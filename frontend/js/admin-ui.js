// =============================================
// ADMIN PANEL - CONNECTED TO BACKEND
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
    // Real enforcement happens server-side on every /api/dashboard admin
    // route; this just keeps a non-admin from landing on the page at all.
    if (user.role !== 'admin') {
        window.location.href = 'dashboard.html';
        return;
    }

    document.getElementById('userDisplayName').textContent = user.name || 'Admin';
    applyAvatar(user.name, user.avatar);

    document.getElementById('logoutBtn')?.addEventListener('click', () => window.logout());

    setupTabSwitching();
    setupSidebarDrawer();
    setupUserMenu();
    loadAdminData(token);

    // Lets a notification's link (e.g. from the bell dropdown) deep-link
    // straight into a specific tab instead of always landing on the overview.
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab && PAGE_TITLES[requestedTab]) switchTab(requestedTab);
});

// =============================================
// USER MENU (avatar dropdown: settings link + logout)
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
// AVATAR HELPER
// =============================================
function applyAvatar(name, avatarUrl) {
    const initial = (name || 'U').charAt(0).toUpperCase();
    const imgEl = document.getElementById('userAvatarImg');
    const spanEl = document.getElementById('userAvatarInitial');
    if (spanEl) spanEl.textContent = initial;
    if (!imgEl) return;
    if (avatarUrl) {
        imgEl.src = avatarUrl;
        imgEl.style.display = 'block';
        if (spanEl) spanEl.style.display = 'none';
    } else {
        imgEl.style.display = 'none';
        if (spanEl) spanEl.style.display = '';
    }
}

// =============================================
// TAB SWITCHING
// =============================================
const PAGE_TITLES = {
    'admin-dashboard': 'Admin Dashboard',
    'admin-shipments': 'All Shipments',
    'admin-users': 'Users',
    'admin-payment-accounts': 'Payment Accounts',
    'admin-payment-reviews': 'Payment Reviews',
    'admin-tickets': 'Support Tickets',
    'admin-support-chat': 'Support Chat',
    'admin-notifications': 'Notifications',
    'admin-reports': 'Reports',
    'admin-settings': 'Settings'
};

function switchTab(tabId) {
    document.querySelectorAll('.sidebar-menu-item[data-tab]').forEach(i => {
        i.classList.toggle('active', i.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.dashboard-section').forEach(section => {
        section.style.display = section.id === toSectionId(tabId) ? 'block' : 'none';
    });

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = PAGE_TITLES[tabId] || 'Admin Dashboard';

    if (tabId === 'admin-shipments') {
        document.getElementById('adminShipmentsBody').innerHTML =
            '<tr class="row-static"><td colspan="5" style="text-align:center;">Loading shipments...</td></tr>';
        loadAllShipments();
    }
    if (tabId === 'admin-users') {
        document.getElementById('adminUsersBody').innerHTML =
            '<tr class="row-static"><td colspan="5" style="text-align:center;">Loading users...</td></tr>';
        loadAllUsers();
    }
    if (tabId === 'admin-payment-accounts') {
        loadPaymentAccounts();
    }
    if (tabId === 'admin-payment-reviews') {
        loadPaymentReviews();
    }
    if (tabId === 'admin-tickets') {
        loadSupportTickets();
    }
    if (tabId === 'admin-support-chat') {
        loadChatConversations();
    }
    if (tabId === 'admin-notifications') {
        populateNotifyUserSelect();
    }
    if (tabId === 'admin-settings') {
        loadFeeSettings();
    }

    closeSidebarDrawer();
}

function toSectionId(tabId) {
    // 'admin-shipments' -> 'adminShipments'
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
async function loadAdminData(token) {
    await Promise.all([
        loadDashboardStats(token),
        loadAllShipments(),
        loadAllUsers(),
        loadPendingApprovals(),
        loadChatConversations()
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
            setElementText('totalUsers', stats.totalUsers || 0);
            setElementText('totalShipmentsAdmin', stats.totalShipmentsOrg || 0);
            setElementText('activeShipments', stats.activeShipments || 0);
            const revenueEl = document.getElementById('revenue');
            if (revenueEl) {
                revenueEl.textContent = `$${(stats.revenue || 0).toLocaleString()}`;
                revenueEl.classList.remove('loading');
            }
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

function authHeaders() {
    return { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
}

async function loadAllShipments() {
    try {
        const res = await fetch('/api/dashboard/shipments?limit=20', { headers: authHeaders() });
        const result = await res.json();
        if (result.success) renderAllShipments(result.data);
    } catch (err) {
        console.error('Error loading all shipments:', err);
    }
}

// Populated on every render; lets viewShipmentDetail() show the full record
// (weight, dimensions, sender contact info) without a second network call.
let lastLoadedShipments = [];

function renderAllShipments(shipments) {
    lastLoadedShipments = shipments;

    // Two tables show this same data: the overview-pane preview (allShipmentsBody)
    // and the dedicated "All Shipments" sidebar tab (adminShipmentsBody).
    const tbodies = ['allShipmentsBody', 'adminShipmentsBody']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    if (!tbodies.length) return;

    const html = !shipments.length
        ? '<tr class="row-static"><td colspan="5" style="text-align:center;">No shipments found</td></tr>'
        : shipments.map(s => `
        <tr onclick="viewShipmentDetail('${s._id}')">
            <td data-label="Tracking #"><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td data-label="Customer">${s.userId?.name || 'N/A'}</td>
            <td data-label="Destination">${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td data-label="Status"><span class="status-badge status-${s.status}">${getStatusLabel(s.status).toUpperCase()}</span></td>
            <td data-label="Actions">
                <button class="action-btn" onclick="event.stopPropagation(); updateShipmentStatus('${s._id}')" title="Update Status"><i class="fas fa-truck"></i></button>
                <button class="action-btn delete" onclick="event.stopPropagation(); deleteShipment('${s._id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    tbodies.forEach(tbody => tbody.innerHTML = html);
}

// The shipment currently open in the details modal -- lets the "View
// Invoice/Receipt" button build its document without a second lookup.
let currentDetailShipment = null;

// The full street address a shipment is actually going to -- previously only
// city/country made it into this view, which told admin which country a
// package was headed to but not the actual address to ship it to.
function formatDeliveryAddress(recipient) {
    if (!recipient) return 'N/A';
    const line2 = [recipient.city, recipient.postalCode].filter(Boolean).join(' ');
    const parts = [recipient.address, line2, getCountryName(recipient.country) || recipient.country].filter(Boolean);
    return parts.length ? parts.join(', ') : 'N/A';
}

window.viewShipmentDetail = function(id) {
    const s = lastLoadedShipments.find(x => x._id === id);
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
        ['Shipment Type', s.shipmentType === 'local' ? 'Local (Domestic)' : 'International'],
        ['Account Holder', s.userId?.name ? `${s.userId.name} (${s.userId.email || 'no email on file'})` : 'N/A'],
        ['Contents', describePackageContents(s.package)],
        ['Weight', s.package?.weight ? `${s.package.weight} kg` : 'Not specified'],
        ['Dimensions', dimensionsText],
        ['Sender Name', s.sender?.name || 'Not specified'],
        ['Contact Email', s.contactEmail || s.sender?.email || 'Not specified'],
        ['Recipient', s.recipient?.name ? `${s.recipient.name}${s.recipient.phone ? ' &middot; ' + s.recipient.phone : ''}` : 'Not specified'],
        ['Delivery Address', formatDeliveryAddress(s.recipient)],
        ['Requested', s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'],
        ['Estimated Delivery', s.estimatedDelivery ? new Date(s.estimatedDelivery).toLocaleDateString() : 'N/A']
    ];

    document.getElementById('shipmentDetailBody').innerHTML = rows.map(([label, value]) => `
        <div class="profile-detail-row">
            <dt>${label}</dt>
            <dd>${value}</dd>
        </div>
    `).join('');

    const docBtn = document.getElementById('shipmentDetailDocBtn');
    if (docBtn) docBtn.textContent = isAwaitingConfirmation(s.status) ? 'View Invoice' : 'View Receipt';

    renderShipmentFeesSection(s);

    document.getElementById('shipmentDetailModal').classList.add('active');
};

document.getElementById('closeShipmentDetailModal')?.addEventListener('click', () => {
    document.getElementById('shipmentDetailModal').classList.remove('active');
});

// =============================================
// PER-SHIPMENT DEMURRAGE / STORAGE TARGETING (inside the Shipment Details
// modal) -- this is what actually opts a specific shipment into the fee
// schedule configured in Admin > Settings. See PATCH
// /api/dashboard/shipments/:id/fees/:type.
// =============================================
function renderShipmentFeesSection(s) {
    const errorEl = document.getElementById('shipmentFeesError');
    if (errorEl) errorEl.style.display = 'none';

    document.getElementById('shipmentDemurrageActive').checked = !!s.fees?.demurrage?.active;
    document.getElementById('shipmentStorageActive').checked = !!s.fees?.storage?.active;

    const demurrageAccrued = s.fees?.demurrage?.accrued || 0;
    const storageAccrued = s.fees?.storage?.accrued || 0;
    document.getElementById('shipmentDemurrageAccrued').textContent =
        demurrageAccrued > 0 ? `$${demurrageAccrued.toFixed(2)} accrued so far` : 'Nothing accrued yet';
    document.getElementById('shipmentStorageAccrued').textContent =
        storageAccrued > 0 ? `$${storageAccrued.toFixed(2)} accrued so far` : 'Nothing accrued yet';
}

document.getElementById('saveShipmentFeesBtn')?.addEventListener('click', async function() {
    if (!currentDetailShipment) return;

    const errorEl = document.getElementById('shipmentFeesError');
    errorEl.style.display = 'none';

    const updates = {
        demurrage: document.getElementById('shipmentDemurrageActive').checked,
        storage: document.getElementById('shipmentStorageActive').checked
    };

    this.disabled = true;
    try {
        const results = await Promise.all(Object.entries(updates).map(([type, active]) =>
            fetch(`/api/dashboard/shipments/${currentDetailShipment._id}/fees/${type}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ active })
            }).then(res => res.json())
        ));

        const failed = results.find(r => !r.success);
        if (failed) {
            errorEl.textContent = failed.message || 'Could not save fee settings. Please try again.';
            errorEl.style.display = 'block';
            return;
        }

        const updatedShipment = results[results.length - 1].data;
        const idx = lastLoadedShipments.findIndex(x => x._id === updatedShipment._id);
        if (idx !== -1) lastLoadedShipments[idx] = updatedShipment;
        currentDetailShipment = updatedShipment;
        renderShipmentFeesSection(updatedShipment);
    } catch (err) {
        console.error('Error saving shipment fee settings:', err);
        errorEl.textContent = 'Could not reach the server. Please try again.';
        errorEl.style.display = 'block';
    } finally {
        this.disabled = false;
    }
});

document.getElementById('shipmentDetailDocBtn')?.addEventListener('click', () => {
    if (currentDetailShipment) openInvoiceOrReceipt(currentDetailShipment);
});

// =============================================
// PENDING APPROVALS
// =============================================
async function loadPendingApprovals() {
    try {
        const res = await fetch('/api/dashboard/shipments?status=pending_approval&limit=100', { headers: authHeaders() });
        const result = await res.json();
        if (result.success) renderPendingApprovals(result.data);
    } catch (err) {
        console.error('Error loading pending approvals:', err);
    }
}

function renderPendingApprovals(shipments) {
    const container = document.getElementById('pendingApprovalsContainer');
    setElementText('pendingCount', shipments.length);
    if (!container) return;

    if (!shipments.length) {
        container.innerHTML = '<p class="empty-text">No shipments awaiting approval.</p>';
        return;
    }

    container.innerHTML = shipments.map(s => `
        <div class="pending-approval-row">
            <div class="pending-approval-info">
                <strong>${s.trackingNumber || 'N/A'}</strong>
                <span class="pending-approval-customer"> — ${s.userId?.name || 'Unknown customer'}</span><br>
                <small class="pending-approval-meta">${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''} · Requested ${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</small>
            </div>
            <div class="pending-approval-actions">
                <button class="btn-approve" onclick="approveShipment('${s._id}')">Approve</button>
                <button class="btn-reject" onclick="rejectShipment('${s._id}')">Reject</button>
            </div>
        </div>
    `).join('');
}

window.approveShipment = async function(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/dashboard/shipments/${id}/approve`, {
            method: 'PATCH',
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Could not approve shipment');

        await Promise.all([loadPendingApprovals(), loadDashboardStats(token), loadAllShipments()]);
    } catch (err) {
        alert(err.message);
    }
};

window.rejectShipment = async function(id) {
    if (!confirm('Reject this shipment request? It will be permanently deleted and cannot be undone.')) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/dashboard/shipments/${id}/reject`, {
            method: 'PATCH',
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Could not reject shipment');

        await Promise.all([loadPendingApprovals(), loadDashboardStats(token), loadAllShipments()]);
    } catch (err) {
        alert(err.message);
    }
};

// =============================================
// USERS
// =============================================
let lastLoadedUsers = [];

async function loadAllUsers() {
    try {
        const res = await fetch('/api/dashboard/users', { headers: authHeaders() });
        const result = await res.json();
        if (result.success) {
            lastLoadedUsers = result.data;
            renderUsers(result.data);
        }
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

function renderUsers(users) {
    // Two tables show this same data: the overview-pane preview (usersBody)
    // and the dedicated "Users" sidebar tab (adminUsersBody).
    const tbodies = ['usersBody', 'adminUsersBody']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    if (!tbodies.length) return;

    const loggedInUser = JSON.parse(localStorage.getItem('user') || '{}');

    const html = !users.length
        ? '<tr class="row-static"><td colspan="5" style="text-align:center;">No users found</td></tr>'
        : users.map(u => {
            const isSelf = u._id === loggedInUser.id || u._id === loggedInUser._id;
            const isActive = (u.status || 'active') === 'active';
            return `
        <tr onclick="editUser('${u._id}')">
            <td data-label="Name">${u.name || 'N/A'}</td>
            <td data-label="Email">${u.email || 'N/A'}</td>
            <td data-label="Role">${u.role === 'admin' ? 'Administrator' : 'Customer'}</td>
            <td data-label="Status"><span class="status-badge ${isActive ? 'status-delivered' : 'status-pending'}">${(u.status || 'active').toUpperCase()}</span></td>
            <td data-label="Actions">
                <button class="action-btn" onclick="event.stopPropagation(); toggleUserStatus('${u._id}')" title="${isActive ? 'Deactivate' : 'Activate'}" ${isSelf ? 'disabled' : ''}>
                    <i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i>
                </button>
                <button class="action-btn delete" onclick="event.stopPropagation(); deleteUser('${u._id}')" title="Delete" ${isSelf ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `;
        }).join('');

    tbodies.forEach(tbody => tbody.innerHTML = html);
}

window.openUserModal = function(mode, user) {
    const form = document.getElementById('userForm');
    const passwordInput = document.getElementById('userFormPassword');
    const passwordHint = document.getElementById('userFormPasswordHint');

    form.reset();
    document.getElementById('userFormId').value = '';

    if (mode === 'edit' && user) {
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('userFormId').value = user._id;
        document.getElementById('userFormName').value = user.name || '';
        document.getElementById('userFormEmail').value = user.email || '';
        document.getElementById('userFormRole').value = user.role || 'user';
        document.getElementById('userFormStatus').value = user.status || 'active';
        passwordInput.required = false;
        passwordHint.style.display = 'block';
    } else {
        document.getElementById('userModalTitle').textContent = 'Add New User';
        passwordInput.required = true;
        passwordHint.style.display = 'none';
    }

    document.getElementById('userModal').classList.add('active');
};

function closeUserModal() {
    document.getElementById('userModal').classList.remove('active');
}

document.getElementById('closeUserModal')?.addEventListener('click', closeUserModal);
document.getElementById('addUserBtnOverview')?.addEventListener('click', () => window.openUserModal('add'));
document.getElementById('addUserBtnTab')?.addEventListener('click', () => window.openUserModal('add'));

document.getElementById('userForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const id = document.getElementById('userFormId').value;
    const isEdit = !!id;
    const password = document.getElementById('userFormPassword').value;

    const userData = {
        name: document.getElementById('userFormName').value,
        email: document.getElementById('userFormEmail').value,
        role: document.getElementById('userFormRole').value,
        status: document.getElementById('userFormStatus').value
    };
    if (password) userData.password = password;

    try {
        const res = await fetch(`/api/dashboard/users${isEdit ? '/' + id : ''}`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(userData)
        });
        const result = await res.json();
        if (result.success) {
            closeUserModal();
            loadAllUsers();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error saving user: ' + error.message);
    }
});

window.editUser = function(id) {
    const user = lastLoadedUsers.find(u => u._id === id);
    if (!user) {
        alert('Could not find that user -- try refreshing the page.');
        return;
    }
    window.openUserModal('edit', user);
};

window.toggleUserStatus = async function(id) {
    const user = lastLoadedUsers.find(u => u._id === id);
    if (!user) return;

    const newStatus = (user.status || 'active') === 'active' ? 'inactive' : 'active';
    if (!confirm(`${newStatus === 'active' ? 'Activate' : 'Deactivate'} ${user.name}?`)) return;

    try {
        const res = await fetch(`/api/dashboard/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await res.json();
        if (result.success) {
            loadAllUsers();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error updating status: ' + error.message);
    }
};

window.deleteUser = async function(id) {
    const user = lastLoadedUsers.find(u => u._id === id);
    const label = user ? `${user.name} (${user.email})` : 'this user';
    if (!confirm(`Delete ${label}? This can't be undone.`)) return;

    try {
        const res = await fetch(`/api/dashboard/users/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        const result = await res.json();
        if (result.success) {
            loadAllUsers();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error deleting user: ' + error.message);
    }
};

// =============================================
// PAYMENT ACCOUNTS (bank transfer details)
// =============================================
// Bank transfer is one of two standard payment options offered on every
// invoice, alongside card checkout -- not restricted to any destination, just
// recommended for limited-service ones. PARENT_ACCOUNT_CODE is a reserved
// code for the one account that acts as the fallback for every destination
// without its own specific entry (set once, covers every country); the rest
// come from the frontend's own LIMITED_SERVICE_COUNTRIES set
// (countries-data.js) -- the backend stores whatever country codes it's
// given without validating against that list, so admin only ever edits
// accounts for codes this page already knows about. Both the parent account
// and any country-specific account can be deleted independently.
// PARENT_ACCOUNT_CODE itself is defined in countries-data.js, shared with
// dashboard-ui.js so both pages agree on the same reserved value.
let lastLoadedPaymentAccounts = [];

function paymentAccountDisplayLabel(code) {
    return code === PARENT_ACCOUNT_CODE ? 'Parent Account' : getCountryName(code);
}

async function loadPaymentAccounts() {
    try {
        const res = await fetch('/api/dashboard/payment-accounts', { headers: authHeaders() });
        const result = await res.json();
        if (result.success) {
            lastLoadedPaymentAccounts = result.data;
            renderParentPaymentAccount(result.data);
            renderPaymentAccounts(result.data);
        }
    } catch (err) {
        console.error('Error loading payment accounts:', err);
    }
}

// Shared by both the parent-account row and every country row -- only the
// leading label column differs between the two tables, so that's the only
// thing each caller builds itself.
function paymentAccountRowCellsHtml(code, account) {
    const exists = !!account;
    const configured = exists && !!(account.bankName || account.accountNumber || account.iban);
    const label = paymentAccountDisplayLabel(code).replace(/'/g, "\\'");
    return `
        <td data-label="Bank">${account?.bankName || '—'}</td>
        <td data-label="Status"><span class="status-badge ${configured ? 'status-delivered' : 'status-pending'}">${configured ? 'CONFIGURED' : 'NOT SET'}</span></td>
        <td data-label="Actions">
            <button class="action-btn" onclick="editPaymentAccount('${code}')" title="Edit"><i class="fas fa-pen"></i></button>
            <button class="action-btn delete" onclick="deletePaymentAccount('${code}', '${label}')" title="Delete" ${exists ? '' : 'disabled'}><i class="fas fa-trash"></i></button>
        </td>
    `;
}

function renderParentPaymentAccount(accounts) {
    const tbody = document.getElementById('parentPaymentAccountBody');
    if (!tbody) return;
    const account = accounts.find(a => a.countryCode === PARENT_ACCOUNT_CODE);
    tbody.innerHTML = `<tr>${paymentAccountRowCellsHtml(PARENT_ACCOUNT_CODE, account)}</tr>`;
}

function renderPaymentAccounts(accounts) {
    const tbody = document.getElementById('paymentAccountsBody');
    if (!tbody) return;

    const byCode = {};
    accounts.forEach(a => { byCode[a.countryCode] = a; });

    tbody.innerHTML = [...LIMITED_SERVICE_COUNTRIES].sort().map(code => `
        <tr>
            <td data-label="Country">${getCountryName(code)}</td>
            ${paymentAccountRowCellsHtml(code, byCode[code])}
        </tr>
    `).join('');
}

window.editPaymentAccount = function(code) {
    const account = lastLoadedPaymentAccounts.find(a => a.countryCode === code);
    const form = document.getElementById('paymentAccountForm');
    form.reset();

    document.getElementById('paymentAccountModalTitle').textContent = `Payment Account -- ${paymentAccountDisplayLabel(code)}`;
    document.getElementById('paymentAccountCountryCode').value = code;
    document.getElementById('paymentAccountBankName').value = account?.bankName || '';
    document.getElementById('paymentAccountAccountName').value = account?.accountName || '';
    document.getElementById('paymentAccountAccountNumber').value = account?.accountNumber || '';
    document.getElementById('paymentAccountIban').value = account?.iban || '';
    document.getElementById('paymentAccountSwiftBic').value = account?.swiftBic || '';
    document.getElementById('paymentAccountRoutingNumber').value = account?.routingNumber || '';
    document.getElementById('paymentAccountSortCode').value = account?.sortCode || '';
    document.getElementById('paymentAccountBranchName').value = account?.branchName || '';
    document.getElementById('paymentAccountBranchAddress').value = account?.branchAddress || '';
    document.getElementById('paymentAccountCurrency').value = account?.currency || '';
    document.getElementById('paymentAccountIntermediaryBank').value = account?.intermediaryBank || '';
    document.getElementById('paymentAccountAdditionalInstructions').value = account?.additionalInstructions || '';

    document.getElementById('deletePaymentAccountBtn').style.display = account ? '' : 'none';

    document.getElementById('paymentAccountModal').classList.add('active');
};

// Reusable for both the parent account and any country account, from either
// a table row's Delete button or the edit modal's own Delete button.
window.deletePaymentAccount = async function(code, label) {
    if (!confirm(`Delete the payment account for ${label}? Customers will no longer see these bank transfer details.`)) return;

    try {
        const res = await fetch(`/api/dashboard/payment-accounts/${code}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('paymentAccountModal').classList.remove('active');
            loadPaymentAccounts();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error deleting payment account: ' + error.message);
    }
};

document.getElementById('deletePaymentAccountBtn')?.addEventListener('click', () => {
    const code = document.getElementById('paymentAccountCountryCode').value;
    window.deletePaymentAccount(code, paymentAccountDisplayLabel(code));
});

document.getElementById('closePaymentAccountModal')?.addEventListener('click', () => {
    document.getElementById('paymentAccountModal').classList.remove('active');
});

document.getElementById('paymentAccountForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const code = document.getElementById('paymentAccountCountryCode').value;

    const data = {
        bankName: document.getElementById('paymentAccountBankName').value,
        accountName: document.getElementById('paymentAccountAccountName').value,
        accountNumber: document.getElementById('paymentAccountAccountNumber').value,
        iban: document.getElementById('paymentAccountIban').value,
        swiftBic: document.getElementById('paymentAccountSwiftBic').value,
        routingNumber: document.getElementById('paymentAccountRoutingNumber').value,
        sortCode: document.getElementById('paymentAccountSortCode').value,
        branchName: document.getElementById('paymentAccountBranchName').value,
        branchAddress: document.getElementById('paymentAccountBranchAddress').value,
        currency: document.getElementById('paymentAccountCurrency').value,
        intermediaryBank: document.getElementById('paymentAccountIntermediaryBank').value,
        additionalInstructions: document.getElementById('paymentAccountAdditionalInstructions').value
    };

    try {
        const res = await fetch(`/api/dashboard/payment-accounts/${code}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('paymentAccountModal').classList.remove('active');
            loadPaymentAccounts();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error saving payment account: ' + error.message);
    }
});

// =============================================
// PAYMENT REVIEWS
// =============================================
// Lists only shipments with a receipt awaiting review (submitted from either
// the card or bank transfer flow -- see frontend/submit-receipt.html).
// Confirming asks how much of the balance this receipt covers -- partial
// payments are allowed, so it only advances the shipment into processing
// once the full balance is paid off; the backend is the source of truth on
// that and refuses anything over what's still owed. Rejecting leaves the
// shipment untouched so the customer's "Payment Processing" button reverts
// to "View Invoice" and they can retry.
let lastLoadedPaymentReviews = [];

const PAYMENT_METHOD_LABELS = { card: 'Card', bank_transfer: 'Bank Transfer' };

async function loadPaymentReviews() {
    const tbody = document.getElementById('paymentReviewsBody');
    if (tbody) tbody.innerHTML = '<tr class="row-static"><td colspan="7" style="text-align:center;">Loading...</td></tr>';

    try {
        const res = await fetch('/api/dashboard/shipments?paymentStatus=pending&limit=100', { headers: authHeaders() });
        const result = await res.json();
        if (result.success) renderPaymentReviews(result.data);
    } catch (err) {
        console.error('Error loading payment reviews:', err);
    }
}

function paymentReceiptPreviewHtml(receipt) {
    if (!receipt?.data) return '—';
    return receipt.contentType?.startsWith('image/')
        ? `<a href="${receipt.data}" download="${receipt.filename || 'receipt'}"><img src="${receipt.data}" alt="Payment receipt" style="max-width:56px; max-height:56px; border-radius:4px; display:block;"></a>`
        : `<a href="${receipt.data}" download="${receipt.filename || 'receipt.pdf'}"><i class="fas fa-file-pdf"></i> Download</a>`;
}

function renderPaymentReviews(shipments) {
    lastLoadedPaymentReviews = shipments;
    const tbody = document.getElementById('paymentReviewsBody');
    if (!tbody) return;

    tbody.innerHTML = !shipments.length
        ? '<tr class="row-static"><td colspan="7" style="text-align:center;">No payments awaiting review</td></tr>'
        : shipments.map(s => {
            const billing = getShipmentBilling(s);
            const balanceCell = billing.amountPaid > 0
                ? `${money(billing.balanceDue)} <span style="color: var(--gray); font-size: 0.8em;">(of ${money(billing.totalOwed)}, ${money(billing.amountPaid)} already paid)</span>`
                : money(billing.balanceDue);
            return `
        <tr>
            <td data-label="Tracking #"><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td data-label="Customer">${s.userId?.name || s.sender?.name || 'N/A'}</td>
            <td data-label="Balance Due">${balanceCell}</td>
            <td data-label="Method">${PAYMENT_METHOD_LABELS[s.paymentReceipt?.method] || 'N/A'}</td>
            <td data-label="Receipt">${paymentReceiptPreviewHtml(s.paymentReceipt)}</td>
            <td data-label="Submitted">${s.paymentReceipt?.submittedAt ? new Date(s.paymentReceipt.submittedAt).toLocaleString() : 'N/A'}</td>
            <td data-label="Actions">
                <div class="pending-approval-actions">
                    <button class="btn-approve" onclick="confirmPaymentReceipt('${s._id}')">Confirm</button>
                    <button class="btn-reject" onclick="rejectPaymentReceipt('${s._id}')">Reject</button>
                </div>
            </td>
        </tr>
    `;
        }).join('');
}

window.confirmPaymentReceipt = async function(id) {
    const s = lastLoadedPaymentReviews.find(x => x._id === id);
    const balanceDue = s ? getShipmentBilling(s).balanceDue : 0;

    const input = prompt(
        `Amount received for shipment ${s?.trackingNumber || id}?\nBalance due: ${money(balanceDue)}\n\nEnter the full balance to close out the invoice, or a smaller amount to record a partial payment.`,
        balanceDue.toFixed(2)
    );
    if (input === null) return;

    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
        alert('Enter a valid amount greater than zero.');
        return;
    }
    // Mirrors the backend check so the admin gets instant feedback, but the
    // server re-validates -- it's the one place that can't be trusted to
    // skip, since it's what actually prevents overcharging a customer.
    if (amount > balanceDue + 0.001) {
        alert(`That's more than the remaining balance of ${money(balanceDue)}.`);
        return;
    }

    try {
        const res = await fetch(`/api/dashboard/shipments/${id}/receipt/confirm`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ amount })
        });
        const result = await res.json();
        if (result.success) {
            loadPaymentReviews();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error confirming payment: ' + error.message);
    }
};

window.rejectPaymentReceipt = async function(id) {
    const s = lastLoadedPaymentReviews.find(x => x._id === id);
    const reason = prompt(`Reason for rejecting the payment for shipment ${s?.trackingNumber || id}:`);
    if (reason === null) return;
    if (!reason.trim()) {
        alert('A reason is required.');
        return;
    }

    try {
        const res = await fetch(`/api/dashboard/shipments/${id}/receipt/reject`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ reason: reason.trim() })
        });
        const result = await res.json();
        if (result.success) {
            loadPaymentReviews();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error rejecting payment: ' + error.message);
    }
};

// =============================================
// SHIPMENT MANAGEMENT
// =============================================
function openShipmentModal() {
    const select = document.getElementById('shipmentUserId');
    select.innerHTML = '<option value="">-- Select a user --</option>';
    lastLoadedUsers.forEach(user => {
        select.innerHTML += `<option value="${user._id}">${user.name} (${user.email})</option>`;
    });
    document.getElementById('shipmentModal').classList.add('active');
}

document.getElementById('addShipmentBtn')?.addEventListener('click', openShipmentModal);
document.getElementById('addShipmentBtnTab')?.addEventListener('click', openShipmentModal);

document.getElementById('closeShipmentModal')?.addEventListener('click', () => {
    document.getElementById('shipmentModal').classList.remove('active');
    document.getElementById('shipmentForm').reset();
});

// Clicking the dimmed backdrop closes whichever modal is open
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

document.getElementById('shipmentForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const userId = document.getElementById('shipmentUserId').value;
    if (!userId) {
        alert('Please select a user.');
        return;
    }

    const [city, country] = document.getElementById('destination').value.split(',').map(s => s.trim());

    const shipmentData = {
        trackingNumber: document.getElementById('trackingNumber').value,
        status: document.getElementById('shipmentStatus').value,
        userId: userId,
        recipient: {
            name: document.getElementById('customerName').value,
            city: city || '',
            country: country || 'USA'
        },
        currentLocation: {
            city: 'Processing Center',
            facility: 'Main Hub'
        }
    };

    try {
        const res = await fetch('/api/dashboard/shipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(shipmentData)
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('shipmentModal').classList.remove('active');
            this.reset();
            loadAllShipments();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error creating shipment: ' + error.message);
    }
});

window.updateShipmentStatus = async function(id) {
    const validStatuses = ['pending', 'processing', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delayed'];
    const newStatus = prompt('Enter new status:\nValid options: pending, processing, picked_up, in_transit, out_for_delivery, delivered, delayed');

    if (!newStatus) return;
    const formattedStatus = newStatus.toLowerCase().trim().replace(/\s+/g, '_');

    if (!validStatuses.includes(formattedStatus)) {
        alert(`Invalid status. Please use one of:\n${validStatuses.join(', ')}`);
        return;
    }

    const location = prompt('Enter current location (optional):');

    try {
        const res = await fetch(`/api/dashboard/shipments/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ status: formattedStatus, location: location })
        });

        const result = await res.json();
        if (result.success) {
            loadAllShipments();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
};

window.deleteShipment = async function(id) {
    if (!confirm('Delete this shipment?')) return;
    try {
        const res = await fetch(`/api/dashboard/shipments/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        const result = await res.json();
        if (result.success) {
            loadAllShipments();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Error: ' + error.message);
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

function openInvoiceOrReceipt(s) {
    const isInvoice = isAwaitingConfirmation(s.status);
    const billing = getShipmentBilling(s);
    const hasBalance = billing.balanceDue > 0.001;
    // Demurrage/storage can accrue after a shipment's original invoice was
    // already paid off and approved -- so "still owes something" (hasBalance),
    // not just "hasn't been approved yet" (isInvoice), is what actually
    // decides whether this document is an invoice or a settled receipt.
    const isDocInvoice = isInvoice || hasBalance;
    const isPartiallyPaid = billing.amountPaid > 0 && hasBalance;

    document.getElementById('invoiceModalTitle').textContent = isDocInvoice ? 'Invoice' : 'Receipt';
    document.getElementById('invoiceDocType').textContent = isDocInvoice ? 'INVOICE' : 'RECEIPT';

    const stamp = document.getElementById('invoiceStatusStamp');
    stamp.textContent = !hasBalance ? 'Paid' : (isPartiallyPaid ? 'Partially Paid' : 'Unpaid');
    stamp.className = 'invoice-doc-stamp ' + (!hasBalance ? 'paid' : (isPartiallyPaid ? 'partial' : 'unpaid'));

    document.getElementById('invoiceDocNumber').textContent = `${isDocInvoice ? 'INV' : 'RCT'}-${s.trackingNumber}`;
    document.getElementById('invoiceDocDate').textContent = s.createdAt
        ? new Date(s.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'N/A';

    document.getElementById('invoiceBillTo').innerHTML = `
        <strong>${s.sender?.name || s.userId?.name || 'N/A'}</strong><br>
        ${s.contactEmail || s.sender?.email || s.userId?.email || ''}
    `;
    document.getElementById('invoiceShipmentSummary').innerHTML = `
        Tracking: <strong>${s.trackingNumber}</strong><br>
        ${[s.sender?.country, s.recipient?.country].filter(Boolean).join(' &rarr; ') || 'N/A'}<br>
        ${s.serviceType ? s.serviceType.charAt(0).toUpperCase() + s.serviceType.slice(1) : 'Standard'} Service &middot; ${s.package?.weight || 'N/A'} kg<br>
        Contents: ${describePackageContents(s.package)}
    `;

    document.getElementById('invoiceLineItems').innerHTML = buildInvoiceLineItemsHtml(s);
    document.getElementById('invoiceTotal').textContent = money(billing.totalOwed);

    const paidRow = document.getElementById('invoiceAmountPaidRow');
    const dueRow = document.getElementById('invoiceBalanceDueRow');
    if (isPartiallyPaid) {
        paidRow.style.display = '';
        dueRow.style.display = '';
        document.getElementById('invoiceAmountPaid').textContent = '-' + money(billing.amountPaid);
        document.getElementById('invoiceBalanceDue').textContent = money(billing.balanceDue);
    } else {
        paidRow.style.display = 'none';
        dueRow.style.display = 'none';
    }

    document.getElementById('invoiceFooterNote').textContent = !hasBalance
        ? 'This receipt confirms payment has been received and processed for the shipment described above.'
        : isPartiallyPaid
            ? `A partial payment of ${money(billing.amountPaid)} has been confirmed. The remaining balance of ${money(billing.balanceDue)} is still due${isInvoice ? ' before this shipment moves into processing' : ''}.`
            : isInvoice
                ? 'This is an invoice, not a receipt. Once this shipment request is approved, this same document becomes a downloadable receipt.'
                : 'Additional fees have accrued on this shipment since it was approved. The customer still owes the balance below.';

    document.getElementById('invoiceVerificationCode').textContent = s.verificationCode || 'N/A';

    document.getElementById('invoiceReceiptModal').classList.add('active');
}

document.getElementById('closeInvoiceModal')?.addEventListener('click', () => {
    document.getElementById('invoiceReceiptModal').classList.remove('active');
});

document.getElementById('printInvoiceBtn')?.addEventListener('click', () => window.print());

// =============================================
// SUPPORT TICKETS
// =============================================
// Backed by TicketStore (frontend/js/tickets-store.js), which persists to
// localStorage until a real backend endpoint exists for this.
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

let ticketFilter = 'open';
let currentTicketId = null;

function loadSupportTickets() {
    const tbody = document.getElementById('adminTicketsBody');
    if (!tbody || !window.TicketStore) return;

    const all = TicketStore.getAll();
    const tickets = ticketFilter === 'all' ? all : all.filter(t => t.status === ticketFilter);

    tbody.innerHTML = !tickets.length
        ? `<tr class="row-static"><td colspan="7" style="text-align:center;">No ${ticketFilter === 'all' ? '' : ticketFilter + ' '}tickets found</td></tr>`
        : tickets.map(t => `
            <tr onclick="viewTicketDetail('${t.id}')">
                <td data-label="Ticket #"><strong>${t.id}</strong></td>
                <td data-label="User">${escapeHtml(t.userName)}<br><span style="color: var(--gray); font-size: 0.8em;">${escapeHtml(t.userEmail)}</span></td>
                <td data-label="Issue">${escapeHtml(t.issueType)}</td>
                <td data-label="Subject">${escapeHtml(t.subject)}</td>
                <td data-label="Status"><span class="status-badge status-${t.status}">${t.status.toUpperCase()}</span></td>
                <td data-label="Created">${new Date(t.createdAt).toLocaleDateString()}</td>
                <td data-label="Actions">
                    ${t.status === 'open'
                        ? `<button class="action-btn" onclick="event.stopPropagation(); viewTicketDetail('${t.id}')" title="Resolve"><i class="fas fa-check"></i></button>`
                        : `<button class="action-btn" onclick="event.stopPropagation(); reopenTicket('${t.id}')" title="Reopen"><i class="fas fa-undo"></i></button>`}
                </td>
            </tr>
        `).join('');
}

document.getElementById('ticketFilterTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    ticketFilter = btn.getAttribute('data-filter');
    document.querySelectorAll('#ticketFilterTabs .filter-tab').forEach(b => b.classList.toggle('active', b === btn));
    loadSupportTickets();
});

window.viewTicketDetail = function(id) {
    const ticket = TicketStore.getById(id);
    if (!ticket) return;
    currentTicketId = id;

    document.getElementById('ticketDetailId').textContent = ticket.id;
    const statusEl = document.getElementById('ticketDetailStatus');
    statusEl.textContent = ticket.status.toUpperCase();
    statusEl.className = 'status-badge status-' + ticket.status;

    document.getElementById('ticketDetailSubject').textContent = ticket.subject;
    document.getElementById('ticketDetailUser').textContent = `${ticket.userName} (${ticket.userEmail})`;
    document.getElementById('ticketDetailIssueType').textContent = ticket.issueType;
    document.getElementById('ticketDetailMessage').textContent = ticket.message;
    document.getElementById('ticketDetailCreated').textContent = new Date(ticket.createdAt).toLocaleString();

    const closedRow = document.getElementById('ticketDetailClosedRow');
    const resolveSection = document.getElementById('ticketDetailResolveSection');
    const resolutionBox = document.getElementById('ticketDetailResolutionBox');
    const reopenBtn = document.getElementById('reopenTicketBtn');

    if (ticket.status === 'open') {
        closedRow.style.display = 'none';
        resolveSection.style.display = '';
        resolutionBox.style.display = 'none';
        reopenBtn.style.display = 'none';
        document.getElementById('ticketResolutionInput').value = '';
    } else {
        closedRow.style.display = '';
        document.getElementById('ticketDetailClosed').textContent = new Date(ticket.closedAt).toLocaleString();
        resolveSection.style.display = 'none';
        resolutionBox.style.display = '';
        document.getElementById('ticketDetailResolutionNote').textContent = ticket.resolutionNote || '';
        reopenBtn.style.display = '';
    }

    document.getElementById('ticketDetailModal').classList.add('active');
};

document.getElementById('closeTicketDetailModal')?.addEventListener('click', () => {
    document.getElementById('ticketDetailModal').classList.remove('active');
});

document.getElementById('closeTicketBtn')?.addEventListener('click', () => {
    if (!currentTicketId) return;
    const note = document.getElementById('ticketResolutionInput').value.trim();
    if (!note) {
        alert('Please add a resolution note before closing this ticket.');
        return;
    }
    TicketStore.resolve(currentTicketId, note);
    document.getElementById('ticketDetailModal').classList.remove('active');
    loadSupportTickets();
});

window.reopenTicket = function(id) {
    TicketStore.reopen(id);
    loadSupportTickets();
};

document.getElementById('reopenTicketBtn')?.addEventListener('click', () => {
    if (!currentTicketId) return;
    TicketStore.reopen(currentTicketId);
    document.getElementById('ticketDetailModal').classList.remove('active');
    loadSupportTickets();
});

// =============================================
// SUPPORT CHAT (backed by /api/chat -- real two-way chat with customers)
// =============================================
let chatConversations = [];
let activeChatUserId = null;
let chatThreadPollTimer = null;
// Bumped on every conversations/thread fetch and every clear -- a response
// only gets painted if it's still the most recently requested one. Without
// this, a slow poll response (the 4s thread poll or 15s sidebar poll) can
// land *after* a Clear Chat call finishes and silently repaint the old
// messages back onto the screen, making the clear look like it didn't work.
let chatConversationsRequestId = 0;
let chatThreadRequestId = 0;

function chatTimeAgo(dateStr) {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

async function loadChatConversations() {
    const requestId = ++chatConversationsRequestId;
    try {
        const res = await fetch('/api/chat/conversations', { headers: authHeaders() });
        const result = await res.json();
        if (requestId !== chatConversationsRequestId) return; // superseded by a newer request
        if (!result.success) return;
        chatConversations = result.data;
        renderChatConversations();
        updateChatSidebarBadge();
    } catch (err) {
        console.error('Error loading conversations:', err);
    }
}

function renderChatConversations() {
    const list = document.getElementById('chatConversationsList');
    if (!list) return;

    if (!chatConversations.length) {
        list.innerHTML = `
            <div class="chat-empty-state">
                <i class="fas fa-comments"></i>
                <strong>No conversations yet</strong>
                <span>New messages from customers will show up here.</span>
            </div>`;
        return;
    }

    list.innerHTML = chatConversations.map(c => `
        <div class="chat-conversation-item ${String(c.userId) === String(activeChatUserId) ? 'active' : ''}" onclick="openChatThread('${c.userId}')">
            <div class="chat-conversation-top">
                <strong>${escapeHtml(c.userName)}</strong>
                <span class="chat-conversation-time">${chatTimeAgo(c.lastAt)}</span>
            </div>
            <div class="chat-conversation-preview">${c.lastAutomated ? 'Auto-reply: ' : (c.lastSenderRole === 'admin' ? 'You: ' : '')}${escapeHtml(c.lastMessage)}</div>
            ${c.unreadCount > 0 ? `<span class="chat-conversation-badge">${c.unreadCount}</span>` : ''}
        </div>
    `).join('');
}

function updateChatSidebarBadge() {
    const badge = document.getElementById('chatUnreadBadge');
    if (!badge) return;
    const total = chatConversations.reduce((sum, c) => sum + c.unreadCount, 0);
    badge.textContent = total > 9 ? '9+' : String(total);
    badge.style.display = total > 0 ? 'flex' : 'none';
}

window.openChatThread = async function(userId) {
    activeChatUserId = userId;
    renderChatConversations();

    const convo = chatConversations.find(c => String(c.userId) === String(userId));
    const headerInfo = document.getElementById('chatThreadHeaderInfo');
    const input = document.getElementById('chatThreadInput');
    const sendBtn = document.querySelector('#chatThreadForm button');
    const clearBtn = document.getElementById('clearChatBtn');

    headerInfo.innerHTML = convo
        ? `<strong>${escapeHtml(convo.userName)}</strong><span>${escapeHtml(convo.userEmail)}</span>`
        : '<span>Conversation</span>';
    input.disabled = false;
    sendBtn.disabled = false;
    if (clearBtn) clearBtn.style.display = '';

    await loadChatThread(userId);

    // Polls while a thread is open so a customer's follow-up message shows
    // up without the admin having to click away and back.
    clearInterval(chatThreadPollTimer);
    chatThreadPollTimer = setInterval(() => loadChatThread(userId), 4000);
};

async function loadChatThread(userId) {
    const messages = document.getElementById('chatThreadMessages');
    if (!messages) return;
    const requestId = ++chatThreadRequestId;
    try {
        const res = await fetch(`/api/chat/conversations/${userId}`, { headers: authHeaders() });
        const result = await res.json();
        if (requestId !== chatThreadRequestId) return; // superseded by a newer request (switched threads, or the thread was cleared)
        if (!result.success) return;

        messages.innerHTML = result.data.length
            ? result.data.map(m => `
                <div class="chat-thread-msg ${m.senderRole === 'admin' ? 'from-admin' : 'from-user'}${m.automated ? ' automated' : ''}">
                    <div class="chat-thread-bubble">${escapeHtml(m.message)}</div>
                    <span class="chat-thread-msg-time">${m.automated ? 'Automated reply · ' : ''}${new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
            `).join('')
            : `<div class="chat-empty-state">
                <i class="fas fa-comment-dots"></i>
                <strong>No messages yet</strong>
                <span>Nothing here yet -- a reply from you will start the conversation.</span>
            </div>`;
        messages.scrollTop = messages.scrollHeight;

        // Viewing the thread just cleared its unread count server-side --
        // refresh the list so the sidebar badge total stays in sync.
        loadChatConversations();
    } catch (err) {
        console.error('Error loading chat thread:', err);
    }
}

document.getElementById('chatThreadForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeChatUserId) return;
    const input = document.getElementById('chatThreadInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    try {
        const res = await fetch(`/api/chat/conversations/${activeChatUserId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ message: text })
        });
        const result = await res.json();
        if (result.success) await loadChatThread(activeChatUserId);
    } catch (err) {
        console.error('Error sending chat reply:', err);
    }
});

document.getElementById('clearChatBtn')?.addEventListener('click', async () => {
    if (!activeChatUserId) return;
    const convo = chatConversations.find(c => String(c.userId) === String(activeChatUserId));
    const name = convo ? convo.userName : 'this customer';
    if (!confirm(`Permanently clear the entire conversation with ${name}? This cannot be undone.`)) return;

    try {
        const res = await fetch(`/api/chat/conversations/${activeChatUserId}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        const result = await res.json();
        if (!result.success) {
            alert(result.message || 'Could not clear this conversation. Please try again.');
            return;
        }

        // Invalidate any in-flight thread poll for this conversation so a
        // slow response that lands after this point can't repaint the
        // just-cleared messages back onto the screen.
        chatThreadRequestId++;
        clearInterval(chatThreadPollTimer);

        // The conversation has no messages left, so it drops out of the list
        // entirely (see GET /conversations) -- reset the thread panel to the
        // empty state rather than showing a thread for a user who's no longer listed.
        activeChatUserId = null;
        document.getElementById('chatThreadHeaderInfo').innerHTML = '<span>No conversation selected</span>';
        document.getElementById('chatThreadMessages').innerHTML = `
            <div class="chat-empty-state">
                <i class="fas fa-comment-dots"></i>
                <strong>Select a conversation</strong>
                <span>Choose a customer from the list on the left to view and reply to their messages.</span>
            </div>`;
        document.getElementById('chatThreadInput').disabled = true;
        document.querySelector('#chatThreadForm button').disabled = true;
        document.getElementById('clearChatBtn').style.display = 'none';

        loadChatConversations();
    } catch (err) {
        console.error('Error clearing chat:', err);
        alert('Could not clear this conversation -- check your connection and try again.');
    }
});

// Keeps the sidebar badge (and the conversation list, if that tab happens to
// be open) fresh even while the admin is working elsewhere in the panel.
setInterval(loadChatConversations, 15000);

// =============================================
// SEND NOTIFICATION (manual, admin-only -- consuming the bell/dropdown
// itself is handled by the shared js/notifications.js widget)
// =============================================
// Reuses lastLoadedUsers (populated by loadAllUsers(), already called once
// on initial page load) rather than firing a second request just for this
// dropdown -- refreshed here in case a user was added/removed since.
function populateNotifyUserSelect() {
    const select = document.getElementById('notifyTargetUser');
    if (!select) return;

    if (!lastLoadedUsers.length) loadAllUsers().then(renderNotifyUserOptions);
    else renderNotifyUserOptions();

    function renderNotifyUserOptions() {
        const current = select.value;
        select.innerHTML = '<option value="">-- Select a user --</option>' +
            lastLoadedUsers.map(u => `<option value="${u._id}">${escapeHtml(u.name || u.email)} (${escapeHtml(u.email)})</option>`).join('');
        select.value = current;
    }
}

document.getElementById('notifyTargetType')?.addEventListener('change', (e) => {
    const isAll = e.target.value === 'all';
    const userGroup = document.getElementById('notifyUserGroup');
    const userSelect = document.getElementById('notifyTargetUser');
    userGroup.style.display = isAll ? 'none' : 'block';
    userSelect.required = !isAll;
});

document.getElementById('sendNotificationForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const successEl = document.getElementById('notifyFormSuccess');
    const errorEl = document.getElementById('notifyFormError');
    successEl.style.display = 'none';
    errorEl.style.display = 'none';

    const target = document.getElementById('notifyTargetType').value;
    const payload = {
        target,
        userId: document.getElementById('notifyTargetUser').value,
        title: document.getElementById('notifyTitle').value.trim(),
        message: document.getElementById('notifyMessage').value.trim(),
        link: document.getElementById('notifyLink').value.trim()
    };

    if (target === 'all' && !confirm('Send this notification to every user? This cannot be undone.')) {
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
        const res = await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            successEl.textContent = result.message || 'Notification sent.';
            successEl.style.display = 'block';
            e.target.reset();
            document.getElementById('notifyUserGroup').style.display = 'block';
        } else {
            errorEl.textContent = result.message || 'Could not send notification. Please try again.';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        console.error('Error sending notification:', err);
        errorEl.textContent = 'Could not reach the server. Please try again.';
        errorEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
    }
});

// =============================================
// FEE SETTINGS (demurrage / storage) -- one form per fee type, both driven
// by the same GET/PATCH pair since they're just two independent rate slots
// on the same settings document (see backend/models/FeeSettings.js). This
// rate is the only thing uniform platform-wide; which shipments actually
// get charged it is targeted per-shipment from the Shipment Details modal
// (see renderShipmentFeesSection / saveShipmentFeesBtn below).
// =============================================
const FEE_FORM_CONFIG = {
    demurrage: { rateId: 'demurrageRate', successId: 'demurrageFeeSuccess', errorId: 'demurrageFeeError' },
    storage: { rateId: 'storageRate', successId: 'storageFeeSuccess', errorId: 'storageFeeError' }
};

async function loadFeeSettings() {
    try {
        const res = await fetch('/api/dashboard/fee-settings', { headers: authHeaders() });
        const result = await res.json();
        if (!result.success) return;

        Object.entries(FEE_FORM_CONFIG).forEach(([type, ids]) => {
            const feeState = result.data[type] || {};
            document.getElementById(ids.rateId).value = feeState.ratePerDay || '';
        });
    } catch (err) {
        console.error('Error loading fee settings:', err);
    }
}

function setupFeeSettingsForm(type) {
    const { rateId, successId, errorId } = FEE_FORM_CONFIG[type];
    const form = document.getElementById(`${type}FeeForm`);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const successEl = document.getElementById(successId);
        const errorEl = document.getElementById(errorId);
        successEl.style.display = 'none';
        errorEl.style.display = 'none';

        const payload = {
            ratePerDay: Number(document.getElementById(rateId).value) || 0
        };

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const res = await fetch(`/api/dashboard/fee-settings/${type}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload)
            });
            const result = await res.json();

            if (result.success) {
                successEl.textContent = 'Settings saved.';
                successEl.style.display = 'block';
            } else {
                errorEl.textContent = result.message || 'Could not save settings. Please try again.';
                errorEl.style.display = 'block';
            }
        } catch (err) {
            console.error(`Error saving ${type} fee settings:`, err);
            errorEl.textContent = 'Could not reach the server. Please try again.';
            errorEl.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
        }
    });
}

setupFeeSettingsForm('demurrage');
setupFeeSettingsForm('storage');
