// =============================================
// SWIFTSHIP EXPRESS - UNIFIED QUOTE ENGINE
// =============================================
// Standalone Page Frontend Logic
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    // Session context matching authentication behaviors
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    // If an authenticated session is running, auto-populate profile context fields
    if (user) {
        const senderNameInput = document.getElementById('senderName');
        const senderEmailInput = document.getElementById('senderEmail');
        if (senderNameInput && !senderNameInput.value) senderNameInput.value = user.name || '';
        if (senderEmailInput && !senderEmailInput.value) senderEmailInput.value = user.email || '';
    }

    setupQuoteFormHandler();
    setupPrintEngine();
    setupBookingEngine(token, user);
});

// =============================================
// SYSTEM CONFIGURATION & MATRICES
// =============================================

const countryNames = {
    'US': 'United States', 'CA': 'Canada', 'UK': 'United Kingdom',
    'DE': 'Germany', 'FR': 'France', 'AU': 'Australia',
    'JP': 'Japan', 'CN': 'China', 'IN': 'India'
};

const serviceDetails = {
    'express': { name: 'Express Delivery', delivery: '1-3 days', baseMultiplier: 1.8 },
    'standard': { name: 'Standard Shipping', delivery: '5-10 days', baseMultiplier: 1.0 },
    'economy': { name: 'Economy Shipping', delivery: '10-20 days', baseMultiplier: 0.7 },
    'international': { name: 'International Priority', delivery: '3-7 days', baseMultiplier: 2.2 },
    'cargo': { name: 'Cargo/Freight Shipping', delivery: '7-14 days', baseMultiplier: 1.5 }
};

const dashDistanceMatrix = {
    'US-CA': 1.0, 'US-UK': 2.5, 'US-DE': 2.7, 'US-FR': 2.8, 'US-AU': 3.5, 'US-JP': 3.2, 'US-CN': 3.3, 'US-IN': 3.4,
    'CA-UK': 2.3, 'CA-DE': 2.5, 'CA-FR': 2.6, 'CA-AU': 3.8, 'CA-JP': 3.5, 'CA-CN': 3.6, 'CA-IN': 3.7,
    'UK-DE': 1.2, 'UK-FR': 1.1, 'UK-AU': 3.2, 'UK-JP': 3.0, 'UK-CN': 3.1, 'UK-IN': 3.3,
    'DE-FR': 1.0, 'DE-AU': 3.3, 'DE-JP': 3.1, 'DE-CN': 3.2, 'DE-IN': 3.4,
    'FR-AU': 3.4, 'FR-JP': 3.2, 'FR-CN': 3.3, 'FR-IN': 3.5,
    'AU-JP': 2.8, 'AU-CN': 2.9, 'AU-IN': 2.7,
    'JP-CN': 1.5, 'JP-IN': 2.2,
    'CN-IN': 1.8
};

// =============================================
// CALCULATION LOGIC & SUBMISSION
// =============================================

function calculateBaseRate(origin, destination, weight, serviceType) {
    let distanceFactor = 1.0;
    const route = `${origin}-${destination}`;
    const reverseRoute = `${destination}-${origin}`;
    
    if (dashDistanceMatrix[route]) distanceFactor = dashDistanceMatrix[route];
    else if (dashDistanceMatrix[reverseRoute]) distanceFactor = dashDistanceMatrix[reverseRoute];
    
    const weightFactor = weight * 0.5;
    const serviceFactor = serviceDetails[serviceType]?.baseMultiplier || 1.0;
    const baseRate = 10 + (distanceFactor * 5) + (weightFactor * 2) * serviceFactor;
    
    return Math.max(baseRate, 15);
}

function setupQuoteFormHandler() {
    const quoteForm = document.getElementById('shippingQuoteForm');
    if (!quoteForm) return;

    quoteForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const origin = document.getElementById('origin').value;
        const destination = document.getElementById('destination').value;
        const serviceType = document.getElementById('serviceType').value;
        const weight = parseFloat(document.getElementById('weight').value) || 1;
        const dimensions = document.getElementById('dimensions').value || 'N/A';
        const insurance = parseFloat(document.getElementById('insurance').value) || 0;
        const senderName = document.getElementById('senderName').value;
        const senderEmail = document.getElementById('senderEmail').value;
        const packageType = document.getElementById('packageType')?.value || 'parcel';
        
        if (!origin || !destination || !serviceType || !weight || !senderName || !senderEmail) {
            alert('Please fill in all required fields.');
            return;
        }
        
        if (origin === destination) {
            alert('Origin and destination cannot be the same.');
            return;
        }
        
        // Attempt calculations via core backend systems route
        try {
            const response = await fetch('/api/quotes/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderName, senderEmail,
                    originCountry: origin,
                    destinationCountry: destination,
                    serviceType: serviceType,
                    weight: weight,
                    dimensions: dimensions,
                    packageType: packageType,
                    insuranceValue: insurance
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                const data = result.data;
                displayUnifiedQuote({
                    serviceName: serviceDetails[data.quote.serviceType]?.name || data.quote.serviceType,
                    route: `${countryNames[data.quote.originCountry] || data.quote.originCountry} → ${countryNames[data.quote.destinationCountry] || data.quote.destinationCountry}`,
                    delivery: data.deliveryEstimate || serviceDetails[data.quote.serviceType]?.delivery || '5-10 days',
                    basePrice: data.quote.basePrice,
                    insuranceCost: data.quote.insuranceCost,
                    surcharge: data.quote.surcharge,
                    total: data.quote.totalPrice,
                    quoteId: data.quote._id,
                    quoteNumber: data.quote.quoteNumber
                });
                return; 
            }
        } catch (error) {
            console.warn('Backend valuation route unavailable, running local backup loop.');
        }
        
        // Local Fallback Execution Frame
        const baseRate = calculateBaseRate(origin, destination, weight, serviceType);
        const insuranceCost = insurance > 0 ? insurance * 0.01 : 0;
        const fuelSurcharge = baseRate * 0.075;
        const total = baseRate + insuranceCost + fuelSurcharge;
        
        displayUnifiedQuote({
            serviceName: serviceDetails[serviceType]?.name || serviceType,
            route: `${countryNames[origin] || origin} → ${countryNames[destination] || destination}`,
            delivery: serviceDetails[serviceType]?.delivery || '5-10 days',
            basePrice: baseRate,
            insuranceCost: insuranceCost,
            surcharge: fuelSurcharge,
            total: total,
            quoteId: null,
            quoteNumber: 'LOCAL-' + Date.now().toString().slice(-6)
        });
    });

    // Handle Reset Operations Elegantly
    quoteForm.querySelector('button[type="reset"]')?.addEventListener('click', function() {
        const quoteResult = document.getElementById('quoteResult');
        if (quoteResult) quoteResult.style.display = 'none';
    });
}

function displayUnifiedQuote(quoteData) {
    const quoteResult = document.getElementById('quoteResult');
    if (!quoteResult) return;

    document.getElementById('resultService').textContent = quoteData.serviceName;
    document.getElementById('resultRoute').textContent = quoteData.route;
    document.getElementById('resultDelivery').textContent = quoteData.delivery;
    document.getElementById('resultBase').textContent = `$${quoteData.basePrice.toFixed(2)}`;
    document.getElementById('resultInsurance').textContent = `$${quoteData.insuranceCost.toFixed(2)}`;
    document.getElementById('resultSurcharge').textContent = `$${quoteData.surcharge.toFixed(2)}`;
    document.getElementById('resultTotal').textContent = `$${quoteData.total.toFixed(2)}`;
    
    quoteResult.style.display = 'block';
    quoteResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Save state context array straight to workspace local storage
    localStorage.setItem('dashLastQuote', JSON.stringify(quoteData));
}

// =============================================
// PREMIUM DISPATCH PRINT ENGINE
// =============================================

function setupPrintEngine() {
    const printQuoteBtn = document.getElementById('printQuote');
    if (!printQuoteBtn) return;

    printQuoteBtn.addEventListener('click', function() {
        const service = document.getElementById('resultService').textContent;
        const route = document.getElementById('resultRoute').textContent;
        const delivery = document.getElementById('resultDelivery').textContent;
        const base = document.getElementById('resultBase').textContent;
        const insurance = document.getElementById('resultInsurance').textContent;
        const surcharge = document.getElementById('resultSurcharge').textContent;
        const total = document.getElementById('resultTotal').textContent;
        
        const cached = localStorage.getItem('dashLastQuote');
        const quoteNumber = cached ? JSON.parse(cached).quoteNumber : 'LOCAL-' + Date.now().toString().slice(-6);
        
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
                        grid-template-columns: repeat(3, 1fr);
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
// TRANS-LOGISTICS BOOKING ENGINE & POPUPS
// =============================================

function setupBookingEngine() {
    const bookNowBtn = document.getElementById('bookNow');
    if (!bookNowBtn) return;

    // Custom Modal Generator to replace ugly native browser alerts
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
        const user = JSON.parse(localStorage.getItem('user')) || null;
        const dimInput = document.getElementById('dimensions').value || "0x0x0";
        const dimArray = dimInput.toLowerCase().split('x').map(num => parseFloat(num.trim()) || 0);

        const bookingPayload = {
            userId: user ? (user.id || user._id) : "65f1a2b3c4d5e6f7a8b9c0d1",
            serviceType: document.getElementById('serviceType').value || 'standard',
            sender: {
                name: document.getElementById('senderName').value,
                email: document.getElementById('senderEmail').value,
                country: document.getElementById('origin').value,
                city: "Origin Hub"
            },
            recipient: {
                name: document.getElementById('senderName').value + " - Recipient",
                city: "Destination Hub",
                country: document.getElementById('destination').value
            },
            packageDetails: {
                weight: parseFloat(document.getElementById('weight').value) || 0,
                dimensions: {
                    length: dimArray[0] || 0,
                    width: dimArray[1] || 0,
                    height: dimArray[2] || 0
                },
                value: parseFloat(document.getElementById('insurance').value) || 0
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
                // Calls the beautiful custom popup using the true backend tracking string
                showCustomTrackingPopup(resData.data.trackingNumber);
            } else {
                console.error(`Booking Failed: ${resData.message}`);
            }
        } catch (error) {
            console.error('Pipeline Error:', error);
        }
    });
}

// Modal Frame rendering layout engine to match visual dashboard continuity
function showLoggedTrackingPopup(trackingNumber) {
    const overlay = document.createElement('div');
    overlay.id = 'trackingPopupOverlay';
    
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
    });
}