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

// `modes` says which shipment type(s) each service tier can be booked under.
// International Priority is meaningless for a same-country move, so it's
// international-only; every other tier is a generic speed level that works
// for both. This is the single source of truth for the Shipping Service
// dropdown -- populateServiceTypeSelect() below builds the <option> list
// from it instead of it being hardcoded separately in each form's HTML.
const QUOTE_SERVICE_DETAILS = {
    express: { name: 'Express Delivery', delivery: '1-3 days', baseMultiplier: 1.8, modes: ['local', 'international'] },
    standard: { name: 'Standard Shipping', delivery: '5-10 days', baseMultiplier: 1.0, modes: ['local', 'international'] },
    economy: { name: 'Economy Shipping', delivery: '10-20 days', baseMultiplier: 0.7, modes: ['local', 'international'] },
    international: { name: 'International Priority', delivery: '3-7 days', baseMultiplier: 2.2, modes: ['international'] },
    cargo: { name: 'Cargo/Freight Shipping', delivery: '7-14 days', baseMultiplier: 1.5, modes: ['local', 'international'] }
};

// Fills the Shipping Service <select> with only the tiers valid for the
// given mode ('local' or 'international'). Shared by both quote forms.
function populateServiceTypeSelect(selectEl, mode) {
    if (!selectEl) return;
    const options = [`<option value="">Select service type</option>`];
    Object.entries(QUOTE_SERVICE_DETAILS).forEach(([value, detail]) => {
        if (!detail.modes.includes(mode)) return;
        options.push(`<option value="${value}">${detail.name} (${detail.delivery})</option>`);
    });
    selectEl.innerHTML = options.join('');
}

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
            <button type="button" class="quote-item-remove" title="Remove item" aria-label="Remove item">
                <i class="fas fa-trash-alt"></i>
            </button>
            <div class="quote-item-row-fields">
                <div class="quote-item-row-line">
                    <div class="form-group quote-item-description">
                        <label>Item Description *</label>
                        <input type="text" class="qi-description form-control" placeholder="e.g., Laptop computer" required>
                    </div>
                    <div class="form-group quote-item-category">
                        <label>Category *</label>
                        <select class="qi-category form-control" required>${categoryOptionsHTML()}</select>
                    </div>
                </div>
                <div class="quote-item-row-line">
                    <div class="form-group quote-item-weight">
                        <label>Weight (kg) *</label>
                        <input type="number" class="qi-weight form-control" min="0.1" max="1000" step="0.1" placeholder="2.5" required>
                    </div>
                    <div class="form-group quote-item-value">
                        <label>Declared Value ($)</label>
                        <input type="number" class="qi-value form-control" min="0" step="0.01" placeholder="Optional">
                    </div>
                </div>
            </div>
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
// SHIPMENT TYPE TOGGLE (Local vs International)
// =============================================
// Shared by both quote forms. In "local" mode, origin/destination are both
// restricted to LOCAL_SHIPPING_COUNTRIES and locked to the same value (a
// local shipment is a same-country move); in "international" mode, behavior
// is exactly what it was before this toggle existed -- full country list,
// origin and destination picked independently. Returns an isLocalMode()
// getter so the caller's submit handler can branch its validation/payload.
function setupShipmentTypeToggle({ radioName, originSelectId, destinationSelectId, noteId, originLabelId, destinationLabelId, serviceTypeSelectId }) {
    const originSelect = document.getElementById(originSelectId);
    const destinationSelect = document.getElementById(destinationSelectId);
    const note = document.getElementById(noteId);
    const originLabel = document.getElementById(originLabelId);
    const destinationLabel = document.getElementById(destinationLabelId);
    const serviceTypeSelect = document.getElementById(serviceTypeSelectId);
    const radios = document.querySelectorAll(`input[name="${radioName}"]`);
    if (!originSelect || !destinationSelect || !radios.length) return { isLocalMode: () => false };

    function isLocalMode() {
        return document.querySelector(`input[name="${radioName}"]:checked`)?.value === 'local';
    }

    function syncDestinationToOrigin() {
        destinationSelect.value = originSelect.value;
        destinationSelect.dispatchEvent(new Event('change'));
    }

    function apply() {
        const local = isLocalMode();
        const prevOrigin = originSelect.value;
        const prevDestination = destinationSelect.value;

        populateCountrySelect(originSelect, 'Select country', { onlyLocal: local });
        populateCountrySelect(destinationSelect, 'Select country', { onlyLocal: local });
        // Keep prior selections when they're still valid options in the new list.
        if (!local || isLocalShippingCountry(prevOrigin)) originSelect.value = prevOrigin;
        if (!local && isLocalShippingCountry(prevDestination)) destinationSelect.value = prevDestination;

        destinationSelect.disabled = local;
        if (originLabel) originLabel.textContent = local ? 'Local Country *' : 'Origin Country *';
        if (destinationLabel) destinationLabel.textContent = local ? 'Destination (same as origin)' : 'Destination Country *';

        if (serviceTypeSelect) {
            const prevServiceType = serviceTypeSelect.value;
            populateServiceTypeSelect(serviceTypeSelect, local ? 'local' : 'international');
            if (QUOTE_SERVICE_DETAILS[prevServiceType]?.modes.includes(local ? 'local' : 'international')) {
                serviceTypeSelect.value = prevServiceType;
            }
        }

        if (note) {
            if (local) {
                const names = [...LOCAL_SHIPPING_COUNTRIES].map(getCountryName).sort().join(', ');
                note.innerHTML = `<i class="fas fa-info-circle"></i> Local shipping is currently available within: ${names}.`;
                note.style.display = 'block';
            } else {
                note.style.display = 'none';
            }
        }

        if (local) syncDestinationToOrigin();
    }

    radios.forEach(r => r.addEventListener('change', apply));
    originSelect.addEventListener('change', () => { if (isLocalMode()) syncDestinationToOrigin(); });

    apply();

    return { isLocalMode };
}

// =============================================
// CALCULATION
// =============================================
// Pricing lives in exactly one place: backend/utils/pricing.js (the
// distance-driven per-country-pair rate card). This used to fall back to a
// crude local approximation -- a flat "distance factor" of 2.0 for every
// route except 8 hardcoded ones -- whenever the request failed. That's not
// just stale now that the real engine prices every country pair distinctly;
// a silently-substituted wrong price is actively worse than an honest error,
// since whatever the quote preview shows here, the shipment gets created
// (and actually priced) by the same backend anyway. So a failed request
// throws instead of guessing, and the caller is expected to show the error
// rather than quietly displaying a made-up number.
async function calculateQuote({ originCountry, destinationCountry, serviceType, items, dimensions, shipmentType }) {
    const { totalWeight, totalValue } = summarizeItems(items);

    let response;
    try {
        response = await fetch('/api/quotes/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originCountry, destinationCountry, serviceType, shipmentType,
                items, dimensions
            })
        });
    } catch (error) {
        throw new Error('Could not reach the pricing service. Check your connection and try again.');
    }

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Could not calculate a quote right now. Please try again.');
    }

    return {
        basePrice: result.data.basePrice,
        insuranceCost: result.data.insuranceCost,
        surcharge: result.data.surcharge,
        totalPrice: result.data.totalPrice,
        totalWeight: result.data.totalWeight ?? totalWeight,
        totalValue: result.data.totalValue ?? totalValue,
        deliveryEstimate: result.data.deliveryEstimate
    };
}
