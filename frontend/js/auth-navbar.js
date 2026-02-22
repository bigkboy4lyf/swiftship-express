(function() {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(enhanceNavbar, 100);
    });

    function enhanceNavbar() {
        const navLinks = document.getElementById('navLinks');
        const signInItem = document.getElementById('signInItem');
        
        // If these IDs aren't in your HTML, the script stops safely
        if (!navLinks || !signInItem) return;

        const user = localStorage.getItem('user');
        
        if (user) {
            showLoggedInUI();
        } else {
            showLoggedOutUI();
        }

        // Keep your original logic for tab synchronization
        window.addEventListener('storage', function(e) {
            if (e.key === 'user') {
                e.newValue ? showLoggedInUI() : showLoggedOutUI();
            }
        });
    }

    function showLoggedInUI() {
        const signInItem = document.getElementById('signInItem');
        const navLinks = document.getElementById('navLinks');
        
        // 1. Hide the Sign In link (don't delete it, just hide it)
        if (signInItem) signInItem.style.display = 'none';

        // 2. Add Dashboard and Logout if they don't exist
        if (!document.getElementById('logoutItem')) {
            const authHtml = `
                <li id="dashboardItem"><a href="dashboard.html">Dashboard</a></li>
                <li id="logoutItem">
                    <a href="#" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> Logout</a>
                </li>
            `;
            // This inserts them exactly where the Sign In link was
            signInItem.insertAdjacentHTML('afterend', authHtml);

            document.getElementById('logoutBtn').addEventListener('click', function(e) {
                e.preventDefault();
                window.logout();
            });
        }
    }

    function showLoggedOutUI() {
        const signInItem = document.getElementById('signInItem');
        const logoutItem = document.getElementById('logoutItem');
        const dashboardItem = document.getElementById('dashboardItem');

        if (signInItem) signInItem.style.display = 'block';
        if (logoutItem) logoutItem.remove();
        if (dashboardItem) dashboardItem.remove();
    }

    // Keep your global logout function
    if (typeof window.logout !== 'function') {
        window.logout = function() {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        };
    }
})();