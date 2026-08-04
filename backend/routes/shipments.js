const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const { calculateShippingPrice, estimateDeliveryDate } = require('../utils/pricing');
const { LOCAL_SHIPPING_COUNTRIES } = require('../utils/countryDistancePricing');
const sendEmail = require('../utils/sendEmail');
const { quoteEmail } = require('../utils/emailTemplates');
const { notifyUser, statusLabel } = require('../utils/notifications');

const SUPPORT_EMAIL = 'helpdesk.swiftship@gmail.com';


// =============================================
// PUBLIC TRACKING - NO AUTHENTICATION NEEDED
// =============================================
router.get('/track/:trackingNumber', async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        
        const shipment = await Shipment.findOne({ 
            trackingNumber: trackingNumber.toUpperCase() 
        }).populate('userId', 'name');
        
        if (!shipment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Tracking number not found' 
            });
        }
        
        // Return only necessary tracking info
        res.json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                estimatedDelivery: shipment.estimatedDelivery,
                currentLocation: shipment.currentLocation,
                trackingHistory: shipment.trackingHistory,
                recipient: {
                    city: shipment.recipient?.city,
                    country: shipment.recipient?.country
                }
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});


// =============================================
// CREATE NEW SHIPMENT
// =============================================
router.post('/create', async (req, res) => {
    try {
        const { sender, recipient, packageDetails, serviceType, userId, contactEmail } = req.body;

        const senderCountry = String(sender?.country || '').toUpperCase();
        const recipientCountry = String(recipient?.country || '').toUpperCase();
        const isLocal = req.body.shipmentType === 'local';

        if (isLocal && (senderCountry !== recipientCountry || !LOCAL_SHIPPING_COUNTRIES.has(senderCountry))) {
            return res.status(400).json({ success: false, message: 'Local shipping is only available within a supported country.' });
        }
        if (isLocal && serviceType === 'international') {
            return res.status(400).json({ success: false, message: 'International Priority is not available for local shipments.' });
        }
        if (!isLocal && senderCountry && senderCountry === recipientCountry) {
            return res.status(400).json({ success: false, message: 'Sender and recipient country cannot be the same for an international shipment.' });
        }
        const shipmentType = isLocal ? 'local' : 'international';

        // Generate a professional tracking number: SS + 9 random digits
        const trackingNumber = 'SS' + Math.floor(100000000 + Math.random() * 900000000);

        // A shipment can bundle several items (packageDetails.items). When it
        // does, the top-level package fields become the aggregate across all
        // of them so every existing reader (admin table, invoice, tracking
        // page) that only looks at package.weight/description/value keeps
        // working unchanged, whether this is a single- or multi-item request.
        const items = Array.isArray(packageDetails?.items) ? packageDetails.items : [];
        const aggregateWeight = items.length
            ? items.reduce((sum, i) => sum + (parseFloat(i.weight) || 0), 0)
            : (parseFloat(packageDetails?.weight) || 0);
        const aggregateValue = items.length
            ? items.reduce((sum, i) => sum + (parseFloat(i.value) || 0), 0)
            : (parseFloat(packageDetails?.value) || 0);
        const aggregateDescription = items.length > 1
            ? `${items.length} items: ${items.map(i => i.description).filter(Boolean).join(', ')}`
            : (items[0]?.description || packageDetails?.description || '');
        const aggregateCategory = items.length > 1 ? 'mixed' : (items[0]?.category || packageDetails?.category || '');

        // This endpoint used to leave totalPrice at its schema default of 0 --
        // nothing ever priced the shipment. Compute it the same way the quote
        // calculator does, from the same inputs this form already collects.
        const { basePrice, insuranceCost, surcharge, totalPrice } = calculateShippingPrice({
            originCountry: sender?.country,
            destinationCountry: recipient?.country,
            serviceType,
            weight: aggregateWeight,
            insuranceValue: aggregateValue
        });

        const newShipment = new Shipment({
            trackingNumber,
            userId: userId, // Links the shipment to the logged-in user
            serviceType,
            shipmentType,
            // Falls back to sender.email for any direct API caller still using
            // the old shape -- see the contactEmail comment in the schema.
            contactEmail: contactEmail || sender?.email,
            sender,
            recipient,
            package: {
                weight: aggregateWeight,
                dimensions: packageDetails?.dimensions,
                description: aggregateDescription,
                category: aggregateCategory,
                value: aggregateValue,
                items
            },
            status: 'pending_approval',
            totalPrice,
            pricing: { basePrice, insuranceCost, surcharge },
            estimatedDelivery: estimateDeliveryDate(serviceType),
            trackingHistory: [{
                status: 'pending_approval',
                location: sender.city,
                description: 'Awaiting shipment confirmation'
            }]
        });

        await newShipment.save();

        notifyUser(userId, {
            type: 'shipment_created',
            title: 'Shipment Created',
            message: `Shipment ${trackingNumber} to ${recipient?.city || 'your destination'}, ${recipient?.country || ''} has been created and is ${statusLabel(newShipment.status)}.`,
            link: 'dashboard.html?tab=user-shipments'
        });

        const accountUser = await User.findById(userId).select('email');

        sendEmail.toShipmentContacts(
            newShipment,
            accountUser?.email,
            `Your SwiftShip Express Quote -- ${trackingNumber}`,
            quoteEmail({
                customerName: sender.name,
                trackingNumber,
                originCity: sender.city,
                originCountry: sender.country,
                destCity: recipient?.city,
                destCountry: recipient?.country,
                serviceType,
                weight: aggregateWeight,
                pricing: { basePrice, insuranceCost, surcharge },
                totalPrice,
                dashboardUrl: `${req.protocol}://${req.get('host')}/dashboard`,
                supportEmail: SUPPORT_EMAIL
            }),
            'Quote'
        );

        res.status(201).json({ success: true, data: newShipment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;