const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { 
        type: String, 
        enum: ['pending', 'picked_up', 'in_transit', 'delivered'], 
        default: 'pending' 
    },
    serviceType: String,
    sender: { name: String, city: String, country: String },
    recipient: { name: String, city: String, country: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Shipment', shipmentSchema);