const mongoose = require('mongoose');

// One config block per payment method -- enabled defaults to true so
// existing deployments (and this document's first creation) start with
// everything available, matching current behavior. disabledReason is only
// meaningful while enabled is false; it's what customers see in place of
// that option at checkout (see PAY NOW in frontend/js/dashboard-ui.js).
const paymentMethodSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: true },
    disabledReason: { type: String, default: '', trim: true, maxlength: 300 }
}, { _id: false });

// Singleton document -- there is exactly one payment settings record for
// the whole platform, not one per user or shipment. See getSingleton()
// below, same pattern as FeeSettings.
const paymentSettingsSchema = new mongoose.Schema({
    card: { type: paymentMethodSchema, default: () => ({}) },
    bankTransfer: { type: paymentMethodSchema, default: () => ({}) },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

// Fetches the one settings document, creating it with both methods enabled
// on first use so the checkout flow and admin UI never have to special-case
// "no settings yet".
paymentSettingsSchema.statics.getSingleton = async function() {
    let settings = await this.findOne();
    if (!settings) settings = await this.create({});
    return settings;
};

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema);
