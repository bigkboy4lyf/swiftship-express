// =============================================
// CUSTOMER DASHBOARD - CONNECTED TO BACKEND
// =============================================
// Status labels come from the shared getStatusLabel() in script.js, which is
// loaded on this page too.

document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (!token || !user) {
        window.location.href = 'account.html';
        return;
    }

    document.getElementById('userDisplayName').textContent = user.name || 'User';
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrator' : 'Customer';
    applyAvatar(user.name, user.avatar);
    window.currentAvatarDataUrl = user.avatar || '';

    // Admins also get a link into the separate admin panel
    document.querySelectorAll('.admin-menu').forEach(el => {
        el.style.display = user.role === 'admin' ? 'flex' : 'none';
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => window.logout());

    setupTabSwitching();
    setupSidebarDrawer();
    setupUserMenu();
    loadDashboardData(token, user);
});

// =============================================
// USER MENU (avatar dropdown: profile link + logout)
// =============================================
function setupUserMenu() {
    const btn = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userMenuDropdown');
    if (!btn || !dropdown) return;

    function closeMenu() {
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        dropdown.classList.remove('open');
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('open');
        btn.classList.toggle('open', isOpen);
        btn.setAttribute('aria-expanded', String(isOpen));
    });

    dropdown.addEventListener('click', (e) => {
        if (e.target.closest('.user-menu-item')) closeMenu();
    });

    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });
}

// =============================================
// MOBILE SIDEBAR DRAWER
// =============================================
function closeSidebarDrawer() {
    document.querySelector('.sidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('open');
}

function setupSidebarDrawer() {
    document.getElementById('sidebarToggleBtn')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.add('open');
        document.getElementById('sidebarBackdrop')?.classList.add('open');
    });
    document.getElementById('sidebarBackdrop')?.addEventListener('click', closeSidebarDrawer);
}

// =============================================
// AVATAR HELPER (shows the real photo if set, else initials)
// =============================================
function applyAvatar(name, avatarUrl) {
    const initial = (name || 'U').charAt(0).toUpperCase();
    const targets = [
        { img: 'userAvatarImg', span: 'userAvatarInitial' },
        { img: 'profileAvatarImg', span: 'profileAvatar' },
        { img: 'editAvatarPreview', span: 'editAvatarInitial' }
    ];
    targets.forEach(t => {
        const imgEl = document.getElementById(t.img);
        const spanEl = document.getElementById(t.span);
        if (spanEl) spanEl.textContent = initial;
        if (!imgEl) return;
        if (avatarUrl) {
            imgEl.src = avatarUrl;
            imgEl.style.display = 'block';
            if (spanEl) spanEl.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            imgEl.src = '';
            if (spanEl) spanEl.style.display = '';
        }
    });
}

// =============================================
// TAB SWITCHING
// =============================================
const PAGE_TITLES = {
    'user-dashboard': 'Dashboard',
    'user-shipments': 'My Shipments',
    'user-tracking': 'Track Package',
    'user-quote': 'Get a Quote',
    'user-addresses': 'Saved Addresses',
    'user-profile': 'Profile'
};

function switchTab(tabId) {
    const menuItems = document.querySelectorAll('.sidebar-menu-item[data-tab]');
    menuItems.forEach(i => i.classList.toggle('active', i.getAttribute('data-tab') === tabId));

    document.querySelectorAll('.dashboard-section').forEach(section => {
        section.style.display = section.id === toSectionId(tabId) ? 'block' : 'none';
    });

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = PAGE_TITLES[tabId] || 'Dashboard';

    if (tabId === 'user-shipments') {
        document.getElementById('userShipmentsBody').innerHTML =
            '<tr class="row-static"><td colspan="5" style="text-align:center;">Loading your shipments...</td></tr>';
        loadUserShipments();
    }
    if (tabId === 'user-profile') loadProfileData();
    if (tabId === 'user-addresses') fetchAddresses();

    closeSidebarDrawer();
}

function toSectionId(tabId) {
    // 'user-shipments' -> 'userShipments'
    return tabId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function setupTabSwitching() {
    document.querySelectorAll('.sidebar-menu-item[data-tab]').forEach(item => {
        item.addEventListener('click', () => switchTab(item.getAttribute('data-tab')));
    });

    document.querySelectorAll('[data-tab-link]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(link.getAttribute('data-tab-link'));
        });
    });
}

// =============================================
// DATA LOADING
// =============================================
async function loadDashboardData(token, user) {
    await Promise.all([
        loadDashboardStats(token),
        loadRecentShipments(token, user)
    ]);
}

async function loadDashboardStats(token) {
    try {
        const res = await fetch('/api/dashboard/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) {
            const stats = result.data;
            setElementText('totalShipments', stats.totalShipments || 0);
            setElementText('deliveredShipments', stats.deliveredShipments || 0);
            setElementText('transitShipments', stats.inTransitShipments || 0);
            setElementText('pendingShipments', stats.pendingShipments || 0);
        }
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

function setElementText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    el.classList.remove('loading');
}

async function loadRecentShipments(token, user) {
    try {
        const url = `/api/dashboard/shipments?limit=5&userId=${user.id}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await res.json();
        if (result.success) renderRecentShipments(result.data);
    } catch (err) {
        console.error('Error loading recent shipments:', err);
    }
}

// Populated by renderRecentShipments()/renderUserShipments(); lets
// viewShipmentDetail() show the full record without a second network call.
let lastLoadedUserShipments = [];

function renderRecentShipments(shipments) {
    lastLoadedUserShipments = shipments;
    const tbody = document.getElementById('recentShipmentsBody');
    if (!tbody) return;
    if (!shipments.length) {
        tbody.innerHTML = '<tr class="row-static"><td colspan="5" style="text-align:center;">No shipments found</td></tr>';
        return;
    }
    tbody.innerHTML = shipments.map(s => `
        <tr onclick="viewShipmentDetail('${s._id}')">
            <td data-label="Tracking #"><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td data-label="Destination">${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td data-label="Date">${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td data-label="Status"><span class="status-badge status-${s.status}">${getStatusLabel(s.status).toUpperCase()}</span></td>
            <td data-label=""><i class="fas fa-chevron-right row-caret"></i></td>
        </tr>
    `).join('');
}

// =============================================
// MY SHIPMENTS (logged-in user's own shipments)
// =============================================
async function loadUserShipments() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    try {
        const res = await fetch(`/api/dashboard/shipments?limit=50&userId=${user.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) renderUserShipments(result.data);
    } catch (err) {
        console.error('Error loading your shipments:', err);
    }
}

function renderUserShipments(shipments) {
    lastLoadedUserShipments = shipments;
    const tbody = document.getElementById('userShipmentsBody');
    if (!tbody) return;
    if (!shipments.length) {
        tbody.innerHTML = '<tr class="row-static"><td colspan="5" style="text-align:center;">No shipments found</td></tr>';
        return;
    }
    tbody.innerHTML = shipments.map(s => `
        <tr onclick="viewShipmentDetail('${s._id}')">
            <td data-label="Tracking #"><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td data-label="Destination">${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td data-label="Status"><span class="status-badge status-${s.status}">${getStatusLabel(s.status).toUpperCase()}</span></td>
            <td data-label="Date">${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td data-label=""><i class="fas fa-chevron-right row-caret"></i></td>
        </tr>
    `).join('');
}

// =============================================
// SHIPMENT DETAILS (full quote/shipment record, dashboard-only)
// =============================================
// The shipment currently open in the details modal -- lets the "View
// Invoice/Receipt" button build its document without a second lookup.
let currentDetailShipment = null;

window.viewShipmentDetail = function(id) {
    const s = lastLoadedUserShipments.find(x => x._id === id);
    if (!s) return;
    currentDetailShipment = s;

    const dims = s.package?.dimensions;
    const dimensionsText = dims && (dims.length || dims.width || dims.height)
        ? `${dims.length} x ${dims.width} x ${dims.height} cm`
        : 'Not specified';

    const rows = [
        ['Tracking Number', s.trackingNumber || 'N/A'],
        ['Status', getStatusLabel(s.status)],
        ['Service Type', s.serviceType ? s.serviceType.charAt(0).toUpperCase() + s.serviceType.slice(1) : 'N/A'],
        ['Weight', s.package?.weight ? `${s.package.weight} kg` : 'Not specified'],
        ['Dimensions', dimensionsText],
        ['Sender Name', s.sender?.name || 'Not specified'],
        ['Sender Email', s.sender?.email || 'Not specified'],
        ['Destination', [s.recipient?.city, s.recipient?.country].filter(Boolean).join(', ') || 'N/A'],
        ['Requested', s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A']
    ];

    document.getElementById('shipmentDetailBody').innerHTML = rows.map(([label, value]) => `
        <div class="profile-detail-row">
            <dt>${label}</dt>
            <dd>${value}</dd>
        </div>
    `).join('');

    document.getElementById('shipmentDetailTrackLink').href = `tracking.html?number=${s.trackingNumber}`;

    const docBtn = document.getElementById('shipmentDetailDocBtn');
    if (docBtn) docBtn.textContent = isAwaitingConfirmation(s.status) ? 'View Invoice' : 'View Receipt';

    document.getElementById('shipmentDetailModal').classList.add('active');
};

document.getElementById('closeShipmentDetailModal')?.addEventListener('click', () => {
    document.getElementById('shipmentDetailModal').classList.remove('active');
});

document.getElementById('shipmentDetailDocBtn')?.addEventListener('click', () => {
    if (currentDetailShipment) openInvoiceOrReceipt(currentDetailShipment);
});

// =============================================
// QUICK TRACK
// =============================================
function goToTracking(inputId) {
    const input = document.getElementById(inputId);
    if (input && input.value.trim()) {
        window.location.href = `tracking.html?number=${encodeURIComponent(input.value.trim())}`;
    }
}

document.getElementById('quickTrackBtn')?.addEventListener('click', () => goToTracking('quickTrackInput'));
document.getElementById('quickTrackInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') goToTracking('quickTrackInput');
});
document.getElementById('trackingTabBtn')?.addEventListener('click', () => goToTracking('trackingInput'));
document.getElementById('trackingInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') goToTracking('trackingInput');
});

// =============================================
// PROFILE
// =============================================
async function loadProfileData() {
    const token = localStorage.getItem('token');
    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn) editBtn.disabled = true;
    try {
        const res = await fetch('/api/dashboard/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Could not load profile');

        const user = result.data;

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...storedUser, ...user, id: user._id }));

        setElementText('profileNameDisplay', user.name || 'Unnamed User');
        setElementText('profileEmailDisplay', user.email || '—');
        setElementText('profilePhoneDisplay', user.phone || 'Not set');

        const accountTypeLabel = user.accountType
            ? user.accountType.charAt(0).toUpperCase() + user.accountType.slice(1)
            : 'Personal';
        setElementText('profileAccountTypeDisplay', accountTypeLabel);
        setElementText('profileAccountTypeBadge', accountTypeLabel);

        setElementText('profileMemberSince', user.createdAt
            ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : '—');

        setElementText('profileTotalShipments', document.getElementById('totalShipments')?.textContent || '0');

        try {
            const statsRes = await fetch('/api/dashboard/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const statsResult = await statsRes.json();
            if (statsResult.success) {
                setElementText('profileActiveShipments', statsResult.data.activeShipmentsPersonal ?? 0);
            }
        } catch (statsErr) {
            console.error('Error loading active shipment count:', statsErr);
        }

        window.currentAvatarDataUrl = user.avatar || '';
        applyAvatar(user.name, user.avatar);
    } catch (err) {
        console.error('Error loading profile:', err);
    } finally {
        if (editBtn) editBtn.disabled = false;
    }
}

document.getElementById('editProfileBtn')?.addEventListener('click', () => {
    const fullName = document.getElementById('profileNameDisplay').textContent.trim();
    const nameParts = fullName.split(' ');
    const email = document.getElementById('profileEmailDisplay').textContent.trim();
    const phone = document.getElementById('profilePhoneDisplay').textContent.trim();

    document.getElementById('editFirstName').value = nameParts[0] || '';
    document.getElementById('editLastName').value = nameParts.slice(1).join(' ') || '';
    document.getElementById('editEmail').value = email;
    document.getElementById('editPhone').value = phone === 'Not set' ? '' : phone;

    window.pendingAvatarDataUrl = window.currentAvatarDataUrl || '';
    window.avatarRemoved = false;
    applyAvatar(fullName, window.currentAvatarDataUrl);
    document.getElementById('removeAvatarBtn').style.display = window.currentAvatarDataUrl ? 'inline' : 'none';

    document.getElementById('editProfileModal').classList.add('active');
});

document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
    document.getElementById('changePasswordForm').reset();
    const errorEl = document.getElementById('passwordFormError');
    errorEl.style.display = 'none';
    errorEl.classList.remove('form-success');
    document.getElementById('changePasswordModal').classList.add('active');
});

document.getElementById('closeEditProfileModal')?.addEventListener('click', () => {
    document.getElementById('editProfileModal').classList.remove('active');
});
document.getElementById('closeChangePasswordModal')?.addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.remove('active');
});

// Clicking the dimmed backdrop closes whichever modal is open
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
});

// Photo picker: resize client-side so we don't ship a multi-megabyte image to the server
document.getElementById('chooseAvatarBtn')?.addEventListener('click', () => {
    document.getElementById('editAvatarInput').click();
});

document.getElementById('editAvatarInput')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Please choose an image file.');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('Please choose an image smaller than 5MB.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
            const maxSize = 300;
            let { width, height } = img;
            if (width > height && width > maxSize) {
                height *= maxSize / width;
                width = maxSize;
            } else if (height > maxSize) {
                width *= maxSize / height;
                height = maxSize;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

            window.pendingAvatarDataUrl = dataUrl;
            window.avatarRemoved = false;
            document.getElementById('editAvatarPreview').src = dataUrl;
            document.getElementById('editAvatarPreview').style.display = 'block';
            document.getElementById('editAvatarInitial').style.display = 'none';
            document.getElementById('removeAvatarBtn').style.display = 'inline';
        };
        img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('removeAvatarBtn')?.addEventListener('click', () => {
    window.pendingAvatarDataUrl = '';
    window.avatarRemoved = true;
    document.getElementById('editAvatarPreview').style.display = 'none';
    document.getElementById('editAvatarInitial').style.display = '';
    document.getElementById('removeAvatarBtn').style.display = 'none';
});

document.getElementById('editProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('saveProfileBtn');
    const firstName = document.getElementById('editFirstName').value.trim();
    const lastName = document.getElementById('editLastName').value.trim();
    const phone = document.getElementById('editPhone').value.trim();

    if (!firstName) {
        alert('First name is required.');
        return;
    }

    const payload = { firstName, lastName, phone };
    if (window.avatarRemoved) {
        payload.avatar = '';
    } else if (window.pendingAvatarDataUrl && window.pendingAvatarDataUrl !== window.currentAvatarDataUrl) {
        payload.avatar = window.pendingAvatarDataUrl;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
        const res = await fetch('/api/dashboard/profile', {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Could not update profile');

        const updatedUser = result.data;
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...storedUser, ...updatedUser, id: updatedUser._id }));

        setElementText('profileNameDisplay', updatedUser.name);
        setElementText('profilePhoneDisplay', updatedUser.phone || 'Not set');
        document.getElementById('userDisplayName').textContent = updatedUser.name;

        window.currentAvatarDataUrl = updatedUser.avatar || '';
        applyAvatar(updatedUser.name, updatedUser.avatar);

        document.getElementById('editProfileModal').classList.remove('active');
    } catch (err) {
        alert(err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
});

document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('passwordFormError');
    const saveBtn = document.getElementById('savePasswordBtn');
    errorEl.style.display = 'none';

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;

    const showError = (msg) => {
        errorEl.classList.remove('form-success');
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    };

    if (newPassword.length < 6) {
        showError('New password must be at least 6 characters.');
        return;
    }
    if (newPassword !== confirmPassword) {
        showError('New passwords do not match.');
        return;
    }
    if (newPassword === currentPassword) {
        showError('New password must be different from your current password.');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating...';
    try {
        const res = await fetch('/api/dashboard/password', {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ currentPassword, newPassword })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Could not update password');

        errorEl.classList.add('form-success');
        errorEl.textContent = 'Password updated successfully.';
        errorEl.style.display = 'block';
        e.target.reset();
        setTimeout(() => {
            errorEl.style.display = 'none';
            document.getElementById('changePasswordModal').classList.remove('active');
        }, 1200);
    } catch (err) {
        showError(err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Update Password';
    }
});

// =============================================
// SHIPMENT REQUEST CONFIRMATION
// =============================================
function showTrackingConfirmation(trackingNumber) {
    document.getElementById('trackingConfirmNumber').textContent = trackingNumber;
    document.getElementById('trackingConfirmModal').classList.add('active');
}

document.getElementById('dismissTrackingConfirm')?.addEventListener('click', () => {
    document.getElementById('trackingConfirmModal').classList.remove('active');
    document.getElementById('dashboardQuoteForm')?.reset();
    document.getElementById('quoteFormState').style.display = 'none';
    document.getElementById('quoteCtaState').style.display = 'block';
});

// =============================================
// QUOTE TAB: click-to-open form
// =============================================
document.getElementById('openQuoteFormBtn')?.addEventListener('click', () => {
    document.getElementById('quoteCtaState').style.display = 'none';
    document.getElementById('quoteFormState').style.display = 'grid';
});

document.getElementById('closeQuoteFormBtn')?.addEventListener('click', () => {
    document.getElementById('quoteFormState').style.display = 'none';
    document.getElementById('quoteCtaState').style.display = 'block';
    document.getElementById('dashboardQuoteForm')?.reset();
});

// =============================================
// QUOTE SUBMISSION -> SHIPMENT REQUEST
// =============================================
function parseDimensions(input) {
    if (typeof input !== 'string') return { length: 0, width: 0, height: 0 };
    const parts = input.toLowerCase().split('x').map(p => parseFloat(p.trim()));
    if (parts.length === 3 && parts.every(p => !isNaN(p))) {
        return { length: parts[0], width: parts[1], height: parts[2] };
    }
    return { length: 0, width: 0, height: 0 };
}

document.getElementById('dashboardQuoteForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user')) || {};

    const senderName = document.getElementById('dashSenderName')?.value.trim();
    const senderEmail = document.getElementById('dashSenderEmail')?.value.trim();
    const originCity = document.getElementById('dashOrigin')?.value || 'Origin Hub';
    const destCity = document.getElementById('dashDestination')?.value || '';
    const service = document.getElementById('dashServiceType')?.value || 'standard';
    const pkgWeight = parseFloat(document.getElementById('dashWeight')?.value) || 1;
    const dimensionsInput = document.getElementById('dashDimensions')?.value || '';

    if (!destCity) {
        alert('Please provide a destination country.');
        return;
    }

    const payload = {
        userId: user.id || user._id,
        serviceType: service,
        sender: { name: senderName || user.name || 'Customer', email: senderEmail, city: originCity, country: originCity },
        recipient: { name: 'To Be Determined', city: destCity, country: destCity },
        packageDetails: {
            weight: pkgWeight,
            dimensions: parseDimensions(dimensionsInput)
        }
    };

    try {
        const res = await fetch('/api/shipments/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (result.success) {
            showTrackingConfirmation(result.data.trackingNumber);
            loadDashboardData(token, user);
        } else {
            alert('Could not submit request: ' + result.message);
        }
    } catch (error) {
        console.error('Error submitting shipment request:', error);
        alert('Could not reach the server. Please try again.');
    }
});

// =============================================
// ADDRESSES
// =============================================
const ADDR_API = '/api/addresses';

async function fetchAddresses() {
    try {
        const res = await fetch(ADDR_API, { headers: getHeaders() });
        if (!res.ok) throw new Error('Could not load addresses');
        renderAddresses(await res.json());
    } catch (err) {
        console.error('Failed to load addresses:', err);
    }
}

function renderAddresses(addresses) {
    setElementText('address-count', addresses.length);

    const container = document.getElementById('address-list-container');
    const toggleBtn = document.getElementById('toggle-address-btn');
    if (!container) return;

    container.innerHTML = addresses.length
        ? addresses.map(addr => `
            <div class="address-card">
                <div class="address-card-details">
                    <strong>${addr.street}</strong><br>
                    ${addr.city}, ${addr.state} ${addr.zipCode}<br>
                    ${addr.Country || ''}
                </div>
                <div class="address-card-actions">
                    <button type="button" class="btn-delete" onclick="deleteAddress('${addr._id}')">
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                </div>
            </div>
        `).join('')
        : '<p class="address-empty">No saved addresses yet. Add one to speed up checkout.</p>';

    if (toggleBtn) toggleBtn.style.display = addresses.length >= 3 ? 'none' : '';
}

function toggleAddressForm(show) {
    document.getElementById('address-form-wrapper').style.display = show ? 'block' : 'none';
}

document.getElementById('toggle-address-btn')?.addEventListener('click', () => toggleAddressForm(true));
document.getElementById('cancel-address-btn')?.addEventListener('click', () => toggleAddressForm(false));

document.getElementById('add-address-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        street: document.getElementById('addr-street').value,
        city: document.getElementById('addr-city').value,
        state: document.getElementById('addr-state').value,
        zipCode: document.getElementById('addr-zip').value,
        country: document.getElementById('addr-country').value
    };

    try {
        const res = await fetch(ADDR_API, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Could not save address');

        renderAddresses(data);
        e.target.reset();
        toggleAddressForm(false);
    } catch (err) {
        alert(err.message);
    }
});

window.deleteAddress = async function(id) {
    if (!confirm('Remove this address?')) return;
    try {
        const res = await fetch(`${ADDR_API}/${id}`, { method: 'DELETE', headers: getHeaders() });
        if (!res.ok) throw new Error('Could not delete address');
        renderAddresses(await res.json());
    } catch (err) {
        alert(err.message);
    }
};

// =============================================
// INVOICE / RECEIPT
// =============================================
// A shipment sitting at pending_approval hasn't been paid for yet -- it
// gets an invoice. Once it's been approved (any other status), the same
// document becomes a receipt. Matches AWAITING_DECISION_STATUSES on the
// backend (backend/routes/dashboard.js).
function isAwaitingConfirmation(status) {
    return status === 'pending_approval';
}

function money(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
}

function openInvoiceOrReceipt(s) {
    const isInvoice = isAwaitingConfirmation(s.status);

    document.getElementById('invoiceModalTitle').textContent = isInvoice ? 'Invoice' : 'Receipt';
    document.getElementById('invoiceDocType').textContent = isInvoice ? 'INVOICE' : 'RECEIPT';

    const stamp = document.getElementById('invoiceStatusStamp');
    stamp.textContent = isInvoice ? 'Unpaid' : 'Paid';
    stamp.className = 'invoice-doc-stamp ' + (isInvoice ? 'unpaid' : 'paid');

    document.getElementById('invoiceDocNumber').textContent = `${isInvoice ? 'INV' : 'RCT'}-${s.trackingNumber}`;
    document.getElementById('invoiceDocDate').textContent = s.createdAt
        ? new Date(s.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'N/A';

    document.getElementById('invoiceBillTo').innerHTML = `
        <strong>${s.sender?.name || 'N/A'}</strong><br>
        ${s.sender?.email || ''}
    `;
    document.getElementById('invoiceShipmentSummary').innerHTML = `
        Tracking: <strong>${s.trackingNumber}</strong><br>
        ${[s.sender?.country, s.recipient?.country].filter(Boolean).join(' &rarr; ') || 'N/A'}<br>
        ${s.serviceType ? s.serviceType.charAt(0).toUpperCase() + s.serviceType.slice(1) : 'Standard'} Service &middot; ${s.package?.weight || 'N/A'} kg
    `;

    const p = s.pricing || {};
    document.getElementById('invoiceLineItems').innerHTML = s.totalPrice
        ? `
            <tr><td>Base Shipping Rate</td><td>${money(p.basePrice)}</td></tr>
            ${p.insuranceCost ? `<tr><td>Insurance</td><td>${money(p.insuranceCost)}</td></tr>` : ''}
            <tr><td>Service Surcharge</td><td>${money(p.surcharge)}</td></tr>
        `
        : '<tr><td colspan="2">Pricing details are not available for this shipment.</td></tr>';

    document.getElementById('invoiceTotal').textContent = money(s.totalPrice);

    document.getElementById('invoiceFooterNote').textContent = isInvoice
        ? 'This is an invoice, not a receipt. Once this shipment request is approved, this same document becomes a downloadable receipt.'
        : 'This receipt confirms payment has been received and processed for the shipment described above.';

    document.getElementById('invoiceVerificationCode').textContent = s.verificationCode || 'N/A';

    document.getElementById('invoiceReceiptModal').classList.add('active');
}

document.getElementById('closeInvoiceModal')?.addEventListener('click', () => {
    document.getElementById('invoiceReceiptModal').classList.remove('active');
});

document.getElementById('printInvoiceBtn')?.addEventListener('click', () => window.print());
