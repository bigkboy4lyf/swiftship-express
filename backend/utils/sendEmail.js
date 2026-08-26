const nodemailer = require('nodemailer');

// Reuses one transporter for the life of the process instead of reconnecting per email.
// Explicit timeouts matter here: without them, a flaky SMTP connection can hang
// well past what's reasonable for a request a user is waiting on (e.g. registration).
const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
});

/**
 * Sends an email from the configured Hostinger account.
 * @param {string} to - recipient address
 * @param {string} subject
 * @param {string} html
 * @param {string} [bcc] - blind-copied address(es); kept out of `to` so
 *   recipients who don't already know each other's address don't see it.
 */
async function sendEmail(to, subject, html, bcc) {
    await transporter.sendMail({
        from: `"SwiftShip Express" <${process.env.EMAIL_USER}>`,
        to,
        bcc,
        subject,
        html
    });
}

// Fires the send without making the caller's HTTP response wait on it -- real
// SMTP round trips can take anywhere from under a second to 20+ seconds,
// which callers like shipment creation shouldn't block on.
sendEmail.inBackground = function(to, subject, html, context, bcc) {
    sendEmail(to, subject, html, bcc).catch(err => {
        console.error(`${context} email failed to send:`, err);
    });
};

// Who should hear about a given shipment: the account owner's login email,
// plus a separate contactEmail if the customer supplied one that differs
// (e.g. quoting on the recipient's behalf). Falls back to the legacy
// sender.email path for shipments created before contactEmail existed.
// Deduped case-insensitively so an identical contact email doesn't double-send.
function shipmentRecipients(shipment, accountEmail) {
    const contact = shipment?.contactEmail || shipment?.sender?.email;
    const seen = new Set();
    return [accountEmail, contact].filter(Boolean).filter(email => {
        const key = email.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Sends one email to every distinct address tied to a shipment (account
// owner + optional differing contact email). No-op if neither is available.
// The extra address(es) go in Bcc rather than To, so two people who may not
// know about each other (e.g. the account owner and someone they quoted a
// shipment for) don't see one another's email address. This is the one place
// that decides who hears about a shipment by email, so any future
// status-update email stays in sync with this policy for free.
sendEmail.toShipmentContacts = function(shipment, accountEmail, subject, html, context) {
    const [to, ...bcc] = shipmentRecipients(shipment, accountEmail);
    if (!to) return;
    sendEmail.inBackground(to, subject, html, context, bcc.join(', ') || undefined);
};

module.exports = sendEmail;
