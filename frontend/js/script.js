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
// TRACKING FUNCTIONALITY
// =============================================
const trackingForm = document.getElementById('trackingForm');
const trackingResult = document.getElementById('trackingResult');
const trackNum = document.getElementById('trackNum');
const trackStatus = document.getElementById('trackStatus');
const trackUpdate = document.getElementById('trackUpdate');
const trackDelivery = document.getElementById('trackDelivery');

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
        
        trackingInput.value = '';
    });
}

function displayTrackingResult(data, trackingNumber) {
    trackNum.textContent = trackingNumber;
    trackStatus.textContent = data.status || 'Unknown';
    
    if (data.trackingHistory?.length) {
        const latest = data.trackingHistory[data.trackingHistory.length - 1];
        trackUpdate.textContent = `${latest.description || 'Status updated'} - ${latest.location || 'Unknown'}`;
    } else {
        trackUpdate.textContent = data.currentLocation 
            ? `At ${data.currentLocation.city || 'Unknown'}`
            : 'No tracking updates';
    }
    
    const date = data.estimatedDelivery ? new Date(data.estimatedDelivery) : null;
    trackDelivery.textContent = date ? date.toLocaleDateString() : 'Not available';
    
    trackStatus.style.color = data.status === 'delivered' ? '#28a745' : 'var(--accent)';
    trackingResult.style.display = 'block';
}

function checkDemoTrackingData(trackingNumber) {
    if (demoTrackingData[trackingNumber]) {
        const demo = demoTrackingData[trackingNumber];
        trackNum.textContent = trackingNumber;
        trackStatus.textContent = demo.status;
        trackUpdate.textContent = demo.update;
        trackDelivery.textContent = demo.delivery;
        trackStatus.style.color = demo.status === 'Delivered' ? '#28a745' : 'var(--accent)';
        trackingResult.style.display = 'block';
    } else {
        trackNum.textContent = trackingNumber;
        trackStatus.textContent = "Not Found";
        trackStatus.style.color = "#dc3545";
        trackUpdate.textContent = "Tracking number not found";
        trackDelivery.textContent = "N/A";
        trackingResult.style.display = 'block';
    }
}

// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
        }
    });
});

// =============================================
// NAVBAR UPDATE - Runs on all pages
// =============================================
function updateNavbar() {
    const user = localStorage.getItem('user');
    const signInItem = document.getElementById('signInItem');
    
    if (!signInItem) return;
    
    // Get current page filename
    const currentPage = window.location.pathname.split('/').pop();
    
    // Don't modify navbar on auth pages
    if (currentPage === 'login.html' || currentPage === 'register.html') {
        return;
    }
    
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

// Logout function
window.logout = function() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = 'index.html';
};

// Run on page load
document.addEventListener('DOMContentLoaded', updateNavbar);