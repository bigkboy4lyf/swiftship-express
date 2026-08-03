const mongoose = require('mongoose');

// One row per recipient, even for an admin broadcast to "all users" -- same
// idea as ChatMessage: every notification belongs to exactly one userId, so
// the bell's unread count and list are always a single indexed query away.
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        enum: ['shipment_created', 'shipment_status', 'shipment_rejected', 'password_changed', 'admin_message'],
        required: true
    },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    // Relative frontend URL (e.g. "dashboard.html?tab=user-shipments") the
    // bell dropdown navigates to when this notification is clicked. Empty
    // for purely informational ones (password changed, most admin messages).
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    // Set only for type: 'admin_message' -- which admin wrote it. Null for
    // every system-generated notification.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
