/* =============================================================
   AXO NETWORKS — ORDER TIMELINE & AUDIT TRAIL
   pages/oem/order-timeline.js

   PRD Alignment: Page 6 (Order Timeline) & Page 7 (Audit Trail)
   
   Features:
   - Immutable activity timeline (cannot be edited or deleted)
   - Real-time activity feed
   - Filter activities by type (status changes, documents, messages)
   - Export audit trail as CSV/PDF
   - View detailed activity information
   - Timestamp and user attribution for every action
   
   Backend endpoints:
     GET  /api/oem/orders/:orderId/timeline     → Get activity timeline
     GET  /api/oem/orders/:orderId/audit-trail  → Get full audit trail
     GET  /api/oem/orders/:orderId/activities/filter → Filter activities
   ============================================================= */

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getQueryParam,
  debounce,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard — OEM + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// ACTIVITY TYPE CONFIGURATION (PRD Page 6 Timeline Examples)
// =================================================================
const ACTIVITY_TYPES = {
  // Quote to PO Actions
  QUOTE_ACCEPTED: { icon: "fa-check-circle", color: "success", label: "Quote Accepted" },
  PO_CREATED: { icon: "fa-file-invoice", color: "primary", label: "PO Created" },
  PO_DRAFT_SAVED: { icon: "fa-save", color: "info", label: "Draft Saved" },
  
  // PO Workflow Actions
  PO_SENT: { icon: "fa-paper-plane", color: "primary", label: "PO Sent" },
  PO_REVIEWED: { icon: "fa-eye", color: "info", label: "PO Reviewed" },
  PO_ACCEPTED: { icon: "fa-check-double", color: "success", label: "PO Accepted" },
  PO_REJECTED: { icon: "fa-times-circle", color: "danger", label: "PO Rejected" },
  PO_REVISION_REQUESTED: { icon: "fa-edit", color: "warning", label: "Revision Requested" },
  
  // PO Status Changes
  PO_STATUS_CHANGED: { icon: "fa-exchange-alt", color: "info", label: "Status Changed" },
  PRODUCTION_STARTED: { icon: "fa-microchip", color: "info", label: "Production Started" },
  PRODUCTION_COMPLETE: { icon: "fa-check-circle", color: "success", label: "Production Complete" },
  READY_FOR_DISPATCH: { icon: "fa-truck-loading", color: "success", label: "Ready for Dispatch" },
  SHIPPED: { icon: "fa-shipping-fast", color: "primary", label: "Shipped" },
  DELIVERED: { icon: "fa-home", color: "success", label: "Delivered" },
  CLOSED: { icon: "fa-archive", color: "secondary", label: "Order Closed" },
  
  // Document Actions
  DOCUMENT_UPLOADED: { icon: "fa-upload", color: "info", label: "Document Uploaded" },
  DOCUMENT_REPLACED: { icon: "fa-sync-alt", color: "warning", label: "Document Replaced" },
  DOCUMENT_DOWNLOADED: { icon: "fa-download", color: "info", label: "Document Downloaded" },
  
  // Invoice Actions
  INVOICE_UPLOADED: { icon: "fa-file-invoice-dollar", color: "success", label: "Invoice Uploaded" },
  INVOICE_PAID: { icon: "fa-credit-card", color: "success", label: "Invoice Paid" },
  
  // Update Actions
  DELIVERY_DATE_CHANGED: { icon: "fa-calendar-alt", color: "warning", label: "Delivery Date Changed" },
  PAYMENT_TERMS_CHANGED: { icon: "fa-money-bill-wave", color: "warning", label: "Payment Terms Changed" },
  SHIPPING_REQUIREMENTS_UPDATED: { icon: "fa-truck", color: "info", label: "Shipping Requirements Updated" },
  SPECIAL_INSTRUCTIONS_ADDED: { icon: "fa-sticky-note", color: "info", label: "Special Instructions Added" },
  
  // Signature Actions
  OEM_SIGNATURE_ADDED: { icon: "fa-signature", color: "primary", label: "OEM Signature Added" },
  SUPPLIER_SIGNATURE_ADDED: { icon: "fa-signature", color: "success", label: "Supplier Signature Added" },
  
  // Communication
  MESSAGE_SENT: { icon: "fa-comment", color: "info", label: "Message Sent" },
};

// =================================================================
// STATE
// =================================================================
const State = {
  orderId: null,
  orderData: null,
  activities: [],
  filteredActivities: [],
  filterType: "all",
  searchQuery: "",
  dateRange: { start: null, end: null },
  pollingInterval: null,
  POLL_INTERVAL_MS: 30000,  // Poll every 30 seconds
  currentPage: 1,
  itemsPerPage: 20,
  totalItems: 0,
  expandedActivities: new Set(),
};

// =================================================================
// DOM ELEMENTS
// =================================================================
const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };
const showEl = (id) => { const n = el(id); if (n) n.style.display = ""; };
const hideEl = (id) => { const n = el(id); if (n) n.style.display = "none"; };

// =================================================================
// LOADING STATES
// =================================================================
const setLoading = (isLoading) => {
  const container = el("timelineContainer");
  if (container) {
    if (isLoading) {
      container.classList.add("loading");
    } else {
      container.classList.remove("loading");
    }
  }
};

// =================================================================
// GET ACTIVITY CONFIG
// =================================================================
const getActivityConfig = (actionType) => {
  return ACTIVITY_TYPES[actionType] || { 
    icon: "fa-history", 
    color: "neutral", 
    label: actionType?.replace(/_/g, ' ') || "Activity" 
  };
};

// =================================================================
// FORMAT ACTIVITY MESSAGE
// =================================================================
const formatActivityMessage = (activity) => {
  const config = getActivityConfig(activity.action_type);
  let message = config.label;
  
  // Add specific details based on action type
  if (activity.new_value) {
    if (activity.action_type === "PO_STATUS_CHANGED") {
      const oldStatus = activity.old_value?.status || "unknown";
      const newStatus = activity.new_value?.status || "unknown";
      message = `Status changed from ${oldStatus.replace(/_/g, ' ')} to ${newStatus.replace(/_/g, ' ')}`;
    } else if (activity.action_type === "DELIVERY_DATE_CHANGED") {
      message = `Delivery date changed to ${formatDate(activity.new_value)}`;
    } else if (activity.action_type === "DOCUMENT_UPLOADED") {
      message = `Document uploaded: ${activity.new_value?.document_name || 'Unknown'}`;
    } else if (activity.action_type === "MESSAGE_SENT") {
      message = `Message sent: "${activity.new_value?.message?.substring(0, 50)}${activity.new_value?.message?.length > 50 ? '...' : ''}"`;
    }
  }
  
  return message;
};

// =================================================================
// RENDER ACTIVITY CARD
// =================================================================
const renderActivityCard = (activity) => {
  const config = getActivityConfig(activity.action_type);
  const message = formatActivityMessage(activity);
  const isExpanded = State.expandedActivities.has(activity.id);
  const hasDetails = activity.old_value || activity.new_value || activity.notes;
  
  return `
    <div class="timeline-card" data-activity-id="${activity.id}" data-action-type="${activity.action_type}">
      <div class="timeline-card__header">
        <div class="timeline-card__icon timeline-card__icon--${config.color}">
          <i class="fas ${config.icon}"></i>
        </div>
        <div class="timeline-card__content">
          <div class="timeline-card__title">
            <span class="activity-type">${sanitizeHTML(message)}</span>
            <span class="activity-actor badge badge--sm badge--${activity.actor_type === 'OEM' ? 'primary' : activity.actor_type === 'Supplier' ? 'info' : 'neutral'}">
              <i class="fas ${activity.actor_type === 'OEM' ? 'fa-user-tie' : activity.actor_type === 'Supplier' ? 'fa-building' : 'fa-robot'}"></i>
              ${activity.actor_type || 'System'}
            </span>
          </div>
          <div class="timeline-card__meta">
            <span class="activity-user">
              <i class="fas fa-user"></i>
              ${sanitizeHTML(activity.user_name || activity.user_email || 'System')}
            </span>
            <span class="activity-time" title="${formatDateTime(activity.created_at)}">
              <i class="fas fa-clock"></i>
              ${formatRelativeTime(activity.created_at)}
            </span>
          </div>
          ${hasDetails ? `
            <button class="timeline-card__expand-btn ${isExpanded ? 'expanded' : ''}" data-activity-id="${activity.id}">
              <i class="fas fa-chevron-down"></i>
              <span>${isExpanded ? 'Show less' : 'Show details'}</span>
            </button>
          ` : ''}
        </div>
      </div>
      ${hasDetails ? `
        <div class="timeline-card__details ${isExpanded ? 'expanded' : ''}" id="activityDetails-${activity.id}">
          ${activity.notes ? `
            <div class="detail-section">
              <div class="detail-label">
                <i class="fas fa-sticky-note"></i>
                <span>Notes</span>
              </div>
              <div class="detail-value">${sanitizeHTML(activity.notes)}</div>
            </div>
          ` : ''}
          ${activity.old_value ? `
            <div class="detail-section">
              <div class="detail-label">
                <i class="fas fa-arrow-left"></i>
                <span>Previous Value</span>
              </div>
              <div class="detail-value old-value">${sanitizeHTML(formatDetailValue(activity.old_value))}</div>
            </div>
          ` : ''}
          ${activity.new_value ? `
            <div class="detail-section">
              <div class="detail-label">
                <i class="fas fa-arrow-right"></i>
                <span>New Value</span>
              </div>
              <div class="detail-value new-value">${sanitizeHTML(formatDetailValue(activity.new_value))}</div>
            </div>
          ` : ''}
          <div class="detail-section detail-section--small">
            <div class="detail-label">
              <i class="fas fa-fingerprint"></i>
              <span>Audit ID</span>
            </div>
            <div class="detail-value">${activity.id}</div>
          </div>
          <div class="detail-section detail-section--small">
            <div class="detail-label">
              <i class="fas fa-globe"></i>
              <span>IP Address</span>
            </div>
            <div class="detail-value">${activity.ip_address || '—'}</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
};

// =================================================================
// FORMAT DETAIL VALUE FOR DISPLAY
// =================================================================
const formatDetailValue = (value) => {
  if (!value) return '—';
  
  if (typeof value === 'string') {
    // Try to parse JSON
    try {
      const parsed = JSON.parse(value);
      return formatDetailObject(parsed);
    } catch {
      return value;
    }
  }
  
  if (typeof value === 'object') {
    return formatDetailObject(value);
  }
  
  return String(value);
};

const formatDetailObject = (obj) => {
  if (!obj) return '—';
  
  const lines = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'status') {
      lines.push(`<strong>${key.replace(/_/g, ' ')}:</strong> ${val?.replace(/_/g, ' ') || '—'}`);
    } else if (key === 'document_name') {
      lines.push(`<strong>Document:</strong> ${val}`);
    } else if (key === 'message') {
      lines.push(`<strong>Message:</strong> "${val}"`);
    } else {
      lines.push(`<strong>${key.replace(/_/g, ' ')}:</strong> ${val}`);
    }
  }
  return lines.join('<br>');
};

// =================================================================
// RENDER TIMELINE
// =================================================================
const renderTimeline = () => {
  const container = el("timelineList");
  if (!container) return;
  
  const activities = filterActivities();
  State.totalItems = activities.length;
  
  // Pagination
  const startIdx = (State.currentPage - 1) * State.itemsPerPage;
  const endIdx = startIdx + State.itemsPerPage;
  const paginatedActivities = activities.slice(startIdx, endIdx);
  
  if (paginatedActivities.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <p>No activities found</p>
        <span>Activities will appear here as they occur</span>
      </div>
    `;
    renderPagination();
    return;
  }
  
  container.innerHTML = paginatedActivities.map(activity => renderActivityCard(activity)).join('');
  
  renderPagination();
  updateFilterStats();
  
  // Bind expand/collapse events
  document.querySelectorAll('.timeline-card__expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const activityId = parseInt(btn.dataset.activityId);
      toggleActivityExpand(activityId);
    });
  });
};

// =================================================================
// TOGGLE ACTIVITY EXPAND
// =================================================================
const toggleActivityExpand = (activityId) => {
  if (State.expandedActivities.has(activityId)) {
    State.expandedActivities.delete(activityId);
  } else {
    State.expandedActivities.add(activityId);
  }
  
  const detailsDiv = el(`activityDetails-${activityId}`);
  if (detailsDiv) {
    detailsDiv.classList.toggle('expanded');
  }
  
  const expandBtn = document.querySelector(`.timeline-card__expand-btn[data-activity-id="${activityId}"]`);
  if (expandBtn) {
    expandBtn.classList.toggle('expanded');
    const span = expandBtn.querySelector('span');
    if (span) {
      span.textContent = expandBtn.classList.contains('expanded') ? 'Show less' : 'Show details';
    }
  }
};

// =================================================================
// FILTER ACTIVITIES
// =================================================================
const filterActivities = () => {
  let filtered = [...State.activities];
  
  // Filter by type
  if (State.filterType !== "all") {
    filtered = filtered.filter(a => a.action_type === State.filterType);
  }
  
  // Filter by search query
  if (State.searchQuery.trim()) {
    const query = State.searchQuery.toLowerCase();
    filtered = filtered.filter(a => {
      const message = formatActivityMessage(a).toLowerCase();
      const notes = (a.notes || "").toLowerCase();
      const userName = (a.user_name || "").toLowerCase();
      return message.includes(query) || notes.includes(query) || userName.includes(query);
    });
  }
  
  // Filter by date range
  if (State.dateRange.start) {
    const startDate = new Date(State.dateRange.start);
    filtered = filtered.filter(a => new Date(a.created_at) >= startDate);
  }
  if (State.dateRange.end) {
    const endDate = new Date(State.dateRange.end);
    endDate.setHours(23, 59, 59);
    filtered = filtered.filter(a => new Date(a.created_at) <= endDate);
  }
  
  return filtered;
};

// =================================================================
// UPDATE FILTER STATS
// =================================================================
const updateFilterStats = () => {
  const filtered = filterActivities();
  setText("filteredCount", filtered.length);
  setText("totalActivities", State.activities.length);
};

// =================================================================
// RENDER PAGINATION
// =================================================================
const renderPagination = () => {
  const container = el("pagination");
  if (!container) return;
  
  const totalPages = Math.ceil(State.totalItems / State.itemsPerPage);
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '<div class="pagination">';
  
  // Previous button
  html += `
    <button class="pagination-btn" ${State.currentPage === 1 ? 'disabled' : ''} data-page="prev">
      <i class="fas fa-chevron-left"></i>
    </button>
  `;
  
  // Page numbers
  const maxVisible = 5;
  let startPage = Math.max(1, State.currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  
  if (startPage > 1) {
    html += `<button class="pagination-btn" data-page="1">1</button>`;
    if (startPage > 2) html += `<span class="pagination-dots">...</span>`;
  }
  
  for (let i = startPage; i <= endPage; i++) {
    html += `
      <button class="pagination-btn ${i === State.currentPage ? 'active' : ''}" data-page="${i}">
        ${i}
      </button>
    `;
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="pagination-dots">...</span>`;
    html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
  }
  
  // Next button
  html += `
    <button class="pagination-btn" ${State.currentPage === totalPages ? 'disabled' : ''} data-page="next">
      <i class="fas fa-chevron-right"></i>
    </button>
  `;
  
  html += '</div>';
  container.innerHTML = html;
  
  // Bind pagination events
  container.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const page = btn.dataset.page;
      if (page === 'prev') {
        State.currentPage--;
      } else if (page === 'next') {
        State.currentPage++;
      } else {
        State.currentPage = parseInt(page);
      }
      renderTimeline();
      // Scroll to top of timeline
      el("timelineList")?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
};

// =================================================================
// RENDER FILTER TABS
// =================================================================
const renderFilterTabs = () => {
  const container = el("filterTabs");
  if (!container) return;
  
  // Get unique action types with counts
  const typeCounts = {};
  State.activities.forEach(activity => {
    typeCounts[activity.action_type] = (typeCounts[activity.action_type] || 0) + 1;
  });
  
  // Sort by count (most frequent first)
  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  
  let html = `
    <button class="filter-tab ${State.filterType === 'all' ? 'active' : ''}" data-filter="all">
      All Activities
      <span class="filter-count">${State.activities.length}</span>
    </button>
  `;
  
  sortedTypes.slice(0, 10).forEach(([type, count]) => {
    const config = getActivityConfig(type);
    html += `
      <button class="filter-tab ${State.filterType === type ? 'active' : ''}" data-filter="${type}">
        <i class="fas ${config.icon}"></i>
        ${config.label}
        <span class="filter-count">${count}</span>
      </button>
    `;
  });
  
  container.innerHTML = html;
  
  // Bind filter events
  container.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      State.filterType = btn.dataset.filter;
      State.currentPage = 1;
      renderFilterTabs();
      renderTimeline();
    });
  });
};

// =================================================================
// EXPORT AUDIT TRAIL
// =================================================================
const exportAuditTrail = async (format = 'csv') => {
  try {
    const response = await API.get(`/oem/orders/${State.orderId}/audit-trail/export?format=${format}`);
    
    if (response.url) {
      window.open(response.url, '_blank');
      Toast.success(`Audit trail exported as ${format.toUpperCase()}`);
    } else if (response.data) {
      // Download directly
      const blob = new Blob([response.data], { type: format === 'csv' ? 'text/csv' : 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_trail_order_${State.orderId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.success(`Audit trail downloaded`);
    }
    
  } catch (err) {
    console.error("Export error:", err);
    Toast.error(err.message || "Failed to export audit trail");
  }
};

// =================================================================
// LOAD TIMELINE DATA
// =================================================================
const loadTimeline = async () => {
  if (!State.orderId) return;
  
  setLoading(true);
  
  try {
    const response = await API.get(`/oem/orders/${State.orderId}/timeline`);
    
    if (response.activities) {
      State.activities = response.activities;
      State.orderData = response.order;
      
      renderFilterTabs();
      renderTimeline();
      
      // Update order info
      setText("orderNumber", State.orderData?.po_number || `PO-${State.orderId}`);
      setText("orderStatus", State.orderData?.status || '—');
    }
    
  } catch (err) {
    console.error("Load timeline error:", err);
    Toast.error(err.message || "Failed to load timeline");
  } finally {
    setLoading(false);
  }
};

// =================================================================
// REFRESH DATA (POLLING)
// =================================================================
const refreshData = async () => {
  if (!State.orderId) return;
  
  try {
    const response = await API.get(`/oem/orders/${State.orderId}/timeline`);
    
    if (response.activities && response.activities.length !== State.activities.length) {
      const newActivities = response.activities.slice(0, State.activities.length);
      const hasNewActivities = response.activities.length > State.activities.length;
      
      State.activities = response.activities;
      
      if (hasNewActivities) {
        renderFilterTabs();
        renderTimeline();
        showNewActivityNotification();
      }
    }
    
  } catch (err) {
    console.error("Refresh error:", err);
  }
};

// =================================================================
// SHOW NEW ACTIVITY NOTIFICATION
// =================================================================
let lastNotificationTime = 0;
const showNewActivityNotification = () => {
  const now = Date.now();
  if (now - lastNotificationTime > 60000) {
    lastNotificationTime = now;
    Toast.info("New activity has been recorded", "Timeline Updated", 3000);
  }
};

// =================================================================
// SEARCH HANDLER
// =================================================================
const handleSearch = debounce((e) => {
  State.searchQuery = e.target.value;
  State.currentPage = 1;
  renderTimeline();
}, 300);

// =================================================================
// DATE RANGE HANDLER
// =================================================================
const applyDateRange = () => {
  const startDate = el("dateStart")?.value;
  const endDate = el("dateEnd")?.value;
  
  State.dateRange = { start: startDate, end: endDate };
  State.currentPage = 1;
  renderTimeline();
};

const clearDateRange = () => {
  if (el("dateStart")) el("dateStart").value = '';
  if (el("dateEnd")) el("dateEnd").value = '';
  State.dateRange = { start: null, end: null };
  State.currentPage = 1;
  renderTimeline();
  Toast.info("Date filter cleared");
};

// =================================================================
// START/STOP POLLING
// =================================================================
const startPolling = () => {
  if (State.pollingInterval) {
    clearInterval(State.pollingInterval);
  }
  State.pollingInterval = setInterval(refreshData, State.POLL_INTERVAL_MS);
};

const stopPolling = () => {
  if (State.pollingInterval) {
    clearInterval(State.pollingInterval);
    State.pollingInterval = null;
  }
};

// =================================================================
// BIND EVENTS
// =================================================================
const bindEvents = () => {
  el("searchInput")?.addEventListener("input", handleSearch);
  el("clearSearchBtn")?.addEventListener("click", () => {
    if (el("searchInput")) el("searchInput").value = "";
    State.searchQuery = "";
    State.currentPage = 1;
    renderTimeline();
  });
  
  el("applyDateBtn")?.addEventListener("click", applyDateRange);
  el("clearDateBtn")?.addEventListener("click", clearDateRange);
  
  el("exportCsvBtn")?.addEventListener("click", () => exportAuditTrail('csv'));
  el("exportPdfBtn")?.addEventListener("click", () => exportAuditTrail('pdf'));
  
  el("refreshBtn")?.addEventListener("click", () => {
    loadTimeline();
    Toast.info("Refreshing timeline...");
  });
  
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${State.orderId}`;
  });
  
  el("logoutBtn")?.addEventListener("click", () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
};

// =================================================================
// INITIALIZE
// =================================================================
const init = async () => {
  State.orderId = getQueryParam("id");
  
  if (!State.orderId) {
    Toast.error("No order ID provided");
    setTimeout(() => {
      window.location.href = CONFIG.ROUTES.OEM_ORDERS;
    }, 2000);
    return;
  }
  
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "OEM");
  
  bindEvents();
  await loadTimeline();
  startPolling();
};

// Stop polling on page unload
window.addEventListener("beforeunload", stopPolling);
window.addEventListener("pagehide", stopPolling);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && State.orderId) {
    refreshData();
    startPolling();
  } else if (document.hidden) {
    stopPolling();
  }
});

document.addEventListener("DOMContentLoaded", init);