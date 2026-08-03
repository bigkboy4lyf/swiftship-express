// =============================================
// SUPPORT LIVE CHAT WIDGET (backed by /api/chat)
// =============================================
// Standalone on purpose -- loaded on its own by both dashboard.html (Support
// tab only) and index.html (the public marketing page). Keeping it out of
// dashboard-ui.js means the marketing page never has to load that file's
// auth-redirect logic just to get a chat bubble.
(function() {
    let chatPollTimer = null;

    function chatHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        };
    }

    function escapeChatHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function renderChatMessages(msgs, container) {
        container.innerHTML = msgs.length
            ? msgs.map(m => `<div class="chat-message ${m.senderRole === 'user' ? 'user' : 'bot'}${m.automated ? ' automated' : ''}">${escapeChatHtml(m.message)}</div>`).join('')
            : '<div class="chat-message bot">Hi! 👋 Send us a message and our support team will reply here as soon as they can.</div>';
        container.scrollTop = container.scrollHeight;
    }

    async function loadChatMessages(container) {
        try {
            const res = await fetch('/api/chat/messages', { headers: chatHeaders() });
            const result = await res.json();
            if (!result.success) return;
            renderChatMessages(result.data, container);
            updateChatBadge(0);
        } catch (err) {
            // Chat is a nice-to-have widget -- a network hiccup shouldn't surface an error
        }
    }

    function updateChatBadge(count) {
        const badge = document.getElementById('chatBubbleBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    async function pollChatUnread() {
        try {
            const res = await fetch('/api/chat/unread-count', { headers: chatHeaders() });
            const result = await res.json();
            if (result.success) updateChatBadge(result.data.count);
        } catch (err) {
            // ignore -- badge just won't update this tick
        }
    }

    function setupChatBubble() {
        const bubbleBtn = document.getElementById('chatBubbleBtn');
        const panel = document.getElementById('chatPanel');
        const closeBtn = document.getElementById('closeChatPanel');
        const form = document.getElementById('chatForm');
        const input = document.getElementById('chatInput');
        const messages = document.getElementById('chatMessages');
        if (!bubbleBtn || !panel || !form || !input || !messages) return;

        const isLoggedIn = !!localStorage.getItem('token');

        function openPanel() {
            panel.classList.add('open');

            // Visitors browsing the public marketing page without an account
            // can't have a conversation yet -- chat is tied to a customer record.
            if (!isLoggedIn) {
                messages.innerHTML = '<div class="chat-message bot">Please <a href="account.html">log in</a> to chat with our support team.</div>';
                input.disabled = true;
                return;
            }

            loadChatMessages(messages);
            // Polls while the panel is open so an admin's reply appears without the
            // customer having to close/reopen the widget.
            if (!chatPollTimer) chatPollTimer = setInterval(() => loadChatMessages(messages), 4000);
        }

        function closePanel() {
            panel.classList.remove('open');
            clearInterval(chatPollTimer);
            chatPollTimer = null;
        }

        bubbleBtn.addEventListener('click', () => {
            if (panel.classList.contains('open')) closePanel(); else openPanel();
        });
        closeBtn?.addEventListener('click', closePanel);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!isLoggedIn) return;
            const text = input.value.trim();
            if (!text) return;
            input.value = '';

            try {
                const res = await fetch('/api/chat/messages', {
                    method: 'POST',
                    headers: chatHeaders(),
                    body: JSON.stringify({ message: text })
                });
                const result = await res.json();
                if (result.success) await loadChatMessages(messages);
            } catch (err) {
                // ignore -- message just won't send this attempt
            }
        });

        // Exposed so a hosting page (e.g. the dashboard's tab switcher) can
        // shut down polling when it hides the widget rather than leaving an
        // interval running behind a display:none container.
        window.SwiftShipChat = { close: closePanel };

        if (isLoggedIn) {
            // Checked regardless of whether the panel is open, so the badge reflects
            // a new admin reply even while the customer is elsewhere on the page.
            pollChatUnread();
            setInterval(pollChatUnread, 15000);
        }
    }

    setupChatBubble();
})();
