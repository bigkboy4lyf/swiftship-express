// Single source of truth for shipping cost math -- used by the public quote
// calculator (routes/quotes.js) and by shipment creation (routes/shipments.js)
// so a shipment's stored price always matches what a quote would have shown
// for the same inputs. Pure and deterministic: same inputs always produce the
// same numbers, which matters once a price gets printed on an invoice/receipt.

const { getLaneBasePrice } = require('./countryDistancePricing');

const BASE_RATES = {
    express: 1.8,
    standard: 1.0,
    economy: 0.7,
    international: 2.2,
    cargo: 1.5
};

// Same day ranges shown in the service dropdown copy on both quote forms
// (frontend/js/quote-engine.js's QUOTE_SERVICE_DETAILS) -- kept here too
// since that file never loads on the server. Used to turn "Express Delivery
// (1-3 days)" into an actual calendar date once a shipment is created.
const SERVICE_DELIVERY_DAYS = {
    express: [1, 3],
    standard: [5, 10],
    economy: [10, 20],
    international: [3, 7],
    cargo: [7, 14]
};

// Estimates a single "arrives by" date -- the slower end of the range, since
// that's the date a customer should actually plan around -- measured from
// when the shipment request was made.
function estimateDeliveryDate(serviceType, fromDate = new Date()) {
    const [, maxDays] = SERVICE_DELIVERY_DAYS[serviceType] || SERVICE_DELIVERY_DAYS.standard;
    return new Date(fromDate.getTime() + maxDays * 24 * 60 * 60 * 1000);
}

function calculateShippingPrice({ originCountry, destinationCountry, serviceType, weight, insuranceValue, basePriceOverride, surchargeOverride }) {
    const laneBasePrice = getLaneBasePrice(originCountry, destinationCountry);

    const safeWeight = parseFloat(weight) || 1;
    const computedBase = laneBasePrice + (safeWeight * 0.5 * 2) * (BASE_RATES[serviceType] || 1.0);
    const parsedBaseOverride = Number(basePriceOverride);
    const basePrice = Number.isFinite(parsedBaseOverride) && parsedBaseOverride >= 0
        ? parsedBaseOverride
        : Math.max(computedBase, 15);
    const insuranceCost = (parseFloat(insuranceValue) || 0) * 0.01;
    const parsedSurchargeOverride = Number(surchargeOverride);
    const surcharge = Number.isFinite(parsedSurchargeOverride) && parsedSurchargeOverride >= 0
        ? parsedSurchargeOverride
        : basePrice * 0.075;
    const totalPrice = basePrice + insuranceCost + surcharge;

    const round2 = n => parseFloat(n.toFixed(2));
    return {
        basePrice: round2(basePrice),
        insuranceCost: round2(insuranceCost),
        surcharge: round2(surcharge),
        totalPrice: round2(totalPrice)
    };
}

module.exports = { calculateShippingPrice, estimateDeliveryDate };
