const nodemailer = require('nodemailer');

// Reuses one transporter for the life of the process instead of reconnecting per email.
// Explicit timeouts matter here: without them, a flaky SMTP connection can hang
// well past what's reasonable for a request a user is waiting on (e.g. registration).
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
});

/**
 * Sends an email from the configured Gmail account.
 * @param {string} to - recipient address
 * @param {string} subject
 * @param {string} html
 */
async function sendEmail(to, subject, html) {
    await transporter.sendMail({
        from: `"SwiftShip Express" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
    });
}

// Fires the send without making the caller's HTTP response wait on it -- real
// SMTP round trips (Gmail included) can take anywhere from under a second to
// 20+ seconds, which callers like shipment creation shouldn't block on.
sendEmail.inBackground = function(to, subject, html, context) {
    sendEmail(to, subject, html).catch(err => {
        console.error(`${context} email failed to send:`, err);
    });
};

module.exports = sendEmail;
