const nodemailer = require('nodemailer');

// Reuses one transporter for the life of the process instead of reconnecting per email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
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

module.exports = sendEmail;
