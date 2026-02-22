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
        res.status(401).json({ success: false, message: 'Unauthorized' });
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
            inTransitShipments = await Shipment.countDocuments({ status: 'in_transit' });
            pendingShipments = await Shipment.countDocuments({ 
                status: { $in: ['pending', 'processing'] } 
            });
        } else {
            totalShipments = await Shipment.countDocuments({ userId: req.user.id });
            deliveredShipments = await Shipment.countDocuments({ userId: req.user.id, status: 'delivered' });
            inTransitShipments = await Shipment.countDocuments({ userId: req.user.id, status: 'in_transit' });
            pendingShipments = await Shipment.countDocuments({ 
                userId: req.user.id,
                status: { $in: ['pending', 'processing'] } 
            });
        }
        
        // Admin-only stats
        let totalUsers = 0, activeShipments = 0, revenue = 45289;
        
        if (isAdmin) {
            totalUsers = await User.countDocuments();
            activeShipments = await Shipment.countDocuments({ 
                status: { $in: ['in_transit', 'processing', 'pending'] } 
            });
            
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
// GET SHIPMENTS
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
        
        res.json({
            success: true,
            data: shipments
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// GET USERS (Admin only)
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