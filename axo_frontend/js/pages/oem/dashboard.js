/* =============================================================
   AXO NETWORKS — OEM DASHBOARD
   pages/oem/dashboard.js

   Backend endpoints used:
     GET /api/oem/dashboard/stats
       → { kpis, charts.order_status_distribution,
            charts.monthly_volume_trend, heatmap, live_orders }
     GET /api/oem/notifications
       → { notifications }
     POST /api/oem/notifications/mark-read
       → { success }
     POST /api/oem/notifications/mark-all-read
       → { success }

   Sections on this page:
   - KPI cards   : active RFQs, quotes pending, active orders, delayed
   - Charts      : order status donut + monthly value trend line
   - Heatmap     : bottleneck severity bars
   - Live orders : latest 5 POs with click-through to detail page
   - Notifications : bell icon with panel and toast messages
   ============================================================= */

import Router   from "../../core/router.js";
import API      from "../../core/api.js";
import Auth     from "../../core/auth.js";
import Toast    from "../../core/toast.js";
import CONFIG   from "../../core/config.js";
import {
  sanitizeHTML,
  formatCurrency,
  formatDate,
  formatStatus,
  getStatusClass,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard — OEM + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  charts: {
    orderStatus: null,
    monthly:     null,
  },
  refreshTimer: null,
  notificationTimer: null,
  REFRESH_INTERVAL_MS: 60_000,
  NOTIFICATION_REFRESH_MS: 30_000,
  notifications: [],
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)         => document.getElementById(id);
const setText = (id, text)   => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html)   => { const n = el(id); if (n) n.innerHTML   = html; };

// KPI skeleton — pulsing placeholder while data loads
const _setKpiLoading = () => {
  ["activeRfqs", "quotesPending", "activeOrders", "delayedOrders"].forEach(
    (id) => setText(id, "—")
  );
};

// Table loading row
const _tableLoading = (cols) => `
  <tr class="table-skeleton">
    <td colspan="${cols}">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
     </td>
   </tr>`;

const _tableEmpty = (cols, msg = "No records found.") => `
   <tr>
    <td colspan="${cols}" class="table-empty">
      <span class="table-empty__icon">📭</span>
      <span>${msg}</span>
     </td>
   </tr>`;

// =================================================================
// NOTIFICATION SYSTEM
// =================================================================

// Get icon by notification type
const getNotificationIcon = (type) => {
  switch(type) {
    case 'success': return 'fa-check-circle';
    case 'warning': return 'fa-exclamation-triangle';
    case 'danger': return 'fa-times-circle';
    case 'info': return 'fa-info-circle';
    default: return 'fa-bell';
  }
};

// Update notification badge count
const updateNotificationBadge = () => {
  const badge = document.querySelector('.notification-badge');
  if (!badge) return;
  
  const unreadCount = State.notifications.filter(n => !n.read).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.style.display = 'flex';
    badge.style.animation = 'badge-pop .3s var(--ease-spring)';
  } else {
    badge.style.display = 'none';
  }
};

// Render notifications in panel
const renderNotifications = () => {
  const notificationList = document.querySelector('.notification-list');
  if (!notificationList) return;
  
  if (!State.notifications.length) {
    notificationList.innerHTML = `
      <div class="notification-empty">
        <i class="fas fa-bell-slash"></i>
        <p>No notifications</p>
      </div>
    `;
    return;
  }
  
  const unreadNotifications = State.notifications.filter(n => !n.read);
  const readNotifications = State.notifications.filter(n => n.read);
  const allNotifications = [...unreadNotifications, ...readNotifications];
  
  notificationList.innerHTML = allNotifications.map(notification => `
    <div class="notification-item ${!notification.read ? 'unread' : ''}" data-id="${notification.id}">
      <div class="notification-item__icon notification-item__icon--${notification.type}">
        <i class="fas ${getNotificationIcon(notification.type)}"></i>
      </div>
      <div class="notification-item__content">
        <div class="notification-item__title">${sanitizeHTML(notification.title)}</div>
        <div class="notification-item__message">${sanitizeHTML(notification.message)}</div>
        <div class="notification-item__time">${sanitizeHTML(notification.time)}</div>
      </div>
    </div>
  `).join('');
  
  // Add click event to notification items
  document.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      markNotificationAsRead(id);
    });
  });
};

// Mark single notification as read
const markNotificationAsRead = async (id) => {
  const notification = State.notifications.find(n => n.id === id);
  if (!notification || notification.read) return;
  
  try {
    // Call API to mark as read
    await API.post("/oem/notifications/mark-read", { id });
    
    // Update local state
    notification.read = true;
    renderNotifications();
    updateNotificationBadge();
    
    showToast('info', 'Notification Read', 'Marked as read');
  } catch (err) {
    console.error('Error marking notification as read:', err);
  }
};

// Mark all notifications as read
const markAllNotificationsAsRead = async () => {
  try {
    await API.post("/oem/notifications/mark-all-read");
    
    State.notifications.forEach(n => { n.read = true; });
    renderNotifications();
    updateNotificationBadge();
    
    showToast('success', 'All Read', 'All notifications marked as read');
  } catch (err) {
    console.error('Error marking all as read:', err);
    Toast.error('Failed to mark all as read');
  }
};

// Clear all notifications
const clearAllNotifications = async () => {
  try {
    await API.post("/oem/notifications/clear-all");
    
    State.notifications = [];
    renderNotifications();
    updateNotificationBadge();
    
    showToast('info', 'Cleared', 'All notifications cleared');
  } catch (err) {
    console.error('Error clearing notifications:', err);
    Toast.error('Failed to clear notifications');
  }
};

// Show toast notification
const showToast = (type, title, message, duration = 5000) => {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) return;
  
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
      <div class="toast__title">${sanitizeHTML(title)}</div>
      <div class="toast__message">${sanitizeHTML(message)}</div>
    </div>
    <button class="toast__close">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  toastContainer.appendChild(toast);
  
  // Add close button functionality
  const closeBtn = toast.querySelector('.toast__close');
  closeBtn.addEventListener('click', () => {
    toast.style.animation = 'toast-out .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  });
  
  // Auto remove after duration
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'toast-out .3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
};

// Open notification panel
const openNotificationPanel = () => {
  const panel = document.querySelector('.notification-panel');
  const overlay = document.querySelector('.notification-overlay');
  if (panel && overlay) {
    panel.classList.add('open');
    overlay.classList.add('open');
    renderNotifications();
  }
};

// Close notification panel
const closeNotificationPanel = () => {
  const panel = document.querySelector('.notification-panel');
  const overlay = document.querySelector('.notification-overlay');
  if (panel && overlay) {
    panel.classList.remove('open');
    overlay.classList.remove('open');
  }
};

// Fetch notifications from API
const fetchNotifications = async () => {
  try {
    const data = await API.get("/oem/notifications");
    State.notifications = data.notifications || [];
    renderNotifications();
    updateNotificationBadge();
  } catch (err) {
    console.error('Error fetching notifications:', err);
    // Don't show error toast for silent refresh
  }
};

// Add sample notification (for testing - remove in production)
const addSampleNotification = (title, message, type = 'info') => {
  const newNotification = {
    id: Date.now(),
    title: title,
    message: message,
    time: 'Just now',
    type: type,
    read: false
  };
  State.notifications.unshift(newNotification);
  renderNotifications();
  updateNotificationBadge();
  showToast(type, title, message);
};

// =================================================================
// RENDER — KPI CARDS
// =================================================================
const renderKPIs = (kpis = {}) => {
  setText("activeRfqs",    kpis.active_rfqs    ?? 0);
  setText("quotesPending", kpis.quotes_pending ?? 0);
  setText("activeOrders",  kpis.active_orders  ?? 0);
  setText("delayedOrders", kpis.delayed_orders ?? 0);
};

// =================================================================
// RENDER — ORDER STATUS DOUGHNUT
// =================================================================
const renderOrderStatusChart = (orderStatus = []) => {
  const canvas = el("orderStatusChart");
  if (!canvas || !window.Chart) return;

  // Destroy previous instance before creating new one
  if (State.charts.orderStatus) {
    State.charts.orderStatus.destroy();
    State.charts.orderStatus = null;
  }

  const hasData = orderStatus.length > 0;

  const labels = hasData
    ? orderStatus.map((item) => formatStatus(item.status))
    : ["No Orders Yet"];

  const counts = hasData
    ? orderStatus.map((item) => parseInt(item.count) || 0)
    : [1];

  const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  State.charts.orderStatus = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data:            counts,
        backgroundColor: hasData ? colors.slice(0, counts.length) : ["#e5e7eb"],
        borderWidth:     0,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels:   { font: { size: 11 }, padding: 16 },
        },
      },
    },
  });
};

// =================================================================
// RENDER — MONTHLY VALUE TREND LINE
// =================================================================
const renderMonthlyTrendChart = (trend = []) => {
  const canvas = el("monthlyTrendChart");
  if (!canvas || !window.Chart) return;

  if (State.charts.monthly) {
    State.charts.monthly.destroy();
    State.charts.monthly = null;
  }

  const labels = trend.map((m) => m.month);
  const values = trend.map((m) => parseFloat(m.total_value) || 0);

  State.charts.monthly = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: labels.length ? labels : [],
      datasets: [{
        label:           "Order Value (USD)",
        data:            values,
        borderColor:     "#6366f1",
        backgroundColor: "rgba(99,102,241,0.06)",
        borderWidth:     2,
        pointRadius:     4,
        pointHoverRadius: 6,
        fill:            true,
        tension:         0.4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => formatCurrency(v, "USD"),
          },
        },
      },
    },
  });
};

// =================================================================
// RENDER — BOTTLENECK HEATMAP
// =================================================================
const renderHeatmap = (heatmapData = []) => {
  const container = el("bottleneckHeatmap");
  if (!container) return;

  // Backend always returns 3 rows even with 0 values — use them
  const data = heatmapData.length ? heatmapData : [
    { name: "Delayed Milestones",    value: 0, severity: "high"   },
    { name: "Raw Material Shortages", value: 0, severity: "medium" },
    { name: "QC Hold",               value: 0, severity: "low"    },
  ];

  const max = Math.max(...data.map((d) => parseInt(d.value) || 0), 1);

  container.innerHTML = data.map((item) => {
    const pct = Math.round(((parseInt(item.value) || 0) / max) * 100);
    return `
      <div class="heatmap-item">
        <span class="heatmap-item__label">${sanitizeHTML(item.name)}</span>
        <div class="heatmap-item__track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="heatmap-item__fill heatmap-item__fill--${sanitizeHTML(item.severity)}" style="width:${pct}%"></div>
        </div>
        <span class="heatmap-item__value">${parseInt(item.value) || 0}</span>
      </div>`;
  }).join("");
};

// =================================================================
// RENDER — LIVE ORDERS TABLE
// =================================================================
const renderLiveOrders = (orders = []) => {
  const tbody = el("liveOrdersList");
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = _tableEmpty(6, "No active orders. Create an RFQ to get started.");
    return;
  }

  tbody.innerHTML = orders.map((order) => {
    const statusClass = getStatusClass(order.status);
    // Detail page URL — id passed as query param
    const detailUrl = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${order.id}`;

    return `
      <tr class="tr-clickable js-order-row" data-href="${detailUrl}" role="button" tabindex="0" aria-label="View order ${sanitizeHTML(order.po_number)}">
        <td><strong>${sanitizeHTML(order.po_number || "—")}</strong></td>
        <td>${sanitizeHTML(order.part_name    || "—")}</td>
        <td>${sanitizeHTML(order.supplier_name || "—")}</td>
        <td>${order.quantity ?? "—"}</td>
        <td>
          <span class="badge badge--${statusClass}">
            ${formatStatus(order.status)}
          </span>
        </td>
        <td>
          <a href="${detailUrl}" class="link-primary">View →</a>
        </td>
       </tr>`;
  }).join("");
};

// =================================================================
// DATA LOADER
// =================================================================
const loadDashboard = async () => {
  _setKpiLoading();
  setHTML("liveOrdersList", _tableLoading(6));

  try {
    const data = await API.get("/oem/dashboard/stats");

    renderKPIs(data.kpis);
    renderOrderStatusChart(data.charts?.order_status_distribution);
    renderMonthlyTrendChart(data.charts?.monthly_volume_trend);
    renderHeatmap(data.heatmap);
    renderLiveOrders(data.live_orders);

  } catch (err) {
    Toast.error(err.message || "Failed to load dashboard data.");

    // Render zeroes so UI isn't broken
    renderKPIs({});
    renderHeatmap([]);
    renderLiveOrders([]);
  }
};

// =================================================================
// AUTO-REFRESH
// =================================================================
const startAutoRefresh = () => {
  State.refreshTimer = setInterval(loadDashboard, State.REFRESH_INTERVAL_MS);
  State.notificationTimer = setInterval(fetchNotifications, State.NOTIFICATION_REFRESH_MS);
};

const stopAutoRefresh = () => {
  if (State.refreshTimer) {
    clearInterval(State.refreshTimer);
    State.refreshTimer = null;
  }
  if (State.notificationTimer) {
    clearInterval(State.notificationTimer);
    State.notificationTimer = null;
  }
};

// Stop refresh when user navigates away — prevents memory leak
window.addEventListener("pagehide", stopAutoRefresh);

// =================================================================
// EVENT LISTENERS
// =================================================================
const bindEvents = () => {

  // ── Clickable order rows (keyboard + mouse) ───────────────────
  // Using delegation — rows are rendered dynamically
  el("liveOrdersList")?.addEventListener("click", (e) => {
    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  el("liveOrdersList")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  // ── Quick-action nav buttons (if present in HTML) ─────────────
  el("btnCreateRfq")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.OEM_RFQ;
  });

  el("btnViewOrders")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.OEM_ORDERS;
  });

  // ── Sidebar / topbar ─────────────────────────────────────────
  el("logoutBtn")?.addEventListener("click", () => Auth.logout());

  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
  
  // ── Notification Bell ─────────────────────────────────────────
  const notificationBell = document.querySelector('.notification-bell');
  if (notificationBell) {
    notificationBell.addEventListener('click', (e) => {
      e.stopPropagation();
      openNotificationPanel();
    });
  }
  
  // ── Notification Overlay (close when clicking outside) ─────────
  const notificationOverlay = document.querySelector('.notification-overlay');
  if (notificationOverlay) {
    notificationOverlay.addEventListener('click', closeNotificationPanel);
  }
  
  // ── Mark All Read Button ──────────────────────────────────────
  const markAllReadBtn = document.querySelector('.mark-all-read');
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
  }
  
  // ── Clear All Button ──────────────────────────────────────────
  const clearAllBtn = document.querySelector('.clear-all');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllNotifications);
  }
  
  // ── Close panel on ESC key ────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeNotificationPanel();
    }
  });
};

// =================================================================
// INIT
// =================================================================
const init = () => {
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "OEM Partner");
  setText("userCompany", user?.company_name || "OEM Partner");

  bindEvents();
  loadDashboard();
  fetchNotifications();  // Load initial notifications
  startAutoRefresh();
  
  // Optional: Add a welcome notification (remove in production)
  setTimeout(() => {
    addSampleNotification('Welcome to OEM Portal', 'Your dashboard is ready', 'success');
  }, 1000);
};

document.addEventListener("DOMContentLoaded", init);
