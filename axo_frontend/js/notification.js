const API_URL = 'https://axonetworks.com/api';

let notificationsList = [];

async function loadNotifications() {
    try {
        const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
        if (!token) return;

        // Get unread count
        const countResponse = await fetch(`${API_URL}/notifications/unread/count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (countResponse.ok) {
            const data = await countResponse.json();
            const badge = document.getElementById('notificationCount');
            if (badge) {
                const count = data.unread_count || 0;
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
        }

        // Get all notifications
        const listResponse = await fetch(`${API_URL}/notifications?limit=20`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (listResponse.ok) {
            const data = await listResponse.json();
            notificationsList = data.notifications || [];
            renderNotificationList();
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function renderNotificationList() {
    const container = document.getElementById('notificationList');
    if (!container) return;

    if (notificationsList.length === 0) {
        container.innerHTML = '<div class="notification-empty"><i class="fas fa-bell-slash"></i><p>No notifications</p></div>';
        return;
    }

    container.innerHTML = notificationsList.map(notif => `
        <div class="notification-item ${!notif.is_read ? 'unread' : ''}" data-id="${notif.id}">
            <div class="notification-title">${escapeHtml(notif.title)}</div>
            <div class="notification-message">${escapeHtml(notif.message)}</div>
            <div class="notification-time">${notif.time_ago || 'Just now'}</div>
        </div>
    `).join('');

    // Add click handlers to mark as read
    container.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.dataset.id;
            await markAsRead(id);
        });
    });
}

async function markAsRead(notificationId) {
    try {
        const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
        await fetch(`${API_URL}/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        loadNotifications();
    } catch (error) {
        console.error('Error marking as read:', error);
    }
}

function setupNotificationPanel() {
    const notificationBell = document.getElementById('notificationBell');
    const notificationPanel = document.getElementById('notificationPanel');
    const notificationOverlay = document.getElementById('notificationOverlay');

    if (!notificationBell || !notificationPanel) {
        return;
    }

    // Remove existing listeners and add new one
    const newBell = notificationBell.cloneNode(true);
    notificationBell.parentNode.replaceChild(newBell, notificationBell);

    newBell.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationPanel.classList.toggle('open');
        if (notificationOverlay) notificationOverlay.classList.toggle('show');
        loadNotifications();
    });

    if (notificationOverlay) {
        notificationOverlay.addEventListener('click', () => {
            notificationPanel.classList.remove('open');
            notificationOverlay.classList.remove('show');
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && notificationPanel.classList.contains('open')) {
            notificationPanel.classList.remove('open');
            if (notificationOverlay) notificationOverlay.classList.remove('show');
        }
    });

    // Mark all as read button
    const markAllBtn = document.getElementById('markAllRead');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            try {
                const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
                await fetch(`${API_URL}/notifications/read-all`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                loadNotifications();
            } catch (error) { console.error('Error:', error); }
        });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadNotifications();
        setupNotificationPanel();
    });
} else {
    loadNotifications();
    setupNotificationPanel();
}

// Auto-refresh every 30 seconds
setInterval(loadNotifications, 30000);
