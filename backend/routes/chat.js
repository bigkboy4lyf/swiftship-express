const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const MAX_MESSAGE_LENGTH = 2000;
const SUPPORT_NAME = 'SwiftShip Support';

// If it's been this long (or longer) since the last activity in a
// conversation, support hasn't been actively engaged -- the customer gets an
// automated "we've got your message" reply, the same away-message pattern
// most support widgets (Intercom, Zendesk, etc.) use so nobody is left
// wondering if anyone saw what they just sent.
const AWAY_MESSAGE_GAP_MS = 24 * 60 * 60 * 1000;
const AWAY_MESSAGE_TEXT = "Thanks for reaching out to SwiftShip Express Support! Our team typically responds within 24 hours. We've received your message and will be with you as soon as possible.";

function sanitizeMessage(message) {
    if (typeof message !== 'string') return null;
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return null;
    return trimmed;
}

// =============================================
// CUSTOMER: GET OWN CONVERSATION
// =============================================
router.get('/messages', protect, async (req, res) => {
    try {
        const messages = await ChatMessage.find({ userId: req.user.id }).sort({ createdAt: 1 });

        // Opening the widget counts as reading every admin reply received so far
        await ChatMessage.updateMany(
            { userId: req.user.id, senderRole: 'admin', readByUser: false },
            { readByUser: true }
        );

        res.json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// CUSTOMER: UNREAD ADMIN REPLIES (drives the bubble badge without opening the panel)
// =============================================
router.get('/unread-count', protect, async (req, res) => {
    try {
        const count = await ChatMessage.countDocuments({
            userId: req.user.id,
            senderRole: 'admin',
            readByUser: false
        });
        res.json({ success: true, data: { count } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// CUSTOMER: SEND A MESSAGE
// =============================================
router.post('/messages', protect, async (req, res) => {
    try {
        const message = sanitizeMessage(req.body.message);
        if (!message) {
            return res.status(400).json({ success: false, message: 'Message cannot be empty' });
        }

        // Checked before this message is created, so the gap reflects the
        // silence leading up to it rather than including itself.
        const lastMessage = await ChatMessage.findOne({ userId: req.user.id }).sort({ createdAt: -1 });
        const needsAwayMessage = !lastMessage || (Date.now() - lastMessage.createdAt.getTime()) >= AWAY_MESSAGE_GAP_MS;

        const user = await User.findById(req.user.id);
        const chatMessage = await ChatMessage.create({
            userId: req.user.id,
            senderRole: 'user',
            senderName: user?.name || 'Customer',
            message,
            readByUser: true,
            readByAdmin: false
        });

        if (needsAwayMessage) {
            await ChatMessage.create({
                userId: req.user.id,
                senderRole: 'admin',
                senderName: SUPPORT_NAME,
                message: AWAY_MESSAGE_TEXT,
                readByAdmin: true,
                readByUser: false,
                automated: true
            });
        }

        res.status(201).json({ success: true, data: chatMessage });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// ADMIN: LIST CONVERSATIONS (one row per customer, most recently active first)
// =============================================
router.get('/conversations', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const conversations = await ChatMessage.aggregate([
            // Excludes any message with no userId (e.g. bad test/manually-inserted
            // data) -- a group like that has no real customer behind it, so it
            // can never be opened or replied to; surfacing it just creates a
            // stuck "Unknown user" thread in the inbox.
            { $match: { userId: { $ne: null } } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$userId',
                    lastMessage: { $first: '$message' },
                    lastSenderRole: { $first: '$senderRole' },
                    lastAutomated: { $first: '$automated' },
                    lastAt: { $first: '$createdAt' },
                    unreadCount: {
                        $sum: {
                            $cond: [{ $and: [{ $eq: ['$senderRole', 'user'] }, { $eq: ['$readByAdmin', false] }] }, 1, 0]
                        }
                    }
                }
            },
            { $sort: { lastAt: -1 } }
        ]);

        const users = await User.find({ _id: { $in: conversations.map(c => c._id) } }).select('name email');
        const usersById = new Map(users.map(u => [String(u._id), u]));

        const data = conversations.map(c => {
            const user = usersById.get(String(c._id));
            return {
                userId: c._id,
                userName: user?.name || 'Unknown user',
                userEmail: user?.email || '',
                lastMessage: c.lastMessage,
                lastSenderRole: c.lastSenderRole,
                lastAutomated: !!c.lastAutomated,
                lastAt: c.lastAt,
                unreadCount: c.unreadCount
            };
        });

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// ADMIN: GET THREAD WITH ONE CUSTOMER
// =============================================
router.get('/conversations/:userId', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
            return res.status(400).json({ success: false, message: 'Invalid conversation' });
        }

        const messages = await ChatMessage.find({ userId: req.params.userId }).sort({ createdAt: 1 });

        await ChatMessage.updateMany(
            { userId: req.params.userId, senderRole: 'user', readByAdmin: false },
            { readByAdmin: true }
        );

        res.json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// ADMIN: REPLY TO A CUSTOMER
// =============================================
router.post('/conversations/:userId', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
            return res.status(400).json({ success: false, message: 'Invalid conversation' });
        }

        const message = sanitizeMessage(req.body.message);
        if (!message) {
            return res.status(400).json({ success: false, message: 'Message cannot be empty' });
        }

        const admin = await User.findById(req.user.id);
        const chatMessage = await ChatMessage.create({
            userId: req.params.userId,
            senderRole: 'admin',
            senderName: admin?.name || 'Support Team',
            message,
            readByAdmin: true,
            readByUser: false
        });

        res.status(201).json({ success: true, data: chatMessage });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// ADMIN: CLEAR AN ENTIRE CONVERSATION
// =============================================
router.delete('/conversations/:userId', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
            return res.status(400).json({ success: false, message: 'Invalid conversation' });
        }

        await ChatMessage.deleteMany({ userId: req.params.userId });
        res.json({ success: true, message: 'Conversation cleared' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
