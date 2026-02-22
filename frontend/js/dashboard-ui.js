// =============================================
// DASHBOARD UI - CONNECTED TO BACKEND
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    // Redirect if not logged in
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

    // Setup Tab Switching
    setupTabSwitching();
    
    // Load Dashboard Data
    loadDashboardData(token, user);
});

// =============================================
// TAB SWITCHING FUNCTIONALITY - FIXED
// =============================================

function setupTabSwitching() {
    // Sidebar menu items
    const menuItems = document.querySelectorAll('.sidebar-menu-item');
    const contentSections = {
        'user-dashboard': document.getElementById('userDashboard'),
        'user-shipments': document.getElementById('userShipments'),
        'user-tracking': document.getElementById('userTracking'),
        'user-quote': document.getElementById('userQuote'),
        'user-addresses': document.getElementById('userAddresses'),
        'user-profile': document.getElementById('userProfileSection'), // Note: This ID is different!
        'admin-dashboard': document.getElementById('adminDashboard'),
        'admin-shipments': document.getElementById('adminShipments'),
        'admin-users': document.getElementById('adminUsers'),
        'admin-reports': document.getElementById('adminReports'),
        'admin-settings': document.getElementById('adminSettings')
    };

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            
            // Update sidebar active state
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // --- THIS IS THE FIX ---
            // Hide ONLY the main content panes (tab-pane and dashboard-section), NOT the header
            document.querySelectorAll('.tab-pane, .dashboard-section').forEach(section => {
                if (section) section.style.display = 'none';
            });
            // --- END OF FIX ---

            // Show selected section
            if (contentSections[tabId]) {
                contentSections[tabId].style.display = 'block';
                
                // Load specific data based on tab
                if (tabId === 'user-shipments') loadUserShipments();
                if (tabId === 'admin-shipments') loadAllShipments();
                if (tabId === 'admin-users') loadAllUsers();
                // Note: The profile data function is called elsewhere if needed
            }
        });
    });

    // Dashboard tabs (User/Admin toggle) - THESE DON'T AFFECT HEADER
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const role = this.dataset.role;
            
            // Only toggle the dashboard content, NOT the header
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('active');
            });
            
            if (role === 'user') {
                document.getElementById('userDashboard').classList.add('active');
            } else {
                document.getElementById('adminDashboard').classList.add('active');
            }
        });
    });
}

// =============================================
// LOAD DASHBOARD DATA
// =============================================

async function loadDashboardData(token, user) {
    try {
        // Load stats
        await loadDashboardStats(token);
        
        // Load recent shipments
        await loadRecentShipments(token, user);
        
    } catch (err) {
        console.error("Error loading dashboard data:", err);
    }
}

async function loadDashboardStats(token) {
    try {
        const response = await fetch('/api/dashboard/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            const stats = result.data;
            
            // Update stats elements
            setElementText('totalShipments', stats.totalShipments || 0);
            setElementText('deliveredShipments', stats.deliveredShipments || 0);
            setElementText('transitShipments', stats.inTransitShipments || 0);
            setElementText('pendingShipments', stats.pendingShipments || 0);
            
            // Admin stats
            setElementText('totalUsers', stats.totalUsers || 0);
            setElementText('totalShipmentsAdmin', stats.totalShipments || 0);
            setElementText('activeShipments', stats.activeShipments || 0);
            
            const revenueEl = document.getElementById('revenue');
            if (revenueEl) {
                revenueEl.textContent = `$${(stats.revenue || 45289).toLocaleString()}`;
            }
        }
    } catch (err) {
        console.error("Error loading stats:", err);
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
            
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            renderRecentShipments(result.data);
        }
    } catch (err) {
        console.error("Error loading shipments:", err);
    }
}

function renderRecentShipments(shipments) {
    const tbody = document.getElementById('recentShipmentsBody');
    if (!tbody) return;
    
    if (!shipments || shipments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">No shipments found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = shipments.map(s => `
        <tr>
            <td><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td>${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td>${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td>
                <span class="status-badge status-${s.status || 'pending'}">
                    ${(s.status || 'pending').replace('_', ' ').toUpperCase()}
                </span>
            </td>
            <td>
                <button class="action-btn" onclick="viewShipment('${s.trackingNumber}')" title="Track">
                    <i class="fas fa-search"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadAllShipments() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch('/api/dashboard/shipments?limit=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            renderAllShipments(result.data);
        }
    } catch (err) {
        console.error("Error loading all shipments:", err);
    }
}

function renderAllShipments(shipments) {
    const tbody = document.getElementById('allShipmentsBody');
    if (!tbody) return;
    
    if (!shipments || shipments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">No shipments found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = shipments.map(s => `
        <tr>
            <td><strong>${s.trackingNumber || 'N/A'}</strong></td>
            <td>${s.userId?.name || 'N/A'}</td>
            <td>${s.recipient?.city || 'N/A'}, ${s.recipient?.country || ''}</td>
            <td>
                <span class="status-badge status-${s.status || 'pending'}">
                    ${(s.status || 'pending').replace('_', ' ').toUpperCase()}
                </span>
            </td>
            <td>
                <button class="action-btn" onclick="editShipment('${s._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="deleteShipment('${s._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadAllUsers() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch('/api/dashboard/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            renderUsers(result.data);
        }
    } catch (err) {
        console.error("Error loading users:", err);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    
    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">No users found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.name || 'N/A'}</td>
            <td>${u.email || 'N/A'}</td>
            <td>${u.role === 'admin' ? 'Administrator' : 'Customer'}</td>
            <td>
                <span class="status-badge ${u.status === 'active' ? 'status-delivered' : 'status-pending'}">
                    ${(u.status || 'active').toUpperCase()}
                </span>
            </td>
            <td>
                <button class="action-btn" onclick="editUser('${u._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// =============================================
// ACTION FUNCTIONS
// =============================================

window.viewShipment = function(trackingNumber) {
    window.location.href = `tracking.html?number=${trackingNumber}`;
};

window.editShipment = function(id) {
    alert(`Edit shipment ${id} - This would open edit modal`);
};

window.deleteShipment = function(id) {
    if (confirm('Delete this shipment?')) {
        alert('Shipment deleted (demo)');
    }
};

window.editUser = function(id) {
    alert(`Edit user ${id}`);
};

// Quick Track
document.getElementById('quickTrackBtn')?.addEventListener('click', function() {
    const input = document.getElementById('quickTrackInput');
    if (input.value) {
        window.location.href = `tracking.html?number=${input.value}`;
    }
});

document.getElementById('quickTrackInput')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('quickTrackBtn').click();
    }
});