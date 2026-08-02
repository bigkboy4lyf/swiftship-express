// =============================================
// SUPPORT TICKET STORE
// =============================================
// Front-end only for now -- no backend endpoint exists yet, so tickets live
// in localStorage. Both dashboard.html (customer) and admin.html (admin)
// load this file and share the same 'swiftship_tickets' key, which is enough
// to demo the full submit -> review -> resolve/reopen flow in one browser
// while the real API is still being wired up.
(function() {
    const STORAGE_KEY = 'swiftship_tickets';

    function readAll() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (err) {
            return [];
        }
    }

    function writeAll(tickets) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
    }

    function generateId() {
        const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        return 'TCK-' + hex.toUpperCase();
    }

    window.TicketStore = {
        getAll() {
            return readAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        },

        getByUser(userId) {
            return this.getAll().filter(t => t.userId === userId);
        },

        getById(id) {
            return readAll().find(t => t.id === id) || null;
        },

        create({ userId, userName, userEmail, issueType, subject, message }) {
            const ticket = {
                id: generateId(),
                userId,
                userName,
                userEmail,
                issueType,
                subject,
                message,
                status: 'open',
                createdAt: new Date().toISOString(),
                closedAt: null,
                resolutionNote: null
            };
            const tickets = readAll();
            tickets.push(ticket);
            writeAll(tickets);
            return ticket;
        },

        resolve(id, resolutionNote) {
            const tickets = readAll();
            const ticket = tickets.find(t => t.id === id);
            if (!ticket) return null;
            ticket.status = 'closed';
            ticket.resolutionNote = resolutionNote;
            ticket.closedAt = new Date().toISOString();
            writeAll(tickets);
            return ticket;
        },

        reopen(id) {
            const tickets = readAll();
            const ticket = tickets.find(t => t.id === id);
            if (!ticket) return null;
            ticket.status = 'open';
            ticket.closedAt = null;
            ticket.resolutionNote = null;
            writeAll(tickets);
            return ticket;
        }
    };
})();
