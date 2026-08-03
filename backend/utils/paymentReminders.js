const Shipment = require('../models/Shipment');
const { notifyUser } = require('./notifications');
const { getBalanceDue, isFullyPaid, unpaidExpr, ACCRUAL_ELIGIBLE_STATUSES } = require('./feeAccrual');

const DAY_MS = 24 * 60 * 60 * 1000;

// Runs one pass of installment-balance reminders across every open shipment
// that's actually mid-installment -- has paid something toward its balance
// but not all of it. A brand-new invoice that's never been paid against
// isn't "installmental" yet, just an unpaid quote, so it's excluded here
// the same way it's excluded from being called partially paid anywhere else
// in the app (see isPartiallyPaid in dashboard-ui.js/admin-ui.js).
//
// Safe to call more than once within the same day -- installmentReminder.lastSentAt
// gates each shipment independently, so re-running after a restart never
// double-notifies. Mirrors utils/feeAccrual.js's runFeeAccrual in shape and
// cadence on purpose, since it's scheduled alongside it in server.js.
async function runInstallmentReminders() {
    const shipments = await Shipment.find({
        status: { $in: ACCRUAL_ELIGIBLE_STATUSES },
        amountPaid: { $gt: 0 },
        $expr: unpaidExpr()
    });

    const now = Date.now();
    let remindersSent = 0;

    for (const shipment of shipments) {
        if (isFullyPaid(shipment)) continue; // defensive; unpaidExpr() should already exclude these

        const last = shipment.installmentReminder?.lastSentAt?.getTime();
        const dueAt = (last !== undefined && last !== null ? last : shipment.createdAt.getTime()) + DAY_MS;
        if (now < dueAt) continue;

        const balanceDue = getBalanceDue(shipment);
        notifyUser(shipment.userId, {
            type: 'installment_reminder',
            title: 'Installment Balance Reminder',
            message: `Shipment ${shipment.trackingNumber} still has an outstanding balance of $${balanceDue.toFixed(2)}. `
                + `Submit a payment to keep it moving toward delivery.`,
            link: 'dashboard.html?tab=user-shipments'
        });

        shipment.installmentReminder = { lastSentAt: new Date() };
        await shipment.save();
        remindersSent++;
    }

    return { remindersSent };
}

module.exports = { runInstallmentReminders };
