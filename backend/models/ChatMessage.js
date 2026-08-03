const mongoose = require('mongoose');

// One conversation per customer (userId) -- every message, from either side,
// is a row here rather than a separate "conversation" document. The admin
// inbox groups these by userId to build its conversation list (see
// GET /api/chat/conversations).
const chatMessageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    senderRole: { type: String, enum: ['user', 'admin'], required: true },
    // Denormalized at send time (same pattern as tickets-store.js's
    // userName/userEmail) so the admin inbox and customer widget don't need
    // to populate/join back to User just to render a name.
    senderName: { type: String, required: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    // Independent read flags rather than a single "read" boolean -- a
    // customer message is unread by the admin until an admin opens that
    // thread, and an admin reply is unread by the customer until they open
    // the widget, regardless of what's happening on the other side.
    readByAdmin: { type: Boolean, default: false },
    readByUser: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
