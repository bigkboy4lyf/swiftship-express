const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Shipment = require('../models/Shipment');
const User = require('../models/User');

// Protection Middleware
const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'swiftship_secret_key_2023_change_this_later');
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};

// =============================================
// DASHBOARD STATS
// =============================================
router.get('/stats', protect, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        let totalShipments, deliveredShipments, inTransitShipments, pendingShipments;

        if (isAdmin) {
            totalShipments = await Shipment.countDocuments();
            deliveredShipments = await Shipment.countDocuments({ status: 'delivered' });
            inTransitShipments = await Shipment.countDocuments({ status: { $in: ['in_transit', 'out_for_delivery'] } });
            pendingShipments = await Shipment.countDocuments({ status: { $in: ['pending', 'processing'] } });
        } else {
            totalShipments = await Shipment.countDocuments({ userId: req.user.id });
            deliveredShipments = await Shipment.countDocuments({ userId: req.user.id, status: 'delivered' });
            inTransitShipments = await Shipment.countDocuments({ userId: req.user.id, status: { $in: ['in_transit', 'out_for_delivery'] } });
            pendingShipments = await Shipment.countDocuments({ userId: req.user.id, status: { $in: ['pending', 'processing'] } });
        }

        let totalUsers = 0, activeShipments = 0, revenue = 45289;
        if (isAdmin) {
            totalUsers = await User.countDocuments();
            activeShipments = await Shipment.countDocuments({ status: { $ne: 'delivered' } });
            const shipments = await Shipment.find();
            revenue = shipments.reduce((sum, s) => sum + (s.package?.value || 0), 0) || 45289;
        }

        res.json({
            success: true,
            data: {
                totalShipments,
                deliveredShipments,
                inTransitShipments,
                pendingShipments,
                totalUsers,
                activeShipments,
                revenue
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// GET SHIPMENTS (with optional userId filter for admin)
// =============================================
router.get('/shipments', protect, async (req, res) => {
    try {
        const { limit = 10, userId } = req.query;
        const isAdmin = req.user.role === 'admin';
        let query = {};

        if (userId && isAdmin) {
            query.userId = userId;
        } else if (!isAdmin) {
            query.userId = req.user.id;
        }

        const shipments = await Shipment.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('userId', 'name email');

        res.json({ success: true, data: shipments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// CREATE NEW SHIPMENT (Admin only)
// =============================================
router.post('/shipments', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const shipmentData = req.body;
        if (!shipmentData.userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        // Generate tracking number if not provided
        if (!shipmentData.trackingNumber) {
            shipmentData.trackingNumber = 'SS' + Date.now().toString().slice(-9);
        }

        // Add initial tracking history
        shipmentData.trackingHistory = [{
            status: shipmentData.status || 'pending',
            location: shipmentData.currentLocation?.city || 'Processing Center',
            description: 'Shipment created',
            timestamp: new Date()
        }];

        const shipment = new Shipment(shipmentData);
        await shipment.save();

        res.status(201).json({ success: true, data: shipment });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// UPDATE SHIPMENT STATUS
// =============================================
router.patch('/shipments/:id/status', protect, async (req, res) => {
    try {
        const { status, location, description } = req.body;
        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }

        shipment.status = status;
        shipment.trackingHistory.push({
            status,
            location: location || shipment.currentLocation?.city,
            description: description || `Status updated to ${status}`,
            timestamp: new Date()
        });

        if (location) {
            shipment.currentLocation = {
                facility: location,
                city: location.split(',')[0].trim(),
                timestamp: new Date()
            };
        }

        if (status === 'delivered') {
            shipment.actualDelivery = new Date();
        }

        await shipment.save();
        res.json({ success: true, data: shipment });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// DELETE SHIPMENT (Admin only)
// =============================================
router.delete('/shipments/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const shipment = await Shipment.findByIdAndDelete(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        res.json({ success: true, message: 'Shipment deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// GET ALL USERS (Admin only)
// =============================================
router.get('/users', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const users = await User.find().select('-password');
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;