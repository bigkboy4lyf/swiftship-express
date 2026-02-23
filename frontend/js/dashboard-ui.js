// =============================================
// DASHBOARD UI - CONNECTED TO BACKEND
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (!token || !user) {
        window.location.href = 'account.html';
        return;
    }

    // Set Profile Info
    document.getElementById('userDisplayName').textContent = user.name || 'User';
    document.getElementById('userAvatar').textContent = (user.name || 'U').charAt(0).toUpperCase();
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrator' : 'Customer';

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
                if (tabId === 'user-shipments') loadUserShipments();
                if (tabId === 'admin-shipments') loadAllShipments();
                if (tabId === 'admin-users') loadAllUsers();
                if (tabId === 'user-profile') setTimeout(loadProfileData, 100);
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
    await loadDashboardStats(token);
    await loadRecentShipments(token, user);
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
            setElementText('totalShipmentsAdmin', stats.totalShipments || 0);
            setElementText('activeShipments', stats.activeShipments || 0);
            const revenueEl = document.getElementById('revenue');
            if (revenueEl) revenueEl.textContent = `$${(stats.revenue || 45289).toLocaleString()}`;
        }
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

function setElementText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

async function loadRecentShipments(token, user) {
    try {
        const url = user.role === 'admin'
            ? '/api/dashboard/shipments?limit=5'
            : `/api/dashboard/shipments?limit=5&userId=${user.id}`;
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
            <td><span class="status-badge status-${s.status}">${(s.status || '').replace('_', ' ').toUpperCase()}</span></td>
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
    const tbody = document.getElementById('allShipmentsBody');
    if (!tbody) return;
    if (!shipments.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No shipments found</td></tr>';
        return;
    }
    tbody.innerHTML = shipments.map(s => `
        <tr>
            <td><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td>${s.userId?.name || 'N/A'}</td>
            <td>${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td><span class="status-badge status-${s.status}">${(s.status || '').replace('_', ' ').toUpperCase()}</span></td>
            <td>
                <button class="action-btn" onclick="editShipment('${s._id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="action-btn" onclick="updateShipmentStatus('${s._id}')" title="Update Status"><i class="fas fa-truck"></i></button>
                <button class="action-btn delete" onclick="deleteShipment('${s._id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

async function loadAllUsers() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/dashboard/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) renderUsers(result.data);
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No users found</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.name || 'N/A'}</td>
            <td>${u.email || 'N/A'}</td>
            <td>${u.role === 'admin' ? 'Administrator' : 'Customer'}</td>
            <td><span class="status-badge ${u.status === 'active' ? 'status-delivered' : 'status-pending'}">${(u.status || 'active').toUpperCase()}</span></td>
            <td><button class="action-btn" onclick="editUser('${u._id}')" title="Edit"><i class="fas fa-edit"></i></button></td>
        </tr>
    `).join('');
}

// =============================================
// PROFILE FUNCTIONS
// =============================================
function loadProfileData() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('profileFirstName').value = (user.name || '').split(' ')[0] || '';
    document.getElementById('profileLastName').value = (user.name || '').split(' ').slice(1).join(' ') || '';
    document.getElementById('profileEmail').value = user.email || '';
    document.getElementById('profilePhone').value = user.phone || '';
    document.getElementById('profileAccountType').value = user.accountType || 'Personal';
    document.getElementById('profileAvatar').textContent = (user.name || 'U').charAt(0).toUpperCase();
    document.getElementById('profileTotalShipments').textContent = document.getElementById('totalShipments')?.textContent || '0';
    document.getElementById('profileActiveShipments').textContent = document.getElementById('transitShipments')?.textContent || '0';
}

// Edit profile modal
document.getElementById('editProfileBtn')?.addEventListener('click', () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const nameParts = (user.name || '').split(' ');
    document.getElementById('editFirstName').value = nameParts[0] || '';
    document.getElementById('editLastName').value = nameParts.slice(1).join(' ') || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editPhone').value = user.phone || '';
    document.getElementById('editProfileModal').classList.add('active');
});

document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.add('active');
});

window.closeEditProfileModal = () => document.getElementById('editProfileModal').classList.remove('active');
window.closeChangePasswordModal = () => document.getElementById('changePasswordModal').classList.remove('active');

document.getElementById('editProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const updatedUser = {
        ...user,
        name: document.getElementById('editFirstName').value + ' ' + document.getElementById('editLastName').value,
        email: document.getElementById('editEmail').value,
        phone: document.getElementById('editPhone').value
    };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    document.getElementById('profileFirstName').value = document.getElementById('editFirstName').value;
    document.getElementById('profileLastName').value = document.getElementById('editLastName').value;
    document.getElementById('profileEmail').value = document.getElementById('editEmail').value;
    document.getElementById('profilePhone').value = document.getElementById('editPhone').value;
    document.getElementById('profileAvatar').textContent = updatedUser.name.charAt(0).toUpperCase();
    document.getElementById('userDisplayName').textContent = updatedUser.name;
    alert('Profile updated!');
    closeEditProfileModal();
});

document.getElementById('changePasswordForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmNewPassword').value;
    if (newPass !== confirm) {
        alert('Passwords do not match!');
        return;
    }
    alert('Password changed (demo)');
    closeChangePasswordModal();
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

// Handle shipment form submission
const shipmentForm = document.getElementById('shipmentForm');
if (shipmentForm) {
    // Remove any existing listeners by cloning
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

// Close modal
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
// SHIPMENT ACTIONS - FIXED STATUS UPDATE
// =============================================
window.viewShipment = function(trackingNumber) {
    window.location.href = `tracking.html?number=${trackingNumber}`;
};

window.editShipment = function(id) {
    alert('Edit functionality – you can extend this.');
};

// FIXED: Status update function with proper formatting
window.updateShipmentStatus = async function(id) {
    // Define valid status options
    const validStatuses = [
        'pending', 
        'processing', 
        'picked_up', 
        'in_transit', 
        'out_for_delivery', 
        'delivered', 
        'delayed'
    ];
    
    // Show prompt with instructions
    const newStatus = prompt(
        'Enter new status:\n' + 
        'Valid options: pending, processing, picked_up, in_transit, out_for_delivery, delivered, delayed'
    );
    
    if (!newStatus) return;
    
    // Format the status: lowercase and replace spaces with underscores
    const formattedStatus = newStatus.toLowerCase().trim().replace(/\s+/g, '_');
    
    // Validate the formatted status
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
            body: JSON.stringify({ 
                status: formattedStatus, 
                location: location 
            })
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

window.editUser = function(id) {
    alert('Edit user – implement as needed.');
};

// Quick Track
document.getElementById('quickTrackBtn')?.addEventListener('click', function() {
    const input = document.getElementById('quickTrackInput');
    if (input.value) {
        window.location.href = `tracking.html?number=${input.value}`;
    }
});

document.getElementById('quickTrackInput')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('quickTrackBtn').click();
});