const express = require('express');
const router = express.Router();
const { calculateShippingPrice } = require('../utils/pricing');
const { LOCAL_SHIPPING_COUNTRIES } = require('../utils/countryDistancePricing');

const DELIVERY_ESTIMATES = {
    express: '1-3 days',
    standard: '5-10 days',
    economy: '10-20 days',
    international: '3-7 days',
    cargo: '7-14 days'
};

// Pure price calculation -- no database write. A quote is just a number
// preview; the shipment record only gets created once the customer actually
// submits the request via /api/shipments/create. (This used to save a real
// Shipment on every "Calculate" click, which meant abandoned quotes piled up
// as orphaned shipment records -- fixed by making this endpoint side-effect
// free like a calculator should be.)
router.post('/calculate', async (req, res) => {
    try {
        const { originCountry, destinationCountry, serviceType, items } = req.body;

        const origin = String(originCountry || '').toUpperCase();
        const destination = String(destinationCountry || '').toUpperCase();
        const isLocal = req.body.shipmentType === 'local';

        if (isLocal && (origin !== destination || !LOCAL_SHIPPING_COUNTRIES.has(origin))) {
            return res.status(400).json({ success: false, message: 'Local shipping is only available within a supported country.' });
        }
        if (isLocal && serviceType === 'international') {
            return res.status(400).json({ success: false, message: 'International Priority is not available for local shipments.' });
        }
        if (!isLocal && origin && origin === destination) {
            return res.status(400).json({ success: false, message: 'Origin and destination cannot be the same for an international shipment.' });
        }

        const itemList = Array.isArray(items) && items.length ? items : [];
        const totalWeight = itemList.reduce((sum, i) => sum + (parseFloat(i.weight) || 0), 0) || parseFloat(req.body.weight) || 1;
        const totalValue = itemList.reduce((sum, i) => sum + (parseFloat(i.value) || 0), 0) || parseFloat(req.body.insuranceValue) || 0;

        const { basePrice, insuranceCost, surcharge, totalPrice } = calculateShippingPrice({
            originCountry, destinationCountry, serviceType,
            weight: totalWeight,
            insuranceValue: totalValue
        });

        res.json({
            success: true,
            data: {
                basePrice,
                insuranceCost,
                surcharge,
                totalPrice,
                totalWeight,
                totalValue,
                deliveryEstimate: DELIVERY_ESTIMATES[serviceType] || '5-10 days'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
