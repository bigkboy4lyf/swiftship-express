const Notification = require('../models/Notification');

// Kept separate from frontend/js/script.js's STATUS_LABELS (that one drives
// UI text and can't be required from Node) -- this is the same mapping for
// the handful of statuses that ever get announced in a notification message.
const STATUS_LABELS = {
    pending_approval: 'Awaiting Confirmation',
    pending: 'Pending',
    processing: 'Processing',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out For Delivery',
    delivered: 'Delivered',
    delayed: 'Delayed',
    rejected: 'Rejected'
};

function statusLabel(status) {
    if (STATUS_LABELS[status]) return STATUS_LABELS[status];
    return String(status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Creates one notification for one user. Never throws -- same "best effort,
// never block the caller" philosophy as utils/sendEmail's inBackground sends,
// since a shipment update or password change must still succeed even if this
// write fails.
async function notifyUser(userId, { type, title, message, link = '', createdBy = null }) {
    if (!userId) return null;
    try {
        return await Notification.create({ userId, type, title, message, link, createdBy });
    } catch (error) {
        console.error('Failed to create notification:', error);
        return null;
    }
}

// Same, but for many recipients at once (admin broadcast to "all users") --
// one insertMany round trip instead of one create() per user.
async function notifyUsers(userIds, { type, title, message, link = '', createdBy = null }) {
    if (!userIds || !userIds.length) return [];
    try {
        const docs = userIds.map(userId => ({ userId, type, title, message, link, createdBy }));
        return await Notification.insertMany(docs, { ordered: false });
    } catch (error) {
        console.error('Failed to create broadcast notifications:', error);
        return [];
    }
}

module.exports = { notifyUser, notifyUsers, statusLabel };
