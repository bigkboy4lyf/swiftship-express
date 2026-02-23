// =============================================
// TRACKING PAGE FUNCTIONALITY
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    // Check URL for tracking number parameter
    const urlParams = new URLSearchParams(window.location.search);
    const trackingNumber = urlParams.get('number');
    
    if (trackingNumber) {
        document.getElementById('trackingNumber').value = trackingNumber;
        searchTracking();
    }
    
    // Add event listener to track button
    document.getElementById('trackBtn').addEventListener('click', searchTracking);
    
    // Add enter key support
    document.getElementById('trackingNumber').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchTracking();
        }
    });
});

// Search tracking function
async function searchTracking() {
    const trackingNumber = document.getElementById('trackingNumber').value.trim().toUpperCase();
    
    if (!trackingNumber) {
        alert('Please enter a tracking number');
        return;
    }
    
    const resultDiv = document.getElementById('trackingResult');
    
    // Show loading
    resultDiv.innerHTML = `
        <div class="loading">
            <i class="fas fa-circle-notch fa-spin"></i>
            <p>Searching for tracking number...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/shipments/track/${trackingNumber}`);
        const result = await response.json();
        
        if (result.success) {
            displayTrackingResult(result.data);
        } else {
            resultDiv.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-search"></i>
                    <h3>Tracking Number Not Found</h3>
                    <p>We couldn't find any shipment with tracking number: <strong>${trackingNumber}</strong></p>
                    <p style="margin-top: 20px; font-size: 0.9rem;">Please check the number and try again.</p>
                </div>
            `;
        }
    } catch (error) {
        resultDiv.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Connection Error</h3>
                <p>Unable to connect to tracking service. Please try again later.</p>
            </div>
        `;
    }
}

// Display tracking result
function displayTrackingResult(data) {
    const resultDiv = document.getElementById('trackingResult');
    
    // Determine status color
    let statusColor = 'var(--primary)';
    if (data.status === 'delivered') statusColor = '#28a745';
    if (data.status === 'delayed') statusColor = '#dc3545';
    
    // Get tracking history or create empty array
    const history = data.trackingHistory || [];
    
    // Sort history by date (oldest first for timeline)
    const sortedHistory = [...history].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    // Generate timeline HTML
    let timelineHtml = '';
    
    if (sortedHistory.length === 0) {
        timelineHtml = '<div class="no-history"><i class="fas fa-history"></i><p>No tracking updates yet</p></div>';
    } else {
        sortedHistory.forEach((entry, index) => {
            const isLatest = index === sortedHistory.length - 1;
            const dotClass = isLatest ? 'current' : 'completed';
            
            timelineHtml += `
                <div class="timeline-item">
                    <div class="timeline-dot ${dotClass}"></div>
                    <div class="timeline-content">
                        <div class="timeline-status">${entry.status.replace('_', ' ').toUpperCase()}</div>
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
    
    resultDiv.innerHTML = `
        <div class="shipment-info">
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Tracking Number</div>
                    <div class="info-value">${data.trackingNumber}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Current Status</div>
                    <div class="info-value" style="color: ${statusColor}">${data.status.replace('_', ' ').toUpperCase()}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Destination</div>
                    <div class="info-value">${data.recipient?.city || 'N/A'}, ${data.recipient?.country || ''}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Est. Delivery</div>
                    <div class="info-value">${data.estimatedDelivery ? new Date(data.estimatedDelivery).toLocaleDateString() : 'N/A'}</div>
                </div>
            </div>
            
            <div class="timeline">
                <h3 class="timeline-title">Tracking History</h3>
                ${timelineHtml}
            </div>
        </div>
    `;
}