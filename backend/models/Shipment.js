const mongoose = require('mongoose');

const trackingHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['pending_approval', 'pending', 'processing', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delayed', 'rejected'],
        required: true
    },
    location: String,
    description: String,
    timestamp: { type: Date, default: Date.now }
});

const shipmentSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['pending_approval', 'pending', 'processing', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delayed', 'rejected'],
        default: 'pending_approval'
    },
    serviceType: { type: String, enum: ['express', 'standard', 'international', 'economy', 'cargo'], default: 'standard' },
    // totalPrice stays the single source of truth other code already reads
    // (e.g. the admin revenue aggregation) -- pricing below is purely the
    // itemized breakdown for invoices/receipts, computed once at creation so
    // a receipt's total never silently changes if the rate formula changes later.
    totalPrice: { type: Number, default: 0 },
    // Cumulative total confirmed across every receipt admin has accepted so
    // far (see PATCH /receipt/confirm) -- supports paying an invoice down in
    // installments. The shipment only advances into processing once this
    // reaches totalPrice; until then it stays an unpaid/partially-paid
    // invoice the customer can keep submitting receipts against.
    amountPaid: { type: Number, default: 0 },
    pricing: {
        basePrice: { type: Number, default: 0 },
        insuranceCost: { type: Number, default: 0 },
        surcharge: { type: Number, default: 0 }
    },
    sender: {
        name: String,
        company: String,
        address: String,
        city: String,
        country: String,
        postalCode: String,
        phone: String,
        email: String
    },
    recipient: {
        name: { type: String, required: true },
        company: String,
        address: String,
        city: { type: String, required: true },
        country: { type: String, required: true },
        postalCode: String,
        phone: String,
        email: String
    },
    package: {
        weight: Number,
        dimensions: {
            length: Number,
            width: Number,
            height: Number
        },
        description: String,
        category: String,
        value: Number,
        // Itemized contents when a shipment bundles more than one thing.
        // weight/description/value above stay the aggregate across all
        // items, so existing code that only reads the top-level package
        // fields keeps working unchanged for both single- and multi-item
        // shipments.
        items: [{
            description: String,
            category: String,
            weight: Number,
            value: Number
        }]
    },
    currentLocation: {
        facility: String,
        city: String,
        country: String,
        timestamp: Date
    },
    // Proof of payment submitted after either the card or bank transfer flow
    // (see PATCH /shipments/:id/receipt and frontend/submit-receipt.html) --
    // both flows converge on the same upload step. 'pending' blocks the
    // dashboard's invoice button until admin resolves it via
    // /receipt/confirm (which also advances the shipment into the pipeline)
    // or /receipt/reject (which leaves the shipment as-is so the customer
    // can retry). rejectionReason isn't shown anywhere yet -- it's captured
    // now so the future notifications engine has it to surface later.
    paymentReceipt: {
        data: String,
        filename: String,
        contentType: String,
        method: { type: String, enum: ['card', 'bank_transfer'] },
        // Set by admin at confirm time (not by the customer) -- the receipt
        // image only proves a payment was made, not how much of the
        // remaining balance it covers, so admin reads that off the receipt
        // and declares it here. Contributes to amountPaid above.
        amount: Number,
        status: { type: String, enum: ['pending', 'confirmed', 'rejected'] },
        submittedAt: Date,
        resolvedAt: Date,
        rejectionReason: String
    },
    // Whether/how much this specific shipment owes in demurrage and storage
    // fees. `active` is admin's per-shipment opt-in -- FeeSettings only sets
    // the uniform per-day rate; nothing accrues on any shipment until admin
    // flags it here too (see PATCH /shipments/:id/fees/:type, which also
    // fires the "fee activated" notification and stamps activatedAt).
    // Daily accrual (utils/feeAccrual.js) counts from activatedAt, not from
    // when the shipment was created, so turning a fee on today never
    // back-charges for days it wasn't active. Accrual only ever adds to
    // `accrued`, even after `active` is turned back off, so a fee already
    // charged is never silently forgiven. lastChargedAt gates the daily job
    // so restarts/reruns within the same day never double-charge.
    fees: {
        demurrage: {
            active: { type: Boolean, default: false },
            activatedAt: Date,
            accrued: { type: Number, default: 0 },
            lastChargedAt: Date
        },
        storage: {
            active: { type: Boolean, default: false },
            activatedAt: Date,
            accrued: { type: Number, default: 0 },
            lastChargedAt: Date
        }
    },
    // Gates the daily installment-balance reminder job (utils/paymentReminders.js)
    // the same way fees.<type>.lastChargedAt gates fee accrual -- so a
    // restart or an extra run within the same day never double-notifies.
    installmentReminder: {
        lastSentAt: Date
    },
    trackingHistory: [trackingHistorySchema],
    estimatedDelivery: Date,
    actualDelivery: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

shipmentSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// trackingNumber already gets an index for free from `unique: true` above.
// These cover every other field the dashboard actually filters/sorts on --
// without them, "my shipments" and every status count in /stats does a full
// collection scan. Doesn't matter at a handful of documents, but does the
// moment this collection has real volume.
shipmentSchema.index({ userId: 1, createdAt: -1 }); // "my shipments", most recent first
shipmentSchema.index({ status: 1 }); // per-status counts/filters (admin stats, status tab)
shipmentSchema.index({ 'paymentReceipt.status': 1 }); // Payment Reviews tab

module.exports = mongoose.model('Shipment', shipmentSchema);