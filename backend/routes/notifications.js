const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { notifyUser, notifyUsers } = require('../utils/notifications');

const MAX_TITLE_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 1000;

// =============================================
// GET OWN NOTIFICATIONS (bell dropdown list)
// =============================================
router.get('/', protect, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// UNREAD COUNT (drives the bell badge without opening the dropdown)
// =============================================
router.get('/unread-count', protect, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ userId: req.user.id, read: false });
        res.json({ success: true, data: { count } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// MARK ONE NOTIFICATION AS READ (opened/clicked in the dropdown)
// =============================================
router.patch('/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { read: true },
            { new: true }
        );
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        res.json({ success: true, data: notification });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// MARK ALL AS READ
// =============================================
router.patch('/read-all', protect, async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// DISMISS (delete) A NOTIFICATION
// =============================================
router.delete('/:id', protect, async (req, res) => {
    try {
        await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// ADMIN: MANUALLY SEND A NOTIFICATION -- to one specific user or every user
// =============================================
router.post('/', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const title = String(req.body.title || '').trim();
        const message = String(req.body.message || '').trim();
        const link = String(req.body.link || '').trim();
        const target = req.body.target === 'all' ? 'all' : 'user';

        if (!title || title.length > MAX_TITLE_LENGTH) {
            return res.status(400).json({ success: false, message: `Title is required and must be under ${MAX_TITLE_LENGTH} characters` });
        }
        if (!message || message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ success: false, message: `Message is required and must be under ${MAX_MESSAGE_LENGTH} characters` });
        }

        const payload = { type: 'admin_message', title, message, link, createdBy: req.user.id };

        if (target === 'all') {
            const users = await User.find().select('_id');
            await notifyUsers(users.map(u => u._id), payload);
            return res.status(201).json({ success: true, message: `Notification sent to ${users.length} user(s)` });
        }

        const userId = req.body.userId;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'A valid recipient is required' });
        }
        const recipient = await User.findById(userId).select('_id name');
        if (!recipient) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        await notifyUser(userId, payload);
        res.status(201).json({ success: true, message: `Notification sent to ${recipient.name || 'user'}` });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

module.exports = router;
