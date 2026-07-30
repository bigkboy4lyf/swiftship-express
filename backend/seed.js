// Run this once to add test data: node seed.js

require('dotenv').config();
const mongoose = require('mongoose');
const Shipment = require('./models/Shipment');

// Placeholder ObjectId -- swap for a real user's _id if you need the
// seeded shipments to show up on a specific account's dashboard.
const SEED_USER_ID = '000000000000000000000000';

const testShipments = [
    {
        trackingNumber: 'SS123456789',
        userId: SEED_USER_ID,
        status: 'in_transit',
        serviceType: 'express',
        sender: {
            name: 'John Doe',
            address: '123 Main St',
            city: 'New York',
            country: 'USA'
        },
        recipient: {
            name: 'Jane Smith',
            address: '456 Oak Ave',
            city: 'London',
            country: 'UK'
        },
        package: {
            weight: 5,
            description: 'Documents',
            value: 100
        },
        currentLocation: {
            facility: 'Sorting Center',
            city: 'London',
            timestamp: new Date()
        },
        trackingHistory: [
            {
                status: 'picked_up',
                location: 'New York',
                description: 'Package picked up from sender',
                timestamp: new Date(Date.now() - 3*24*60*60*1000)
            },
            {
                status: 'in_transit',
                location: 'London',
                description: 'Package arrived at sorting facility',
                timestamp: new Date(Date.now() - 1*24*60*60*1000)
            }
        ],
        estimatedDelivery: new Date(Date.now() + 2*24*60*60*1000)
    },
    {
        trackingNumber: 'SS987654321',
        userId: SEED_USER_ID,
        status: 'out_for_delivery',
        serviceType: 'standard',
        sender: {
            name: 'Alice Johnson',
            city: 'Chicago',
            country: 'USA'
        },
        recipient: {
            name: 'Bob Wilson',
            city: 'Boston',
            country: 'USA'
        },
        package: {
            weight: 10,
            description: 'Clothes',
            value: 200
        },
        currentLocation: {
            facility: 'Local Delivery Depot',
            city: 'Boston',
            timestamp: new Date()
        },
        trackingHistory: [
            {
                status: 'picked_up',
                location: 'Chicago',
                timestamp: new Date(Date.now() - 2*24*60*60*1000)
            },
            {
                status: 'in_transit',
                location: 'Boston',
                timestamp: new Date(Date.now() - 1*24*60*60*1000)
            }
        ],
        estimatedDelivery: new Date(Date.now() + 6*60*60*1000)
    },
    {
        trackingNumber: 'SS567890123',
        userId: SEED_USER_ID,
        status: 'delivered',
        serviceType: 'international',
        sender: {
            name: 'Carlos Mendez',
            city: 'Madrid',
            country: 'Spain'
        },
        recipient: {
            name: 'Emma Brown',
            city: 'Sydney',
            country: 'Australia'
        },
        package: {
            weight: 2,
            description: 'Gifts',
            value: 150
        },
        trackingHistory: [
            {
                status: 'picked_up',
                location: 'Madrid',
                timestamp: new Date(Date.now() - 10*24*60*60*1000)
            },
            {
                status: 'in_transit',
                location: 'Dubai',
                timestamp: new Date(Date.now() - 7*24*60*60*1000)
            },
            {
                status: 'out_for_delivery',
                location: 'Sydney',
                timestamp: new Date(Date.now() - 1*24*60*60*1000)
            },
            {
                status: 'delivered',
                location: 'Sydney',
                description: 'Package delivered to recipient',
                timestamp: new Date(Date.now() - 12*60*60*1000)
            }
        ],
        actualDelivery: new Date(Date.now() - 12*60*60*1000)
    }
];

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        
        // Clear existing data
        await Shipment.deleteMany({});
        console.log('Cleared existing shipments');
        
        // Insert test data
        await Shipment.insertMany(testShipments);
        console.log('Added test shipments');
        
        mongoose.disconnect();
        console.log('Done');
    })
    .catch(err => {
        console.error('Error:', err);
        mongoose.disconnect();
    });