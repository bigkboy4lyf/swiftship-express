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
    setupDashboardQuoteEngine();
    loadDashboardData(token, user);

    // Lets a notification's link (e.g. from the bell dropdown) deep-link
    // straight into a specific tab instead of always landing on Dashboard.
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab && PAGE_TITLES[requestedTab]) switchTab(requestedTab);
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
    'user-profile': 'Profile',
    'user-support': 'Support Center'
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
    if (tabId === 'user-support') renderMyTickets();

    // The live chat bubble only makes sense on the Support tab -- showing it
    // globally on every tab wasted space and kept its poll timers running
    // even when nobody could see the widget.
    const chatWidget = document.querySelector('.chat-bubble-widget');
    if (chatWidget) {
        chatWidget.style.display = tabId === 'user-support' ? 'flex' : 'none';
        if (tabId !== 'user-support') window.SwiftShipChat?.close();
    }

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

// The full street address a shipment is actually going to -- previously only
// city/country made it into this view, which told the customer which
// country their package was headed to but not whether it had a real
// delivery address on file at all.
function formatDeliveryAddress(recipient) {
    if (!recipient) return 'N/A';
    const line2 = [recipient.city, recipient.postalCode].filter(Boolean).join(' ');
    const parts = [recipient.address, line2, getCountryName(recipient.country) || recipient.country].filter(Boolean);
    return parts.length ? parts.join(', ') : 'N/A';
}

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
        ['Shipment Type', s.shipmentType === 'local' ? 'Local (Domestic)' : 'International'],
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

    document.getElementById('shipmentDetailTrackLink').href = `tracking.html?number=${s.trackingNumber}`;

    const docBtn = document.getElementById('shipmentDetailDocBtn');
    if (docBtn) {
        // A pending receipt blocks the invoice/receipt view entirely until
        // admin confirms or rejects it (see Payment Reviews in the admin
        // panel) -- rejecting leaves shipment.status untouched, so this
        // naturally reverts back to "View Invoice" on its own.
        const paymentPending = s.paymentReceipt?.status === 'pending';
        docBtn.disabled = paymentPending;
        docBtn.textContent = paymentPending
            ? 'Payment Processing'
            : (isAwaitingConfirmation(s.status) ? 'View Invoice' : 'View Receipt');
    }

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
        // Fired together rather than one after the other -- these two don't
        // depend on each other, so there's no reason the stats call should
        // sit and wait for the profile call to finish first. scope=personal
        // also tells /stats to skip the org-wide queries (admin counts,
        // revenue aggregation) this page never reads anyway.
        const [res, statsRes] = await Promise.all([
            fetch('/api/dashboard/profile', { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch('/api/dashboard/stats?scope=personal', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
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

// The avatar camera badge and the Phone row's "Edit" link are just shortcuts
// into the same Edit Profile modal -- no separate flow to maintain.
document.querySelectorAll('.profile-edit-trigger').forEach(el => {
    el.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('editProfileBtn')?.click();
    });
});

// =============================================
// CHANGE PASSWORD -- either with the current password, or (if forgotten)
// with a one-time code emailed to the account, reusing the same
// /api/auth/forgot-password + /api/auth/reset-password endpoints the
// logged-out "Forgot password?" flow on the login page uses.
// =============================================
let passwordResetMode = false;
let passwordResetCodeSent = false;

function setPasswordResetMode(resetMode) {
    passwordResetMode = resetMode;
    passwordResetCodeSent = false;
    document.getElementById('currentPasswordGroup').style.display = resetMode ? 'none' : '';
    document.getElementById('currentPassword').required = !resetMode;
    document.getElementById('resetCodeGroup').style.display = 'none';
    document.getElementById('passwordResetCode').value = '';
    document.getElementById('forgotCurrentPasswordLink').style.display = resetMode ? 'none' : '';
    document.getElementById('backToCurrentPasswordLink').style.display = resetMode ? '' : 'none';
    document.getElementById('sendPasswordCodeBtn').style.display = resetMode ? '' : 'none';
    document.getElementById('sendPasswordCodeBtn').textContent = 'Send Verification Code';
    document.getElementById('savePasswordBtn').style.display = resetMode ? 'none' : '';
}

document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
    document.getElementById('changePasswordForm').reset();
    const errorEl = document.getElementById('passwordFormError');
    errorEl.style.display = 'none';
    errorEl.classList.remove('form-success');
    setPasswordResetMode(false);
    document.getElementById('changePasswordModal').classList.add('active');
});

document.getElementById('forgotCurrentPasswordLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    setPasswordResetMode(true);
    document.getElementById('passwordFormError').style.display = 'none';
});

document.getElementById('backToCurrentPasswordLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    setPasswordResetMode(false);
    document.getElementById('passwordFormError').style.display = 'none';
});

document.getElementById('sendPasswordCodeBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('sendPasswordCodeBtn');
    const errorEl = document.getElementById('passwordFormError');
    const email = document.getElementById('profileEmailDisplay').textContent.trim();
    errorEl.style.display = 'none';

    btn.disabled = true;
    const wasResend = passwordResetCodeSent;
    btn.textContent = wasResend ? 'Resending...' : 'Sending...';
    try {
        const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Could not send code');

        passwordResetCodeSent = true;
        document.getElementById('resetCodeEmailDisplay').textContent = email;
        document.getElementById('resetCodeGroup').style.display = '';
        document.getElementById('savePasswordBtn').style.display = '';
        btn.textContent = 'Resend Code';

        errorEl.classList.add('form-success');
        errorEl.textContent = wasResend ? 'A new code has been sent.' : `A verification code has been sent to ${email}.`;
        errorEl.style.display = 'block';
    } catch (err) {
        errorEl.classList.remove('form-success');
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        btn.textContent = wasResend ? 'Resend Code' : 'Send Verification Code';
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('closeEditProfileModal')?.addEventListener('click', () => {
    document.getElementById('editProfileModal').classList.remove('active');
});
document.getElementById('closeChangePasswordModal')?.addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.remove('active');
});

// =============================================
// CHANGE EMAIL ADDRESS -- new address is only applied once the code sent
// to it (not the current address) is confirmed, proving they own it.
// =============================================
let pendingNewEmail = '';

function showEmailStep(step) {
    document.getElementById('emailStepRequest').style.display = step === 'request' ? '' : 'none';
    document.getElementById('emailStepVerify').style.display = step === 'verify' ? '' : 'none';
}

document.getElementById('changeEmailTriggerLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('currentEmailDisplay').textContent = document.getElementById('profileEmailDisplay').textContent.trim();
    document.getElementById('newEmailInput').value = '';
    document.getElementById('emailRequestError').style.display = 'none';
    showEmailStep('request');
    document.getElementById('changeEmailModal').classList.add('active');
});

document.getElementById('closeChangeEmailModal')?.addEventListener('click', () => {
    document.getElementById('changeEmailModal').classList.remove('active');
});

document.getElementById('sendEmailCodeBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('sendEmailCodeBtn');
    const errorEl = document.getElementById('emailRequestError');
    const newEmail = document.getElementById('newEmailInput').value.trim();
    errorEl.style.display = 'none';

    if (!newEmail) {
        errorEl.textContent = 'Please enter a new email address.';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        const res = await fetch('/api/dashboard/profile/email/request', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ newEmail })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Could not send verification code');

        pendingNewEmail = newEmail;
        document.getElementById('pendingEmailDisplay').textContent = newEmail;
        document.getElementById('emailVerifyCode').value = '';
        document.getElementById('emailVerifyError').style.display = 'none';
        showEmailStep('verify');
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send Verification Code';
    }
});

document.getElementById('changeEmailAddressLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('emailRequestError').style.display = 'none';
    showEmailStep('request');
});

document.getElementById('resendEmailCodeLink')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('emailVerifyError');
    errorEl.style.display = 'none';
    try {
        const res = await fetch('/api/dashboard/profile/email/request', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ newEmail: pendingNewEmail })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Could not resend code');
        errorEl.classList.add('form-success');
        errorEl.textContent = 'A new code has been sent.';
        errorEl.style.display = 'block';
    } catch (err) {
        errorEl.classList.remove('form-success');
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
});

document.getElementById('confirmEmailChangeBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirmEmailChangeBtn');
    const errorEl = document.getElementById('emailVerifyError');
    const code = document.getElementById('emailVerifyCode').value.trim();
    errorEl.classList.remove('form-success');
    errorEl.style.display = 'none';

    if (!code) {
        errorEl.textContent = 'Please enter the verification code.';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Confirming...';
    try {
        const res = await fetch('/api/dashboard/profile/email/verify', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ code })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Could not confirm email change');

        const newEmail = result.data.email;
        setElementText('profileEmailDisplay', newEmail);
        document.getElementById('editEmail').value = newEmail;
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...storedUser, email: newEmail }));

        errorEl.classList.add('form-success');
        errorEl.textContent = 'Email address updated successfully.';
        errorEl.style.display = 'block';
        setTimeout(() => {
            document.getElementById('changeEmailModal').classList.remove('active');
        }, 1200);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm New Email';
    }
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
    const resetCode = document.getElementById('passwordResetCode').value.trim();
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
    if (passwordResetMode) {
        if (!passwordResetCodeSent) {
            showError('Please send a verification code first.');
            return;
        }
        if (!resetCode) {
            showError('Please enter the verification code.');
            return;
        }
    } else if (newPassword === currentPassword) {
        showError('New password must be different from your current password.');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating...';
    try {
        const res = passwordResetMode
            ? await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('profileEmailDisplay').textContent.trim(),
                    code: resetCode,
                    newPassword
                })
            })
            : await fetch('/api/dashboard/password', {
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

let lastDashboardQuoteContext = null;

function resetQuoteTab() {
    document.getElementById('dashboardQuoteForm')?.reset();
    resetItemsRepeater(document.getElementById('dashItemsContainer'));
    const resultState = document.getElementById('quoteResultState');
    const infoBoxState = document.getElementById('quoteInfoBoxState');
    if (resultState) resultState.style.display = 'none';
    if (infoBoxState) infoBoxState.style.display = 'block';
    ['dashOriginLimitedNote', 'dashDestinationLimitedNote'].forEach(id => {
        const note = document.getElementById(id);
        if (note) note.style.display = 'none';
    });
    lastDashboardQuoteContext = null;
    resetRecipientAddressPicker();
}

// =============================================
// RECIPIENT ADDRESS PICKER (Get Quote tab)
// Lets a user ship to a saved address instead of retyping it every time,
// same "pick one or add a new one" pattern as most checkout flows. Saved
// addresses are cached here rather than re-fetched from renderAddresses()
// (the Addresses tab) since the two lists can be open/edited independently.
// =============================================
let dashRecipientAddresses = [];
let selectedRecipientAddressId = null;

async function loadDashRecipientAddresses() {
    try {
        const res = await fetch(ADDR_API, { headers: getHeaders() });
        dashRecipientAddresses = res.ok ? await res.json() : [];
    } catch (err) {
        console.error('Failed to load saved addresses:', err);
        dashRecipientAddresses = [];
    }
    renderRecipientAddressOptions();
}

function renderRecipientAddressOptions() {
    const container = document.getElementById('dashRecipientAddressList');
    if (!container) return;

    const destination = document.getElementById('dashDestination')?.value || '';
    if (!destination) {
        container.innerHTML = `<p class="recipient-address-hint">Select a destination country above to see matching saved addresses.</p>`;
        return;
    }

    // Addresses created before this feature existed (e.g. the one address
    // registration itself collects) may not have a recipient name/phone on
    // file -- exclude those rather than let a shipment go out with a blank
    // recipient. addr-fullname/addr-phone are required on every address the
    // Addresses tab or this picker create going forward.
    const matches = dashRecipientAddresses.filter(a => a.Country === destination && a.fullName && a.phone);
    if (!matches.length) {
        container.innerHTML = `<p class="recipient-address-hint">No saved addresses in ${getCountryName(destination)} yet. Add one below.</p>`;
        return;
    }

    container.innerHTML = matches.map(addr => `
        <label class="recipient-address-card">
            <input type="radio" name="dashRecipientAddress" value="${addr._id}" ${selectedRecipientAddressId === addr._id ? 'checked' : ''}>
            <div class="recipient-address-card-body">
                <strong>${addr.fullName || 'Unnamed'}</strong>
                <span>${addr.street}</span>
                <span>${addr.city}, ${addr.state} ${addr.zipCode}</span>
                ${addr.phone ? `<span>${addr.phone}</span>` : ''}
            </div>
        </label>
    `).join('');

    container.querySelectorAll('input[name="dashRecipientAddress"]').forEach(input => {
        input.addEventListener('change', () => {
            selectedRecipientAddressId = input.value;
            showNewRecipientForm(false);
        });
    });
}

function showNewRecipientForm(show) {
    const wrap = document.getElementById('dashNewRecipientForm');
    if (wrap) wrap.style.display = show ? 'block' : 'none';
    if (show) {
        selectedRecipientAddressId = null;
        document.querySelectorAll('input[name="dashRecipientAddress"]').forEach(r => { r.checked = false; });
    }
}

function resetRecipientAddressPicker() {
    dashRecipientAddresses = [];
    selectedRecipientAddressId = null;
    showNewRecipientForm(false);
    const container = document.getElementById('dashRecipientAddressList');
    if (container) container.innerHTML = `<p class="recipient-address-hint">Select a destination country above to see matching saved addresses.</p>`;
}

// Resolves whichever option the user actually chose (a saved address, or
// the inline new-address form) into the plain shape shipments.js expects.
// Returns null when nothing usable was provided, so the caller can block
// submission with a clear message instead of shipping a blank recipient.
function resolveRecipientDetails(destinationCode) {
    const newFormOpen = document.getElementById('dashNewRecipientForm')?.style.display === 'block';

    if (!newFormOpen && selectedRecipientAddressId) {
        const addr = dashRecipientAddresses.find(a => a._id === selectedRecipientAddressId);
        if (!addr) return null;
        return {
            name: addr.fullName,
            phone: addr.phone,
            address: addr.street,
            city: addr.city,
            postalCode: addr.zipCode,
            country: addr.Country
        };
    }

    if (newFormOpen) {
        const name = document.getElementById('dashRecipName')?.value.trim();
        const phone = document.getElementById('dashRecipPhone')?.value.trim();
        const street = document.getElementById('dashRecipStreet')?.value.trim();
        const city = document.getElementById('dashRecipCity')?.value.trim();
        const state = document.getElementById('dashRecipState')?.value.trim();
        const zipCode = document.getElementById('dashRecipZip')?.value.trim();
        if (!name || !phone || !street || !city) return null;

        return {
            name, phone, address: street, city, postalCode: zipCode, country: destinationCode,
            saveToAddressBook: document.getElementById('dashSaveRecipientAddress')?.checked,
            newAddressPayload: { fullName: name, phone, street, city, state, zipCode, country: destinationCode }
        };
    }

    return null;
}

document.getElementById('dashAddNewRecipientBtn')?.addEventListener('click', () => {
    const wrap = document.getElementById('dashNewRecipientForm');
    showNewRecipientForm(wrap?.style.display !== 'block');
});

document.getElementById('dashDestination')?.addEventListener('change', () => {
    selectedRecipientAddressId = null;
    showNewRecipientForm(false);
    renderRecipientAddressOptions();
});

document.getElementById('dismissTrackingConfirm')?.addEventListener('click', () => {
    document.getElementById('trackingConfirmModal').classList.remove('active');
    resetQuoteTab();
    document.getElementById('quoteFormState').style.display = 'none';
    document.getElementById('quoteCtaState').style.display = 'block';
});

// =============================================
// QUOTE TAB: click-to-open form + country/item-row setup
// =============================================
document.getElementById('openQuoteFormBtn')?.addEventListener('click', () => {
    document.getElementById('quoteCtaState').style.display = 'none';
    document.getElementById('quoteFormState').style.display = 'grid';
    loadDashRecipientAddresses();
});

document.getElementById('closeQuoteFormBtn')?.addEventListener('click', () => {
    document.getElementById('quoteFormState').style.display = 'none';
    document.getElementById('quoteCtaState').style.display = 'block';
    resetQuoteTab();
});

// The Reset button only clears the plain form fields natively -- rebuild the
// item rows back down to one and flip the result panel back to the info box
// right after, so "Reset" really does put the tab back to a blank slate.
document.getElementById('dashboardQuoteForm')?.addEventListener('reset', () => {
    setTimeout(() => {
        resetItemsRepeater(document.getElementById('dashItemsContainer'));
        document.getElementById('quoteResultState').style.display = 'none';
        document.getElementById('quoteInfoBoxState').style.display = 'block';
        document.getElementById('dashShipmentTypeIntl')?.dispatchEvent(new Event('change'));
    }, 0);
});

function setupDashLimitedServiceNotice(selectId, noteId) {
    const select = document.getElementById(selectId);
    const note = document.getElementById(noteId);
    if (!select || !note) return;
    select.addEventListener('change', () => {
        if (isLimitedServiceCountry(select.value)) {
            note.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${getCountryName(select.value)} currently has limited shipping service. Delivery times may be longer than usual.`;
            note.style.display = 'block';
        } else {
            note.style.display = 'none';
        }
    });
}

let dashShipmentTypeToggle = null;

function setupDashboardQuoteEngine() {
    dashShipmentTypeToggle = setupShipmentTypeToggle({
        radioName: 'dashShipmentType',
        originSelectId: 'dashOrigin',
        destinationSelectId: 'dashDestination',
        noteId: 'dashLocalCountryNote',
        originLabelId: 'dashOriginLabel',
        destinationLabelId: 'dashDestinationLabel',
        serviceTypeSelectId: 'dashServiceType'
    });
    populateCountrySelect(document.getElementById('addr-country'), 'Select country');
    setupDashLimitedServiceNotice('dashOrigin', 'dashOriginLimitedNote');
    setupDashLimitedServiceNotice('dashDestination', 'dashDestinationLimitedNote');
    initItemsRepeater(document.getElementById('dashItemsContainer'), document.getElementById('dashAddItemBtn'));
}

// =============================================
// STEP 1: CALCULATE QUOTE (same engine as the public quote page)
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

    const senderName = document.getElementById('dashSenderName')?.value.trim();
    const contactEmail = document.getElementById('dashContactEmail')?.value.trim();
    const origin = document.getElementById('dashOrigin')?.value || '';
    const destination = document.getElementById('dashDestination')?.value || '';
    const serviceType = document.getElementById('dashServiceType')?.value || 'standard';
    const dimensionsInput = document.getElementById('dashDimensions')?.value || '';
    const items = collectItems(document.getElementById('dashItemsContainer'));
    const isLocal = dashShipmentTypeToggle?.isLocalMode() || false;
    const shipmentType = isLocal ? 'local' : 'international';

    if (!origin || !destination) {
        alert('Please select an origin and destination country.');
        return;
    }
    if (isLocal && !isLocalShippingCountry(origin)) {
        alert('Local shipping is only available within a supported country.');
        return;
    }
    if (!isLocal && origin === destination) {
        alert('Origin and destination cannot be the same.');
        return;
    }
    if (!items.length || items.some(i => !i.description || !i.weight)) {
        alert("Please describe every item you're shipping and give it a weight.");
        return;
    }

    const recipient = resolveRecipientDetails(destination);
    if (!recipient) {
        alert('Please select a saved recipient address, or add a new one with a name, phone, street, and city.');
        return;
    }

    const submitBtn = this.querySelector('button[type="submit"]');
    let quote;
    try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Calculating...'; }
        quote = await calculateQuote({ originCountry: origin, destinationCountry: destination, serviceType, items, dimensions: dimensionsInput, shipmentType });
    } catch (error) {
        alert(error.message);
        return;
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Calculate Quote'; }
    }

    lastDashboardQuoteContext = { senderName, contactEmail, origin, destination, serviceType, shipmentType, dimensionsInput, items, recipient };

    document.getElementById('dashResultService').textContent = QUOTE_SERVICE_DETAILS[serviceType]?.name || serviceType;
    document.getElementById('dashResultRoute').textContent = `${getCountryName(origin)} → ${getCountryName(destination)}`;
    document.getElementById('dashResultDelivery').textContent = quote.deliveryEstimate || QUOTE_SERVICE_DETAILS[serviceType]?.delivery || '5-10 days';
    document.getElementById('dashResultContents').textContent = `${items.length} item${items.length > 1 ? 's' : ''}, ${quote.totalWeight.toFixed(1)} kg total`;
    document.getElementById('dashResultBase').textContent = money(quote.basePrice);
    document.getElementById('dashResultInsurance').textContent = money(quote.insuranceCost);
    document.getElementById('dashResultSurcharge').textContent = money(quote.surcharge);
    document.getElementById('dashResultTotal').textContent = money(quote.totalPrice);

    document.getElementById('quoteInfoBoxState').style.display = 'none';
    document.getElementById('quoteResultState').style.display = 'block';
});

document.getElementById('editQuoteDetailsBtn')?.addEventListener('click', () => {
    document.getElementById('quoteResultState').style.display = 'none';
    document.getElementById('quoteInfoBoxState').style.display = 'block';
});

// =============================================
// STEP 2: CONFIRM -> ACTUALLY CREATE THE SHIPMENT
// =============================================
document.getElementById('confirmQuoteBookingBtn')?.addEventListener('click', async () => {
    if (!lastDashboardQuoteContext) return;

    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user')) || {};
    const { senderName, contactEmail, origin, destination, serviceType, shipmentType, dimensionsInput, items, recipient } = lastDashboardQuoteContext;

    const payload = {
        userId: user.id || user._id,
        serviceType,
        shipmentType,
        contactEmail,
        sender: { name: senderName || user.name || 'Customer', city: getCountryName(origin), country: origin },
        recipient: {
            name: recipient.name,
            phone: recipient.phone,
            address: recipient.address,
            city: recipient.city,
            postalCode: recipient.postalCode,
            country: recipient.country
        },
        packageDetails: {
            dimensions: parseDimensions(dimensionsInput),
            items
        }
    };

    const btn = document.getElementById('confirmQuoteBookingBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

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
            // Best-effort: a brand new recipient address the user chose to
            // keep gets saved to their address book too, so next time it
            // shows up as a one-click option instead of a full retype. This
            // must never block the shipment itself -- e.g. the 4-address
            // cap is a fine reason to skip it, not to fail the whole request.
            if (recipient.saveToAddressBook && recipient.newAddressPayload) {
                fetch(ADDR_API, { method: 'POST', headers: getHeaders(), body: JSON.stringify(recipient.newAddressPayload) })
                    .catch(err => console.error('Could not save new recipient address:', err));
            }
            showTrackingConfirmation(result.data.trackingNumber);
            loadDashboardData(token, user);
        } else {
            alert('Could not submit request: ' + result.message);
        }
    } catch (error) {
        console.error('Error submitting shipment request:', error);
        alert('Could not reach the server. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm & Submit Request';
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
                <div class="address-card-icon"><i class="fas fa-map-marker-alt"></i></div>
                <div class="address-card-body">
                    <strong>${addr.fullName || 'Unnamed'}</strong>
                    <span>${addr.street}</span>
                    <span>${addr.city}, ${addr.state} ${addr.zipCode}</span>
                    <span>${getCountryName(addr.Country) || addr.Country || ''}</span>
                    ${addr.phone ? `<span>${addr.phone}</span>` : ''}
                </div>
                <button type="button" class="address-card-delete" onclick="deleteAddress('${addr._id}')" title="Delete address" aria-label="Delete address">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('')
        : `<div class="address-empty">
                <i class="fas fa-map-marker-alt"></i>
                <p>No saved addresses yet. Add one to speed up checkout.</p>
           </div>`;

    if (toggleBtn) toggleBtn.style.display = addresses.length >= 4 ? 'none' : '';
}

function toggleAddressForm(show) {
    document.getElementById('address-form-wrapper').style.display = show ? 'block' : 'none';
}

document.getElementById('toggle-address-btn')?.addEventListener('click', () => toggleAddressForm(true));
document.getElementById('cancel-address-btn')?.addEventListener('click', () => toggleAddressForm(false));

document.getElementById('add-address-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        fullName: document.getElementById('addr-fullname').value.trim(),
        phone: document.getElementById('addr-phone').value.trim(),
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

// The invoice currently open in the modal -- lets the Pay Now button branch
// on destination country and pull the right tracking number/amount without a
// second lookup.
let currentInvoiceShipment = null;

function openInvoiceOrReceipt(s) {
    currentInvoiceShipment = s;
    const isInvoice = isAwaitingConfirmation(s.status);
    const billing = getShipmentBilling(s);
    const hasBalance = billing.balanceDue > 0.001;
    // Demurrage/storage can accrue after a shipment's original invoice was
    // already paid off and approved -- so "still owes something" (hasBalance),
    // not just "hasn't been approved yet" (isInvoice), is what actually
    // decides whether this document is an invoice or a settled receipt. A
    // shipment that picked up a fee balance after approval gets treated as a
    // supplementary invoice for that fee, same document, same flow.
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
        <strong>${s.sender?.name || 'N/A'}</strong><br>
        ${s.contactEmail || s.sender?.email || ''}
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
                : 'Additional fees have accrued on this shipment since it was approved. Please settle the balance below to bring the account current.';

    document.getElementById('invoiceVerificationCode').textContent = s.verificationCode || 'N/A';

    const payBtn = document.getElementById('payNowBtn');
    if (payBtn) payBtn.style.display = hasBalance ? '' : 'none';

    document.getElementById('invoiceReceiptModal').classList.add('active');
}

document.getElementById('closeInvoiceModal')?.addEventListener('click', () => {
    document.getElementById('invoiceReceiptModal').classList.remove('active');
});

document.getElementById('printInvoiceBtn')?.addEventListener('click', () => window.print());

// =============================================
// PAY NOW -- both card and bank transfer are always offered; bank transfer
// is just recommended (not required) for limited-service destinations, which
// only affects which tab opens by default.
// =============================================
let paymentSettingsCache = null;

async function loadPaymentSettingsForCheckout() {
    try {
        const res = await fetch('/api/dashboard/payment-settings', { headers: getHeaders() });
        const result = await res.json();
        if (result.success) paymentSettingsCache = result.data;
    } catch (err) {
        console.error('Error loading payment settings:', err);
    }
}

function applyPaymentMethodAvailability() {
    const settings = paymentSettingsCache || {};
    const cardState = settings.card || { enabled: true };
    const bankState = settings.bankTransfer || { enabled: true };

    const cardTab = document.getElementById('paymentTabCard');
    const bankTab = document.getElementById('paymentTabBank');
    cardTab.disabled = cardState.enabled === false;
    cardTab.classList.toggle('payment-method-tab-disabled', cardState.enabled === false);
    bankTab.disabled = bankState.enabled === false;
    bankTab.classList.toggle('payment-method-tab-disabled', bankState.enabled === false);

    const cardNote = document.getElementById('cardPaymentUnavailableNote');
    const cardContent = document.getElementById('cardPaymentAvailableContent');
    const cardUnavailable = cardState.enabled === false;
    cardNote.style.display = cardUnavailable ? 'block' : 'none';
    if (cardUnavailable) {
        cardNote.innerHTML = `<i class="fas fa-info-circle"></i> Card payments are temporarily unavailable. ${escapeHtml(cardState.disabledReason || '')}`;
    }
    cardContent.style.display = cardUnavailable ? 'none' : '';

    const bankNote = document.getElementById('bankPaymentUnavailableNote');
    const bankContent = document.getElementById('bankPaymentAvailableContent');
    const bankUnavailable = bankState.enabled === false;
    bankNote.style.display = bankUnavailable ? 'block' : 'none';
    if (bankUnavailable) {
        bankNote.innerHTML = `<i class="fas fa-info-circle"></i> Bank transfer is temporarily unavailable. ${escapeHtml(bankState.disabledReason || '')}`;
    }
    bankContent.style.display = bankUnavailable ? 'none' : '';
}

function selectPaymentMethod(method) {
    document.getElementById('paymentTabCard').classList.toggle('active', method === 'card');
    document.getElementById('paymentTabBank').classList.toggle('active', method === 'bank');
    document.getElementById('paymentMethodCardPanel').style.display = method === 'card' ? '' : 'none';
    document.getElementById('paymentMethodBankPanel').style.display = method === 'bank' ? '' : 'none';
}

document.getElementById('paymentTabCard')?.addEventListener('click', () => {
    if (document.getElementById('paymentTabCard').disabled) return;
    selectPaymentMethod('card');
});
document.getElementById('paymentTabBank')?.addEventListener('click', () => {
    if (document.getElementById('paymentTabBank').disabled) return;
    selectPaymentMethod('bank');
});

document.getElementById('payNowBtn')?.addEventListener('click', async () => {
    const s = currentInvoiceShipment;
    if (!s) return;

    await loadPaymentSettingsForCheckout();
    applyPaymentMethodAvailability();

    const cardEnabled = paymentSettingsCache?.card?.enabled !== false;
    const bankEnabled = paymentSettingsCache?.bankTransfer?.enabled !== false;
    const preferred = isLimitedServiceCountry(s.recipient?.country) ? 'bank' : 'card';
    const defaultMethod = (preferred === 'bank' && bankEnabled) ? 'bank'
        : (preferred === 'card' && cardEnabled) ? 'card'
        : cardEnabled ? 'card'
        : bankEnabled ? 'bank'
        : null;

    if (defaultMethod) selectPaymentMethod(defaultMethod);

    document.getElementById('paymentMethodModal').classList.add('active');
    loadBankTransferDetails(s);
});

document.getElementById('closePaymentMethodModal')?.addEventListener('click', () => {
    document.getElementById('paymentMethodModal').classList.remove('active');
});

document.getElementById('continueToCardBtn')?.addEventListener('click', () => {
    const s = currentInvoiceShipment;
    if (!s) return;
    const params = new URLSearchParams({
        tracking: s.trackingNumber || '',
        amount: getShipmentBilling(s).balanceDue,
        shipment: s._id || ''
    });
    window.location.href = `pay.html?${params.toString()}`;
});

document.getElementById('confirmBankPaymentBtn')?.addEventListener('click', () => {
    const s = currentInvoiceShipment;
    if (!s) return;
    const params = new URLSearchParams({
        shipment: s._id || '',
        tracking: s.trackingNumber || '',
        method: 'bank_transfer'
    });
    window.location.href = `submit-receipt.html?${params.toString()}`;
});

// The account shown is specific to the shipment's destination if one's been
// configured, otherwise the admin's parent account (PARENT_ACCOUNT_CODE) --
// either way the customer can still use this tab regardless of destination.
async function loadBankTransferDetails(s) {
    document.getElementById('bankTransferBody').innerHTML = '<div class="profile-detail-row"><dd>Loading account details...</dd></div>';

    try {
        const res = await fetch('/api/dashboard/payment-accounts', { headers: getHeaders() });
        const result = await res.json();
        const accounts = result.success ? result.data : [];
        const account = accounts.find(a => a.countryCode === s.recipient?.country)
            || accounts.find(a => a.countryCode === PARENT_ACCOUNT_CODE);

        const rows = account ? [
            ['Payment Reference', s.trackingNumber],
            ['Amount Due', money(getShipmentBilling(s).balanceDue)],
            ['Bank Name', account.bankName],
            ['Account Holder Name', account.accountName],
            ['Account Number', account.accountNumber],
            ['IBAN', account.iban],
            ['SWIFT / BIC', account.swiftBic],
            ['Routing Number', account.routingNumber],
            ['Sort Code', account.sortCode],
            ['Branch Name', account.branchName],
            ['Branch Address', account.branchAddress],
            ['Currency', account.currency],
            ['Intermediary Bank', account.intermediaryBank],
            ['Instructions', account.additionalInstructions]
        ].filter(([, value]) => value) : [];

        document.getElementById('bankTransferBody').innerHTML = rows.length
            ? rows.map(([label, value]) => `
                <div class="profile-detail-row">
                    <dt>${label}</dt>
                    <dd>${value}</dd>
                </div>
            `).join('')
            : `<div class="profile-detail-row"><dd>Bank transfer details aren't set up yet. Our support team will contact you directly with payment instructions for tracking number <strong>${s.trackingNumber}</strong>.</dd></div>`;
    } catch (err) {
        document.getElementById('bankTransferBody').innerHTML = '<div class="profile-detail-row"><dd>Could not load account details. Please try again or contact support.</dd></div>';
    }
}

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

function renderMyTickets() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const list = document.getElementById('myTicketsList');
    if (!list || !window.TicketStore) return;

    const tickets = TicketStore.getByUser(user.id);
    list.innerHTML = !tickets.length
        ? '<p class="empty-text">You haven\'t submitted any tickets yet.</p>'
        : tickets.map(t => `
            <div class="ticket-row" onclick="openTicketDetail('${t.id}')">
                <div class="ticket-row-main">
                    <span class="ticket-id-tag">${t.id}</span>
                    <span class="status-badge status-${t.status}">${t.status.toUpperCase()}</span>
                    <span class="ticket-row-date">${new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
                <strong class="ticket-row-subject">${escapeHtml(t.subject)}</strong>
                <p class="ticket-row-type">${escapeHtml(t.issueType)}</p>
                ${t.status === 'closed'
                    ? '<span class="ticket-row-resolved"><i class="fas fa-check-circle"></i> Resolved &mdash; click to view details</span>'
                    : ''}
            </div>
        `).join('');
}

window.openTicketDetail = function(id) {
    const ticket = TicketStore.getById(id);
    if (!ticket) return;

    document.getElementById('ticketDetailId').textContent = ticket.id;
    const statusEl = document.getElementById('ticketDetailStatus');
    statusEl.textContent = ticket.status.toUpperCase();
    statusEl.className = 'status-badge status-' + ticket.status;

    document.getElementById('ticketDetailSubject').textContent = ticket.subject;
    document.getElementById('ticketDetailIssueType').textContent = ticket.issueType;
    document.getElementById('ticketDetailMessage').textContent = ticket.message;
    document.getElementById('ticketDetailCreated').textContent = new Date(ticket.createdAt).toLocaleString();

    const closedRow = document.getElementById('ticketDetailClosedRow');
    if (ticket.closedAt) {
        closedRow.style.display = '';
        document.getElementById('ticketDetailClosed').textContent = new Date(ticket.closedAt).toLocaleString();
    } else {
        closedRow.style.display = 'none';
    }

    const resolutionBox = document.getElementById('ticketDetailResolutionBox');
    if (ticket.resolutionNote) {
        resolutionBox.style.display = '';
        document.getElementById('ticketDetailResolutionNote').textContent = ticket.resolutionNote;
    } else {
        resolutionBox.style.display = 'none';
    }

    document.getElementById('ticketDetailModal').classList.add('active');
};

document.getElementById('closeTicketDetailModal')?.addEventListener('click', () => {
    document.getElementById('ticketDetailModal').classList.remove('active');
});

document.getElementById('supportTicketForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const subject = document.getElementById('ticketSubject').value.trim();
    const issueType = document.getElementById('ticketIssueType').value;
    const message = document.getElementById('ticketMessage').value.trim();
    if (!subject || !issueType || !message) return;

    TicketStore.create({
        userId: user.id,
        userName: user.name || 'Customer',
        userEmail: user.email || '',
        issueType,
        subject,
        message
    });

    e.target.reset();
    const successEl = document.getElementById('ticketFormSuccess');
    successEl.style.display = 'block';
    setTimeout(() => { successEl.style.display = 'none'; }, 4000);

    renderMyTickets();
});

// Live chat itself lives in chat-widget.js (loaded separately below) so the
// public marketing page can reuse it without pulling in this file's
// auth-redirect logic. switchTab() above only shows/hides the widget's
// container and tells it to stop polling when the Support tab isn't active.
