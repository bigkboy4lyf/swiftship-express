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
                if (tabId === 'user-shipments') loadUserShipments();
                if (tabId === 'admin-shipments') loadAllShipments();
                if (tabId === 'admin-users') loadAllUsers();
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

// =============================================
// MY SHIPMENTS (logged-in user's own shipments)
// =============================================
async function loadUserShipments() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch('/api/dashboard/shipments?limit=50', {
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
            <td><span class="status-badge status-${s.status}">${(s.status || '').replace('_', ' ').toUpperCase()}</span></td>
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
async function loadProfileData() {
    const token = localStorage.getItem('token');
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

        document.getElementById('profileNameDisplay').textContent = user.name || 'Unnamed User';
        document.getElementById('profileEmailDisplay').textContent = user.email || '—';
        document.getElementById('profilePhoneDisplay').textContent = user.phone || 'Not set';

        const accountTypeLabel = user.accountType
            ? user.accountType.charAt(0).toUpperCase() + user.accountType.slice(1)
            : 'Personal';
        document.getElementById('profileAccountTypeDisplay').textContent = accountTypeLabel;
        document.getElementById('profileAccountTypeBadge').textContent = accountTypeLabel;

        const memberSinceEl = document.getElementById('profileMemberSince');
        if (memberSinceEl) {
            memberSinceEl.textContent = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : '—';
        }
        document.getElementById('profileTotalShipments').textContent = document.getElementById('totalShipments')?.textContent || '0';
        document.getElementById('profileActiveShipments').textContent = document.getElementById('transitShipments')?.textContent || '0';

        window.currentAvatarDataUrl = user.avatar || '';
        applyAvatar(user.name, user.avatar);
    } catch (err) {
        console.error('Error loading profile:', err);
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

window.editUser = function(id) {
    alert('Edit user – implement as needed.');
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
    });
}

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

