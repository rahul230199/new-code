/* =============================================================
   NOTIFICATION SYSTEM - OEM PORTAL
   Fixed: Mark as read persists, no duplicate notifications
   Improved CSS for better visual design
   ============================================================= */

const API_URL = window.location.origin || 'https://axonetworks.com/api';

let notificationsList = [];
let isPanelOpen = false;
let markedAsReadIds = new Set(); // Track marked as read IDs

// DOM Elements
const getNotificationBell = () => document.querySelector('.notification-bell');
const getNotificationPanel = () => document.getElementById('notificationPanel');
const getNotificationOverlay = () => document.getElementById('notificationOverlay');
const getNotificationList = () => document.getElementById('notificationList');
const getNotificationBadge = () => document.querySelector('.notification-badge');
const getMarkAllBtn = () => document.getElementById('markAllRead');

// Helper: Get auth token
function getToken() {
    return localStorage.getItem('axo_access_token') || 
           localStorage.getItem('adminToken') || 
           localStorage.getItem('token');
}

// Helper: Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Get icon based on notification type
function getNotificationIcon(type) {
    switch(type) {
        case 'success': return 'fa-check-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'danger': return 'fa-times-circle';
        case 'info': return 'fa-info-circle';
        default: return 'fa-bell';
    }
}

// Get color class based on notification type
function getNotificationColorClass(type) {
    switch(type) {
        case 'success': return 'notification-item__icon--success';
        case 'warning': return 'notification-item__icon--warning';
        case 'danger': return 'notification-item__icon--danger';
        case 'info': return 'notification-item__icon--info';
        default: return 'notification-item__icon--info';
    }
}

// =============================================================
// Toast Notifications (Improved)
// =============================================================

function showToast(type, title, message, duration = 4000) {
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
        <div class="toast__icon">
            <i class="fas ${icons[type] || 'fa-bell'}"></i>
        </div>
        <div class="toast__content">
            <div class="toast__title">${escapeHtml(title)}</div>
            <div class="toast__message">${escapeHtml(message)}</div>
        </div>
        <button class="toast__close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Add entrance animation
    toast.style.animation = 'toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
    
    const closeBtn = toast.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => {
        toast.style.animation = 'toast-out 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    });
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'toast-out 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

// =============================================================
// Load Notifications from API
// =============================================================

async function loadNotifications() {
    try {
        const token = getToken();
        if (!token) {
            useSampleNotifications();
            return;
        }

        // Get unread count
        try {
            const countResponse = await fetch(`${API_URL}/api/oem/notifications/unread/count`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (countResponse.ok) {
                const data = await countResponse.json();
                const badge = getNotificationBadge();
                if (badge) {
                    const count = data.unread_count || 0;
                    badge.textContent = count;
                    badge.style.display = count > 0 ? 'flex' : 'flex';
                }
            }
        } catch (e) {
            console.log('Unread count endpoint not available');
        }

        // Get all notifications
        try {
            const listResponse = await fetch(`${API_URL}/api/oem/notifications?limit=20`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (listResponse.ok) {
                const data = await listResponse.json();
                notificationsList = data.notifications || [];
                renderNotificationList();
                updateBadgeCount();
                return;
            }
        } catch (e) {
            console.log('Notifications endpoint not available');
        }
        
        useSampleNotifications();
        
    } catch (error) {
        console.error('Error loading notifications:', error);
        useSampleNotifications();
    }
}

// Sample notifications (only shown once)
let sampleNotificationsLoaded = false;

function useSampleNotifications() {
    if (sampleNotificationsLoaded) return;
    
    // Load saved read status from localStorage
    const savedReadIds = localStorage.getItem('read_notification_ids');
    if (savedReadIds) {
        markedAsReadIds = new Set(JSON.parse(savedReadIds));
    }
    
    notificationsList = [
        {
            id: 1,
            title: "🎉 Welcome to AXO Networks",
            message: "Welcome to the OEM Portal! Start by creating an RFQ to connect with top suppliers.",
            time_ago: "Just now",
            is_read: markedAsReadIds.has(1),
            type: "success"
        },
        {
            id: 2,
            title: "📋 New Quote Received",
            message: "You have received a new quote for RFQ-001 from ABC Electronics. Review it now.",
            time_ago: "2 hours ago",
            is_read: markedAsReadIds.has(2),
            type: "info"
        },
        {
            id: 3,
            title: "🚚 Order Status Update",
            message: "PO-2024-001 status has been changed to 'In Production' by the supplier.",
            time_ago: "Yesterday",
            is_read: markedAsReadIds.has(3),
            type: "warning"
        },
        {
            id: 4,
            title: "✅ Milestone Completed",
            message: "Production milestone for Order #PO-2024-002 has been marked as complete.",
            time_ago: "2 days ago",
            is_read: markedAsReadIds.has(4),
            type: "success"
        },
        {
            id: 5,
            title: "⚠️ Quality Check Required",
            message: "Quality check is pending for Order #PO-2024-003. Please review.",
            time_ago: "3 days ago",
            is_read: markedAsReadIds.has(5),
            type: "danger"
        }
    ];
    
    sampleNotificationsLoaded = true;
    renderNotificationList();
    updateBadgeCount();
}

// Update badge count
function updateBadgeCount() {
    const badge = getNotificationBadge();
    if (!badge) return;
    
    const unreadCount = notificationsList.filter(n => !n.is_read).length;
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'flex';
        // Add bounce animation for new notifications
        badge.style.animation = 'badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        setTimeout(() => {
            if (badge) badge.style.animation = '';
        }, 300);
    } else {
        badge.textContent = '0';
        badge.style.display = 'flex';
    }
}

// =============================================================
// Save read status to localStorage
// =============================================================

function saveReadStatus() {
    const readIds = Array.from(markedAsReadIds);
    localStorage.setItem('read_notification_ids', JSON.stringify(readIds));
}

// =============================================================
// Render Notifications in Panel (Improved UI)
// =============================================================

function renderNotificationList() {
    const container = getNotificationList();
    if (!container) return;

    if (notificationsList.length === 0) {
        container.innerHTML = `
            <div class="notification-empty">
                <div class="notification-empty__icon">
                    <i class="fas fa-bell-slash"></i>
                </div>
                <p>No notifications yet</p>
                <span>New notifications will appear here</span>
            </div>
        `;
        return;
    }

    // Separate unread and read
    const unreadNotifications = notificationsList.filter(n => !n.is_read);
    const readNotifications = notificationsList.filter(n => n.is_read);
    const allNotifications = [...unreadNotifications, ...readNotifications];

    container.innerHTML = allNotifications.map(notif => `
        <div class="notification-item ${!notif.is_read ? 'unread' : 'read'}" data-id="${notif.id}">
            <div class="notification-item__icon ${getNotificationColorClass(notif.type || 'info')}">
                <i class="fas ${getNotificationIcon(notif.type || 'info')}"></i>
            </div>
            <div class="notification-item__content">
                <div class="notification-item__title">${escapeHtml(notif.title)}</div>
                <div class="notification-item__message">${escapeHtml(notif.message)}</div>
                <div class="notification-item__time">
                    <i class="far fa-clock"></i> ${escapeHtml(notif.time_ago || 'Just now')}
                </div>
            </div>
            ${!notif.is_read ? `
                <button class="notification-item__mark-read" data-id="${notif.id}" title="Mark as read">
                    <i class="fas fa-check"></i>
                </button>
            ` : `
                <div class="notification-item__read-badge">
                    <i class="fas fa-check-circle"></i>
                </div>
            `}
        </div>
    `).join('');

    // Add click handlers for mark as read buttons
    document.querySelectorAll('.notification-item__mark-read').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            await markAsRead(id);
        });
    });

    // Add click handlers for notification items
    container.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            // Don't trigger if clicking on the mark-read button
            if (e.target.closest('.notification-item__mark-read')) return;
            const id = parseInt(item.dataset.id);
            const notification = notificationsList.find(n => n.id === id);
            if (notification && !notification.is_read) {
                await markAsRead(id);
            }
        });
    });
}

// =============================================================
// Mark Notification as Read (Fixed - won't show again)
// =============================================================

async function markAsRead(notificationId) {
    const notification = notificationsList.find(n => n.id === notificationId);
    if (!notification || notification.is_read) return;

    try {
        const token = getToken();
        if (token) {
            await fetch(`${API_URL}/api/oem/notifications/${notificationId}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(e => console.log('API not available, using local storage'));
        }
        
        // Update local state
        notification.is_read = true;
        markedAsReadIds.add(notificationId);
        saveReadStatus();
        
        // Re-render the list
        renderNotificationList();
        updateBadgeCount();
        
        // Show success toast
        showToast('success', 'Marked as Read', `"${notification.title}" has been marked as read`);
        
    } catch (error) {
        console.error('Error marking as read:', error);
        // Still update UI
        notification.is_read = true;
        markedAsReadIds.add(notificationId);
        saveReadStatus();
        renderNotificationList();
        updateBadgeCount();
        showToast('success', 'Marked as Read', `"${notification.title}" has been marked as read`);
    }
}

// =============================================================
// Mark All as Read (Fixed)
// =============================================================

async function markAllAsRead() {
    const unreadNotifications = notificationsList.filter(n => !n.is_read);
    if (unreadNotifications.length === 0) {
        showToast('info', 'No Unread', 'All notifications are already read');
        return;
    }

    try {
        const token = getToken();
        if (token) {
            await fetch(`${API_URL}/api/oem/notifications/read-all`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(e => console.log('API not available, using local storage'));
        }
        
        // Update all notifications
        notificationsList.forEach(n => { 
            if (!n.is_read) {
                n.is_read = true;
                markedAsReadIds.add(n.id);
            }
        });
        saveReadStatus();
        
        renderNotificationList();
        updateBadgeCount();
        showToast('success', 'All Read', `${unreadNotifications.length} notification${unreadNotifications.length > 1 ? 's' : ''} marked as read`);
        
    } catch (error) {
        console.error('Error marking all as read:', error);
        notificationsList.forEach(n => { 
            if (!n.is_read) {
                n.is_read = true;
                markedAsReadIds.add(n.id);
            }
        });
        saveReadStatus();
        renderNotificationList();
        updateBadgeCount();
        showToast('success', 'All Read', `${unreadNotifications.length} notification${unreadNotifications.length > 1 ? 's' : ''} marked as read`);
    }
}

// =============================================================
// Setup Notification Panel
// =============================================================

function setupNotificationPanel() {
    const notificationBell = getNotificationBell();
    const notificationPanel = getNotificationPanel();
    const notificationOverlay = getNotificationOverlay();
    const markAllBtn = getMarkAllBtn();

    if (!notificationBell || !notificationPanel) {
        setTimeout(setupNotificationPanel, 500);
        return;
    }

    // Toggle panel on bell click
    notificationBell.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (isPanelOpen) {
            notificationPanel.classList.remove('open');
            if (notificationOverlay) notificationOverlay.classList.remove('open');
            isPanelOpen = false;
        } else {
            notificationPanel.classList.add('open');
            if (notificationOverlay) notificationOverlay.classList.add('open');
            isPanelOpen = true;
            loadNotifications();
        }
    });

    // Close on overlay click
    if (notificationOverlay) {
        notificationOverlay.addEventListener('click', () => {
            notificationPanel.classList.remove('open');
            notificationOverlay.classList.remove('open');
            isPanelOpen = false;
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isPanelOpen) {
            notificationPanel.classList.remove('open');
            if (notificationOverlay) notificationOverlay.classList.remove('open');
            isPanelOpen = false;
        }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (isPanelOpen && 
            !notificationPanel.contains(e.target) && 
            !notificationBell.contains(e.target)) {
            notificationPanel.classList.remove('open');
            if (notificationOverlay) notificationOverlay.classList.remove('open');
            isPanelOpen = false;
        }
    });

    // Mark all as read button
    if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            markAllAsRead();
        });
    }
}

// =============================================================
// Add New Notification (for real-time updates)
// =============================================================

function addNewNotification(title, message, type = 'info') {
    const newNotification = {
        id: Date.now(),
        title: title,
        message: message,
        time_ago: 'Just now',
        is_read: false,
        type: type
    };
    notificationsList.unshift(newNotification);
    renderNotificationList();
    updateBadgeCount();
    showToast(type, title, message);
    
    // Also play notification sound (optional)
    // playNotificationSound();
}

// Make available globally
window.addNotification = addNewNotification;
window.notificationsList = () => notificationsList;

// =============================================================
// Initialize
// =============================================================

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
setInterval(() => {
    if (!isPanelOpen) {
        loadNotifications();
    }
}, 30000);

// Refresh when page becomes visible
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadNotifications();
    }
});
