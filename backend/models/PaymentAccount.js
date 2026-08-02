const mongoose = require('mongoose');

// Bank transfer is offered as one of two standard payment options on every
// invoice (alongside card checkout) -- one profile per country code, keyed
// by ISO country code, plus a special 'PARENT' code (PARENT_ACCOUNT_CODE in
// frontend/js/countries-data.js) that acts as the fallback for any
// destination without its own entry -- set it once and it covers every
// country by default. Bank transfer is recommended (not required) for
// destinations in LIMITED_SERVICE_COUNTRIES (see frontend/js/countries-data.js),
// since card processing there can be unreliable, but any customer can choose
// either method regardless of destination. Every field except countryCode is
// optional -- which fields a given bank actually needs varies by country,
// and this needs to stay editable from the admin panel without a schema
// change each time. Both the parent account and any country-specific
// account can be deleted independently via DELETE /payment-accounts/:code.
const paymentAccountSchema = new mongoose.Schema({
    countryCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    bankName: String,
    accountName: String,
    accountNumber: String,
    iban: String,
    swiftBic: String,
    routingNumber: String,
    sortCode: String,
    branchName: String,
    branchAddress: String,
    currency: String,
    intermediaryBank: String,
    additionalInstructions: String,
    updatedAt: { type: Date, default: Date.now }
});

paymentAccountSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('PaymentAccount', paymentAccountSchema);
