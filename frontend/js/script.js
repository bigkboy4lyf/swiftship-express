// =============================================
// DEVICE ID (used to recognize this browser on login -- see auth.js's
// new-device check). Generated once and persisted; not a secret, just a
// stable identifier for "have we OTP-verified this browser before."
// =============================================
function getDeviceId() {
    let id = localStorage.getItem('deviceId');
    if (!id) {
        id = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem('deviceId', id);
    }
    return id;
}

// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const navLinks = document.getElementById('navLinks');

if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        mobileMenuBtn.innerHTML = navLinks.classList.contains('active') 
            ? '<i class="fas fa-times"></i>' 
            : '<i class="fas fa-bars"></i>';
    });
    
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
        });
    });
}

// Header scroll effect
window.addEventListener('scroll', () => {
    const header = document.getElementById('header');
    if (header) {
        header.style.backgroundColor = window.scrollY > 100 
            ? 'rgba(255, 255, 255, 0.98)' 
            : 'rgba(255, 255, 255, 0.95)';
        header.style.boxShadow = window.scrollY > 100 
            ? '0 5px 20px rgba(0, 0, 0, 0.1)' 
            : '0 2px 15px rgba(0, 0, 0, 0.1)';
    }
});

// =============================================
// STATUS LABELS (matches tracking.js / dashboard-ui.js wording)
// =============================================
var STATUS_LABELS = {
    pending_approval: 'Awaiting Confirmation',
    pending: 'Pending',
    processing: 'Processing',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out For Delivery',
    delivered: 'Delivered',
    delayed: 'Delayed',
    rejected: 'Rejected',
    manifest_received: 'Manifest Received'
};

function getStatusLabel(status) {
    if (STATUS_LABELS[status]) return STATUS_LABELS[status];
    // Fallback for any status not in the map above, so nothing ever renders blank
    return (status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// =============================================
// TRACKING FUNCTIONALITY (CHAIN STYLE)
// =============================================
const trackingForm = document.getElementById('trackingForm');
const trackingResult = document.getElementById('trackingResult');

const demoTrackingData = {
    "SS123456789": {
        status: "in_transit",
        update: "Package departed from London distribution center",
        delivery: "Tomorrow by 5:00 PM",
        location: "London, UK"
    },
    "SS987654321": {
        status: "out_for_delivery",
        update: "Package is with the delivery driver in your area",
        delivery: "Today by 3:00 PM",
        location: "Local Hub"
    },
    "SS567890123": {
        status: "delivered",
        update: "Package was delivered to front door",
        delivery: "Yesterday at 2:30 PM",
        location: "Destination"
    }
};

if (trackingForm) {
    trackingForm.addEventListener('submit', async function(e) {
        // e.preventDefault() is necessary for AJAX, but we use 'name' and 'autocomplete' 
        // in HTML to ensure the browser still tracks the input history.
        e.preventDefault();
        const trackingInput = document.getElementById('trackingInput');
        const trackingNumber = trackingInput.value.trim().toUpperCase();
        
        if (!trackingNumber) return;
        
        trackingResult.style.display = 'none';
        
        try {
            const response = await fetch(`/api/shipments/track/${trackingNumber}`);
            const result = await response.json();
            
            if (result.success) {
                displayTrackingResult(result.data, trackingNumber);
            } else {
                checkDemoTrackingData(trackingNumber);
            }
        } catch (error) {
            checkDemoTrackingData(trackingNumber);
        }
        
        // Note: Removed trackingInput.value = ''; to help browser autocomplete registration
    });
}

function displayTrackingResult(data, trackingNumber) {
    const trackingContent = document.getElementById('trackingContent');
    
    let statusColor = 'var(--primary)';
    if (data.status === 'delivered') statusColor = '#28a745';
    if (data.status === 'delayed' || data.status === 'cancelled') statusColor = '#dc3545';
    
    const history = data.trackingHistory || [];
    let timelineHtml = '';
    
    if (history.length === 0) {
        timelineHtml = '<div class="no-history"><p>No tracking updates available yet.</p></div>';
    } else {
        // FIXED: Sorts oldest to newest (up-to-down) to match the dashboard timeline
        const sortedHistory = [...history].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        sortedHistory.forEach((entry, index) => {
            // FIXED: Marks the very last item in the chronological array as the current active status
            const isLatest = index === sortedHistory.length - 1;
            const dotClass = isLatest ? 'current' : 'completed';
            
            timelineHtml += `
                <div class="timeline-item">
                    <div class="timeline-dot ${dotClass}"></div>
                    <div class="timeline-content">
                        <div class="timeline-status">${getStatusLabel(entry.status)}</div>
                        ${entry.location ? `<div class="timeline-location"><i class="fas fa-map-marker-alt"></i> ${entry.location}</div>` : ''}
                        ${entry.description ? `<div class="timeline-description">${entry.description}</div>` : ''}
                        <div class="timeline-date">
                            <i class="far fa-clock"></i> ${new Date(entry.timestamp).toLocaleString()}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    trackingContent.innerHTML = `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Tracking Number</div>
                <div class="info-value">${trackingNumber}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Current Status</div>
                <div class="info-value" style="color: ${statusColor}">${getStatusLabel(data.status || 'processing')}</div>
            </div>
        </div>
        
        <div class="timeline">
            <h3 class="timeline-title">Tracking History</h3>
            ${timelineHtml}
        </div>
    `;
    
    trackingResult.style.display = 'block';
}

function checkDemoTrackingData(trackingNumber) {
    if (demoTrackingData[trackingNumber]) {
        const demo = demoTrackingData[trackingNumber];
        
        const mockData = {
            status: demo.status,
            trackingHistory: [
                {
                    status: demo.status,
                    location: demo.location,
                    description: demo.update,
                    timestamp: new Date().toISOString()
                },
                {
                    status: "manifest_received",
                    location: "Origin Facility",
                    description: "Shipment information received",
                    timestamp: new Date(Date.now() - 86400000).toISOString()
                }
            ]
        };
        displayTrackingResult(mockData, trackingNumber);
    } else {
        document.getElementById('trackingContent').innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #dc3545; margin-bottom: 10px;"></i>
                <p>Tracking number <strong>${trackingNumber}</strong> not found. Please verify the number and try again.</p>
            </div>`;
        trackingResult.style.display = 'block';
    }
}

// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        // Read the href at click time, not bind time -- some links (e.g. a
        // modal's "Track This Shipment") start as "#" placeholders and get
        // their real destination filled in by other JS later. If that's
        // happened, this is no longer a same-page anchor link, so let the
        // browser navigate normally instead of hijacking the click.
        const hash = this.getAttribute('href');
        if (!hash || !hash.startsWith('#') || hash.length <= 1) return;

        e.preventDefault();
        const target = document.querySelector(hash);
        if (target) {
            window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
        }
    });
});

// =============================================
// NAVBAR UPDATE
// =============================================
function updateNavbar() {
    const user = localStorage.getItem('user');
    const signInItem = document.getElementById('signInItem');
    if (!signInItem) return;
    
    if (user) {
        const userData = JSON.parse(user);
        signInItem.innerHTML = `
            <a href="dashboard.html" style="display: flex; align-items: center; gap: 5px;">
                <i class="fas fa-user-circle"></i> ${userData.name || 'Account'}
            </a>
        `;
    } else {
        signInItem.innerHTML = '<a href="account.html">Sign In</a>';
    }
}

document.addEventListener('DOMContentLoaded', updateNavbar);