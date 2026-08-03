// =============================================
// NOTIFICATIONS BELL (bell icon + dropdown panel in the dashboard header)
// =============================================
// Standalone on purpose, same pattern as chat-widget.js -- both dashboard.html
// and admin.html load this file so the bell/dropdown behaves identically for
// every logged-in user regardless of role. Composing a manual notification is
// an admin-only action and lives in admin-ui.js instead, since only the admin
// page has that form.
(function() {
    let pollTimer = null;

    function notifHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        };
    }

    function escapeNotifHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    const TYPE_ICONS = {
        shipment_created: 'fa-box',
        shipment_status: 'fa-truck',
        shipment_rejected: 'fa-circle-xmark',
        password_changed: 'fa-shield-halved',
        admin_message: 'fa-bullhorn'
    };

    function timeAgo(dateStr) {
        const diffMs = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(dateStr).toLocaleDateString();
    }

    // Notifications the dropdown last rendered, keyed by nothing in
    // particular -- just a flat cache so a click on an item can look up its
    // full message/title/time without a second network round trip.
    let currentNotifications = [];

    // Built once and reused -- the dropdown itself is only 360px wide (and a
    // fixed strip on mobile), too small to comfortably read a longer
    // message, so clicking an item opens this centered modal instead of
    // navigating away immediately. Injected lazily rather than living in
    // dashboard.html/admin.html markup so this file stays a single,
    // drop-in include with no HTML changes required on either page.
    function getDetailModal() {
        let modal = document.getElementById('notifDetailModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'notifDetailModal';
        modal.innerHTML = `
            <div class="modal-content notif-detail-content">
                <button type="button" class="modal-close notif-detail-close" id="notifDetailCloseBtn" aria-label="Close">&times;</button>
                <div class="notif-detail-header">
                    <div class="notif-item-icon" id="notifDetailIcon"><i class="fas fa-bell"></i></div>
                    <div class="notif-detail-header-text">
                        <h3 id="notifDetailTitle">Notification</h3>
                        <span class="notif-item-time" id="notifDetailTime"></span>
                    </div>
                </div>
                <p class="notif-detail-message" id="notifDetailMessage"></p>
                <div class="notif-detail-actions" id="notifDetailActions" style="display:none;">
                    <button type="button" class="btn quote-btn-primary" id="notifDetailGoBtn">Open</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => modal.classList.remove('active');
        modal.querySelector('#notifDetailCloseBtn').addEventListener('click', close);
        // Same "click the dimmed backdrop to close" behavior every other
        // modal in the app has -- registered directly here since this modal
        // is created after dashboard-ui.js/admin-ui.js's own one-time pass
        // that wires up that behavior for modals present at page load.
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

        return modal;
    }

    function openNotifDetail(n) {
        const modal = getDetailModal();
        modal.querySelector('#notifDetailTitle').textContent = n.title;
        modal.querySelector('#notifDetailMessage').textContent = n.message;
        modal.querySelector('#notifDetailTime').textContent = timeAgo(n.createdAt);

        const iconEl = modal.querySelector('#notifDetailIcon');
        iconEl.className = `notif-item-icon type-${n.type}`;
        iconEl.innerHTML = `<i class="fas ${TYPE_ICONS[n.type] || 'fa-bell'}"></i>`;

        const actions = modal.querySelector('#notifDetailActions');
        const goBtn = modal.querySelector('#notifDetailGoBtn');
        if (n.link) {
            actions.style.display = 'flex';
            goBtn.onclick = () => { window.location.href = n.link; };
        } else {
            actions.style.display = 'none';
            goBtn.onclick = null;
        }

        modal.classList.add('active');
    }

    function renderNotifications(notifications, listEl) {
        if (!notifications.length) {
            listEl.innerHTML = '<div class="notif-empty-state"><i class="fas fa-bell-slash"></i><br>You\'re all caught up.</div>';
            return;
        }
        listEl.innerHTML = notifications.map(n => `
            <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n._id}" data-link="${escapeNotifHtml(n.link || '')}">
                <div class="notif-item-icon type-${n.type}"><i class="fas ${TYPE_ICONS[n.type] || 'fa-bell'}"></i></div>
                <div class="notif-item-body">
                    <div class="notif-item-title">${escapeNotifHtml(n.title)}</div>
                    <div class="notif-item-message">${escapeNotifHtml(n.message)}</div>
                    <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
                </div>
                ${n.read ? '' : '<span class="notif-item-dot" title="Unread"></span>'}
                <button type="button" class="notif-item-dismiss" data-dismiss="${n._id}" title="Dismiss" aria-label="Dismiss notification"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
    }

    async function loadNotifications(listEl) {
        try {
            const res = await fetch('/api/notifications', { headers: notifHeaders() });
            const result = await res.json();
            if (!result.success) return;
            currentNotifications = result.data;
            renderNotifications(result.data, listEl);
        } catch (err) {
            listEl.innerHTML = '<div class="notif-empty-state">Could not load notifications.</div>';
        }
    }

    function updateBadge(count) {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    async function pollUnreadCount() {
        try {
            const res = await fetch('/api/notifications/unread-count', { headers: notifHeaders() });
            const result = await res.json();
            if (result.success) updateBadge(result.data.count);
        } catch (err) {
            // ignore -- badge just won't update this tick
        }
    }

    function setupNotificationBell() {
        const btn = document.getElementById('notifBellBtn');
        const dropdown = document.getElementById('notifDropdown');
        const list = document.getElementById('notifList');
        const markAllBtn = document.getElementById('notifMarkAllBtn');
        if (!btn || !dropdown || !list) return;

        function closeDropdown() {
            btn.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            dropdown.classList.remove('open');
        }

        function openDropdown() {
            btn.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            dropdown.classList.add('open');
            list.innerHTML = '<div class="notif-empty-state">Loading...</div>';
            loadNotifications(list);
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.classList.contains('open')) closeDropdown(); else openDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeDropdown();
        });

        markAllBtn?.addEventListener('click', async () => {
            try {
                await fetch('/api/notifications/read-all', { method: 'PATCH', headers: notifHeaders() });
                list.querySelectorAll('.notif-item.unread').forEach(el => {
                    el.classList.remove('unread');
                    el.querySelector('.notif-item-dot')?.remove();
                });
                updateBadge(0);
            } catch (err) {
                // ignore -- badge/list just stay as-is this attempt
            }
        });

        list.addEventListener('click', async (e) => {
            const dismissBtn = e.target.closest('[data-dismiss]');
            if (dismissBtn) {
                e.stopPropagation();
                const id = dismissBtn.getAttribute('data-dismiss');
                const item = dismissBtn.closest('.notif-item');
                const wasUnread = item?.classList.contains('unread');
                item?.remove();
                if (!list.querySelector('.notif-item')) {
                    list.innerHTML = '<div class="notif-empty-state"><i class="fas fa-bell-slash"></i><br>You\'re all caught up.</div>';
                }
                try {
                    await fetch(`/api/notifications/${id}`, { method: 'DELETE', headers: notifHeaders() });
                    if (wasUnread) pollUnreadCount();
                } catch (err) {
                    // ignore -- worst case it reappears next load
                }
                return;
            }

            const item = e.target.closest('.notif-item');
            if (!item) return;
            const id = item.getAttribute('data-id');
            const wasUnread = item.classList.contains('unread');

            if (wasUnread) {
                item.classList.remove('unread');
                item.querySelector('.notif-item-dot')?.remove();
                fetch(`/api/notifications/${id}/read`, { method: 'PATCH', headers: notifHeaders() })
                    .then(() => pollUnreadCount())
                    .catch(() => {});
            }

            // Opens a centered modal to read the full message rather than
            // navigating away immediately -- the dropdown itself is too
            // narrow for a longer notification. Falls back to the item's
            // own dataset if the cache ever misses (e.g. a stale click).
            const notification = currentNotifications.find(n => n._id === id) || {
                title: item.querySelector('.notif-item-title')?.textContent || 'Notification',
                message: item.querySelector('.notif-item-message')?.textContent || '',
                type: [...item.querySelector('.notif-item-icon').classList].find(c => c.startsWith('type-'))?.replace('type-', '') || 'admin_message',
                link: item.getAttribute('data-link'),
                createdAt: new Date().toISOString()
            };
            closeDropdown();
            openNotifDetail(notification);
        });

        // Checked regardless of whether the dropdown is open, so the badge
        // reflects a new notification (e.g. a shipment status change) even
        // while the user is elsewhere on the page -- same pattern as the
        // chat bubble's unread-reply polling.
        pollUnreadCount();
        pollTimer = setInterval(pollUnreadCount, 20000);
    }

    setupNotificationBell();
})();
