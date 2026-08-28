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
        // Callers reuse generic titles ("Shipment Update", "Payment Received",
        // etc.) across many events on the same shipment. Gmail (and most mail
        // clients) group messages into one collapsed thread when the subject
        // matches an earlier message to the same recipient, so two distinct
        // updates were showing up folded under "Hide quoted text" instead of
        // as separate emails. Appending the tracking number plus a per-send
        // timestamp keeps the subject human-readable while guaranteeing each
        // notification email is unique enough that it won't get threaded with
        // the last one. The in-app notification `title` is untouched --
        // this only affects the outgoing email subject.
        const emailSubject = shipment.trackingNumber
            ? `${title} - ${shipment.trackingNumber} (${new Date().toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
              })})`
            : title;
        sendEmail.toShipmentContacts(
            shipment,
            accountUser?.email,
            emailSubject,
            shipmentUpdateEmail({ heading: title, message, trackingNumber: shipment.trackingNumber }),
            'Shipment update'
        );
    } catch (error) {
        console.error('Failed to resolve shipment email recipients:', error);
    }
}

module.exports = { notifyUser, notifyUsers, notifyShipment, statusLabel };
