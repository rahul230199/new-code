/* =============================================================
   AXO NETWORKS — AUDIT TRAIL VIEWER
   pages/oem/audit-trail.js

   PRD Alignment: Page 7 (Audit Trail - Immutable)
   
   Features:
   - Complete, immutable record of all order activities
   - Cannot be edited or deleted (database-level protection)
   - Filter by date range, action type, actor
   - Export audit trail as CSV/JSON/PDF
   - View detailed changes (before/after)
   - User attribution for every action
   - Timestamp with timezone
   - IP address tracking
   - Search functionality
   
   Backend endpoints:
     GET  /api/oem/orders/:orderId/audit-trail     → Get full audit trail
     GET  /api/oem/orders/:orderId/audit-trail/export → Export audit trail
   ============================================================= */

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import {
  sanitizeHTML,
  formatDateTime,
  formatDate,
  getQueryParam,
  debounce,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard — OEM + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// ACTIVITY TYPE CONFIGURATION (for display)
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
  
  // Signature Actions
  OEM_SIGNATURE_ADDED: { icon: "fa-signature", color: "primary", label: "OEM Signature Added" },
  SUPPLIER_SIGNATURE_ADDED: { icon: "fa-signature", color: "success", label: "Supplier Signature Added" },
  
  // Communication
  MESSAGE_SENT: { icon: "fa-comment", color: "info", label: "Message Sent" },
  
  // Default
  default: { icon: "fa-history", color: "neutral", label: "Activity" }
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
  filterActor: "all",
  searchQuery: "",
  dateRange: { start: null, end: null },
  currentPage: 1,
  itemsPerPage: 20,
  totalItems: 0,
  expandedActivities: new Set(),
  isLoading: false,
  exportFormat: "csv",
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
  const container = el("auditTrailContainer");
  if (container) {
    if (isLoading) {
      container.classList.add("loading");
    } else {
      container.classList.remove("loading");
    }
  }
};

// =================================================================
// HELPER FUNCTIONS
// =================================================================
const getActivityConfig = (actionType) => {
  return ACTIVITY_TYPES[actionType] || ACTIVITY_TYPES.default;
};

const formatDetailValue = (value) => {
  if (!value) return "—";
  
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return formatDetailObject(parsed);
    } catch {
      return sanitizeHTML(value);
    }
  }
  
  if (typeof value === "object") {
    return formatDetailObject(value);
  }
  
  return String(value);
};

const formatDetailObject = (obj) => {
  if (!obj) return "—";
  
  const lines = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key === "status") {
      lines.push(`<span class="diff-key">${key.replace(/_/g, " ")}:</span> <span class="diff-value">${sanitizeHTML(String(val).replace(/_/g, " "))}</span>`);
    } else if (key === "document_name") {
      lines.push(`<span class="diff-key">Document:</span> <span class="diff-value">${sanitizeHTML(val)}</span>`);
    } else if (key === "signature") {
      lines.push(`<span class="diff-key">Signature by:</span> <span class="diff-value">${sanitizeHTML(val.name)} (${val.designation})</span>`);
    } else {
      lines.push(`<span class="diff-key">${key.replace(/_/g, " ")}:</span> <span class="diff-value">${sanitizeHTML(String(val))}</span>`);
    }
  }
  return lines.join('<br>');
};

// =================================================================
// RENDER ACTIVITY ROW
// =================================================================
const renderActivityRow = (activity, index) => {
  const config = getActivityConfig(activity.action_type);
  const isExpanded = State.expandedActivities.has(activity.id);
  const actorIcon = activity.actor_type === "OEM" ? "fa-user-tie" : 
                    activity.actor_type === "Supplier" ? "fa-building" : "fa-robot";
  const actorColor = activity.actor_type === "OEM" ? "primary" : 
                     activity.actor_type === "Supplier" ? "info" : "neutral";
  
  const hasDetails = activity.old_value || activity.new_value || activity.notes;
  
  return `
    <tr class="audit-row ${isExpanded ? "expanded" : ""}" data-activity-id="${activity.id}">
      <td class="audit-index">${index}</td>
      <td class="audit-timestamp" title="${formatDateTime(activity.created_at)}">
        ${formatDateTime(activity.created_at)}
      </td>
      <td class="audit-actor">
        <span class="actor-badge actor-badge--${actorColor}">
          <i class="fas ${actorIcon}"></i>
          ${activity.actor_type || "System"}
        </span>
      </td>
      <td class="audit-action">
        <span class="action-icon action-icon--${config.color}">
          <i class="fas ${config.icon}"></i>
        </span>
        <span class="action-label">${config.label}</span>
      </td>
      <td class="audit-message">
        <div class="audit-message-text">${sanitizeHTML(activity.activity_message || activity.notes || "—")}</div>
        ${hasDetails ? `
          <button class="audit-expand-btn ${isExpanded ? "expanded" : ""}" data-activity-id="${activity.id}">
            <i class="fas fa-chevron-down"></i>
            <span>${isExpanded ? "Show less" : "Show details"}</span>
          </button>
        ` : ""}
      </td>
      <td class="audit-user">
        <span class="user-name">${sanitizeHTML(activity.user_name || activity.user_email || "System")}</span>
        ${activity.ip_address ? `<span class="user-ip" title="IP Address">${sanitizeHTML(activity.ip_address)}</span>` : ""}
      </td>
    </tr>
    ${hasDetails ? `
      <tr class="audit-details-row ${isExpanded ? "expanded" : ""}" data-parent="${activity.id}">
        <td colspan="6">
          <div class="audit-details">
            ${activity.notes ? `
              <div class="detail-section">
                <div class="detail-label">
                  <i class="fas fa-sticky-note"></i>
                  <span>Notes</span>
                </div>
                <div class="detail-value">${sanitizeHTML(activity.notes)}</div>
              </div>
            ` : ""}
            ${activity.old_value ? `
              <div class="detail-section">
                <div class="detail-label">
                  <i class="fas fa-arrow-left"></i>
                  <span>Previous Value</span>
                </div>
                <div class="detail-value old-value">${formatDetailValue(activity.old_value)}</div>
              </div>
            ` : ""}
            ${activity.new_value ? `
              <div class="detail-section">
                <div class="detail-label">
                  <i class="fas fa-arrow-right"></i>
                  <span>New Value</span>
                </div>
                <div class="detail-value new-value">${formatDetailValue(activity.new_value)}</div>
              </div>
            ` : ""}
            <div class="detail-section detail-section--small">
              <div class="detail-label">
                <i class="fas fa-fingerprint"></i>
                <span>Audit ID</span>
              </div>
              <div class="detail-value">${activity.id}</div>
            </div>
            ${activity.ip_address ? `
              <div class="detail-section detail-section--small">
                <div class="detail-label">
                  <i class="fas fa-globe"></i>
                  <span>IP Address</span>
                </div>
                <div class="detail-value">${sanitizeHTML(activity.ip_address)}</div>
              </div>
            ` : ""}
            ${activity.user_agent ? `
              <div class="detail-section detail-section--small">
                <div class="detail-label">
                  <i class="fas fa-laptop"></i>
                  <span>User Agent</span>
                </div>
                <div class="detail-value detail-value--mono">${sanitizeHTML(activity.user_agent)}</div>
              </div>
            ` : ""}
          </div>
        </td>
      </tr>
    ` : ""}
  `;
};

// =================================================================
// RENDER AUDIT TABLE
// =================================================================
const renderAuditTable = () => {
  const tbody = el("auditTableBody");
  if (!tbody) return;
  
  let activities = filterActivities();
  State.totalItems = activities.length;
  
  // Pagination
  const startIdx = (State.currentPage - 1) * State.itemsPerPage;
  const endIdx = startIdx + State.itemsPerPage;
  const paginatedActivities = activities.slice(startIdx, endIdx);
  
  if (paginatedActivities.length === 0) {
    tbody.innerHTML = `
      <tr class="audit-empty-row">
        <td colspan="6">
          <div class="empty-state">
            <i class="fas fa-history"></i>
            <p>No audit records found</p>
            <span>Activities will appear here as they occur</span>
          </div>
        </td>
      </tr>
    `;
    renderPagination();
    updateStats();
    return;
  }
  
  let html = "";
  paginatedActivities.forEach((activity, idx) => {
    const globalIndex = startIdx + idx + 1;
    html += renderActivityRow(activity, globalIndex);
  });
  
  tbody.innerHTML = html;
  renderPagination();
  updateStats();
  
  // Bind expand/collapse events
  document.querySelectorAll(".audit-expand-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
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
  
  // Update row styling
  const row = document.querySelector(`.audit-row[data-activity-id="${activityId}"]`);
  const detailsRow = document.querySelector(`.audit-details-row[data-parent="${activityId}"]`);
  const expandBtn = document.querySelector(`.audit-expand-btn[data-activity-id="${activityId}"]`);
  
  if (row) row.classList.toggle("expanded");
  if (detailsRow) detailsRow.classList.toggle("expanded");
  if (expandBtn) {
    expandBtn.classList.toggle("expanded");
    const span = expandBtn.querySelector("span");
    if (span) {
      span.textContent = expandBtn.classList.contains("expanded") ? "Show less" : "Show details";
    }
  }
};

// =================================================================
// FILTER ACTIVITIES
// =================================================================
const filterActivities = () => {
  let filtered = [...State.activities];
  
  // Filter by action type
  if (State.filterType !== "all") {
    filtered = filtered.filter(a => a.action_type === State.filterType);
  }
  
  // Filter by actor
  if (State.filterActor !== "all") {
    filtered = filtered.filter(a => a.actor_type === State.filterActor);
  }
  
  // Filter by search query
  if (State.searchQuery.trim()) {
    const query = State.searchQuery.toLowerCase();
    filtered = filtered.filter(a => {
      const message = (a.activity_message || a.notes || "").toLowerCase();
      const userName = (a.user_name || a.user_email || "").toLowerCase();
      const actionType = (a.action_type || "").toLowerCase();
      return message.includes(query) || userName.includes(query) || actionType.includes(query);
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
// UPDATE STATS DISPLAY
// =================================================================
const updateStats = () => {
  const filtered = filterActivities();
  setText("filteredCount", filtered.length);
  setText("totalActivities", State.activities.length);
  
  // Update actor counts
  const actorCounts = {
    OEM: State.activities.filter(a => a.actor_type === "OEM").length,
    Supplier: State.activities.filter(a => a.actor_type === "Supplier").length,
    System: State.activities.filter(a => a.actor_type === "System" || !a.actor_type).length
  };
  setText("oemCount", actorCounts.OEM);
  setText("supplierCount", actorCounts.Supplier);
  setText("systemCount", actorCounts.System);
};

// =================================================================
// RENDER FILTER OPTIONS
// =================================================================
const renderFilterOptions = () => {
  // Get unique action types
  const actionTypes = {};
  State.activities.forEach(activity => {
    actionTypes[activity.action_type] = (actionTypes[activity.action_type] || 0) + 1;
  });
  
  const filterContainer = el("actionTypeFilters");
  if (filterContainer) {
    let html = `
      <button class="filter-chip ${State.filterType === "all" ? "active" : ""}" data-filter="all">
        All
        <span class="filter-count">${State.activities.length}</span>
      </button>
    `;
    
    Object.entries(actionTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([type, count]) => {
        const config = getActivityConfig(type);
        html += `
          <button class="filter-chip ${State.filterType === type ? "active" : ""}" data-filter="${type}">
            <i class="fas ${config.icon}"></i>
            ${config.label}
            <span class="filter-count">${count}</span>
          </button>
        `;
      });
    
    filterContainer.innerHTML = html;
    
    // Bind filter events
    filterContainer.querySelectorAll(".filter-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        State.filterType = btn.dataset.filter;
        State.currentPage = 1;
        renderFilterOptions();
        renderAuditTable();
      });
    });
  }
};

// =================================================================
// RENDER PAGINATION
// =================================================================
const renderPagination = () => {
  const container = el("pagination");
  if (!container) return;
  
  const totalPages = Math.ceil(State.totalItems / State.itemsPerPage);
  
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }
  
  let html = '<div class="pagination">';
  
  // Previous button
  html += `
    <button class="pagination-btn" ${State.currentPage === 1 ? "disabled" : ""} data-page="prev">
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
      <button class="pagination-btn ${i === State.currentPage ? "active" : ""}" data-page="${i}">
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
    <button class="pagination-btn" ${State.currentPage === totalPages ? "disabled" : ""} data-page="next">
      <i class="fas fa-chevron-right"></i>
    </button>
  `;
  
  html += '</div>';
  container.innerHTML = html;
  
  // Bind pagination events
  container.querySelectorAll(".pagination-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const page = btn.dataset.page;
      if (page === "prev") {
        State.currentPage--;
      } else if (page === "next") {
        State.currentPage++;
      } else {
        State.currentPage = parseInt(page);
      }
      renderAuditTable();
      el("auditTableBody")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
};

// =================================================================
// EXPORT AUDIT TRAIL
// =================================================================
const exportAuditTrail = async (format) => {
  setLoading(true);
  
  try {
    const response = await API.get(`/oem/orders/${State.orderId}/audit-trail/export?format=${format}`);
    
    if (response.url || response.data) {
      if (response.url) {
        window.open(response.url, "_blank");
      } else {
        // Create blob from response
        const blob = new Blob([JSON.stringify(response, null, 2)], { 
          type: format === "csv" ? "text/csv" : "application/json" 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_trail_order_${State.orderData?.po_number || State.orderId}_${Date.now()}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      Toast.success(`Audit trail exported as ${format.toUpperCase()}`);
    } else {
      Toast.error("Failed to export audit trail");
    }
    
  } catch (error) {
    console.error("Export error:", error);
    Toast.error(error.message || "Failed to export audit trail");
  } finally {
    setLoading(false);
  }
};

// =================================================================
// FILTER HANDLERS
// =================================================================
const handleActorFilter = (e) => {
  State.filterActor = e.target.value;
  State.currentPage = 1;
  renderAuditTable();
};

const handleSearch = debounce((e) => {
  State.searchQuery = e.target.value;
  State.currentPage = 1;
  renderAuditTable();
}, 300);

const clearSearch = () => {
  const searchInput = el("searchInput");
  if (searchInput) searchInput.value = "";
  State.searchQuery = "";
  State.currentPage = 1;
  renderAuditTable();
};

const applyDateRange = () => {
  const startDate = el("dateStart")?.value;
  const endDate = el("dateEnd")?.value;
  
  State.dateRange = { start: startDate, end: endDate };
  State.currentPage = 1;
  renderAuditTable();
  Toast.info("Date filter applied");
};

const clearDateRange = () => {
  if (el("dateStart")) el("dateStart").value = "";
  if (el("dateEnd")) el("dateEnd").value = "";
  State.dateRange = { start: null, end: null };
  State.currentPage = 1;
  renderAuditTable();
  Toast.info("Date filter cleared");
};

const resetAllFilters = () => {
  State.filterType = "all";
  State.filterActor = "all";
  State.searchQuery = "";
  State.dateRange = { start: null, end: null };
  State.currentPage = 1;
  
  // Reset UI
  if (el("searchInput")) el("searchInput").value = "";
  if (el("dateStart")) el("dateStart").value = "";
  if (el("dateEnd")) el("dateEnd").value = "";
  if (el("actorFilter")) el("actorFilter").value = "all";
  
  renderFilterOptions();
  renderAuditTable();
  Toast.info("All filters cleared");
};

// =================================================================
// LOAD AUDIT TRAIL DATA
// =================================================================
const loadAuditTrail = async () => {
  if (!State.orderId) return;
  
  setLoading(true);
  
  try {
    const response = await API.get(`/oem/orders/${State.orderId}/audit-trail`);
    
    State.activities = response.activities || [];
    State.orderData = response.order;
    
    // Update order info
    setText("orderNumber", State.orderData?.po_number || `PO-${State.orderId}`);
    setText("orderStatus", State.orderData?.status || "—");
    
    // Render filter options
    renderFilterOptions();
    
    // Render table
    renderAuditTable();
    
  } catch (error) {
    console.error("Load audit trail error:", error);
    Toast.error(error.message || "Failed to load audit trail");
    
    const tbody = el("auditTableBody");
    if (tbody) {
      tbody.innerHTML = `
        <tr class="audit-empty-row">
          <td colspan="6">
            <div class="empty-state">
              <i class="fas fa-exclamation-triangle"></i>
              <p>Failed to load audit trail</p>
              <span>Please try refreshing the page</span>
              <button class="btn btn--primary" id="retryBtn">Retry</button>
            </div>
          </td>
        </tr>
      `;
      const retryBtn = document.getElementById("retryBtn");
      if (retryBtn) retryBtn.addEventListener("click", loadAuditTrail);
    }
  } finally {
    setLoading(false);
  }
};

// =================================================================
// BIND EVENTS
// =================================================================
const bindEvents = () => {
  // Actor filter
  el("actorFilter")?.addEventListener("change", handleActorFilter);
  
  // Search
  el("searchInput")?.addEventListener("input", handleSearch);
  el("clearSearchBtn")?.addEventListener("click", clearSearch);
  
  // Date filters
  el("applyDateBtn")?.addEventListener("click", applyDateRange);
  el("clearDateBtn")?.addEventListener("click", clearDateRange);
  el("resetFiltersBtn")?.addEventListener("click", resetAllFilters);
  
  // Export buttons
  el("exportCsvBtn")?.addEventListener("click", () => exportAuditTrail("csv"));
  el("exportJsonBtn")?.addEventListener("click", () => exportAuditTrail("json"));
  el("exportPdfBtn")?.addEventListener("click", () => exportAuditTrail("pdf"));
  
  // Refresh
  el("refreshBtn")?.addEventListener("click", loadAuditTrail);
  
  // Back button
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${State.orderId}`;
  });
  
  // Items per page
  el("itemsPerPage")?.addEventListener("change", (e) => {
    State.itemsPerPage = parseInt(e.target.value);
    State.currentPage = 1;
    renderAuditTable();
  });
  
  // Sidebar / auth
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
  await loadAuditTrail();
};

document.addEventListener("DOMContentLoaded", init);