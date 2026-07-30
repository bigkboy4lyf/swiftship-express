const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { createToken } = require('../middleware/auth');

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

        // Checked only after the password is confirmed correct, so a wrong
        // guess never reveals whether an account is deactivated.
        if (user.status && user.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: user.status === 'suspended'
                    ? 'This account has been suspended. Please contact support.'
                    : 'This account is inactive. Please contact support to reactivate it.'
            });
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

// =============================================
// FORGOT PASSWORD - send a 6-digit code by email
// =============================================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const user = await User.findOne({ email });

        // Always respond the same way whether or not the account exists,
        // so this endpoint can't be used to check who has an account here.
        const genericResponse = {
            success: true,
            message: 'If an account exists for that email, a reset code has been sent.'
        };

        if (!user) {
            return res.json(genericResponse);
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
        const salt = await bcrypt.genSalt(10);
        user.resetCodeHash = await bcrypt.hash(code, salt);
        user.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await user.save();

        await sendEmail(
            user.email,
            'Your SwiftShip password reset code',
            `<p>Hi ${user.name || ''},</p>
             <p>Your password reset code is:</p>
             <h2 style="letter-spacing: 4px;">${code}</h2>
             <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`
        );

        res.json(genericResponse);
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

// =============================================
// RESET PASSWORD - verify the code, set new password
// =============================================
router.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email, code, and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const user = await User.findOne({ email }).select('+resetCodeHash +resetCodeExpires');
        if (!user || !user.resetCodeHash || !user.resetCodeExpires) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code' });
        }

        if (user.resetCodeExpires < new Date()) {
            return res.status(400).json({ success: false, message: 'That code has expired. Please request a new one.' });
        }

        const isMatch = await bcrypt.compare(code, user.resetCodeHash);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code' });
        }

        user.password = newPassword; // pre('save') hook re-hashes this
        user.resetCodeHash = null;
        user.resetCodeExpires = null;
        await user.save();

        res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

module.exports = router;