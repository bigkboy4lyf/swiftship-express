const Shipment = require('../models/Shipment');
const FeeSettings = require('../models/FeeSettings');
const { notifyUser } = require('./notifications');

const FEE_TYPES = ['demurrage', 'storage'];
const FEE_LABELS = { demurrage: 'Demurrage', storage: 'Storage' };
const DAY_MS = 24 * 60 * 60 * 1000;

// A shipment only ever counts as "unpaid" or "still open" while it's in one
// of these statuses -- delivered shipments are done regardless of balance,
// and rejected ones are deleted outright elsewhere, so neither should keep
// racking up fees.
const ACCRUAL_ELIGIBLE_STATUSES = ['pending_approval', 'pending', 'processing', 'picked_up', 'in_transit', 'out_for_delivery', 'delayed'];

const round2 = (n) => Math.round(n * 100) / 100;

// =============================================
// BILLING -- the single source of truth for "how much does this shipment
// actually cost, all in". Everywhere else that needs a total, a balance, or
// a fully-paid check (invoice/receipt rendering, payment confirmation, the
// admin payment-review queue) reads it from here instead of re-deriving it,
// so a shipment's fees, its invoice, and its accrual eligibility can never
// drift out of agreement with each other.
// =============================================

// Demurrage + storage accrued so far, itemized and summed. Works on both
// hydrated Mongoose documents and .lean() plain objects, since it only ever
// reads.
function getFeesAccrued(shipment) {
    const demurrage = round2(shipment.fees?.demurrage?.accrued || 0);
    const storage = round2(shipment.fees?.storage?.accrued || 0);
    return { demurrage, storage, total: round2(demurrage + storage) };
}

// The full amount this shipment is on the hook for: the original shipping
// charge plus whatever demurrage/storage has accrued since. This -- not the
// original totalPrice -- is what "fully paid" and "balance due" are measured
// against, so a shipment can't be marked settled while a fee balance remains.
function getTotalOwed(shipment) {
    return round2((shipment.totalPrice || 0) + getFeesAccrued(shipment).total);
}

function getBalanceDue(shipment) {
    return round2(Math.max(getTotalOwed(shipment) - (shipment.amountPaid || 0), 0));
}

function isFullyPaid(shipment) {
    return round2(shipment.amountPaid || 0) >= getTotalOwed(shipment);
}

// Mongo-side equivalent of isFullyPaid() above, for querying "still unpaid"
// shipments without loading everything into memory first. Shared by the fee
// accrual query below and utils/paymentReminders.js, so "unpaid" can never
// mean two different things depending on which job is asking.
function unpaidExpr() {
    return {
        $lt: [
            '$amountPaid',
            { $add: ['$totalPrice', { $ifNull: ['$fees.demurrage.accrued', 0] }, { $ifNull: ['$fees.storage.accrued', 0] }] }
        ]
    };
}

// Whether a shipment is currently in the window where demurrage/storage fees
// are allowed to accrue at all -- unpaid (or only partially paid) and not
// yet delivered/rejected. The moment either stops being true (fully paid, or
// delivered), accrual stops for good on that shipment, regardless of its
// per-shipment active flags.
function isAccrualEligible(shipment) {
    return !isFullyPaid(shipment) && ACCRUAL_ELIGIBLE_STATUSES.includes(shipment.status);
}

// Shared by both the moment a fee is switched on and every later daily
// charge -- same recipient and fee-type vocabulary, just a different verb
// and total owed.
function notifyFeeCharge(shipment, type, { activated, rate, accrued }) {
    const label = FEE_LABELS[type].toLowerCase();
    const message = activated
        ? `A ${label} fee of $${rate.toFixed(2)}/day now applies to shipment ${shipment.trackingNumber} because it remains unpaid. `
            + `This will be charged daily until the balance is paid in full.`
        : `A ${label} fee of $${rate.toFixed(2)}/day has been applied to shipment ${shipment.trackingNumber} because it remains unpaid. `
            + `You now owe $${accrued.toFixed(2)} in ${label} fees.`;

    notifyUser(shipment.userId, {
        type: 'fee_charge',
        title: `${FEE_LABELS[type]} Fee ${activated ? 'Activated' : 'Applied'}`,
        message,
        link: 'dashboard.html?tab=user-shipments'
    });
}

// Shipments created before the fees field existed won't have it hydrated
// with the schema's nested defaults, since there's nothing in stored data
// for Mongoose to apply them to -- back it in explicitly rather than
// assuming every document already has it.
function ensureFeesInitialized(shipment) {
    if (!shipment.fees) shipment.fees = { demurrage: {}, storage: {} };
}

// Admin's per-shipment opt-in (see PATCH /shipments/:id/fees/:type). Turning
// a fee ON stamps activatedAt -- the anchor the daily accrual job counts
// from, so activating today never back-charges for days it wasn't active --
// and immediately notifies the customer. Turning it off just stops future
// accrual; whatever's already accrued is left untouched either way.
async function setShipmentFeeActive(shipment, type, active) {
    ensureFeesInitialized(shipment);
    const feeState = shipment.fees[type];
    const turningOn = active && !feeState.active;

    feeState.active = active;

    if (turningOn) {
        feeState.activatedAt = new Date();
        const settings = await FeeSettings.getSingleton();
        const rate = round2(settings[type]?.ratePerDay || 0);
        notifyFeeCharge(shipment, type, { activated: true, rate });
    }
}

// Runs one pass of fee accrual across every open shipment. A fee type only
// ever charges a shipment once its rate is set above zero (FeeSettings) AND
// admin has individually activated it on that shipment
// (shipment.fees.<type>.active) -- the rate is the one thing kept uniform
// across the platform; which accounts actually get charged is targeted
// per-shipment, not by a platform-wide switch.
//
// Safe to call more than once within the same day -- lastChargedAt gates
// each shipment/fee-type pair independently, so re-running after a restart
// never double-charges.
async function runFeeAccrual() {
    const settings = await FeeSettings.getSingleton();
    const activeFeeTypes = FEE_TYPES.filter(type => settings[type]?.ratePerDay > 0);
    if (!activeFeeTypes.length) return { shipmentsCharged: 0 };

    // "Unpaid" here has to mean the exact same thing as isFullyPaid() above --
    // amountPaid against totalPrice *plus* whatever fees have already
    // accrued -- otherwise a shipment whose base price is settled but still
    // carries a fee balance would silently fall out of accrual.
    const shipments = await Shipment.find({
        status: { $in: ACCRUAL_ELIGIBLE_STATUSES },
        $expr: unpaidExpr(),
        $or: activeFeeTypes.map(type => ({ [`fees.${type}.active`]: true }))
    });

    const now = Date.now();
    let shipmentsCharged = 0;

    for (const shipment of shipments) {
        let changed = false;
        ensureFeesInitialized(shipment);

        for (const type of activeFeeTypes) {
            const feeState = shipment.fees[type];
            if (!feeState.active) continue;

            const last = feeState.lastChargedAt ? feeState.lastChargedAt.getTime() : null;
            const anchor = feeState.activatedAt ? feeState.activatedAt.getTime() : shipment.createdAt.getTime();
            const dueAt = (last !== null ? last : anchor) + DAY_MS;
            if (now < dueAt) continue;

            const rate = round2(settings[type].ratePerDay);
            feeState.accrued = round2((feeState.accrued || 0) + rate);
            feeState.lastChargedAt = new Date();
            changed = true;

            notifyFeeCharge(shipment, type, { activated: false, rate, accrued: feeState.accrued });
        }

        if (changed) {
            await shipment.save();
            shipmentsCharged++;
        }
    }

    return { shipmentsCharged };
}

module.exports = {
    runFeeAccrual,
    setShipmentFeeActive,
    getFeesAccrued,
    getTotalOwed,
    getBalanceDue,
    isFullyPaid,
    isAccrualEligible,
    unpaidExpr,
    FEE_TYPES,
    ACCRUAL_ELIGIBLE_STATUSES
};
