const mongoose = require('mongoose');

const trackingHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['pending_approval', 'pending', 'processing', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delayed', 'rejected'],
        required: true
    },
    location: String,
    description: String,
    timestamp: { type: Date, default: Date.now }
});

const shipmentSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['pending_approval', 'pending', 'processing', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delayed', 'rejected'],
        default: 'pending_approval'
    },
    serviceType: { type: String, enum: ['express', 'standard', 'international', 'economy', 'cargo'], default: 'standard' },
    // totalPrice stays the single source of truth other code already reads
    // (e.g. the admin revenue aggregation) -- pricing below is purely the
    // itemized breakdown for invoices/receipts, computed once at creation so
    // a receipt's total never silently changes if the rate formula changes later.
    totalPrice: { type: Number, default: 0 },
    pricing: {
        basePrice: { type: Number, default: 0 },
        insuranceCost: { type: Number, default: 0 },
        surcharge: { type: Number, default: 0 }
    },
    sender: {
        name: String,
        company: String,
        address: String,
        city: String,
        country: String,
        postalCode: String,
        phone: String,
        email: String
    },
    recipient: {
        name: { type: String, required: true },
        company: String,
        address: String,
        city: { type: String, required: true },
        country: { type: String, required: true },
        postalCode: String,
        phone: String,
        email: String
    },
    package: {
        weight: Number,
        dimensions: {
            length: Number,
            width: Number,
            height: Number
        },
        description: String,
        value: Number
    },
    currentLocation: {
        facility: String,
        city: String,
        country: String,
        timestamp: Date
    },
    trackingHistory: [trackingHistorySchema],
    estimatedDelivery: Date,
    actualDelivery: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

shipmentSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Shipment', shipmentSchema);