// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const navLinks = document.getElementById('navLinks');

// Check if elements exist (for pages that don't have them)
if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        mobileMenuBtn.innerHTML = navLinks.classList.contains('active') 
            ? '<i class="fas fa-times"></i>' 
            : '<i class="fas fa-bars"></i>';
    });
    
    // Close mobile menu when clicking a link
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
        if (window.scrollY > 100) {
            header.style.backgroundColor = 'rgba(255, 255, 255, 0.98)';
            header.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            header.style.boxShadow = '0 2px 15px rgba(0, 0, 0, 0.1)';
        }
    }
});

// =============================================
// MAIN CHANGE: Tracking form - Connect to Backend
// =============================================
const trackingForm = document.getElementById('trackingForm');
const trackingResult = document.getElementById('trackingResult');
const trackNum = document.getElementById('trackNum');
const trackStatus = document.getElementById('trackStatus');
const trackUpdate = document.getElementById('trackUpdate');
const trackDelivery = document.getElementById('trackDelivery');

// Keep demo data as fallback
const demoTrackingData = {
    "SS123456789": {
        status: "In Transit",
        update: "Package departed from London distribution center",
        delivery: "Tomorrow by 5:00 PM"
    },
    "SS987654321": {
        status: "Out for Delivery",
        update: "Package is with the delivery driver in your area",
        delivery: "Today by 3:00 PM"
    },
    "SS567890123": {
        status: "Delivered",
        update: "Package was delivered to front door",
        delivery: "Yesterday at 2:30 PM"
    }
};

if (trackingForm) {
    trackingForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const trackingInput = this.querySelector('.tracking-input');
        const trackingNumber = trackingInput.value.trim().toUpperCase();
        
        // Clear previous results
        trackingResult.style.display = 'none';
        
        // Try to fetch from backend first
        try {
            const response = await fetch(`/api/shipments/track/${trackingNumber}`);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                // ✅ Backend tracking successful
                displayBackendTrackingResult(result.data, trackingNumber);
            } else {
                // Backend returned error
                console.warn('Backend tracking error:', result.message);
                // Fall back to demo data
                checkDemoTrackingData(trackingNumber);
            }
            
        } catch (error) {
            // ❌ Network error or server down
            console.error('Backend connection failed:', error);
            // Fall back to demo data
            checkDemoTrackingData(trackingNumber);
        }
        
        // Clear the input
        trackingInput.value = '';
    });
}

// =============================================
// Display backend tracking result
// =============================================
function displayBackendTrackingResult(trackingData, trackingNumber) {
    trackNum.textContent = trackingNumber;
    trackStatus.textContent = trackingData.status || 'Unknown';
    
    // Get latest tracking update
    if (trackingData.trackingHistory && trackingData.trackingHistory.length > 0) {
        const latestUpdate = trackingData.trackingHistory[trackingData.trackingHistory.length - 1];
        trackUpdate.textContent = `${latestUpdate.description || 'Status updated'} - ${latestUpdate.location || 'Unknown location'}`;
    } else {
        trackUpdate.textContent = trackingData.currentLocation 
            ? `At ${trackingData.currentLocation.facility || 'facility'} in ${trackingData.currentLocation.city || 'Unknown'}`
            : 'No tracking updates available';
    }
    
    // Format delivery date
    if (trackingData.estimatedDelivery) {
        const deliveryDate = new Date(trackingData.estimatedDelivery);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        if (deliveryDate.toDateString() === today.toDateString()) {
            trackDelivery.textContent = `Today by ${deliveryDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        } else if (deliveryDate.toDateString() === tomorrow.toDateString()) {
            trackDelivery.textContent = `Tomorrow by ${deliveryDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        } else {
            trackDelivery.textContent = deliveryDate.toLocaleDateString() + ' by ' + 
                                       deliveryDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
    } else {
        trackDelivery.textContent = 'Estimated delivery not available';
    }
    
    // Change status color based on status
    const statusColors = {
        'delivered': '#28a745',
        'out_for_delivery': '#17a2b8',
        'in_transit': 'var(--accent)',
        'pending': '#6c757d',
        'delayed': '#dc3545',
        'exception': '#dc3545'
    };
    
    trackStatus.style.color = statusColors[trackingData.status] || 'var(--accent)';
    
    // Show tracking result
    trackingResult.style.display = 'block';
    
    // Scroll to results
    setTimeout(() => {
        trackingResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// =============================================
// Fallback: Check demo tracking data
// =============================================
function checkDemoTrackingData(trackingNumber) {
    if (demoTrackingData[trackingNumber]) {
        trackNum.textContent = trackingNumber;
        trackStatus.textContent = demoTrackingData[trackingNumber].status;
        trackUpdate.textContent = demoTrackingData[trackingNumber].update;
        trackDelivery.textContent = demoTrackingData[trackingNumber].delivery;
        
        // Change status color based on status
        if (demoTrackingData[trackingNumber].status === "Delivered") {
            trackStatus.style.color = "#28a745";
        } else if (demoTrackingData[trackingNumber].status === "Out for Delivery") {
            trackStatus.style.color = "#17a2b8";
        } else {
            trackStatus.style.color = "var(--accent)";
        }
        
        trackingResult.style.display = 'block';
        
        // Scroll to results
        setTimeout(() => {
            trackingResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
        
    } else {
        // Show error for invalid tracking number
        trackNum.textContent = trackingNumber;
        trackStatus.textContent = "Not Found";
        trackStatus.style.color = "#dc3545";
        trackUpdate.textContent = "We couldn't find a shipment with this tracking number. Please check the number and try again.";
        trackDelivery.textContent = "N/A";
        
        trackingResult.style.display = 'block';
        
        // Scroll to results
        setTimeout(() => {
            trackingResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
}

// =============================================
// Optional: Add test tracking numbers for demo
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    // Add some test tracking numbers to localStorage for demo
    // This simulates having shipments in the database
    if (!localStorage.getItem('demoShipments')) {
        const demoShipments = [
            {
                trackingNumber: "SS789012345",
                status: "in_transit",
                currentLocation: { city: "New York", facility: "JFK Sorting Center" },
                trackingHistory: [
                    {
                        status: "picked_up",
                        location: "Los Angeles",
                        description: "Package picked up from sender",
                        timestamp: new Date(Date.now() - 2*24*60*60*1000).toISOString()
                    },
                    {
                        status: "in_transit",
                        location: "Chicago",
                        description: "Package arrived at distribution center",
                        timestamp: new Date(Date.now() - 1*24*60*60*1000).toISOString()
                    }
                ],
                estimatedDelivery: new Date(Date.now() + 2*24*60*60*1000).toISOString(),
                serviceType: "express"
            },
            {
                trackingNumber: "SS345678901",
                status: "out_for_delivery",
                currentLocation: { city: "London", facility: "Local Delivery Depot" },
                trackingHistory: [
                    {
                        status: "in_transit",
                        location: "Paris",
                        description: "Package cleared customs",
                        timestamp: new Date(Date.now() - 1*24*60*60*1000).toISOString()
                    }
                ],
                estimatedDelivery: new Date(Date.now() + 4*60*60*1000).toISOString(), // 4 hours from now
                serviceType: "international"
            }
        ];
        localStorage.setItem('demoShipments', JSON.stringify(demoShipments));
    }
    
    // Auto-fill tracking input with demo number for testing (optional)
    if (trackingForm && !trackingForm.querySelector('.tracking-input').value) {
        setTimeout(() => {
            trackingForm.querySelector('.tracking-input').placeholder = "Try: SS123456789 or SS789012345";
        }, 1000);
    }
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 80,
                behavior: 'smooth'
            });
        }
    });
});