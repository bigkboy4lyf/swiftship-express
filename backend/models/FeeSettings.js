const mongoose = require('mongoose');

// One config block per fee type -- the rate is the only thing uniform
// across the whole platform. There's deliberately no separate enabled flag
// here: a $0/day rate already means "charges nothing", and which shipments
// actually get charged is targeted per-shipment (see Shipment.fees.<type>.active
// in utils/feeAccrual.js) -- a platform-wide switch on top of that would just
// be a second way to express the same "off" state.
const feeTypeSchema = new mongoose.Schema({
    ratePerDay: { type: Number, default: 0, min: 0 }
}, { _id: false });

// Singleton document -- there is exactly one fee schedule for the whole
// platform, not one per shipment or per admin. See getSingleton() below.
const feeSettingsSchema = new mongoose.Schema({
    demurrage: { type: feeTypeSchema, default: () => ({}) },
    storage: { type: feeTypeSchema, default: () => ({}) },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

// Fetches the one settings document, creating it with everything disabled
// on first use so the accrual job and admin UI never have to special-case
// "no settings yet".
feeSettingsSchema.statics.getSingleton = async function() {
    let settings = await this.findOne();
    if (!settings) settings = await this.create({});
    return settings;
};

module.exports = mongoose.model('FeeSettings', feeSettingsSchema);
