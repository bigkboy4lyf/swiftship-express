// =============================================
// DISTANCE-DRIVEN LANE PRICING
// =============================================
// Turns a pair of countries into a realistic "lane" base price the same way
// real carriers build rate cards: a distance/zone-based formula, not one
// flat number applied to every destination (which is what backend/utils/
// pricing.js's old hardcoded 8-route DISTANCE_FACTORS table effectively
// reduced to for the other ~99% of routes).
//
// Coordinates are each country's capital city, accurate to roughly a
// degree -- plenty for a shipping-cost model; this isn't a mapping product.
// Every code here matches ALL_COUNTRIES in frontend/js/countries-data.js.

const COUNTRY_COORDINATES = {
    AF: [34.5, 69.2], AL: [41.3, 19.8], DZ: [36.8, 3.1], AD: [42.5, 1.5],
    AO: [-8.8, 13.2], AG: [17.1, -61.8], AR: [-34.6, -58.4], AM: [40.2, 44.5],
    AU: [-35.3, 149.1], AT: [48.2, 16.4], AZ: [40.4, 49.9], BS: [25.0, -77.3],
    BH: [26.2, 50.6], BD: [23.8, 90.4], BB: [13.1, -59.6], BY: [53.9, 27.6],
    BE: [50.8, 4.4], BZ: [17.25, -88.77], BJ: [6.5, 2.6], BT: [27.5, 89.6],
    BO: [-16.5, -68.15], BA: [43.85, 18.36], BW: [-24.65, 25.9], BR: [-15.8, -47.9],
    BN: [4.9, 114.9], BG: [42.7, 23.3], BF: [12.4, -1.5], BI: [-3.4, 29.9],
    CV: [14.9, -23.5], KH: [11.55, 104.9], CM: [3.87, 11.52], CA: [45.4, -75.7],
    CF: [4.37, 18.56], TD: [12.1, 15.05], CL: [-33.45, -70.65], CN: [39.9, 116.4],
    CO: [4.6, -74.1], KM: [-11.7, 43.25], CG: [-4.26, 15.28], CD: [-4.32, 15.31],
    CR: [9.93, -84.08], CI: [6.83, -5.28], HR: [45.8, 16.0], CU: [23.1, -82.4],
    CY: [35.17, 33.36], CZ: [50.08, 14.44], DK: [55.68, 12.57], DJ: [11.6, 43.15],
    DM: [15.3, -61.4], DO: [18.48, -69.9], EC: [-0.23, -78.52], EG: [30.04, 31.24],
    SV: [13.7, -89.2], GQ: [3.75, 8.78], ER: [15.3, 38.93], EE: [59.44, 24.75],
    SZ: [-26.32, 31.13], ET: [9.03, 38.74], FJ: [-18.14, 178.44], FI: [60.17, 24.94],
    FR: [48.86, 2.35], GA: [0.39, 9.45], GM: [13.45, -16.58], GE: [41.72, 44.79],
    DE: [52.52, 13.4], GH: [5.6, -0.19], GR: [37.98, 23.73], GD: [12.05, -61.75],
    GT: [14.63, -90.51], GN: [9.51, -13.71], GW: [11.86, -15.6], GY: [6.8, -58.16],
    HT: [18.53, -72.34], HN: [14.1, -87.2], HU: [47.5, 19.05], IS: [64.15, -21.94],
    IN: [28.61, 77.21], ID: [-6.2, 106.85], IR: [35.69, 51.39], IQ: [33.31, 44.36],
    IE: [53.35, -6.26], IL: [31.77, 35.21], IT: [41.9, 12.5], JM: [17.97, -76.79],
    JP: [35.68, 139.69], JO: [31.95, 35.93], KZ: [51.17, 71.43], KE: [-1.29, 36.82],
    KI: [1.33, 172.98], KW: [29.38, 47.99], KG: [42.87, 74.59], LA: [17.97, 102.6],
    LV: [56.95, 24.11], LB: [33.89, 35.5], LS: [-29.31, 27.48], LR: [6.3, -10.8],
    LY: [32.87, 13.19], LI: [47.14, 9.52], LT: [54.69, 25.28], LU: [49.61, 6.13],
    MG: [-18.88, 47.5], MW: [-13.96, 33.79], MY: [3.14, 101.69], MV: [4.17, 73.51],
    ML: [12.65, -8.0], MT: [35.9, 14.51], MH: [7.09, 171.38], MR: [18.07, -15.97],
    MU: [-20.16, 57.5], MX: [19.43, -99.13], FM: [6.92, 158.16], MD: [47.02, 28.83],
    MC: [43.74, 7.42], MN: [47.92, 106.92], ME: [42.44, 19.26], MA: [34.02, -6.83],
    MZ: [-25.97, 32.57], MM: [19.76, 96.08], NA: [-22.56, 17.08], NR: [-0.55, 166.92],
    NP: [27.72, 85.32], NL: [52.37, 4.9], NZ: [-41.29, 174.78], NI: [12.11, -86.24],
    NE: [13.51, 2.11], NG: [9.08, 7.4], MK: [42.0, 21.43], NO: [59.91, 10.75],
    OM: [23.61, 58.59], PK: [33.68, 73.05], PW: [7.5, 134.62], PA: [8.98, -79.52],
    PG: [-9.44, 147.18], PY: [-25.28, -57.63], PE: [-12.05, -77.04], PH: [14.6, 120.98],
    PL: [52.23, 21.01], PT: [38.72, -9.14], QA: [25.29, 51.53], RO: [44.43, 26.1],
    RU: [55.75, 37.62], RW: [-1.94, 30.06], KN: [17.3, -62.72], LC: [14.0, -61.0],
    VC: [13.16, -61.22], WS: [-13.83, -171.76], SM: [43.94, 12.45], ST: [0.34, 6.73],
    SA: [24.71, 46.68], SN: [14.72, -17.47], RS: [44.79, 20.45], SC: [-4.62, 55.45],
    SL: [8.48, -13.23], SG: [1.35, 103.82], SK: [48.15, 17.11], SI: [46.06, 14.51],
    SB: [-9.43, 159.95], SO: [2.04, 45.34], ZA: [-25.75, 28.19], KR: [37.57, 126.98],
    SS: [4.85, 31.58], ES: [40.42, -3.7], LK: [6.93, 79.85], SD: [15.5, 32.56],
    SR: [5.87, -55.17], SE: [59.33, 18.07], CH: [46.95, 7.45], SY: [33.51, 36.28],
    TW: [25.03, 121.57], TJ: [38.56, 68.78], TZ: [-6.16, 35.75], TH: [13.75, 100.5],
    TL: [-8.56, 125.57], TG: [6.13, 1.22], TO: [-21.14, -175.2], TT: [10.65, -61.52],
    TN: [36.81, 10.18], TR: [39.93, 32.86], TM: [37.95, 58.38], TV: [-8.52, 179.2],
    UG: [0.35, 32.58], UA: [50.45, 30.52], AE: [24.47, 54.37], GB: [51.51, -0.13],
    US: [38.9, -77.04], UY: [-34.9, -56.16], UZ: [41.3, 69.24], VU: [-17.73, 168.32],
    VA: [41.9, 12.45], VE: [10.49, -66.88], VN: [21.03, 105.83], YE: [15.35, 44.2],
    ZM: [-15.39, 28.32], ZW: [-17.83, 31.05]
};

// Same set as frontend/js/countries-data.js's LIMITED_SERVICE_COUNTRIES --
// kept in sync manually since the frontend and backend don't share a module
// system. Routes touching any of these carry a steep risk premium
// (specialized charter logistics, war-risk insurance) that swamps ordinary
// distance-based pricing, mirroring how real carriers handle sanctioned or
// active-conflict destinations rather than quoting them like anywhere else.
const CONFLICT_ZONE_COUNTRIES = new Set(['CU', 'IR', 'KP', 'SY', 'RU', 'BY', 'MM', 'AF', 'YE', 'SO', 'SS', 'SD', 'LY']);

// Routes touching a conflict zone start around here rather than at whatever
// the raw distance formula alone would say -- reflecting that the risk
// premium, not the distance, is what dominates the cost of those routes.
const CONFLICT_ZONE_FLOOR = 7000;

function haversineKm([lat1, lon1], [lat2, lon2]) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pairKey(a, b) {
    const [x, y] = [a, b].sort();
    return `${x}|${y}`;
}

// Distance -> dollars, calibrated against real small-parcel international
// rates: ~$35 for a short hop like US-Canada (~730km), ~$150 for a long
// intercontinental route like US-India (~12,700km). The diminishing per-km
// cost (the ^0.85) mirrors real freight economics -- fixed handling/customs
// costs dominate short routes, and marginal cost per km shrinks on long-haul.
function rawLaneFormula(distanceKm) {
    return 24 + 0.04 * Math.pow(distanceKm, 0.85);
}

// Computed once, the first time a price is looked up, and cached for the
// life of the process -- this is a rate card, not a per-request calculation.
// ~16,000 pairs resolves in a few milliseconds.
let routeBasePriceCache = null;

function buildRouteBasePrices() {
    const codes = Object.keys(COUNTRY_COORDINATES);
    const prices = new Map();
    const usedValues = new Set();

    for (let i = 0; i < codes.length; i++) {
        for (let j = i + 1; j < codes.length; j++) {
            const a = codes[i];
            const b = codes[j];
            const distanceKm = haversineKm(COUNTRY_COORDINATES[a], COUNTRY_COORDINATES[b]);
            const isConflict = CONFLICT_ZONE_COUNTRIES.has(a) || CONFLICT_ZONE_COUNTRIES.has(b);

            let price = isConflict
                ? CONFLICT_ZONE_FLOOR + rawLaneFormula(distanceKm)
                : rawLaneFormula(distanceKm);
            price = Math.round(price * 100) / 100;

            // Two different lanes landing on the exact same distance-driven
            // cent value does happen -- plenty of country pairs are
            // near-enough equidistant. Nudge forward a cent at a time until
            // distinct, guaranteeing no two routes ever cost exactly the same.
            while (usedValues.has(price)) {
                price = Math.round((price + 0.01) * 100) / 100;
            }
            usedValues.add(price);

            prices.set(pairKey(a, b), price);
        }
    }

    return prices;
}

function getLaneBasePrice(originCountry, destinationCountry) {
    if (!routeBasePriceCache) routeBasePriceCache = buildRouteBasePrices();

    const origin = String(originCountry || '').toUpperCase();
    const destination = String(destinationCountry || '').toUpperCase();

    const cached = routeBasePriceCache.get(pairKey(origin, destination));
    if (cached !== undefined) return cached;

    // Unknown/missing country code -- shouldn't happen from the dropdown,
    // but a generic long-haul rate is a cheaper failure mode than a 500.
    return Math.round(rawLaneFormula(9000) * 100) / 100;
}

module.exports = { getLaneBasePrice, CONFLICT_ZONE_COUNTRIES };
