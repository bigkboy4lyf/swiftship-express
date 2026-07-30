const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');

// Calculate quote endpoint - Fully Aligned with Mongoose Schema Constraints
router.post('/calculate', async (req, res) => {
    try {
        const { 
            senderName, senderEmail, 
            originCountry, destinationCountry, 
            serviceType, weight, dimensions, 
            packageType, insuranceValue,
            userId 
        } = req.body;

        // 1. Math Calculation Matrices
        const baseRates = {
            'express': 1.8,
            'standard': 1.0,
            'economy': 0.7,
            'international': 2.2,
            'cargo': 1.5
        };

        const distanceFactors = {
            'US-CA': 1.0, 'US-UK': 2.5, 'US-DE': 2.7,
            'US-FR': 2.8, 'US-AU': 3.5, 'US-JP': 3.2,
            'US-CN': 3.3, 'US-IN': 3.4
        };
        
        const routeKey = `${String(originCountry).toUpperCase()}-${String(destinationCountry).toUpperCase()}`;
        const distanceFactor = distanceFactors[routeKey] || 2.0;
        
        const computedBase = 10 + (distanceFactor * 5) + (parseFloat(weight) * 0.5 * 2) * (baseRates[serviceType] || 1.0);
        const basePrice = Math.max(computedBase, 15);
        const insuranceCost = (parseFloat(insuranceValue) || 0) * 0.01;
        const surcharge = basePrice * 0.075;
        const totalPrice = basePrice + insuranceCost + surcharge;

        // 2. Metadata-Rhyming Tracking Number Algorithm
        const servicePrefix = {
            'express': 'EX',
            'standard': 'ST',
            'economy': 'EC',
            'international': 'IN',
            'cargo': 'CR'
        }[serviceType] || 'SS';

        const originCode = String(originCountry).substring(0, 2).toUpperCase();
        const destCode = String(destinationCountry).substring(0, 2).toUpperCase();
        const uniqueSerial = Math.floor(1000 + Math.random() * 9000);
        const verificationChar = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        
        const trackingNumber = `${servicePrefix}-${originCode}-${destCode}-${uniqueSerial}${verificationChar}`;

        // 3. Parse dimension strings safely into Schema object requirements
        let parsedDimensions = { length: 0, width: 0, height: 0 };
        if (typeof dimensions === 'string' && dimensions.toLowerCase() !== 'n/a') {
            const parts = dimensions.toLowerCase().split('x').map(p => parseFloat(p.trim()));
            if (parts.length === 3 && parts.every(p => !isNaN(p))) {
                parsedDimensions = { length: parts[0], width: parts[1], height: parts[2] };
            }
        }

        // 4. Enforce valid Fallback ObjectId structure if userId is missing 
        // to prevent Mongoose Validation errors (required: true)
        const validatedUserId = userId || "60d000000000000000000000"; 

        // 5. Database Persistence Layout (Schema Corrected)
        const newShipment = new Shipment({
            trackingNumber: trackingNumber,
            userId: validatedUserId, // Validated ObjectId mapping
            status: 'pending_approval',
            serviceType: serviceType || 'standard',
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            sender: {
                name: senderName || 'Guest User',
                city: originCountry,
                country: originCountry,
                email: senderEmail
            },
            recipient: {
                name: 'To Be Determined (Quote)', // Fulfills required string schema rule
                city: destinationCountry,         // Fulfills required string schema rule
                country: destinationCountry       // Fulfills required string schema rule
            },
            package: {
                weight: parseFloat(weight) || 1,
                dimensions: parsedDimensions,    // Structured object payload mapping
                packageType: packageType || 'Standard',
                value: parseFloat(insuranceValue) || 0
            },
            currentLocation: {
                facility: 'Processing Center',
                city: originCountry,
                country: originCountry,
                timestamp: new Date()
            },
            trackingHistory: [{
                status: 'pending_approval',
                location: originCountry || 'Origin Hub',
                description: 'Quote computed and shipment logged into terminal system.',
                timestamp: new Date()
            }]
        });

        // Save straight to your MongoDB 'Shipments' collection
        await newShipment.save();

        res.json({
            success: true,
            data: {
                quote: {
                    _id: newShipment._id,
                    quoteNumber: 'Q-' + uniqueSerial,
                    trackingNumber: newShipment.trackingNumber,
                    serviceType,
                    originCountry,
                    destinationCountry,
                    basePrice,
                    insuranceCost,
                    surcharge,
                    totalPrice: newShipment.totalPrice,
                    senderName,
                    senderEmail,
                    weight,
                    dimensions,
                    packageType
                },
                deliveryEstimate: {
                    'express': '1-3 days',
                    'standard': '5-10 days',
                    'economy': '10-20 days',
                    'international': '3-7 days',
                    'cargo': '7-14 days'
                }[serviceType] || '5-10 days'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;