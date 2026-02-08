// Mobile menu toggle for quote page
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const navLinks = document.getElementById('navLinks');

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

// Quote calculation functionality
const quoteForm = document.getElementById('shippingQuoteForm');
const quoteResult = document.getElementById('quoteResult');
const printQuoteBtn = document.getElementById('printQuote');
const bookNowBtn = document.getElementById('bookNow');

// Country names mapping
const countryNames = {
    'US': 'United States',
    'CA': 'Canada',
    'UK': 'United Kingdom',
    'DE': 'Germany',
    'FR': 'France',
    'AU': 'Australia',
    'JP': 'Japan',
    'CN': 'China',
    'IN': 'India'
};

// Service type details
const serviceDetails = {
    'express': { name: 'Express Delivery', delivery: '1-3 days', baseMultiplier: 1.8 },
    'standard': { name: 'Standard Shipping', delivery: '5-10 days', baseMultiplier: 1.0 },
    'economy': { name: 'Economy Shipping', delivery: '10-20 days', baseMultiplier: 0.7 },
    'international': { name: 'International Priority', delivery: '3-7 days', baseMultiplier: 2.2 },
    'cargo': { name: 'Cargo/Freight Shipping', delivery: '7-14 days', baseMultiplier: 1.5 }
};

// =============================================
// MAIN CHANGE: Quote form submission
// =============================================
if (quoteForm) {
    quoteForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Get form values
        const origin = document.getElementById('origin').value;
        const destination = document.getElementById('destination').value;
        const serviceType = document.getElementById('serviceType').value;
        const weight = parseFloat(document.getElementById('weight').value) || 1;
        const dimensions = document.getElementById('dimensions').value;
        const insurance = parseFloat(document.getElementById('insurance').value) || 0;
        
        // Validate form
        if (!origin || !destination || !serviceType || !weight) {
            alert('Please fill in all required fields.');
            return;
        }
        
        if (origin === destination) {
            alert('Origin and destination cannot be the same.');
            return;
        }
        
        // Try to send to backend first
        try {
            const response = await fetch('/api/quotes/calculate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    senderName: document.getElementById('senderName').value,
                    senderEmail: document.getElementById('senderEmail').value,
                    originCountry: origin,
                    destinationCountry: destination,
                    serviceType: serviceType,
                    weight: weight,
                    dimensions: dimensions,
                    packageType: document.getElementById('packageType').value,
                    insuranceValue: insurance
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // ✅ Backend calculation successful
                console.log('Backend quote:', result.data);
                displayBackendQuoteResult(result.data);
            } else {
                // Backend failed but gave a response
                console.warn('Backend warning:', result.message);
                // Fall back to local calculation
                calculateLocalQuote(origin, destination, serviceType, weight, dimensions, insurance);
            }
            
        } catch (error) {
            // ❌ Backend completely failed (server down, network error)
            console.error('Backend connection failed, using local calculation:', error);
            calculateLocalQuote(origin, destination, serviceType, weight, dimensions, insurance);
        }
    });
}

// =============================================
// Display backend quote result
// =============================================
function displayBackendQuoteResult(quoteData) {
    const { quote, summary, deliveryEstimate } = quoteData;
    
    document.getElementById('resultService').textContent = 
        serviceDetails[quote.serviceType]?.name || quote.serviceType;
    
    document.getElementById('resultRoute').textContent = 
        `${countryNames[quote.originCountry] || quote.originCountry} to ${countryNames[quote.destinationCountry] || quote.destinationCountry}`;
    
    document.getElementById('resultDelivery').textContent = 
        deliveryEstimate || serviceDetails[quote.serviceType]?.delivery || '5-10 days';
    
    document.getElementById('resultBase').textContent = `$${quote.basePrice.toFixed(2)}`;
    document.getElementById('resultInsurance').textContent = `$${quote.insuranceCost.toFixed(2)}`;
    document.getElementById('resultSurcharge').textContent = `$${quote.surcharge.toFixed(2)}`;
    document.getElementById('resultTotal').textContent = `$${quote.totalPrice.toFixed(2)}`;
    
    // Show quote result
    quoteResult.style.display = 'block';
    
    // Scroll to result
    quoteResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Store quote data for booking
    localStorage.setItem('lastQuoteId', quote._id);
    localStorage.setItem('lastQuoteNumber', quote.quoteNumber);
    localStorage.setItem('lastQuoteTotal', quote.totalPrice);
}

// =============================================
// Fallback: Local quote calculation
// =============================================
function calculateLocalQuote(origin, destination, serviceType, weight, dimensions, insurance) {
    // Calculate base rate based on weight, distance, and service type
    const baseRate = calculateBaseRate(origin, destination, weight, serviceType);
    
    // Calculate insurance cost (1% of insured value)
    const insuranceCost = insurance > 0 ? insurance * 0.01 : 0;
    
    // Calculate fuel surcharge (7.5% of base rate)
    const fuelSurcharge = baseRate * 0.075;
    
    // Calculate total
    const total = baseRate + insuranceCost + fuelSurcharge;
    
    // Display results
    document.getElementById('resultService').textContent = serviceDetails[serviceType].name;
    document.getElementById('resultRoute').textContent = `${countryNames[origin]} to ${countryNames[destination]}`;
    document.getElementById('resultDelivery').textContent = serviceDetails[serviceType].delivery;
    document.getElementById('resultBase').textContent = `$${baseRate.toFixed(2)}`;
    document.getElementById('resultInsurance').textContent = `$${insuranceCost.toFixed(2)}`;
    document.getElementById('resultSurcharge').textContent = `$${fuelSurcharge.toFixed(2)}`;
    document.getElementById('resultTotal').textContent = `$${total.toFixed(2)}`;
    
    // Show quote result
    quoteResult.style.display = 'block';
    
    // Scroll to result
    quoteResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Store for booking (local quote)
    localStorage.setItem('lastQuoteLocal', JSON.stringify({
        service: serviceDetails[serviceType].name,
        total: total,
        timestamp: new Date().toISOString()
    }));
}

// Calculate base shipping rate (keep your existing function)
function calculateBaseRate(origin, destination, weight, serviceType) {
    // Base distance factor (simplified calculation)
    let distanceFactor = 1.0;
    
    // Simplified distance calculation based on country pairs
    const distanceMatrix = {
        'US-CA': 1.0, 'US-UK': 2.5, 'US-DE': 2.7, 'US-FR': 2.8, 'US-AU': 3.5, 'US-JP': 3.2, 'US-CN': 3.3, 'US-IN': 3.4,
        'CA-UK': 2.3, 'CA-DE': 2.5, 'CA-FR': 2.6, 'CA-AU': 3.8, 'CA-JP': 3.5, 'CA-CN': 3.6, 'CA-IN': 3.7,
        'UK-DE': 1.2, 'UK-FR': 1.1, 'UK-AU': 3.2, 'UK-JP': 3.0, 'UK-CN': 3.1, 'UK-IN': 3.3,
        'DE-FR': 1.0, 'DE-AU': 3.3, 'DE-JP': 3.1, 'DE-CN': 3.2, 'DE-IN': 3.4,
        'FR-AU': 3.4, 'FR-JP': 3.2, 'FR-CN': 3.3, 'FR-IN': 3.5,
        'AU-JP': 2.8, 'AU-CN': 2.9, 'AU-IN': 2.7,
        'JP-CN': 1.5, 'JP-IN': 2.2,
        'CN-IN': 1.8
    };
    
    const route = `${origin}-${destination}`;
    const reverseRoute = `${destination}-${origin}`;
    
    if (distanceMatrix[route]) {
        distanceFactor = distanceMatrix[route];
    } else if (distanceMatrix[reverseRoute]) {
        distanceFactor = distanceMatrix[reverseRoute];
    }
    
    // Weight factor
    const weightFactor = weight * 0.5;
    
    // Service factor
    const serviceFactor = serviceDetails[serviceType].baseMultiplier;
    
    // Calculate base rate
    const baseRate = 10 + (distanceFactor * 5) + (weightFactor * 2) * serviceFactor;
    
    return Math.max(baseRate, 15); // Minimum $15
}

// Print quote functionality (updated for backend)
if (printQuoteBtn) {
    printQuoteBtn.addEventListener('click', function() {
        const service = document.getElementById('resultService').textContent;
        const route = document.getElementById('resultRoute').textContent;
        const delivery = document.getElementById('resultDelivery').textContent;
        const base = document.getElementById('resultBase').textContent;
        const insurance = document.getElementById('resultInsurance').textContent;
        const surcharge = document.getElementById('resultSurcharge').textContent;
        const total = document.getElementById('resultTotal').textContent;
        
        // Get quote number from localStorage or generate one
        const quoteNumber = localStorage.getItem('lastQuoteNumber') || 'LOCAL-' + Date.now().toString().slice(-6);
        
        // Create a new window for printing
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>SwiftShip Express Quote</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h1 { color: #0056b3; }
                        .total { font-size: 1.5em; font-weight: bold; color: #ff7b00; margin-top: 20px; }
                        .footer { margin-top: 40px; font-size: 0.9em; color: #666; }
                        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                        th { background-color: #0056b3; color: white; padding: 10px; text-align: left; }
                        td { padding: 10px; border: 1px solid #ddd; }
                    </style>
                </head>
                <body>
                    <h1>SwiftShip Express</h1>
                    <h2>Shipping Quote #${quoteNumber}</h2>
                    
                    <table>
                        <tr>
                            <th>Service</th>
                            <td>${service}</td>
                        </tr>
                        <tr>
                            <th>Route</th>
                            <td>${route}</td>
                        </tr>
                        <tr>
                            <th>Estimated Delivery</th>
                            <td>${delivery}</td>
                        </tr>
                    </table>
                    
                    <h3>Cost Breakdown</h3>
                    <table>
                        <tr>
                            <th>Item</th>
                            <th>Amount</th>
                        </tr>
                        <tr>
                            <td>Base Shipping</td>
                            <td>${base}</td>
                        </tr>
                        <tr>
                            <td>Insurance</td>
                            <td>${insurance}</td>
                        </tr>
                        <tr>
                            <td>Fuel Surcharge</td>
                            <td>${surcharge}</td>
                        </tr>
                        <tr style="font-weight: bold;">
                            <td>Total Estimated Cost</td>
                            <td>${total}</td>
                        </tr>
                    </table>
                    
                    <div class="footer">
                        <p>Quote valid for 30 days.</p>
                        <p>Generated on: ${new Date().toLocaleDateString()}</p>
                        <p>SwiftShip Express - 123 Shipping Ave, Logistics City</p>
                        <p>Phone: +1 (123) 456-7890 | Email: quotes@swiftship.com</p>
                    </div>
                    
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(function() {
                                window.close();
                            }, 500);
                        }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    });
}

// Book now functionality (updated for backend)
if (bookNowBtn) {
    bookNowBtn.addEventListener('click', async function() {
        const service = document.getElementById('resultService').textContent;
        const total = document.getElementById('resultTotal').textContent;
        const quoteId = localStorage.getItem('lastQuoteId');
        
        if (quoteId) {
            // Try to convert backend quote to shipment
            try {
                const response = await fetch(`/api/quotes/${quoteId}/convert`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert(`✅ Shipment created successfully!\n\nTracking Number: ${result.data.trackingNumber}\nService: ${service}\nTotal: ${total}\n\nA shipping specialist will contact you shortly.`);
                } else {
                    // Fallback to local booking
                    alertLocalBooking(service, total);
                }
            } catch (error) {
                console.error('Booking error:', error);
                alertLocalBooking(service, total);
            }
        } else {
            // Local quote booking
            alertLocalBooking(service, total);
        }
    });
}

function alertLocalBooking(service, total) {
    alert(`Thank you for choosing ${service}!\n\nYour total is ${total}.\n\nA shipping specialist will contact you shortly to complete the booking.`);
}

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

// Form auto-fill for testing (remove in production)
document.addEventListener('DOMContentLoaded', function() {
    // Auto-fill form for demo purposes
    setTimeout(() => {
        if (document.getElementById('senderName') && !document.getElementById('senderName').value) {
            document.getElementById('senderName').value = 'John Smith';
            document.getElementById('senderEmail').value = 'john.smith@example.com';
            document.getElementById('origin').value = 'US';
            document.getElementById('destination').value = 'UK';
            document.getElementById('serviceType').value = 'express';
            document.getElementById('weight').value = '2.5';
            document.getElementById('dimensions').value = '30x20x15';
            document.getElementById('insurance').value = '500';
        }
    }, 500);
});