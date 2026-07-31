const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');
const { calculateShippingPrice } = require('../utils/pricing');

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

        const { basePrice, insuranceCost, surcharge, totalPrice } = calculateShippingPrice({
            originCountry, destinationCountry, serviceType, weight, insuranceValue
        });

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
            totalPrice,
            pricing: { basePrice, insuranceCost, surcharge },
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