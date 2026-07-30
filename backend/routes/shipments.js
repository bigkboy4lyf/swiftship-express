const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');


// =============================================
// PUBLIC TRACKING - NO AUTHENTICATION NEEDED
// =============================================
router.get('/track/:trackingNumber', async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        
        const shipment = await Shipment.findOne({ 
            trackingNumber: trackingNumber.toUpperCase() 
        }).populate('userId', 'name');
        
        if (!shipment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Tracking number not found' 
            });
        }
        
        // Return only necessary tracking info
        res.json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                estimatedDelivery: shipment.estimatedDelivery,
                currentLocation: shipment.currentLocation,
                trackingHistory: shipment.trackingHistory,
                recipient: {
                    city: shipment.recipient?.city,
                    country: shipment.recipient?.country
                }
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});


// =============================================
// CREATE NEW SHIPMENT
// =============================================
router.post('/create', async (req, res) => {
    try {
        const { sender, recipient, packageDetails, serviceType, userId } = req.body;

        // Generate a professional tracking number: SS + 9 random digits
        const trackingNumber = 'SS' + Math.floor(100000000 + Math.random() * 900000000);

        const newShipment = new Shipment({
            trackingNumber,
            userId: userId, // Links the shipment to the logged-in user
            serviceType,
            sender,
            recipient,
            package: packageDetails,
            status: 'pending_approval',
            trackingHistory: [{
                status: 'pending_approval',
                location: sender.city,
                description: 'Awaiting shipment confirmation'
            }]
        });

        await newShipment.save();
        res.status(201).json({ success: true, data: newShipment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;