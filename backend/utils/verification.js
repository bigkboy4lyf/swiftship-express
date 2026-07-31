const crypto = require('crypto');

// A short code printed on invoices/receipts that's derived from the
// shipment's immutable billing data (id, tracking number, amount, issue
// date) using a server-only secret. Nobody can produce a valid-looking code
// for a value they've altered without knowing JWT_SECRET, so it makes a
// printed or downloaded document tamper-evident even without a public
// lookup page: if the numbers on the page don't match the code, it wasn't
// issued by this server as-is.
function documentVerificationCode(shipment) {
    const secret = process.env.JWT_SECRET;
    const basis = [
        shipment._id,
        shipment.trackingNumber,
        shipment.totalPrice,
        new Date(shipment.createdAt).toISOString()
    ].join('|');

    const hash = crypto.createHmac('sha256', secret).update(basis).digest('hex').toUpperCase();
    // Grouped into readable blocks, e.g. "A1B2-C3D4-E5F6"
    return hash.slice(0, 12).match(/.{1,4}/g).join('-');
}

module.exports = { documentVerificationCode };
