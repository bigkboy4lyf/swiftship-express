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
    loadDashboardData(token, user);
});

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
            '<tr><td colspan="5" style="text-align:center;">Loading your shipments...</td></tr>';
        loadUserShipments();
    }
    if (tabId === 'user-profile') loadProfileData();
    if (tabId === 'user-addresses') fetchAddresses();
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No shipments found</td></tr>';
        return;
    }
    tbody.innerHTML = shipments.map(s => `
        <tr>
            <td><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td>${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td>${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status).toUpperCase()}</span></td>
            <td><button class="action-btn" onclick="viewShipmentDetail('${s._id}')" title="View Details"><i class="fas fa-eye"></i></button></td>
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No shipments found</td></tr>';
        return;
    }
    tbody.innerHTML = shipments.map(s => `
        <tr>
            <td><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td>${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status).toUpperCase()}</span></td>
            <td>${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td><button class="action-btn" onclick="viewShipmentDetail('${s._id}')" title="View Details"><i class="fas fa-eye"></i></button></td>
        </tr>
    `).join('');
}

// =============================================
// SHIPMENT DETAILS (full quote/shipment record, dashboard-only)
// =============================================
window.viewShipmentDetail = function(id) {
    const s = lastLoadedUserShipments.find(x => x._id === id);
    if (!s) return;

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
    document.getElementById('shipmentDetailModal').classList.add('active');
};

document.getElementById('closeShipmentDetailModal')?.addEventListener('click', () => {
    document.getElementById('shipmentDetailModal').classList.remove('active');
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
