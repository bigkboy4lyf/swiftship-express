const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Helper to create JWT
const createToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET || 'swiftship_secret_key_2023_change_this_later',
        { expiresIn: '30d' }
    );
};

// =============================================
// REGISTER NEW USER
// =============================================
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, accountType, newsletter } = req.body;

        // 1. Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        // 2. Create user (The pre-save hook in User.js handles hashing)
        const user = new User({
            name: `${firstName} ${lastName}`.trim(),
            email,
            phone,
            password,
            accountType: accountType || 'personal',
            newsletter: newsletter || false
        });

        await user.save();

        // 3. Generate Token
        const token = createToken(user);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            data: {
                token,
                user: { id: user._id, name: user.name, email: user.email, role: user.role }
            }
        });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// LOGIN USER
// =============================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 🔥 IMPORTANT: We use .select('+password') because we hid it in User.js
        const user = await User.findOne({ email }).select('+password');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const token = createToken(user);

        res.json({
            success: true,
            data: {
                token,
                user: { id: user._id, name: user.name, email: user.email, role: user.role }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;