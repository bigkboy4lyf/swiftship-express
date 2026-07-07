// =============================================
// DASHBOARD UI - CONNECTED TO BACKEND
// =============================================

// =============================================
// STATUS DISPLAY LABELS
// =============================================
// The database status codes (pending_approval, in_transit, etc.) are stable
// identifiers used in queries and business logic -- they're not meant to be
// shown to the user as-is. This is the single place that controls what's
// actually displayed on a status badge.
//
// Customers and admins see DIFFERENT wording for the same underlying status.
// An admin needs to know a shipment is sitting there waiting on a decision --
// that's actionable information for them. A customer should never see any
// hint that a human has to sign off on their order; to them it should just
// look like the normal first step of the pipeline. Same status code, two
// audiences, two labels.
const ADMIN_STATUS_LABELS = {
    pending_approval: 'Awaiting Confirmation',
    pending: 'Pending',
    processing: 'Processing',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out For Delivery',
    delivered: 'Delivered',
    delayed: 'Delayed',
    rejected: 'Rejected'
};

const CUSTOMER_STATUS_LABELS = {
    ...ADMIN_STATUS_LABELS
};

function getStatusLabel(status, audience = 'admin') {
    const map = audience === 'customer' ? CUSTOMER_STATUS_LABELS : ADMIN_STATUS_LABELS;
    if (map[status]) return map[status];
    // Fallback for any status not in the map above, so nothing ever renders blank
    return (status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (!token || !user) {
        window.location.href = 'account.html';
        return;
    }

    // Set Profile Info
    document.getElementById('userDisplayName').textContent = user.name || 'User';
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrator' : 'Customer';
    applyAvatar(user.name, user.avatar);
    window.currentAvatarDataUrl = user.avatar || '';

    // Show/hide admin menu based on role
    const adminMenus = document.querySelectorAll('.admin-menu');
    const adminTabBtn = document.getElementById('adminTabBtn');
    if (user.role === 'admin') {
        adminMenus.forEach(menu => menu.style.display = 'flex');
        if (adminTabBtn) adminTabBtn.style.display = 'block';
    } else {
        adminMenus.forEach(menu => menu.style.display = 'none');
        if (adminTabBtn) adminTabBtn.style.display = 'none';
    }

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
function setupTabSwitching() {
    const menuItems = document.querySelectorAll('.sidebar-menu-item');
    const contentSections = {
        'user-dashboard': document.getElementById('userDashboard'),
        'user-shipments': document.getElementById('userShipments'),
        'user-tracking': document.getElementById('userTracking'),
        'user-quote': document.getElementById('userQuote'),
        'user-addresses': document.getElementById('userAddresses'),
        'user-profile': document.getElementById('userProfile'),
        'admin-dashboard': document.getElementById('adminDashboard'),
        'admin-shipments': document.getElementById('adminShipments'),
        'admin-users': document.getElementById('adminUsers'),
        'admin-reports': document.getElementById('adminReports'),
        'admin-settings': document.getElementById('adminSettings')
    };

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Hide all main content sections
            document.querySelectorAll('.tab-pane, .dashboard-section').forEach(section => {
                if (section) section.style.display = 'none';
            });

            // Show selected section
            if (contentSections[tabId]) {
                contentSections[tabId].style.display = 'block';
                if (tabId === 'user-shipments') {
                    const usBody = document.getElementById('userShipmentsBody');
                    if (usBody) usBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading your shipments...</td></tr>';
                    loadUserShipments();
                }
                if (tabId === 'admin-shipments') {
                    const asBody = document.getElementById('allShipmentsBody');
                    if (asBody) asBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading shipments...</td></tr>';
                    loadAllShipments();
                }
                if (tabId === 'admin-users') {
                    const auBody = document.getElementById('usersBody');
                    if (auBody) auBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading users...</td></tr>';
                    loadAllUsers();
                }
                if (tabId === 'user-profile') setTimeout(loadProfileData, 100);
                if (tabId === 'user-addresses') {
                    fetchAddresses(); // Injected hook to automatically load database entries
                    document.getElementById('add-address-form').addEventListener('submit', handleAddAddress);
                }
            }
        });
    });

    // User/Admin toggle tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const role = this.dataset.role;
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            if (role === 'user') {
                document.getElementById('userDashboard').classList.add('active');
            } else {
                document.getElementById('adminDashboard').classList.add('active');
            }
        });
    });
}

// =============================================
// DATA LOADING
// =============================================
async function loadDashboardData(token, user) {
    // Every call here is an independent GET that renders into its own part of
    // the page -- none of them depend on another one finishing first. Awaiting
    // them one at a time (as this used to) means the total wait is the SUM of
    // every round trip; running them together means it's roughly the slowest
    // single one. This is the main fix for "the dashboard takes forever to load."
    const calls = [
        loadDashboardStats(token),
        loadRecentShipments(token, user)
    ];

    // Admins land on the Admin Dashboard overview, which has its own
    // "Recent Shipments - All Users" and "User Management" tables.
    // Load them up front so the overview isn't empty until you happen
    // to visit the All Shipments / Users tabs first.
    if (user.role === 'admin') {
        calls.push(loadAllShipments(), loadAllUsers(), loadPendingApprovals());
    }

    await Promise.all(calls);
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
            setElementText('totalUsers', stats.totalUsers || 0);
            setElementText('totalShipmentsAdmin', stats.totalShipmentsOrg || 0);
            setElementText('activeShipments', stats.activeShipments || 0);
            const revenueEl = document.getElementById('revenue');
            if (revenueEl) {
                revenueEl.textContent = `$${(stats.revenue || 45289).toLocaleString()}`;
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

async function loadRecentShipments(token, user) {
    try {
        // This feeds the customer-side "Recent Shipments" widget, so it's always
        // scoped to the logged-in user's own shipments -- admins included, since
        // an admin can also hold shipments as a customer.
        const url = `/api/dashboard/shipments?limit=5&userId=${user.id}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await res.json();
        if (result.success) renderRecentShipments(result.data);
    } catch (err) {
        console.error('Error loading recent shipments:', err);
    }
}

function renderRecentShipments(shipments) {
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
            <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status, 'customer').toUpperCase()}</span></td>
            <td><button class="action-btn" onclick="viewShipment('${s.trackingNumber}')" title="Track"><i class="fas fa-search"></i></button></td>
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
        // "My Shipments" is the customer-side view -- always the logged-in user's
        // own shipments, admin or not.
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
    const tbody = document.getElementById('userShipmentsBody');
    if (!tbody) return;
    if (!shipments.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No shipments found</td></tr>';
        return;
    }
    // Column order matches the #userShipments table headers: Tracking #, Destination, Status, Date, Action
    tbody.innerHTML = shipments.map(s => `
        <tr>
            <td><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td>${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status, 'customer').toUpperCase()}</span></td>
            <td>${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td><button class="action-btn" onclick="viewShipment('${s.trackingNumber}')" title="Track"><i class="fas fa-search"></i></button></td>
        </tr>
    `).join('');
}

async function loadAllShipments() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/dashboard/shipments?limit=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) renderAllShipments(result.data);
    } catch (err) {
        console.error('Error loading all shipments:', err);
    }
}

function renderAllShipments(shipments) {
    // Two tables show this same data: the overview-pane preview (allShipmentsBody)
    // and the dedicated "Shipments" sidebar tab (adminShipmentsBody). Keep both in sync.
    const tbodies = ['allShipmentsBody', 'adminShipmentsBody']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    if (!tbodies.length) return;

    const html = !shipments.length
        ? '<tr><td colspan="5" style="text-align:center;">No shipments found</td></tr>'
        : shipments.map(s => `
        <tr>
            <td><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td>${s.userId?.name || 'N/A'}</td>
            <td>${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status, 'admin').toUpperCase()}</span></td>
            <td>
                <button class="action-btn" onclick="editShipment('${s._id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="action-btn" onclick="updateShipmentStatus('${s._id}')" title="Update Status"><i class="fas fa-truck"></i></button>
                <button class="action-btn delete" onclick="deleteShipment('${s._id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    tbodies.forEach(tbody => tbody.innerHTML = html);
}

// =============================================
// PENDING APPROVALS (Admin only)
// =============================================
async function loadPendingApprovals() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/dashboard/shipments?status=pending_approval&limit=100', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) renderPendingApprovals(result.data);
    } catch (err) {
        console.error('Error loading pending approvals:', err);
    }
}

function renderPendingApprovals(shipments) {
    const container = document.getElementById('pendingApprovalsContainer');
    const countEl = document.getElementById('pendingCount');
    if (countEl) countEl.textContent = shipments.length;
    if (!container) return;

    if (!shipments.length) {
        container.innerHTML = '<p style="color:#888; padding: 12px 0; margin: 0;">No shipments awaiting approval.</p>';
        return;
    }

    container.innerHTML = shipments.map(s => `
        <div class="pending-approval-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #eee;">
            <div>
                <strong>${s.trackingNumber || 'N/A'}</strong>
                <span style="color:#666;"> — ${s.userId?.name || 'Unknown customer'}</span><br>
                <small style="color:#999;">${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''} · Requested ${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</small>
            </div>
            <div style="display:flex; gap:8px; flex-shrink:0;">
                <button class="btn" style="background:#2e7d32; color:#fff; border:none; padding:6px 14px; border-radius:4px; cursor:pointer;" onclick="approveShipment('${s._id}')">Approve</button>
                <button class="btn" style="background:#d32f2f; color:#fff; border:none; padding:6px 14px; border-radius:4px; cursor:pointer;" onclick="rejectShipment('${s._id}')">Reject</button>
            </div>
        </div>
    `).join('');
}

async function approveShipment(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/dashboard/shipments/${id}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Could not approve shipment');

        // Approval changes the shipment's status (now counts as active) and
        // removes it from the pending list, so refresh everything it touches
        // -- these three are independent, run them together.
        await Promise.all([loadPendingApprovals(), loadDashboardStats(token), loadAllShipments()]);
    } catch (err) {
        alert('❌ ' + err.message);
    }
}

async function rejectShipment(id) {
    if (!confirm('Reject this shipment request? It will be permanently deleted and cannot be undone.')) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`/api/dashboard/shipments/${id}/reject`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Could not reject shipment');

        await Promise.all([loadPendingApprovals(), loadDashboardStats(token), loadAllShipments()]);
    } catch (err) {
        alert('❌ ' + err.message);
    }
}

async function loadAllUsers() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/dashboard/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) {
            lastLoadedUsers = result.data;
            renderUsers(result.data);
        }
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

// Populated by loadAllUsers(); lets editUser()/toggleUserStatus() find a
// record by id without firing off another network request.
let lastLoadedUsers = [];

function renderUsers(users) {
    // Two tables show this same data: the overview-pane preview (usersBody)
    // and the dedicated "Users" sidebar tab (adminUsersBody). Keep both in sync.
    const tbodies = ['usersBody', 'adminUsersBody']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    if (!tbodies.length) return;

    const loggedInUser = JSON.parse(localStorage.getItem('user') || '{}');

    const html = !users.length
        ? '<tr><td colspan="5" style="text-align:center;">No users found</td></tr>'
        : users.map(u => {
            const isSelf = u._id === loggedInUser.id || u._id === loggedInUser._id;
            const isActive = (u.status || 'active') === 'active';
            return `
        <tr>
            <td>${u.name || 'N/A'}</td>
            <td>${u.email || 'N/A'}</td>
            <td>${u.role === 'admin' ? 'Administrator' : 'Customer'}</td>
            <td><span class="status-badge ${isActive ? 'status-delivered' : 'status-pending'}">${(u.status || 'active').toUpperCase()}</span></td>
            <td>
                <button class="action-btn" onclick="editUser('${u._id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="action-btn" onclick="toggleUserStatus('${u._id}')" title="${isActive ? 'Deactivate' : 'Activate'}" ${isSelf ? 'disabled' : ''}>
                    <i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i>
                </button>
                <button class="action-btn delete" onclick="deleteUser('${u._id}')" title="Delete" ${isSelf ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `;
        }).join('');

    tbodies.forEach(tbody => tbody.innerHTML = html);
}

// =============================================
// PROFILE FUNCTIONS
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

        // Keep localStorage's copy of the user in sync with the server
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...storedUser, ...user, id: user._id }));

        const nameEl = document.getElementById('profileNameDisplay');
        nameEl.textContent = user.name || 'Unnamed User';
        nameEl.classList.remove('loading');

        const emailEl = document.getElementById('profileEmailDisplay');
        emailEl.textContent = user.email || '—';
        emailEl.classList.remove('loading');

        const phoneEl = document.getElementById('profilePhoneDisplay');
        phoneEl.textContent = user.phone || 'Not set';
        phoneEl.classList.remove('loading');

        const accountTypeLabel = user.accountType
            ? user.accountType.charAt(0).toUpperCase() + user.accountType.slice(1)
            : 'Personal';
        const accountTypeDisplayEl = document.getElementById('profileAccountTypeDisplay');
        accountTypeDisplayEl.textContent = accountTypeLabel;
        accountTypeDisplayEl.classList.remove('loading');

        const accountTypeBadgeEl = document.getElementById('profileAccountTypeBadge');
        accountTypeBadgeEl.textContent = accountTypeLabel;
        accountTypeBadgeEl.classList.remove('loading');

        const memberSinceEl = document.getElementById('profileMemberSince');
        if (memberSinceEl) {
            memberSinceEl.textContent = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : '—';
            memberSinceEl.classList.remove('loading');
        }
        document.getElementById('profileTotalShipments').textContent = document.getElementById('totalShipments')?.textContent || '0';
        document.getElementById('profileTotalShipments').classList.remove('loading');

        // Active Shipments here must reflect actual active status (approved and
        // not yet delivered), not "In Transit" -- fetch it fresh so an approval
        // that just happened shows up immediately, even without a full reload.
        try {
            const statsRes = await fetch('/api/dashboard/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const statsResult = await statsRes.json();
            if (statsResult.success) {
                const el = document.getElementById('profileActiveShipments');
                el.textContent = statsResult.data.activeShipmentsPersonal ?? 0;
                el.classList.remove('loading');
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
    errorEl.style.color = '#dc3545';
    document.getElementById('changePasswordModal').classList.add('active');
});

window.closeEditProfileModal = () => document.getElementById('editProfileModal').classList.remove('active');
window.closeChangePasswordModal = () => document.getElementById('changePasswordModal').classList.remove('active');

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

        document.getElementById('profileNameDisplay').textContent = updatedUser.name;
        document.getElementById('profilePhoneDisplay').textContent = updatedUser.phone || 'Not set';
        document.getElementById('userDisplayName').textContent = updatedUser.name;

        window.currentAvatarDataUrl = updatedUser.avatar || '';
        applyAvatar(updatedUser.name, updatedUser.avatar);

        closeEditProfileModal();
    } catch (err) {
        alert('❌ ' + err.message);
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

        errorEl.style.color = '#2e7d32';
        errorEl.textContent = '✅ Password updated successfully.';
        errorEl.style.display = 'block';
        e.target.reset();
        setTimeout(() => {
            errorEl.style.color = '#dc3545';
            errorEl.style.display = 'none';
            closeChangePasswordModal();
        }, 1200);
    } catch (err) {
        showError(err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Update Password';
    }
});

// =============================================
// ADMIN SHIPMENT MANAGEMENT
// =============================================
document.getElementById('addShipmentBtn')?.addEventListener('click', async function() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/dashboard/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) {
            let select = document.getElementById('shipmentUserId');
            if (!select) {
                const form = document.getElementById('shipmentForm');
                const trackingGroup = form.querySelector('.form-group:first-child');
                const userGroup = document.createElement('div');
                userGroup.className = 'form-group';
                userGroup.innerHTML = `
                    <label>Assign to User <span style="color:red;">*</span></label>
                    <select id="shipmentUserId" required>
                        <option value="">-- Select a user --</option>
                    </select>
                `;
                trackingGroup.insertAdjacentElement('afterend', userGroup);
                select = document.getElementById('shipmentUserId');
            }
            select.innerHTML = '<option value="">-- Select a user --</option>';
            result.data.forEach(user => {
                select.innerHTML += `<option value="${user._id}">${user.name} (${user.email})</option>`;
            });
        }
    } catch (err) {
        console.error('Error loading users:', err);
    }
    document.getElementById('shipmentModal').classList.add('active');
});

const shipmentForm = document.getElementById('shipmentForm');
if (shipmentForm) {
    const newForm = shipmentForm.cloneNode(true);
    shipmentForm.parentNode.replaceChild(newForm, shipmentForm);

    newForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const userId = document.getElementById('shipmentUserId')?.value;
        if (!userId) {
            alert('Please select a user.');
            return;
        }

        const shipmentData = {
            trackingNumber: document.getElementById('trackingNumber').value,
            status: document.getElementById('shipmentStatus').value,
            userId: userId,
            recipient: {
                name: document.getElementById('customerName').value,
                city: document.getElementById('destination').value.split(',')[0].trim(),
                country: document.getElementById('destination').value.split(',')[1]?.trim() || 'USA'
            },
            currentLocation: {
                city: 'Processing Center',
                facility: 'Main Hub'
            }
        };

        try {
            const res = await fetch('/api/dashboard/shipments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(shipmentData)
            });
            const result = await res.json();
            if (result.success) {
                alert('✅ Shipment created successfully!');
                document.getElementById('shipmentModal').classList.remove('active');
                document.getElementById('modalTitle').textContent = 'Add New Shipment';
                this.reset();
                loadAllShipments();
            } else {
                alert('❌ Error: ' + result.message);
            }
        } catch (error) {
            alert('❌ Error creating shipment: ' + error.message);
        }
    });
}

document.getElementById('closeShipmentModal')?.addEventListener('click', function() {
    document.getElementById('shipmentModal').classList.remove('active');
    document.getElementById('modalTitle').textContent = 'Add New Shipment';
});

window.addEventListener('click', function(event) {
    const modal = document.getElementById('shipmentModal');
    if (event.target === modal) {
        modal.classList.remove('active');
        document.getElementById('modalTitle').textContent = 'Add New Shipment';
    }
});

// =============================================
// SHIPMENT ACTIONS - STATUS MANAGEMENT
// =============================================
window.viewShipment = function(trackingNumber) {
    window.location.href = `tracking.html?number=${trackingNumber}`;
};

window.editShipment = function(id) {
    alert('Edit functionality – you can extend this.');
};

window.updateShipmentStatus = async function(id) {
    // 'delayed' is the status an admin sets manually when a shipment needs to
    // flag a hold-up. 'pending' is available for manual use too.
    const validStatuses = ['pending', 'processing', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delayed'];
    const newStatus = prompt('Enter new status:\nValid options: pending, processing, picked_up, in_transit, out_for_delivery, delivered, delayed');
    
    if (!newStatus) return;
    const formattedStatus = newStatus.toLowerCase().trim().replace(/\s+/g, '_');
    
    if (!validStatuses.includes(formattedStatus)) {
        alert(`❌ Invalid status. Please use one of:\n${validStatuses.join(', ')}`);
        return;
    }
    
    const location = prompt('Enter current location (optional):');
    
    try {
        const res = await fetch(`/api/dashboard/shipments/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status: formattedStatus, location: location })
        });
        
        const result = await res.json();
        if (result.success) {
            alert('✅ Status updated successfully');
            loadAllShipments();
        } else {
            alert('❌ Error: ' + result.message);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

window.deleteShipment = async function(id) {
    if (!confirm('Delete this shipment?')) return;
    try {
        const res = await fetch(`/api/dashboard/shipments/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await res.json();
        if (result.success) {
            alert('✅ Shipment deleted');
            loadAllShipments();
        } else {
            alert('❌ Error: ' + result.message);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

// =============================================
// USER MANAGEMENT MODAL (Add / Edit / Delete / Activate-Deactivate)
// =============================================
window.openUserModal = function(mode, user) {
    const form = document.getElementById('userForm');
    const passwordGroup = document.getElementById('userFormPasswordGroup');
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

window.closeUserModal = function() {
    document.getElementById('userModal').classList.remove('active');
};

document.getElementById('closeUserModal')?.addEventListener('click', window.closeUserModal);
document.getElementById('addUserBtn')?.addEventListener('click', () => window.openUserModal('add'));

window.addEventListener('click', function(event) {
    const modal = document.getElementById('userModal');
    if (event.target === modal) window.closeUserModal();
});

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
    // Only send a password if one was actually typed -- on edit, blank means
    // "leave it alone"; on add, the field is required so it's always present.
    if (password) userData.password = password;

    try {
        const res = await fetch(`/api/dashboard/users${isEdit ? '/' + id : ''}`, {
            method: isEdit ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(userData)
        });
        const result = await res.json();
        if (result.success) {
            window.closeUserModal();
            loadAllUsers();
        } else {
            alert('❌ Error: ' + result.message);
        }
    } catch (error) {
        alert('❌ Error saving user: ' + error.message);
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
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await res.json();
        if (result.success) {
            loadAllUsers();
        } else {
            alert('❌ Error: ' + result.message);
        }
    } catch (error) {
        alert('❌ Error updating status: ' + error.message);
    }
};

window.deleteUser = async function(id) {
    const user = lastLoadedUsers.find(u => u._id === id);
    const label = user ? `${user.name} (${user.email})` : 'this user';
    if (!confirm(`Delete ${label}? This can't be undone.`)) return;

    try {
        const res = await fetch(`/api/dashboard/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await res.json();
        if (result.success) {
            loadAllUsers();
        } else {
            alert('❌ Error: ' + result.message);
        }
    } catch (error) {
        alert('❌ Error deleting user: ' + error.message);
    }
};

document.getElementById('quickTrackBtn')?.addEventListener('click', function() {
    const input = document.getElementById('quickTrackInput');
    if (input.value) {
        window.location.href = `tracking.html?number=${input.value}`;
    }
});

document.getElementById('quickTrackInput')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('quickTrackBtn').click();
});

// =============================================
// CUSTOM NOTIFICATION SYSTEM
// =============================================
function showLoggedTrackingPopup(trackingNumber) {
    const overlay = document.createElement('div');
    overlay.id = 'trackingPopupOverlay';
    
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: '9999'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        backgroundColor: '#ffffff', padding: '25px', borderRadius: '8px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)', textAlign: 'center',
        maxWidth: '400px', width: '90%', fontFamily: 'Arial, sans-serif'
    });

    modal.innerHTML = `
        <div style="font-size: 2.5rem; color: #2e7d32; margin-bottom: 12px;"><i class="fas fa-check-circle"></i></div>
        <h3 style="color: #222; margin: 0 0 8px 0; font-size: 1.3rem;">Shipment Requirement Received</h3>
        
        <p style="color: #555; font-size: 0.9rem; line-height: 1.4; margin-bottom: 18px;">
            Your shipment requirement has been received, and support will write to you to get more details on the shipping and how to go about it.
        </p>
        
        <div style="background: #f4f6f8; padding: 12px; border-radius: 6px; border: 1px dashed #b2dfdb; margin-bottom: 20px;">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: #666; display: block; margin-bottom: 2px;">Assigned Tracking Number</span>
            <strong style="font-size: 1.25rem; color: #0056b3; letter-spacing: 0.5px;">${trackingNumber}</strong>
        </div>
        
        <button id="dismissTrackingPopupBtn" style="width: 100%; background: #0056b3; color: white; padding: 10px; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Acknowledge</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('dismissTrackingPopupBtn').addEventListener('click', () => {
        document.body.removeChild(overlay);
        const formElement = document.getElementById('quoteForm') || document.querySelector('#userQuote form');
        if (formElement) formElement.reset();

        // Return to the "Start a Quote" card instead of leaving the form open
        const formState = document.getElementById('quoteFormState');
        const ctaState = document.getElementById('quoteCtaState');
        if (formState) formState.style.display = 'none';
        if (ctaState) ctaState.style.display = 'block';
        const result = document.getElementById('dashQuoteResult');
        if (result) result.style.display = 'none';
    });
}

// =============================================
// QUOTE TAB: click-to-open form
// =============================================
document.addEventListener('click', function(e) {
    if (e.target.closest('#openQuoteFormBtn')) {
        document.getElementById('quoteCtaState').style.display = 'none';
        document.getElementById('quoteFormState').style.display = 'grid';
    }
    if (e.target.closest('#closeQuoteFormBtn')) {
        document.getElementById('quoteFormState').style.display = 'none';
        document.getElementById('quoteCtaState').style.display = 'block';
        const form = document.getElementById('dashboardQuoteForm');
        if (form) form.reset();
        const result = document.getElementById('dashQuoteResult');
        if (result) result.style.display = 'none';
    }
});

// =============================================
// QUOTE SUBMISSION & SHIPMENT PIPELINE
// =============================================
document.addEventListener('submit', async function(e) {
    const quoteContainer = document.getElementById('userQuote');
    if (!quoteContainer || !quoteContainer.contains(e.target)) return;
    
    e.preventDefault();
    const form = e.target;

    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user')) || {};

    const originCity = document.getElementById('dashOrigin')?.value || 'Origin Hub';
    const destCity = document.getElementById('dashDestination')?.value || '';
    const service = document.getElementById('dashServiceType')?.value || 'standard';
    const pkgWeight = parseFloat(document.getElementById('dashWeight')?.value) || 1;
    const notes = document.getElementById('dashDimensions')?.value || 'N/A';

    if (!destCity) {
        alert('Please provide a destination city.');
        return;
    }

    const payload = {
        userId: user.id || user._id,
        serviceType: service,
        sender: { name: user.name || 'Customer', city: originCity, country: originCity },
        recipient: { name: user.name || 'Customer Reference', city: destCity, country: destCity },
        packageDetails: { weight: pkgWeight, description: `Package parameters: ${notes}` }
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
            showLoggedTrackingPopup(result.data.trackingNumber);
            if (typeof loadDashboardData === 'function') {
                loadDashboardData(token, user);
            }
        } else {
            alert('Could not process requirement: ' + result.message);
        }
    } catch (error) {
        console.error('Error contacting shipping terminal:', error);
    }
});

// =============================================
// ENHANCED ADDRESS INTERFACE MANAGEMENT PIPELINE
// =============================================
const ADDR_API = '/api/addresses';
const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
});

// Helper to create and show functional feedback status banners
function showAddressAlert(message, type = 'success') {
    const targetContainer = document.getElementById('userAddresses') || document.getElementById('address-list-container');
    if (!targetContainer) return;

    // Remove old alerts to prevent cluttering
    document.querySelectorAll('.address-alert-banner').forEach(el => el.remove());

    const alertEl = document.createElement('div');
    alertEl.className = `address-alert-banner alert alert-${type === 'success' ? 'success' : 'danger'} mb-3`;
    Object.assign(alertEl.style, {
        padding: '12px 20px',
        borderRadius: '6px',
        fontWeight: '6px',
        fontSize: '0.9rem',
        backgroundColor: type === 'success' ? '#e8f5e9' : '#ffebee',
        color: type === 'success' ? '#2e7d32' : '#c62828',
        border: `1px solid ${type === 'success' ? '#a5d6a7' : '#ef9a9a'}`,
        marginBottom: '15px'
    });
    alertEl.innerHTML = `<strong>${type === 'success' ? '✅ Success:' : '❌ Error:'}</strong> ${message}`;
    
    targetContainer.insertBefore(alertEl, targetContainer.firstChild);
    setTimeout(() => alertEl.remove(), 4000);
}

async function fetchAddresses() {
    try {
        const res = await fetch(ADDR_API, { headers: getHeaders() });
        if (!res.ok) throw new Error('Could not pull saved entries');
        const data = await res.json();
        renderAddresses(data);
    } catch (err) {
        console.error('Failed to load addresses:', err);
    }
}

function renderAddresses(addresses) {
    const mainSection = document.getElementById('userAddresses');
    if (!mainSection) return;

    // Clean build the primary list container layout structure programmatically
    mainSection.innerHTML = `
        <div id="address-view-list" class="card p-4 shadow-sm" style="border: none; border-radius: 8px; background: #fff;">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h3 style="font-size: 1.25rem; font-weight: 700; color: #333; margin: 0;">
                    Saved Addresses (<span id="address-count">${addresses.length}</span>/3)
                </h3>
                <button id="show-add-form-btn" class="btn btn-primary" style="background-color: #0056b3; border: none; font-weight: 600; padding: 8px 16px;">
                    + Add Address
                </button>
            </div>
            <div id="address-list-container"></div>
        </div>
        
        <!-- Dynamic Overlay Input Form View Section -->
        <div id="address-view-form" class="card p-4 shadow-sm" style="display: none; border: none; border-radius: 8px; background: #fff;">
            <h3 style="font-size: 1.25rem; font-weight: 700; color: #333; margin-bottom: 20px;">Add New Address</h3>
            <form id="add-address-form">
                <div class="mb-3" style="margin-bottom: 15px;">
                    <label style="display:block; margin-bottom: 5px; font-weight: 600; font-size: 0.85rem; color:#555;">Street Address</label>
                    <input type="text" id="addr-street" class="form-control" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;" required>
                </div>
                <div class="row" style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <label style="display:block; margin-bottom: 5px; font-weight: 600; font-size: 0.85rem; color:#555;">City</label>
                        <input type="text" id="addr-city" class="form-control" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;" required>
                    </div>
                    <div style="flex: 1;">
                        <label style="display:block; margin-bottom: 5px; font-weight: 600; font-size: 0.85rem; color:#555;">State / Region</label>
                        <input type="text" id="addr-state" class="form-control" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;" required>
                    </div>
                </div>
                <div class="row" style="display: flex; gap: 15px; margin-bottom: 20px;">
                    <div style="flex: 1;">
                        <label style="display:block; margin-bottom: 5px; font-weight: 600; font-size: 0.85rem; color:#555;">Zip / Postal Code</label>
                        <input type="text" id="addr-zip" class="form-control" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;" required>
                    </div>
                    <div style="flex: 1;">
                        <label style="display:block; margin-bottom: 5px; font-weight: 600; font-size: 0.85rem; color:#555;">Country</label>
                        <input type="text" id="addr-country" class="form-control" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;" required>
                    </div>
                </div>
                <div class="d-flex gap-2" style="display: flex; gap: 10px;">
                    <button type="submit" class="btn btn-success" style="background-color: #2e7d32; color: white; border: none; padding: 10px 20px; font-weight: 600; border-radius: 4px; cursor: pointer;">Save Address</button>
                    <button type="button" id="cancel-address-btn" class="btn btn-secondary" style="background-color: #757575; color: white; border: none; padding: 10px 20px; font-weight: 600; border-radius: 4px; cursor: pointer;">Cancel</button>
                </div>
            </form>
        </div>
    `;

    const container = document.getElementById('address-list-container');
    const toggleFormBtn = document.getElementById('show-add-form-btn');

    if (addresses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #888; padding: 40px 0;">
                <i class="fas fa-map-marked-alt" style="font-size: 3rem; margin-bottom: 12px; color: #ddd;"></i>
                <p style="margin: 0;">No saved addresses discovered. Click the button above to add one.</p>
            </div>`;
    } else {
        addresses.forEach(addr => {
            const card = document.createElement('div');
            card.className = 'address-card d-flex justify-content-between align-items-center mb-3';
            Object.assign(card.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '15px',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                marginBottom: '12px',
                backgroundColor: '#fafafa'
            });
            card.innerHTML = `
                <div>
                    <strong style="color: #222; font-size: 0.95rem;">${addr.street}</strong><br>
                    <span style="color: #666; font-size: 0.85rem;">${addr.city}, ${addr.state} ${addr.zipCode}</span><br>
                    <small style="color: #999; text-transform: uppercase; font-weight: bold; font-size: 0.7rem;">${addr.Country || ''}</small>
                </div>
                <button onclick="deleteAddress('${addr._id}')" class="btn btn-danger btn-sm" style="background-color: #d32f2f; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">
                    <i class="fas fa-trash-alt"></i> Delete
                </button>
            `;
            container.appendChild(card);
        });
    }

    // Completely hide add controls if user hits the database limit constraint
    if (addresses.length >= 3) {
        if (toggleFormBtn) toggleFormBtn.style.display = 'none';
    } else {
        // Wire up interface view toggle swaps
        toggleFormBtn?.addEventListener('click', () => {
            document.getElementById('address-view-list').style.display = 'none';
            document.getElementById('address-view-form').style.display = 'block';
        });
    }

    // Attach runtime hooks to dynamic document instances
    document.getElementById('cancel-address-btn')?.addEventListener('click', () => {
        document.getElementById('address-view-form').style.display = 'none';
        document.getElementById('address-view-list').style.display = 'block';
    });

    document.getElementById('add-address-form')?.addEventListener('submit', handleAddAddress);
}

async function handleAddAddress(e) {
    e.preventDefault();
    const payload = {
        street: document.getElementById('addr-street').value,
        city: document.getElementById('addr-city').value,
        state: document.getElementById('addr-state').value,
        zipCode: document.getElementById('addr-zip').value,
        country: document.getElementById('addr-country').value
    };

    try {
        const res = await fetch(ADDR_API, { 
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify(payload) 
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.message || 'Server interface rejection');
        
        renderAddresses(data);
        showAddressAlert('Address stored successfully in profile ecosystem.', 'success');
    } catch (err) {
        showAddressAlert(err.message, 'error');
    }
}

async function deleteAddress(id) {
    if (!confirm('Are you absolute sure you want to remove this address?')) return;
    try {
        const res = await fetch(`${ADDR_API}/${id}`, { method: 'DELETE', headers: getHeaders() });
        const data = await res.json();
        
        if (!res.ok) throw new Error('Database deletion transaction failed');
        
        renderAddresses(data);
        showAddressAlert('Address safely expunged from database records.', 'success');
    } catch (err) {
        showAddressAlert(err.message, 'error');
    }
}

