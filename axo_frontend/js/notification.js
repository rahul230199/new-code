const API_URL = 'https://axonetworks.com/api';

async function loadNotifications() {
    try {
        const token = localStorage.getItem('adminToken');
        if (!token) return;
        
        const response = await fetch(`${API_URL}/notifications/unread/count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            const badge = document.getElementById('notificationCount');
            if (badge) badge.textContent = data.unread_count || 0;
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function setupNotificationPanel() {
    const notificationBell = document.getElementById('notificationBell');
    const notificationPanel = document.getElementById('notificationPanel');
    const notificationOverlay = document.getElementById('notificationOverlay');
    
    if (!notificationBell || !notificationPanel) return;
    
    notificationBell.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationPanel.classList.toggle('open');
        if (notificationOverlay) notificationOverlay.classList.toggle('show');
    });
    
    if (notificationOverlay) {
        notificationOverlay.addEventListener('click', () => {
            notificationPanel.classList.remove('open');
            notificationOverlay.classList.remove('show');
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && notificationPanel.classList.contains('open')) {
            notificationPanel.classList.remove('open');
            if (notificationOverlay) notificationOverlay.classList.remove('show');
        }
    });
    
    const markAllBtn = document.getElementById('markAllRead');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            try {
                await fetch(`${API_URL}/notifications/read-all`, {
                    method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }
                });
                loadNotifications();
            } catch (error) { console.error('Error:', error); }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadNotifications();
    setupNotificationPanel();
    setInterval(loadNotifications, 30000);
});
