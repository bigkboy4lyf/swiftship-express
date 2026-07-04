const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); // ✅ Added to parse tokens locally
const User = require('../models/User');

// ✅ FIXED: Replaced the missing external file with your working token verification
const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'swiftship_secret_key_2023_change_this_later');
        req.user = decoded; // Standardized to match req.user.id expectations
        req.user.id = decoded.id; 
        next();
    } catch (e) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};

// 👥 GET ROUTE: Completely untouched logic
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json(user.addresses || []);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching addresses' });
    }
});

// ➕ POST ROUTE: Completely untouched logic[cite: 20]
router.post('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.addresses.length >= 3) {
            return res.status(400).json({ message: 'Address limit of 3 reached.' });
        }
        
        const { street, city, state, zipCode, country } = req.body;
        
        user.addresses.push({ 
            street, 
            city, 
            state, 
            zipCode, 
            Country: country 
        });
        
        await user.save();
        res.status(201).json(user.addresses);
    } catch (err) {
        console.error('Database Save Error:', err);
        res.status(500).json({ message: 'Database validation failed. Ensure all fields are filled.' });
    }
});

// ❌ DELETE ROUTE: Completely untouched logic[cite: 20]
router.delete('/:addressId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.addresses = user.addresses.filter(addr => addr._id.toString() !== req.params.addressId);
        await user.save();
        res.json(user.addresses);
    } catch (err) {
        res.status(500).json({ message: 'Error deleting address' });
    }
});

module.exports = router;