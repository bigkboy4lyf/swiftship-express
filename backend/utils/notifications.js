const Notification = require('../models/Notification');
const User = require('../models/User');
const sendEmail = require('./sendEmail');
const { shipmentUpdateEmail } = require('./emailTemplates');

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

// Fires both the in-app notification and the matching email for something
// that happened to a shipment (status change, payment, fee, reminder...),
// so every call site states what happened exactly once instead of building
// the same message twice. Best-effort like notifyUser/sendEmail.inBackground
// -- a shipment update must still succeed even if either notification fails,
// so this never throws and callers don't need to await it.
async function notifyShipment(shipment, { type, title, message, link = '' }) {
    notifyUser(shipment.userId, { type, title, message, link });
    try {
        const accountUser = await User.findById(shipment.userId).select('email');
        sendEmail.toShipmentContacts(
            shipment,
            accountUser?.email,
            title,
            shipmentUpdateEmail({ heading: title, message, trackingNumber: shipment.trackingNumber }),
            'Shipment update'
        );
    } catch (error) {
        console.error('Failed to resolve shipment email recipients:', error);
    }
}

module.exports = { notifyUser, notifyUsers, notifyShipment, statusLabel };
