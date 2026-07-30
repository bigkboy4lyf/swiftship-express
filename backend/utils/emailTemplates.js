// Shared branded wrapper for every outgoing email, so a customer's inbox
// consistently looks like it came from SwiftShip Express regardless of which
// flow (verification, password reset, etc.) triggered it. Built with inline
// styles and no external image -- email clients (Outlook especially) strip
// <style> blocks and often block remote images, so an emoji + inline-styled
// text logo is the one thing guaranteed to render everywhere.
function brandedEmail(bodyHtml) {
    const year = new Date().getFullYear();
    return `
    <div style="font-family: Arial, Helvetica, sans-serif; background: #f5f7fa; padding: 32px 16px;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
            <div style="background: linear-gradient(135deg, #0056b3, #00a2ff); padding: 26px 30px; text-align: center;">
                <span style="font-size: 1.4rem; vertical-align: middle;">&#128666;</span>
                <span style="color: #ffffff; font-size: 1.3rem; font-weight: 700; letter-spacing: 0.02em; vertical-align: middle; margin-left: 8px;">SwiftShip Express</span>
            </div>
            <div style="padding: 32px 30px;">
                ${bodyHtml}
            </div>
            <div style="padding: 16px 30px; background: #f8f9fa; text-align: center; border-top: 1px solid #eee;">
                <p style="margin: 0; font-size: 0.75rem; color: #999;">&copy; ${year} SwiftShip Express. This is an automated message -- please don't reply directly to it.</p>
            </div>
        </div>
    </div>`;
}

// heading/body copy differs per OTP purpose; the code block and expiry
// notice are identical everywhere, so callers just pass what changes.
function otpEmail({ heading, message, code }) {
    return brandedEmail(`
        <h2 style="margin: 0 0 12px; color: #222; font-size: 1.3rem;">${heading}</h2>
        <p style="margin: 0 0 22px; color: #555; font-size: 0.95rem; line-height: 1.5;">${message}</p>
        <div style="background: #f4f6f8; border: 1px dashed #b2dfdb; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 22px;">
            <span style="font-size: 2rem; font-weight: 700; letter-spacing: 10px; color: #0056b3;">${code}</span>
        </div>
        <p style="margin: 0; color: #999; font-size: 0.8rem;">This code expires in 15 minutes. If you didn't request it, you can safely ignore this email.</p>
    `);
}

module.exports = { brandedEmail, otpEmail };
