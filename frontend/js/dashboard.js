// FRONTEND dashboard.js - Runs in browser
// =============================================
// DASHBOARD - REAL-TIME DATABASE CONNECTED
// =============================================

const API_BASE = '/api/dashboard';

document.addEventListener('DOMContentLoaded', function() {
    if (checkLoginStatus()) {
        loadDashboardData();
        setupEventListeners();
    }
});

// =============================================
// AUTHENTICATION & ACCESS CONTROL
// =============================================

function checkLoginStatus() {
    const user = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');
    
    if (!user || !token) {
        window.location.href = 'account.html';
        return false;
    }
    
    // UI Updates based on logged-in user
    document.getElementById('userDisplayName').textContent = user.name || 'User';
    document.getElementById('userAvatar').textContent = (user.name || 'U').charAt(0);
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrator' : 'Customer';
    
    // Logic for Admin-only elements
    const adminElements = document.querySelectorAll('.admin-only');
    const adminTabBtn = document.getElementById('adminTabBtn');
    
    if (user.role === 'admin') {
        adminElements.forEach(el => el.style.display = 'block');
        if (adminTabBtn) adminTabBtn.style.display = 'block';
    } else {
        adminElements.forEach(el => el.style.display = 'none');
        if (adminTabBtn) adminTabBtn.style.display = 'none';
    }
    return true;
}

// Helper to get Auth Headers for all fetch calls
const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
});

// =============================================
// DATA LOADING
// =============================================

async function loadDashboardData() {
    const user = JSON.parse(localStorage.getItem('user'));
    
    await loadDashboardStats();
    await loadShipments(user.id, user.role); // Filtered by user unless Admin
    
    if (user.role === 'admin') {
        await loadUsers();
    }
}

async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`, { headers: getAuthHeaders() });
        const result = await response.json();
        
        if (result.success) {
            const stats = result.data;
            document.getElementById('totalShipments').textContent = stats.totalShipments || 0;
            document.getElementById('deliveredShipments').textContent = stats.deliveredShipments || 0;
            document.getElementById('transitShipments').textContent = stats.inTransitShipments || 0;
            document.getElementById('pendingShipments').textContent = stats.pendingShipments || 0;
            
            if (document.getElementById('revenue')) {
                document.getElementById('revenue').textContent = `$${(stats.revenue || 0).toLocaleString()}`;
            }
        }
    } catch (err) { console.error('Stats Load Error:', err); }
}

async function loadShipments(userId, role) {
    try {
        // If user, only get THEIR shipments. If admin, get ALL shipments.
        const url = role === 'admin' ? `${API_BASE}/shipments` : `${API_BASE}/shipments?userId=${userId}`;
        const response = await fetch(url, { headers: getAuthHeaders() });
        const result = await response.json();
        
        if (result.success) {
            renderShipmentTable('recentShipmentsBody', result.data.slice(0, 5));
            if (role === 'admin') {
                // Feeds both the admin dashboard table and the sidebar shipments table layout
                renderShipmentTable('allShipmentsBody', result.data);
                renderShipmentTable('adminShipmentsBody', result.data);
            }
        }
    } catch (err) { console.error('Shipment Load Error:', err); }
}

function renderShipmentTable(targetId, shipments) {
    const tbody = document.getElementById(targetId);
    if (!tbody) return;

    if (shipments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">No shipments found.</td></tr>`;
        return;
    }

    tbody.innerHTML = shipments.map(s => `
        <tr>
            <td><strong>${s.trackingNumber}</strong></td>
            <td>${s.recipient?.city || 'N/A'}</td>
            <td>${new Date(s.createdAt).toLocaleDateString()}</td>
            <td><span class="status-badge status-${s.status}">${s.status.toUpperCase()}</span></td>
            <td>
                <button class="action-btn" onclick="trackShipment('${s.trackingNumber}')"><i class="fas fa-search"></i></button>
                <button class="action-btn" onclick="viewDetails('${s._id}')"><i class="fas fa-eye"></i></button>
                ${JSON.parse(localStorage.getItem('user')).role === 'admin' ? `
                    <button class="action-btn" onclick="updateShipmentStatus('${s._id}')"><i class="fas fa-truck"></i></button>
                    <button class="action-btn delete" onclick="deleteShipment('${s._id}')"><i class="fas fa-trash"></i></button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

// =============================================
// ACTIONS (Create, Update, Delete)
// =============================================

async function deleteShipment(id) {
    if (!confirm('Permanently delete this shipment?')) return;
    try {
        const res = await fetch(`${API_BASE}/shipments/${id}`, { 
            method: 'DELETE', 
            headers: getAuthHeaders() 
        });
        if ((await res.json()).success) loadDashboardData();
    } catch (err) { alert('Delete failed'); }
}

async function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = 'account.html';
}

// =============================================
// EVENT LISTENERS
// =============================================

function setupEventListeners() {
    // Logout Button
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // Sidebar Tabs
    document.querySelectorAll('.sidebar-menu-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            
            const targetTab = this.dataset.tab;
            // Hide all sections, show the one clicked
            document.querySelectorAll('.dashboard-section').forEach(sec => sec.style.display = 'none');
            document.getElementById(targetTab).style.display = 'block';
        });
    });

    // Form Submissions
    document.getElementById('shipmentForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        // ... logic for creating shipment ...
    });
}

// =============================================
// QUOTE CALCULATOR (EMBEDDED IN DASHBOARD)
// =============================================

// Service details
const dashServiceDetails = {
    'express': { name: 'Express Delivery', delivery: '1-3 days', baseMultiplier: 1.8 },
    'standard': { name: 'Standard Shipping', delivery: '5-10 days', baseMultiplier: 1.0 },
    'economy': { name: 'Economy Shipping', delivery: '10-20 days', baseMultiplier: 0.7 },
    'international': { name: 'International Priority', delivery: '3-7 days', baseMultiplier: 2.2 },
    'cargo': { name: 'Cargo/Freight Shipping', delivery: '7-14 days', baseMultiplier: 1.5 }
};

const dashCountryNames = {
    'US': 'United States', 'CA': 'Canada', 'UK': 'United Kingdom',
    'DE': 'Germany', 'FR': 'France', 'AU': 'Australia',
    'JP': 'Japan', 'CN': 'China', 'IN': 'India'
};

// Distance matrix for local calculation
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

// Calculate base rate (local fallback)
function dashCalculateBaseRate(origin, destination, weight, serviceType) {
    let distanceFactor = 1.0;
    const route = `${origin}-${destination}`;
    const reverseRoute = `${destination}-${origin}`;
    
    if (dashDistanceMatrix[route]) distanceFactor = dashDistanceMatrix[route];
    else if (dashDistanceMatrix[reverseRoute]) distanceFactor = dashDistanceMatrix[reverseRoute];
    
    const weightFactor = weight * 0.5;
    const serviceFactor = dashServiceDetails[serviceType]?.baseMultiplier || 1.0;
    const baseRate = 10 + (distanceFactor * 5) + (weightFactor * 2) * serviceFactor;
    
    return Math.max(baseRate, 15);
}

// Display quote result
function dashDisplayQuote(quoteData) {
    const resultDiv = document.getElementById('dashQuoteResult');
    if (!resultDiv) return;
    
    document.getElementById('dashResultService').textContent = quoteData.serviceName;
    document.getElementById('dashResultRoute').textContent = quoteData.route;
    document.getElementById('dashResultDelivery').textContent = quoteData.delivery;
    document.getElementById('dashResultBase').textContent = `$${quoteData.basePrice.toFixed(2)}`;
    document.getElementById('dashResultInsurance').textContent = `$${quoteData.insuranceCost.toFixed(2)}`;
    document.getElementById('dashResultSurcharge').textContent = `$${quoteData.surcharge.toFixed(2)}`;
    document.getElementById('dashResultTotal').textContent = `$${quoteData.total.toFixed(2)}`;
    
    resultDiv.style.display = 'block';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Store for booking
    localStorage.setItem('dashLastQuote', JSON.stringify(quoteData));
}

// Handle quote form submission
    quoteForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const origin = document.getElementById('dashOrigin').value;
        const destination = document.getElementById('dashDestination').value;
        const serviceType = document.getElementById('dashServiceType').value;
        const weight = parseFloat(document.getElementById('dashWeight').value) || 1;
        const dimensions = document.getElementById('dashDimensions').value || 'N/A';
        const insurance = parseFloat(document.getElementById('dashInsurance').value) || 0;
        const senderName = document.getElementById('dashSenderName').value;
        const senderEmail = document.getElementById('dashSenderEmail').value;
        
        if (!origin || !destination || !serviceType || !weight || !senderName || !senderEmail) {
            alert('Please fill in all required fields.');
            return;
        }
        
        if (origin === destination) {
            alert('Origin and destination cannot be the same.');
            return;
        }
        
        // Try backend first
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
                    packageType: document.getElementById('dashPackageType').value,
                    insuranceValue: insurance
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                const data = result.data;
                dashDisplayQuote({
                    serviceName: dashServiceDetails[data.quote.serviceType]?.name || data.quote.serviceType,
                    route: `${dashCountryNames[data.quote.originCountry] || data.quote.originCountry} → ${dashCountryNames[data.quote.destinationCountry] || data.quote.destinationCountry}`,
                    delivery: data.deliveryEstimate || dashServiceDetails[data.quote.serviceType]?.delivery || '5-10 days',
                    basePrice: data.quote.basePrice,
                    insuranceCost: data.quote.insuranceCost,
                    surcharge: data.quote.surcharge,
                    total: data.quote.totalPrice,
                    quoteId: data.quote._id,
                    quoteNumber: data.quote.quoteNumber
                });
                return; // Exits the listener successfully if the backend fulfills the request
            }
        } catch (error) {
            console.warn('Backend unavailable, using local calculation');
        }
        
        // Local fallback calculation (Runs seamlessly if backend fetch throws an error or returns success: false)
        const baseRate = dashCalculateBaseRate(origin, destination, weight, serviceType);
        const insuranceCost = insurance > 0 ? insurance * 0.01 : 0;
        const fuelSurcharge = baseRate * 0.075;
        const total = baseRate + insuranceCost + fuelSurcharge;
        
        dashDisplayQuote({
            serviceName: dashServiceDetails[serviceType]?.name || serviceType,
            route: `${dashCountryNames[origin] || origin} → ${dashCountryNames[destination] || destination}`,
            delivery: dashServiceDetails[serviceType]?.delivery || '5-10 days',
            basePrice: baseRate,
            insuranceCost: insuranceCost,
            surcharge: fuelSurcharge,
            total: total,
            quoteId: null,
            quoteNumber: 'LOCAL-' + Date.now().toString().slice(-6)
        });
    }); // This closes the submit event listener smoothly at the correct logical end
    
    // Reset button
    quoteForm.querySelector('button[type="reset"]')?.addEventListener('click', function() {
        document.getElementById('dashQuoteResult').style.display = 'none';
    });
    
    // Print quote
    document.getElementById('dashPrintQuote')?.addEventListener('click', function() {
        const service = document.getElementById('dashResultService').textContent;
        const route = document.getElementById('dashResultRoute').textContent;
        const delivery = document.getElementById('dashResultDelivery').textContent;
        const base = document.getElementById('dashResultBase').textContent;
        const insurance = document.getElementById('dashResultInsurance').textContent;
        const surcharge = document.getElementById('dashResultSurcharge').textContent;
        const total = document.getElementById('dashResultTotal').textContent;
        const quoteNumber = localStorage.getItem('dashLastQuote') ? 
            JSON.parse(localStorage.getItem('dashLastQuote')).quoteNumber : 
            'LOCAL-' + Date.now().toString().slice(-6);
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html><head><title>SwiftShip Quote</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; }
                h1 { color: #0056b3; }
                .total { font-size: 1.5em; font-weight: bold; color: #ff7b00; margin-top: 20px; }
                .footer { margin-top: 40px; font-size: 0.9em; color: #666; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th { background: #0056b3; color: white; padding: 10px; text-align: left; }
                td { padding: 10px; border: 1px solid #ddd; }
            </style></head>
            <body>
                <h1>SwiftShip Express</h1>
                <h2>Shipping Quote #${quoteNumber}</h2>
                <table>
                    <tr><th>Service</th><td>${service}</td></tr>
                    <tr><th>Route</th><td>${route}</td></tr>
                    <tr><th>Delivery</th><td>${delivery}</td></tr>
                </table>
                <h3>Cost Breakdown</h3>
                <table>
                    <tr><th>Item</th><th>Amount</th></tr>
                    <tr><td>Base Shipping</td><td>${base}</td></tr>
                    <tr><td>Insurance</td><td>${insurance}</td></tr>
                    <tr><td>Fuel Surcharge</td><td>${surcharge}</td></tr>
                    <tr style="font-weight: bold;"><td>Total</td><td>${total}</td></tr>
                </table>
                <div class="footer">
                    <p>Quote valid for 30 days. Generated: ${new Date().toLocaleDateString()}</p>
                    <p>SwiftShip Express - 123 Shipping Ave</p>
                </div>
                <script>
                    window.onload = function() { window.print(); setTimeout(window.close, 500); }
                <\/script>
            </body></html>
        `);
        printWindow.document.close();
    });
    
        // Book Now - Creates actual shipment
    document.getElementById('dashBookNow')?.addEventListener('click', function() {
        const total = document.getElementById('dashResultTotal').textContent;
        const service = document.getElementById('dashResultService').textContent;
        const quoteData = localStorage.getItem('dashLastQuote');
        
        if (!quoteData) {
            alert('Please calculate a quote first.');
            return;
        }
        
        const data = JSON.parse(quoteData);
        
        // Get current user
        const user = JSON.parse(localStorage.getItem('user'));
        
        // Prepare shipment data from quote
        const shipmentData = {
            trackingNumber: 'TRK-' + Date.now().toString().slice(-6),
            status: 'pending',
            userId: user ? user.id : null,
            serviceType: document.getElementById('dashServiceType').value,
            recipient: {
                name: document.getElementById('dashSenderName').value,
                city: document.getElementById('dashDestination').value,
                country: document.getElementById('dashDestination').value
            },
            package: {
                weight: parseFloat(document.getElementById('dashWeight').value) || 1,
                dimensions: {
                    length: 0,
                    width: 0,
                    height: 0
                }
            },
            currentLocation: {
                facility: 'Processing Center',
                city: document.getElementById('dashOrigin').value,
                country: document.getElementById('dashOrigin').value
            },
            totalPrice: parseFloat(total.replace('$', ''))
        };
        
        // Send to backend to create shipment
        fetch('/api/dashboard/shipments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                trackingNumber: shipmentData.trackingNumber,
                status: 'pending',
                userId: shipmentData.userId,
                serviceType: shipmentData.serviceType,
                recipient: shipmentData.recipient,
                package: shipmentData.package,
                currentLocation: shipmentData.currentLocation
            })
        })
        .then(r => r.json())
        .then(result => {
            if (result.success) {
                alert(`✅ Shipment created!\nTracking: ${shipmentData.trackingNumber}\nService: ${service}\nTotal: ${total}\n\nYou can track it in "My Shipments".`);
                // Refresh dashboard
                if (typeof loadDashboardData === 'function') {
                    loadDashboardData();
                }
                // Reset form
                document.getElementById('dashboardQuoteForm').reset();
                document.getElementById('dashQuoteResult').style.display = 'none';
            } else {
                alert('❌ Error: ' + (result.message || 'Unknown error. Please try again.'));
            }
        })
        .catch(error => {
            alert('❌ Error creating shipment: ' + error.message);
        });
    });