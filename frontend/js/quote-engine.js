// =============================================
// SHARED QUOTE ENGINE
// =============================================
// Single source of truth for the "get a shipping quote" experience, used by
// both the public marketing page (quote.html) and the logged-in dashboard's
// Get Quote tab. Previously each page had its own copy of the service
// catalog, distance table, and calculation math, which had drifted apart
// (the dashboard tab had no price preview at all). Both pages now build
// their form around the same item-row UI and the same calculateQuote() call
// so a quote means the same thing everywhere in the app.
// Depends on countries-data.js being loaded first.

const ITEM_CATEGORIES = [
    ['documents', 'Documents'],
    ['electronics', 'Electronics'],
    ['apparel_textiles', 'Apparel & Textiles'],
    ['machinery_industrial', 'Machinery & Industrial Parts'],
    ['food_perishables', 'Food & Perishables'],
    ['pharma_medical', 'Pharmaceuticals & Medical Supplies'],
    ['automotive_parts', 'Automotive Parts'],
    ['furniture_home', 'Furniture & Home Goods'],
    ['books_media', 'Books & Media'],
    ['hazardous', 'Hazardous Materials'],
    ['other', 'Other']
];

const QUOTE_SERVICE_DETAILS = {
    express: { name: 'Express Delivery', delivery: '1-3 days', baseMultiplier: 1.8 },
    standard: { name: 'Standard Shipping', delivery: '5-10 days', baseMultiplier: 1.0 },
    economy: { name: 'Economy Shipping', delivery: '10-20 days', baseMultiplier: 0.7 },
    international: { name: 'International Priority', delivery: '3-7 days', baseMultiplier: 2.2 },
    cargo: { name: 'Cargo/Freight Shipping', delivery: '7-14 days', baseMultiplier: 1.5 }
};

// Used only by the local fallback calculator when the backend is unreachable.
// Anything not listed falls back to a flat distance factor of 2.0.
const QUOTE_DISTANCE_FACTORS = {
    'US-CA': 1.0, 'US-UK': 2.5, 'US-GB': 2.5, 'US-DE': 2.7,
    'US-FR': 2.8, 'US-AU': 3.5, 'US-JP': 3.2, 'US-CN': 3.3, 'US-IN': 3.4
};

function categoryLabel(value) {
    const match = ITEM_CATEGORIES.find(([v]) => v === value);
    return match ? match[1] : (value || 'Other');
}

// Shared by the dashboard and admin shipment-detail modals so a saved
// shipment's contents read the same way wherever they're shown.
function describePackageContents(pkg) {
    if (!pkg) return 'Not specified';
    const items = Array.isArray(pkg.items) ? pkg.items : [];
    if (items.length > 1) {
        return `${items.length} items (${categoryLabel(pkg.category)}): ${items.map(i => i.description).filter(Boolean).join(', ')}`;
    }
    if (pkg.description) {
        return `${pkg.description}${pkg.category ? ` — ${categoryLabel(pkg.category)}` : ''}`;
    }
    return 'Not specified';
}

// =============================================
// ITEM ROWS (repeatable "what's in this shipment" entries)
// =============================================
let quoteItemRowSeq = 0;

function categoryOptionsHTML(selected) {
    return ITEM_CATEGORIES.map(([value, label]) =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
    ).join('');
}

function createItemRowHTML() {
    const rowId = `qi-${++quoteItemRowSeq}`;
    return `
        <div class="quote-item-row" data-row-id="${rowId}">
            <div class="quote-item-row-fields">
                <div class="form-group quote-item-description">
                    <label>Item Description *</label>
                    <input type="text" class="qi-description form-control" placeholder="e.g., Laptop computer" required>
                </div>
                <div class="form-group quote-item-category">
                    <label>Category *</label>
                    <select class="qi-category form-control" required>${categoryOptionsHTML()}</select>
                </div>
                <div class="form-group quote-item-weight">
                    <label>Weight (kg) *</label>
                    <input type="number" class="qi-weight form-control" min="0.1" max="1000" step="0.1" placeholder="2.5" required>
                </div>
                <div class="form-group quote-item-value">
                    <label>Declared Value ($)</label>
                    <input type="number" class="qi-value form-control" min="0" step="0.01" placeholder="Optional">
                </div>
            </div>
            <button type="button" class="quote-item-remove" title="Remove item" aria-label="Remove item">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `;
}

// Wires up "+ Add another item" / per-row remove buttons and keeps at least
// one row present at all times (the last row's remove button just clears it
// instead of deleting it, so the form never has zero items).
function initItemsRepeater(containerEl, addBtnEl) {
    if (!containerEl) return;

    function addRow() {
        containerEl.insertAdjacentHTML('beforeend', createItemRowHTML());
        updateRemoveButtons();
    }

    function updateRemoveButtons() {
        const rows = containerEl.querySelectorAll('.quote-item-row');
        rows.forEach(row => {
            const btn = row.querySelector('.quote-item-remove');
            if (btn) btn.disabled = rows.length <= 1;
        });
    }

    containerEl.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.quote-item-remove');
        if (!removeBtn) return;
        const rows = containerEl.querySelectorAll('.quote-item-row');
        if (rows.length > 1) {
            removeBtn.closest('.quote-item-row').remove();
            updateRemoveButtons();
        }
    });

    addBtnEl?.addEventListener('click', addRow);

    if (!containerEl.querySelector('.quote-item-row')) addRow();
    updateRemoveButtons();
}

function resetItemsRepeater(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    containerEl.insertAdjacentHTML('beforeend', createItemRowHTML());
    const rows = containerEl.querySelectorAll('.quote-item-row');
    rows.forEach(row => {
        const btn = row.querySelector('.quote-item-remove');
        if (btn) btn.disabled = true;
    });
}

// Reads every row into a plain array, skipping rows left completely blank.
function collectItems(containerEl) {
    if (!containerEl) return [];
    return [...containerEl.querySelectorAll('.quote-item-row')].map(row => ({
        description: row.querySelector('.qi-description')?.value.trim() || '',
        category: row.querySelector('.qi-category')?.value || 'other',
        weight: parseFloat(row.querySelector('.qi-weight')?.value) || 0,
        value: parseFloat(row.querySelector('.qi-value')?.value) || 0
    })).filter(item => item.description || item.weight);
}

function summarizeItems(items) {
    const totalWeight = items.reduce((sum, i) => sum + (i.weight || 0), 0);
    const totalValue = items.reduce((sum, i) => sum + (i.value || 0), 0);
    const description = items.length <= 1
        ? (items[0]?.description || '')
        : `${items.length} items: ${items.map(i => i.description).filter(Boolean).join(', ')}`;
    const category = items.length <= 1 ? (items[0]?.category || 'other') : 'mixed';
    return { totalWeight, totalValue, description, category };
}

// =============================================
// CALCULATION
// =============================================
function calculateLocalFallback({ originCountry, destinationCountry, serviceType, items }) {
    const { totalWeight, totalValue } = summarizeItems(items);
    const route = `${originCountry}-${destinationCountry}`;
    const reverseRoute = `${destinationCountry}-${originCountry}`;
    const distanceFactor = QUOTE_DISTANCE_FACTORS[route] || QUOTE_DISTANCE_FACTORS[reverseRoute] || 2.0;

    const weightFactor = (totalWeight || 1) * 0.5;
    const serviceFactor = QUOTE_SERVICE_DETAILS[serviceType]?.baseMultiplier || 1.0;
    const basePrice = Math.max(10 + (distanceFactor * 5) + (weightFactor * 2) * serviceFactor, 15);
    const insuranceCost = totalValue > 0 ? totalValue * 0.01 : 0;
    const surcharge = basePrice * 0.075;
    const totalPrice = basePrice + insuranceCost + surcharge;

    const round2 = n => Math.round(n * 100) / 100;
    return {
        basePrice: round2(basePrice),
        insuranceCost: round2(insuranceCost),
        surcharge: round2(surcharge),
        totalPrice: round2(totalPrice),
        totalWeight,
        totalValue,
        source: 'local'
    };
}

// Calls the backend calculator (pure -- no shipment is created at this
// stage) and falls back to an equivalent local calculation if the request
// fails, so the quote step never just breaks if the network hiccups.
async function calculateQuote({ originCountry, destinationCountry, serviceType, items, dimensions }) {
    const { totalWeight, totalValue, description, category } = summarizeItems(items);

    try {
        const response = await fetch('/api/quotes/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originCountry, destinationCountry, serviceType,
                items, dimensions
            })
        });
        const result = await response.json();
        if (result.success) {
            return {
                basePrice: result.data.basePrice,
                insuranceCost: result.data.insuranceCost,
                surcharge: result.data.surcharge,
                totalPrice: result.data.totalPrice,
                totalWeight: result.data.totalWeight ?? totalWeight,
                totalValue: result.data.totalValue ?? totalValue,
                deliveryEstimate: result.data.deliveryEstimate,
                source: 'backend'
            };
        }
    } catch (error) {
        console.warn('Quote backend unavailable, using local fallback calculation.', error);
    }

    return {
        ...calculateLocalFallback({ originCountry, destinationCountry, serviceType, items }),
        deliveryEstimate: QUOTE_SERVICE_DETAILS[serviceType]?.delivery || '5-10 days'
    };
}
