// Gmail's image proxy (and most other clients) will only fetch images from
// a real URL -- it strips both inline <svg> and base64 data URIs outright.
// ASSET_BASE_URL is the one line to change once the site has a live domain:
// set the env var to e.g. "https://swiftshipexpress.com/img" so emails start
// pointing at the app's own hosted copy of frontend/img/email-logo.png
// instead of this GitHub fallback. Nothing else about the templates needs
// to change.
const ASSET_BASE_URL = process.env.ASSET_BASE_URL
    || 'https://raw.githubusercontent.com/bigkboy4lyf/swiftship-express/main/frontend/img';
const LOGO_URL = `${ASSET_BASE_URL}/email-logo.png`;

// Shared branded wrapper for every outgoing email, so a customer's inbox
// consistently looks like it came from SwiftShip Express regardless of which
// flow (verification, password reset, etc.) triggered it. Built with inline
// styles -- email clients (Outlook especially) strip <style> blocks, so
// everything here is styled inline instead.
function brandedEmail(bodyHtml) {
    const year = new Date().getFullYear();
    return `
    <div style="font-family: Arial, Helvetica, sans-serif; background: #f5f7fa; padding: 32px 16px;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
            <div style="background: linear-gradient(135deg, #0056b3, #00a2ff); padding: 26px 30px; text-align: center;">
                <img src="${LOGO_URL}" width="26" height="26" alt="SwiftShip Express" style="vertical-align: middle; border: 0;">
                <span style="color: #ffffff; font-size: 1.3rem; font-weight: 700; letter-spacing: 0.02em; vertical-align: middle; margin-left: 10px;">SwiftShip Express</span>
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

function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
}

// Sent the moment a priced shipment record exists (booking submitted), since
// that's the first point a total price, tracking number, and customer email
// all co-exist -- see backend/routes/shipments.js and dashboard.js POST /shipments.
// The "how to pay" step points at the dashboard invoice's Pay Now button
// (frontend/js/dashboard-ui.js), which itself branches between card checkout
// and bank transfer instructions depending on the destination country.
function quoteEmail({ customerName, trackingNumber, originCity, originCountry, destCity, destCountry, serviceType, weight, pricing, totalPrice, dashboardUrl, supportEmail }) {
    const serviceLabel = serviceType ? serviceType.charAt(0).toUpperCase() + serviceType.slice(1) : 'Standard';
    const route = [[originCity, originCountry].filter(Boolean).join(', '), [destCity, destCountry].filter(Boolean).join(', ')]
        .filter(Boolean).join(' &rarr; ');
    const p = pricing || {};

    return brandedEmail(`
        <h2 style="margin: 0 0 12px; color: #222; font-size: 1.3rem;">Your Shipping Quote is Ready</h2>
        <p style="margin: 0 0 22px; color: #555; font-size: 0.95rem; line-height: 1.5;">
            Hi ${customerName || 'there'}, thanks for requesting a quote with SwiftShip Express. Here are the details and pricing for your shipment request.
        </p>

        <div style="background: #f4f6f8; border-radius: 8px; padding: 18px 20px; margin-bottom: 22px;">
            <p style="margin: 0 0 10px; font-size: 0.85rem; color: #777;">Tracking Number</p>
            <p style="margin: 0 0 16px; font-size: 1.15rem; font-weight: 700; color: #0056b3; letter-spacing: 0.02em;">${trackingNumber}</p>
            <p style="margin: 0 0 4px; font-size: 0.85rem; color: #777;">Route</p>
            <p style="margin: 0 0 16px; font-size: 0.95rem; color: #333;">${route || 'Not specified'}</p>
            <p style="margin: 0 0 4px; font-size: 0.85rem; color: #777;">Service &amp; Weight</p>
            <p style="margin: 0; font-size: 0.95rem; color: #333;">${serviceLabel} Service${weight ? ` &middot; ${weight} kg` : ''}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 0.9rem;">
            <tr><td style="padding: 6px 0; color: #555;">Base Shipping Rate</td><td style="padding: 6px 0; text-align: right; color: #333;">${money(p.basePrice)}</td></tr>
            ${p.insuranceCost ? `<tr><td style="padding: 6px 0; color: #555;">Insurance</td><td style="padding: 6px 0; text-align: right; color: #333;">${money(p.insuranceCost)}</td></tr>` : ''}
            <tr><td style="padding: 6px 0; color: #555;">Service Surcharge</td><td style="padding: 6px 0; text-align: right; color: #333;">${money(p.surcharge)}</td></tr>
            <tr>
                <td style="padding: 10px 0 0; border-top: 1px solid #e0e0e0; font-weight: 700; color: #222;">Total Due</td>
                <td style="padding: 10px 0 0; border-top: 1px solid #e0e0e0; text-align: right; font-weight: 700; color: #0056b3; font-size: 1.05rem;">${money(totalPrice)}</td>
            </tr>
        </table>

        <h3 style="margin: 0 0 10px; color: #222; font-size: 1.02rem;">How to Pay</h3>
        <ol style="margin: 0 0 22px; padding-left: 20px; color: #555; font-size: 0.9rem; line-height: 1.7;">
            <li>Log in to your <a href="${dashboardUrl}" style="color: #0056b3;">SwiftShip Express dashboard</a> and click on this shipment to view your invoice.</li>
            <li>From the invoice, click <strong>Pay Now</strong> and choose to pay by card or by bank transfer -- bank transfer is recommended for destinations with limited service, such as regions affected by conflict.</li>
            <li>Our support team will follow up with you shortly afterward to confirm payment and any remaining details about your shipment.</li>
        </ol>

        <p style="margin: 0; color: #999; font-size: 0.8rem;">Questions about this quote? You can't reply directly to this email, but you can always reach us at ${supportEmail}.</p>
    `);
}

// Internal notice to the support inbox, not the customer -- lets support know
// a receipt is waiting to be reviewed in the admin Payment Reviews tab. This
// is the interim stand-in until a real notifications engine exists.
function receiptSubmittedEmail({ trackingNumber, customerName, customerEmail }) {
    return brandedEmail(`
        <h2 style="margin: 0 0 12px; color: #222; font-size: 1.3rem;">Payment Receipt Submitted</h2>
        <p style="margin: 0 0 22px; color: #555; font-size: 0.95rem; line-height: 1.5;">
            ${customerName || 'A customer'} (${customerEmail || 'email on file'}) submitted a payment receipt for shipment <strong>${trackingNumber}</strong>. Review it in the admin Payment Reviews tab and confirm or reject it.
        </p>
    `);
}

module.exports = { brandedEmail, otpEmail, quoteEmail, receiptSubmittedEmail };
