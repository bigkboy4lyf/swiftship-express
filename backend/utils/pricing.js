// Single source of truth for shipping cost math -- used by the public quote
// calculator (routes/quotes.js) and by shipment creation (routes/shipments.js)
// so a shipment's stored price always matches what a quote would have shown
// for the same inputs. Pure and deterministic: same inputs always produce the
// same numbers, which matters once a price gets printed on an invoice/receipt.

const BASE_RATES = {
    express: 1.8,
    standard: 1.0,
    economy: 0.7,
    international: 2.2,
    cargo: 1.5
};

const DISTANCE_FACTORS = {
    'US-CA': 1.0, 'US-UK': 2.5, 'US-DE': 2.7,
    'US-FR': 2.8, 'US-AU': 3.5, 'US-JP': 3.2,
    'US-CN': 3.3, 'US-IN': 3.4
};

function calculateShippingPrice({ originCountry, destinationCountry, serviceType, weight, insuranceValue }) {
    const routeKey = `${String(originCountry || '').toUpperCase()}-${String(destinationCountry || '').toUpperCase()}`;
    const distanceFactor = DISTANCE_FACTORS[routeKey] || 2.0;

    const safeWeight = parseFloat(weight) || 1;
    const computedBase = 10 + (distanceFactor * 5) + (safeWeight * 0.5 * 2) * (BASE_RATES[serviceType] || 1.0);
    const basePrice = Math.max(computedBase, 15);
    const insuranceCost = (parseFloat(insuranceValue) || 0) * 0.01;
    const surcharge = basePrice * 0.075;
    const totalPrice = basePrice + insuranceCost + surcharge;

    const round2 = n => parseFloat(n.toFixed(2));
    return {
        basePrice: round2(basePrice),
        insuranceCost: round2(insuranceCost),
        surcharge: round2(surcharge),
        totalPrice: round2(totalPrice)
    };
}

module.exports = { calculateShippingPrice };
