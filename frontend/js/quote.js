// =============================================
// SWIFTSHIP EXPRESS - PUBLIC QUOTE PAGE
// =============================================
// Form wiring only -- the actual price math and item-row UI live in
// quote-engine.js so this page and the dashboard's Get Quote tab share one
// calculation engine instead of two that can drift apart.

let lastQuoteContext = null;

document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (user) {
        const senderNameInput = document.getElementById('senderName');
        const senderEmailInput = document.getElementById('senderEmail');
        if (senderNameInput && !senderNameInput.value) senderNameInput.value = user.name || '';
        if (senderEmailInput && !senderEmailInput.value) senderEmailInput.value = user.email || '';
    }

    populateCountrySelect(document.getElementById('origin'), 'Select country');
    populateCountrySelect(document.getElementById('destination'), 'Select country');
    setupLimitedServiceNotice('origin', 'originLimitedNote');
    setupLimitedServiceNotice('destination', 'destinationLimitedNote');

    initItemsRepeater(document.getElementById('quoteItemsContainer'), document.getElementById('quoteAddItemBtn'));

    setupQuoteFormHandler(token, user);
    setupPrintEngine();
    setupBookingEngine();
});

function setupLimitedServiceNotice(selectId, noteId) {
    const select = document.getElementById(selectId);
    const note = document.getElementById(noteId);
    if (!select || !note) return;

    select.addEventListener('change', () => {
        if (isLimitedServiceCountry(select.value)) {
            note.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${getCountryName(select.value)} currently has limited shipping service. Delivery times may be longer than usual.`;
            note.style.display = 'block';
        } else {
            note.style.display = 'none';
        }
    });
}

function setupQuoteFormHandler(token, user) {
    const quoteForm = document.getElementById('shippingQuoteForm');
    if (!quoteForm) return;

    quoteForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const origin = document.getElementById('origin').value;
        const destination = document.getElementById('destination').value;
        const serviceType = document.getElementById('serviceType').value;
        const dimensions = document.getElementById('dimensions').value || 'N/A';
        const senderName = document.getElementById('senderName').value;
        const senderEmail = document.getElementById('senderEmail').value;
        const items = collectItems(document.getElementById('quoteItemsContainer'));

        if (!origin || !destination || !serviceType || !senderName || !senderEmail) {
            alert('Please fill in all required fields.');
            return;
        }

        if (origin === destination) {
            alert('Origin and destination cannot be the same.');
            return;
        }

        if (!items.length || items.some(i => !i.description || !i.weight)) {
            alert('Please describe every item you\'re shipping and give it a weight.');
            return;
        }

        const submitBtn = quoteForm.querySelector('button[type="submit"]');
        let quote;
        try {
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Calculating...'; }
            quote = await calculateQuote({ originCountry: origin, destinationCountry: destination, serviceType, items, dimensions });
        } catch (error) {
            alert(error.message);
            return;
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Calculate Quote'; }
        }

        // Kept so "Book Now" creates exactly the shipment that was just
        // quoted, instead of re-deriving it from the form a second time.
        lastQuoteContext = { origin, destination, serviceType, dimensions, senderName, senderEmail, items, quote, user };

        displayUnifiedQuote({
            serviceName: QUOTE_SERVICE_DETAILS[serviceType]?.name || serviceType,
            route: `${getCountryName(origin)} → ${getCountryName(destination)}`,
            delivery: quote.deliveryEstimate || QUOTE_SERVICE_DETAILS[serviceType]?.delivery || '5-10 days',
            contents: `${items.length} item${items.length > 1 ? 's' : ''}, ${quote.totalWeight.toFixed(1)} kg total`,
            basePrice: quote.basePrice,
            insuranceCost: quote.insuranceCost,
            surcharge: quote.surcharge,
            total: quote.totalPrice
        });
    });

    quoteForm.querySelector('button[type="reset"]')?.addEventListener('click', function() {
        const quoteResult = document.getElementById('quoteResult');
        if (quoteResult) quoteResult.style.display = 'none';
        resetItemsRepeater(document.getElementById('quoteItemsContainer'));
        lastQuoteContext = null;
        ['originLimitedNote', 'destinationLimitedNote'].forEach(id => {
            const note = document.getElementById(id);
            if (note) note.style.display = 'none';
        });
    });
}

function displayUnifiedQuote(quoteData) {
    const quoteResult = document.getElementById('quoteResult');
    if (!quoteResult) return;

    document.getElementById('resultService').textContent = quoteData.serviceName;
    document.getElementById('resultRoute').textContent = quoteData.route;
    document.getElementById('resultDelivery').textContent = quoteData.delivery;
    document.getElementById('resultContents').textContent = quoteData.contents;
    document.getElementById('resultBase').textContent = `$${quoteData.basePrice.toFixed(2)}`;
    document.getElementById('resultInsurance').textContent = `$${quoteData.insuranceCost.toFixed(2)}`;
    document.getElementById('resultSurcharge').textContent = `$${quoteData.surcharge.toFixed(2)}`;
    document.getElementById('resultTotal').textContent = `$${quoteData.total.toFixed(2)}`;

    quoteResult.style.display = 'block';
    quoteResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// =============================================
// PRINT ENGINE
// =============================================
function setupPrintEngine() {
    const printQuoteBtn = document.getElementById('printQuote');
    if (!printQuoteBtn) return;

    printQuoteBtn.addEventListener('click', function() {
        const service = document.getElementById('resultService').textContent;
        const route = document.getElementById('resultRoute').textContent;
        const delivery = document.getElementById('resultDelivery').textContent;
        const contents = document.getElementById('resultContents').textContent;
        const base = document.getElementById('resultBase').textContent;
        const insurance = document.getElementById('resultInsurance').textContent;
        const surcharge = document.getElementById('resultSurcharge').textContent;
        const total = document.getElementById('resultTotal').textContent;

        const quoteNumber = 'Q-' + Date.now().toString().slice(-6);

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>SwiftShip Express - Quote #${quoteNumber}</title>
                <style>
                    :root {
                        --primary: #0f172a;
                        --accent: #2563eb;
                        --text-main: #334155;
                        --text-dark: #0f172a;
                        --bg-light: #f8fafc;
                        --border: #e2e8f0;
                    }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        color: var(--text-main);
                        line-height: 1.5;
                        padding: 40px;
                        background: #ffffff;
                    }
                    .wrapper { max-width: 800px; margin: 0 auto; }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        border-bottom: 2px solid var(--primary);
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .brand h1 { font-size: 24px; color: var(--primary); font-weight: 800; letter-spacing: -0.05em; }
                    .brand p { font-size: 12px; color: var(--text-main); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
                    .meta-block { text-align: right; }
                    .meta-block h2 { font-size: 14px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; }
                    .quote-num { font-size: 20px; font-weight: 700; color: var(--text-dark); margin: 4px 0; }
                    .date { font-size: 13px; color: var(--text-main); }
                    .details-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 20px;
                        background: var(--bg-light);
                        border: 1px solid var(--border);
                        border-radius: 8px;
                        padding: 20px;
                        margin-bottom: 35px;
                    }
                    .grid-item span { display: block; font-size: 11px; text-transform: uppercase; color: var(--text-main); font-weight: 600; margin-bottom: 4px; }
                    .grid-item p { font-size: 15px; font-weight: 600; color: var(--text-dark); }
                    h3 { font-size: 16px; color: var(--text-dark); font-weight: 700; margin-bottom: 12px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th {
                        background: var(--bg-light);
                        color: var(--text-dark);
                        font-weight: 600;
                        font-size: 13px;
                        text-align: left;
                        padding: 12px 16px;
                        border-bottom: 1px solid var(--border);
                    }
                    td { padding: 14px 16px; font-size: 14px; border-bottom: 1px solid var(--border); color: var(--text-main); }
                    .summary-container { display: flex; justify-content: flex-end; }
                    .summary-card { width: 320px; background: var(--bg-light); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
                    .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
                    .summary-row.total-row {
                        margin-top: 15px;
                        padding-top: 15px;
                        border-top: 2px dashed var(--border);
                        font-size: 18px;
                        font-weight: 700;
                        color: var(--text-dark);
                    }
                    .total-amount { color: var(--accent); }
                    .footer { margin-top: 60px; border-top: 1px solid var(--border); padding-top: 20px; text-align: center; font-size: 12px; color: var(--text-main); }
                    @media print {
                        body { padding: 0; }
                        .summary-card, .details-grid { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #f8fafc !important; }
                    }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="header">
                        <div class="brand">
                            <h1>SWIFTSHIP EXPRESS</h1>
                            <p>Global Logistics Platform</p>
                        </div>
                        <div class="meta-block">
                            <h2>Fulfillment Quote</h2>
                            <div class="quote-num">#${quoteNumber}</div>
                            <div class="date">Issued: ${new Date().toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="details-grid">
                        <div class="grid-item">
                            <span>Service Tier</span>
                            <p>${service}</p>
                        </div>
                        <div class="grid-item">
                            <span>Transit Route</span>
                            <p>${route}</p>
                        </div>
                        <div class="grid-item">
                            <span>Est. Delivery Window</span>
                            <p>${delivery}</p>
                        </div>
                        <div class="grid-item">
                            <span>Contents</span>
                            <p>${contents}</p>
                        </div>
                    </div>
                    <h3>Financial Breakdown</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Line Item Description</th>
                                <th style="text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Base Freight Rate Valuation</td>
                                <td style="text-align: right; font-weight: 600; color: var(--text-dark);">${base}</td>
                            </tr>
                            <tr>
                                <td>Declared Value Liability Insurance Cover (1%)</td>
                                <td style="text-align: right; font-weight: 600; color: var(--text-dark);">${insurance}</td>
                            </tr>
                            <tr>
                                <td>Fuel Surcharge Indexation Adjustment</td>
                                <td style="text-align: right; font-weight: 600; color: var(--text-dark);">${surcharge}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="summary-container">
                        <div class="summary-card">
                            <div class="summary-row">
                                <span>Subtotal:</span>
                                <strong>${base}</strong>
                            </div>
                            <div class="summary-row">
                                <span>Ancillary Fees:</span>
                                <strong>${(parseFloat(insurance.replace('$', '')) + parseFloat(surcharge.replace('$', ''))).toLocaleString('en-US', {style: 'currency', currency: 'USD'})}</strong>
                            </div>
                            <div class="summary-row total-row">
                                <span>Total Price:</span>
                                <span class="total-amount">${total}</span>
                            </div>
                        </div>
                    </div>
                    <div class="footer">
                        <p>This document constitutes a formal calculation matrix snapshot valid for exactly 30 calendar days from issuance.</p>
                        <p style="margin-top: 4px; font-weight: 600;">SwiftShip Express Corporation &copy; ${new Date().getFullYear()}</p>
                    </div>
                </div>
                <script>
                    window.onload = function() { window.print(); setTimeout(window.close, 500); }
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    });
}

// =============================================
// BOOKING ENGINE
// =============================================
function setupBookingEngine() {
    const bookNowBtn = document.getElementById('bookNow');
    if (!bookNowBtn) return;

    function showCustomTrackingPopup(trackingNumber) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex',
            justifyContent: 'center', alignItems: 'center', zIndex: '9999'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#ffffff', padding: '25px', borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)', textAlign: 'center',
            maxWidth: '400px', width: '90%', fontFamily: 'Arial, sans-serif'
        });

        modal.innerHTML = `
            <div style="font-size: 2.5rem; color: #2e7d32; margin-bottom: 12px;"><i class="fas fa-check-circle"></i></div>
            <h3 style="color: #222; margin: 0 0 8px 0; font-size: 1.3rem;">Shipment Requirement Received</h3>

            <p style="color: #555; font-size: 0.9rem; line-height: 1.4; margin-bottom: 18px;">
                Your shipment requirement has been received, and support will write to you to get more details on the shipping and how to go about it.
            </p>

            <div style="background: #f4f6f8; padding: 12px; border-radius: 6px; border: 1px dashed #b2dfdb; margin-bottom: 20px;">
                <span style="font-size: 0.7rem; text-transform: uppercase; color: #666; display: block; margin-bottom: 2px;">Assigned Tracking Number</span>
                <strong style="font-size: 1.25rem; color: #0056b3; letter-spacing: 0.5px;">${trackingNumber}</strong>
            </div>

            <button id="dismissTrackingPopupBtn" style="width: 100%; background: #0056b3; color: white; padding: 10px; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Acknowledge</button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('dismissTrackingPopupBtn').addEventListener('click', () => {
            document.body.removeChild(overlay);
            window.location.href = 'dashboard.html';
        });
    }

    bookNowBtn.addEventListener('click', async () => {
        if (!lastQuoteContext) {
            alert('Please calculate a quote first.');
            return;
        }

        const { origin, destination, serviceType, dimensions, senderName, senderEmail, items, user } = lastQuoteContext;
        const dimArray = (dimensions && dimensions !== 'N/A' ? dimensions : '0x0x0').toLowerCase().split('x').map(n => parseFloat(n.trim()) || 0);

        const bookingPayload = {
            // Shipment.userId is required by the schema; guests booking without
            // an account fall back to the same placeholder id the rest of this
            // app already uses when there's no real user to attach the record to.
            userId: user ? (user.id || user._id) : '65f1a2b3c4d5e6f7a8b9c0d1',
            serviceType,
            sender: { name: senderName, email: senderEmail, country: origin, city: getCountryName(origin) },
            recipient: { name: `${senderName} - Recipient`, city: getCountryName(destination), country: destination },
            packageDetails: {
                dimensions: { length: dimArray[0] || 0, width: dimArray[1] || 0, height: dimArray[2] || 0 },
                items
            }
        };

        try {
            const response = await fetch('/api/shipments/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingPayload)
            });

            const resData = await response.json();

            if (resData.success) {
                showCustomTrackingPopup(resData.data.trackingNumber);
            } else {
                alert(`Booking failed: ${resData.message}`);
            }
        } catch (error) {
            console.error('Booking error:', error);
            alert('Could not reach the server. Please try again.');
        }
    });
}
