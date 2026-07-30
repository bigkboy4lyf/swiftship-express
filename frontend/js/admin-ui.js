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
    loadAdminData(token);
});

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
            '<tr><td colspan="5" style="text-align:center;">Loading shipments...</td></tr>';
        loadAllShipments();
    }
    if (tabId === 'admin-users') {
        document.getElementById('adminUsersBody').innerHTML =
            '<tr><td colspan="5" style="text-align:center;">Loading users...</td></tr>';
        loadAllUsers();
    }
}

function toSectionId(tabId) {
    // 'admin-shipments' -> 'adminShipments'
    return tabId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function setupTabSwitching() {
    document.querySelectorAll('.sidebar-menu-item[data-tab]').forEach(item => {
        item.addEventListener('click', () => switchTab(item.getAttribute('data-tab')));
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
        loadPendingApprovals()
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

function renderAllShipments(shipments) {
    // Two tables show this same data: the overview-pane preview (allShipmentsBody)
    // and the dedicated "All Shipments" sidebar tab (adminShipmentsBody).
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
            <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status).toUpperCase()}</span></td>
            <td>
                <button class="action-btn" onclick="updateShipmentStatus('${s._id}')" title="Update Status"><i class="fas fa-truck"></i></button>
                <button class="action-btn delete" onclick="deleteShipment('${s._id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    tbodies.forEach(tbody => tbody.innerHTML = html);
}

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
