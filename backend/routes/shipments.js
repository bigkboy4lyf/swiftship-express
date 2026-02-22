const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');

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
            status: 'pending',
            trackingHistory: [{
                status: 'pending',
                location: sender.city,
                description: 'Shipment information received'
            }]
        });

        await newShipment.save();
        res.status(201).json({ success: true, data: newShipment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// GET USER'S SHIPMENTS (For the Dashboard)
// =============================================
router.get('/my-shipments/:userId', async (req, res) => {
    try {
        const shipments = await Shipment.find({ userId: req.params.userId });
        res.json({ success: true, data: shipments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;