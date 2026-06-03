/* =============================================================
   AXO NETWORKS — SUPPLIER PRODUCTION UPDATE
   pages/supplier/production-update.js

   PRD Alignment: Page 6 (Production Started → Production Complete → 
                  Ready for Dispatch → Shipped → Delivered → Closed)
   
   Features:
   - View all production milestones for an order
   - Update milestone status (pending → in_progress → completed)
   - Upload evidence photos for each milestone
   - Add notes/comments for milestone updates
   - Track overall production progress
   - Real-time status updates with polling
   - View milestone history
   
   Backend endpoints:
     GET  /api/supplier/orders/:orderId/milestones     → Get all milestones
     GET  /api/supplier/orders/:orderId/progress       → Get progress percentage
     PUT  /api/supplier/orders/:orderId/milestones/:milestoneId → Update milestone
     POST /api/supplier/orders/:orderId/milestones/:milestoneId/photo → Upload evidence
   ============================================================= */

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatRelativeTime,
  getQueryParam,
  debounce,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard — Supplier + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["supplier", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// MILESTONE CONFIGURATION (PRD Page 6 Status Workflow)
// =================================================================
const MILESTONE_CONFIG = {
  po_accepted: {
    name: "PO Accepted",
    icon: "fa-file-signature",
    color: "success",
    order: 1,
    description: "Purchase Order has been accepted by supplier",
    requiredEvidence: false
  },
  production_started: {
    name: "Production Started",
    icon: "fa-microchip",
    color: "info",
    order: 2,
    description: "Manufacturing process has begun",
    requiredEvidence: false
  },
  production_complete: {
    name: "Production Complete",
    icon: "fa-check-circle",
    color: "success",
    order: 3,
    description: "All parts have been manufactured",
    requiredEvidence: true
  },
  quality_inspection: {
    name: "Quality Inspection",
    icon: "fa-clipboard-check",
    color: "warning",
    order: 4,
    description: "Quality control and testing in progress",
    requiredEvidence: true
  },
  packaging_completed: {
    name: "Packaging Completed",
    icon: "fa-box",
    color: "info",
    order: 5,
    description: "Parts have been packaged for shipment",
    requiredEvidence: false
  },
  ready_for_dispatch: {
    name: "Ready for Dispatch",
    icon: "fa-truck-loading",
    color: "success",
    order: 6,
    description: "Order is ready to be shipped",
    requiredEvidence: true
  },
  shipped: {
    name: "Shipped",
    icon: "fa-shipping-fast",
    color: "primary",
    order: 7,
    description: "Order has been dispatched",
    requiredEvidence: true
  },
  delivered: {
    name: "Delivered",
    icon: "fa-home",
    color: "success",
    order: 8,
    description: "Order has been delivered to OEM",
    requiredEvidence: true
  },
  closed: {
    name: "Order Closed",
    icon: "fa-archive",
    color: "secondary",
    order: 9,
    description: "Order is complete and closed",
    requiredEvidence: false
  }
};

const MILESTONE_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  DELAYED: "delayed"
};

const STATUS_ACTIONS = {
  [MILESTONE_STATUS.PENDING]: { next: MILESTONE_STATUS.IN_PROGRESS, label: "Start", icon: "fa-play" },
  [MILESTONE_STATUS.IN_PROGRESS]: { next: MILESTONE_STATUS.COMPLETED, label: "Complete", icon: "fa-check" },
  [MILESTONE_STATUS.COMPLETED]: { next: null, label: "Completed", icon: "fa-check-circle" },
  [MILESTONE_STATUS.DELAYED]: { next: MILESTONE_STATUS.IN_PROGRESS, label: "Resume", icon: "fa-play" }
};

// =================================================================
// STATE
// =================================================================
const State = {
  orderId: null,
  orderData: null,
  milestones: [],
  progress: 0,
  currentMilestoneId: null,
  selectedFile: null,
  pollingInterval: null,
  POLL_INTERVAL_MS: 15000,
  expandedMilestones: new Set(),
  isSubmitting: false,
};

// =================================================================
// DOM ELEMENTS
// =================================================================
const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };
const showEl = (id) => { const n = el(id); if (n) n.style.display = ""; };
const hideEl = (id) => { const n = el(id); if (n) n.style.display = "none"; };
const setVal = (id, val) => { const n = el(id); if (n) n.value = val ?? ""; };

// =================================================================
// LOADING STATES
// =================================================================
const setLoading = (isLoading) => {
  const container = el("productionContainer");
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
const getMilestoneConfig = (key) => {
  return MILESTONE_CONFIG[key] || {
    name: key?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
    icon: "fa-flag-checkered",
    color: "neutral",
    description: ""
  };
};

const getMilestoneStatusClass = (status) => {
  const classMap = {
    pending: "neutral",
    in_progress: "warning",
    completed: "success",
    delayed: "danger"
  };
  return classMap[status] || "neutral";
};

const getStatusIcon = (status) => {
  const iconMap = {
    pending: "fa-clock",
    in_progress: "fa-spinner fa-pulse",
    completed: "fa-check-circle",
    delayed: "fa-exclamation-triangle"
  };
  return iconMap[status] || "fa-question-circle";
};

// =================================================================
// RENDER PROGRESS SECTION
// =================================================================
const renderProgressSection = () => {
  const progressBar = el("progressBarFill");
  const progressText = el("progressPercentage");
  const progressLabel = el("progressLabel");
  
  if (progressBar) {
    progressBar.style.width = `${State.progress}%`;
  }
  
  if (progressText) {
    progressText.textContent = `${State.progress}%`;
  }
  
  if (progressLabel) {
    const completedCount = State.milestones.filter(m => m.status === MILESTONE_STATUS.COMPLETED).length;
    const totalCount = State.milestones.length;
    progressLabel.textContent = `${completedCount} of ${totalCount} milestones completed`;
  }
};

// =================================================================
// RENDER STATS CARDS
// =================================================================
const renderStatsCards = () => {
  const total = State.milestones.length;
  const completed = State.milestones.filter(m => m.status === MILESTONE_STATUS.COMPLETED).length;
  const inProgress = State.milestones.filter(m => m.status === MILESTONE_STATUS.IN_PROGRESS).length;
  const delayed = State.milestones.filter(m => m.status === MILESTONE_STATUS.DELAYED).length;
  
  setText("totalMilestones", total);
  setText("completedMilestones", completed);
  setText("inProgressMilestones", inProgress);
  setText("delayedMilestones", delayed);
};

// =================================================================
// RENDER MILESTONE TIMELINE
// =================================================================
const renderMilestoneTimeline = () => {
  const container = el("milestoneTimeline");
  if (!container) return;
  
  if (!State.milestones.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-chart-line"></i>
        <p>No milestones found for this order</p>
      </div>
    `;
    return;
  }
  
  let html = '<div class="milestone-timeline">';
  
  State.milestones.forEach((milestone, index) => {
    const config = getMilestoneConfig(milestone.milestone_key);
    const statusClass = getMilestoneStatusClass(milestone.status);
    const statusIcon = getStatusIcon(milestone.status);
    const isCompleted = milestone.status === MILESTONE_STATUS.COMPLETED;
    const isInProgress = milestone.status === MILESTONE_STATUS.IN_PROGRESS;
    const isDelayed = milestone.status === MILESTONE_STATUS.DELAYED;
    const isPending = milestone.status === MILESTONE_STATUS.PENDING;
    const isExpanded = State.expandedMilestones.has(milestone.id);
    const canUpdate = !isCompleted;
    
    html += `
      <div class="timeline-node ${isCompleted ? 'completed' : isInProgress ? 'active' : isDelayed ? 'delayed' : ''}" 
           data-milestone-id="${milestone.id}">
        
        <div class="timeline-node__marker">
          <div class="timeline-node__dot">
            ${isCompleted ? '<i class="fas fa-check"></i>' : ''}
          </div>
          ${index < State.milestones.length - 1 ? '<div class="timeline-node__line"></div>' : ''}
        </div>
        
        <div class="timeline-node__content">
          <div class="timeline-node__header">
            <div class="timeline-node__icon timeline-node__icon--${config.color}">
              <i class="fas ${config.icon}"></i>
            </div>
            <div class="timeline-node__info">
              <h4>${sanitizeHTML(config.name)}</h4>
              <p class="timeline-node__description">${config.description}</p>
            </div>
            <span class="badge badge--${statusClass}">
              <i class="fas ${statusIcon}"></i>
              ${milestone.status.replace("_", " ").toUpperCase()}
            </span>
            <button class="timeline-node__expand-btn ${isExpanded ? 'expanded' : ''}" 
                    data-milestone-id="${milestone.id}">
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
          
          <div class="timeline-node__details ${isExpanded ? 'expanded' : ''}" id="milestoneDetails-${milestone.id}">
            <div class="timeline-node__meta">
              ${milestone.started_at ? `
                <div class="meta-item">
                  <i class="fas fa-play"></i>
                  <span>Started: ${formatDate(milestone.started_at)}</span>
                </div>
              ` : ''}
              ${milestone.completed_at ? `
                <div class="meta-item">
                  <i class="fas fa-flag-checkered"></i>
                  <span>Completed: ${formatDate(milestone.completed_at)}</span>
                </div>
              ` : ''}
              ${milestone.estimated_days ? `
                <div class="meta-item">
                  <i class="fas fa-calendar-week"></i>
                  <span>Est. Duration: ${milestone.estimated_days} days</span>
                </div>
              ` : ''}
            </div>
            
            ${milestone.notes ? `
              <div class="timeline-node__notes">
                <i class="fas fa-sticky-note"></i>
                <p>${sanitizeHTML(milestone.notes)}</p>
              </div>
            ` : ''}
            
            ${milestone.photo_url ? `
              <div class="timeline-node__evidence">
                <div class="evidence-title">
                  <i class="fas fa-camera"></i>
                  <span>Evidence Photo</span>
                </div>
                <div class="evidence-image">
                  <img src="${milestone.photo_url}" alt="Milestone evidence" 
                       onclick="window.open(this.src)" loading="lazy">
                </div>
              </div>
            ` : ''}
            
            ${canUpdate ? `
              <div class="timeline-node__actions">
                <button class="btn btn--sm btn--${isPending ? 'primary' : isDelayed ? 'warning' : 'success'} js-update-milestone"
                        data-milestone-id="${milestone.id}"
                        data-milestone-name="${config.name}"
                        data-current-status="${milestone.status}">
                  <i class="fas ${STATUS_ACTIONS[milestone.status]?.icon || 'fa-edit'}"></i>
                  ${STATUS_ACTIONS[milestone.status]?.label || 'Update'} ${config.name}
                </button>
                ${!isDelayed && !isCompleted ? `
                  <button class="btn btn--sm btn--danger-outline js-delay-milestone"
                          data-milestone-id="${milestone.id}"
                          data-milestone-name="${config.name}">
                    <i class="fas fa-exclamation-triangle"></i> Mark Delayed
                  </button>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
  
  // Bind events
  document.querySelectorAll('.timeline-node__expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const milestoneId = parseInt(btn.dataset.milestoneId);
      toggleMilestoneExpand(milestoneId);
    });
  });
  
  document.querySelectorAll('.js-update-milestone').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const milestoneId = parseInt(btn.dataset.milestoneId);
      const milestoneName = btn.dataset.milestoneName;
      const currentStatus = btn.dataset.currentStatus;
      openUpdateModal(milestoneId, milestoneName, currentStatus);
    });
  });
  
  document.querySelectorAll('.js-delay-milestone').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const milestoneId = parseInt(btn.dataset.milestoneId);
      const milestoneName = btn.dataset.milestoneName;
      openDelayModal(milestoneId, milestoneName);
    });
  });
};

// =================================================================
// TOGGLE MILESTONE EXPAND
// =================================================================
const toggleMilestoneExpand = (milestoneId) => {
  if (State.expandedMilestones.has(milestoneId)) {
    State.expandedMilestones.delete(milestoneId);
  } else {
    State.expandedMilestones.add(milestoneId);
  }
  
  const detailsDiv = el(`milestoneDetails-${milestoneId}`);
  if (detailsDiv) {
    detailsDiv.classList.toggle('expanded');
  }
  
  const expandBtn = document.querySelector(`.timeline-node__expand-btn[data-milestone-id="${milestoneId}"]`);
  if (expandBtn) {
    expandBtn.classList.toggle('expanded');
  }
};

// =================================================================
// OPEN UPDATE MODAL
// =================================================================
const openUpdateModal = (milestoneId, milestoneName, currentStatus) => {
  State.currentMilestoneId = milestoneId;
  const nextStatus = STATUS_ACTIONS[currentStatus]?.next;
  
  setText("updateModalTitle", `Update: ${milestoneName}`);
  setText("updateActionLabel", STATUS_ACTIONS[currentStatus]?.label || "Update");
  setVal("updateNotes", "");
  el("updatePhoto")?.value = "";
  State.selectedFile = null;
  updateFilePreview(null);
  
  // Show/hide evidence required notice
  const config = Object.values(MILESTONE_CONFIG).find(c => c.name === milestoneName);
  const evidenceRequired = config?.requiredEvidence || false;
  
  const evidenceNotice = el("evidenceRequiredNotice");
  if (evidenceNotice) {
    if (evidenceRequired && nextStatus === MILESTONE_STATUS.COMPLETED) {
      evidenceNotice.style.display = "block";
    } else {
      evidenceNotice.style.display = "none";
    }
  }
  
  showEl("updateModal");
};

const closeUpdateModal = () => {
  hideEl("updateModal");
  State.currentMilestoneId = null;
  State.selectedFile = null;
};

// =================================================================
// OPEN DELAY MODAL
// =================================================================
const openDelayModal = (milestoneId, milestoneName) => {
  State.currentMilestoneId = milestoneId;
  
  setText("delayModalTitle", `Mark Delayed: ${milestoneName}`);
  setVal("delayReason", "");
  
  showEl("delayModal");
};

const closeDelayModal = () => {
  hideEl("delayModal");
  State.currentMilestoneId = null;
};

// =================================================================
// FILE PREVIEW
// =================================================================
const updateFilePreview = (file) => {
  const preview = el("updateFilePreview");
  if (!preview) return;
  
  if (!file) {
    preview.style.display = "none";
    preview.innerHTML = "";
    return;
  }
  
  preview.style.display = "flex";
  preview.innerHTML = `
    <i class="fas fa-file-image"></i>
    <span class="file-name">${sanitizeHTML(file.name)}</span>
    <span class="file-size">${(file.size / 1024).toFixed(2)} KB</span>
    <button type="button" class="clear-file" id="clearFileBtn">&times;</button>
  `;
  
  document.getElementById("clearFileBtn")?.addEventListener("click", () => {
    State.selectedFile = null;
    el("updatePhoto").value = "";
    updateFilePreview(null);
  });
};

const handleFileSelect = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  if (file.size > 5 * 1024 * 1024) {
    Toast.error("File too large. Maximum size is 5 MB");
    e.target.value = "";
    return;
  }
  
  if (!file.type.startsWith("image/")) {
    Toast.error("Please select an image file (JPEG, PNG, GIF)");
    e.target.value = "";
    return;
  }
  
  State.selectedFile = file;
  updateFilePreview(file);
};

// =================================================================
// SUBMIT MILESTONE UPDATE
// =================================================================
const submitMilestoneUpdate = async () => {
  if (State.isSubmitting) return;
  
  const milestone = State.milestones.find(m => m.id === State.currentMilestoneId);
  if (!milestone) return;
  
  const currentStatus = milestone.status;
  const nextStatus = STATUS_ACTIONS[currentStatus]?.next;
  
  if (!nextStatus) {
    Toast.warning("This milestone cannot be updated further");
    closeUpdateModal();
    return;
  }
  
  const notes = el("updateNotes")?.value.trim() || "";
  const config = Object.values(MILESTONE_CONFIG).find(c => c.name === milestone.milestone_name);
  const evidenceRequired = config?.requiredEvidence || false;
  
  if (evidenceRequired && nextStatus === MILESTONE_STATUS.COMPLETED && !State.selectedFile) {
    Toast.warning("Evidence photo is required to mark this milestone as complete");
    return;
  }
  
  State.isSubmitting = true;
  setLoading(true);
  
  try {
    // Update milestone status
    const updateResponse = await API.put(
      `/supplier/orders/${State.orderId}/milestones/${State.currentMilestoneId}`,
      { status: nextStatus, notes }
    );
    
    // Upload photo if provided
    if (State.selectedFile) {
      const formData = new FormData();
      formData.append("photo", State.selectedFile);
      
      await API.upload(
        `/supplier/orders/${State.orderId}/milestones/${State.currentMilestoneId}/photo`,
        formData
      );
    }
    
    Toast.success(`Milestone updated to ${nextStatus.replace("_", " ")}`);
    closeUpdateModal();
    
    // Refresh data
    await loadProductionData();
    
  } catch (error) {
    console.error("Update milestone error:", error);
    Toast.error(error.message || "Failed to update milestone");
  } finally {
    State.isSubmitting = false;
    setLoading(false);
  }
};

// =================================================================
// SUBMIT DELAY
// =================================================================
const submitDelay = async () => {
  if (State.isSubmitting) return;
  
  const reason = el("delayReason")?.value.trim();
  if (!reason) {
    Toast.warning("Please provide a reason for the delay");
    return;
  }
  
  State.isSubmitting = true;
  setLoading(true);
  
  try {
    await API.put(
      `/supplier/orders/${State.orderId}/milestones/${State.currentMilestoneId}`,
      { status: MILESTONE_STATUS.DELAYED, notes: `DELAYED: ${reason}` }
    );
    
    Toast.warning("Milestone marked as delayed");
    closeDelayModal();
    
    await loadProductionData();
    
  } catch (error) {
    console.error("Mark delay error:", error);
    Toast.error(error.message || "Failed to mark delay");
  } finally {
    State.isSubmitting = false;
    setLoading(false);
  }
};

// =================================================================
// LOAD PRODUCTION DATA
// =================================================================
const loadProductionData = async () => {
  if (!State.orderId) return;
  
  setLoading(true);
  
  try {
    const [milestonesRes, progressRes] = await Promise.all([
      API.get(`/supplier/orders/${State.orderId}/milestones`),
      API.get(`/supplier/orders/${State.orderId}/progress`)
    ]);
    
    State.milestones = milestonesRes.milestones || [];
    State.progress = progressRes.progress || 0;
    
    renderMilestoneTimeline();
    renderProgressSection();
    renderStatsCards();
    
  } catch (error) {
    console.error("Load production data error:", error);
    Toast.error(error.message || "Failed to load production data");
  } finally {
    setLoading(false);
  }
};

// =================================================================
// LOAD ORDER INFO
// =================================================================
const loadOrderInfo = async () => {
  try {
    const response = await API.get(`/supplier/orders/${State.orderId}`);
    State.orderData = response.order;
    
    setText("orderNumber", State.orderData.po_number || `PO-${State.orderId}`);
    setText("orderStatus", State.orderData.status || "—");
    setText("oemName", State.orderData.oem_name || "—");
    setText("partName", State.orderData.part_name || "—");
    setText("quantity", `${State.orderData.quantity || 0} units`);
    
  } catch (error) {
    console.error("Load order info error:", error);
  }
};

// =================================================================
// REFRESH DATA (POLLING)
// =================================================================
let lastUpdateTime = 0;

const refreshData = async () => {
  if (!State.orderId) return;
  
  try {
    const [milestonesRes, progressRes] = await Promise.all([
      API.get(`/supplier/orders/${State.orderId}/milestones`),
      API.get(`/supplier/orders/${State.orderId}/progress`)
    ]);
    
    const hasChanges = JSON.stringify(State.milestones) !== JSON.stringify(milestonesRes.milestones);
    
    if (hasChanges) {
      State.milestones = milestonesRes.milestones;
      State.progress = progressRes.progress || 0;
      
      renderMilestoneTimeline();
      renderProgressSection();
      renderStatsCards();
      
      const now = Date.now();
      if (now - lastUpdateTime > 60000) {
        lastUpdateTime = now;
        Toast.info("Production status has been updated");
      }
    }
    
  } catch (error) {
    console.error("Refresh error:", error);
  }
};

// =================================================================
// POLLING
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
  // Update modal
  el("updatePhoto")?.addEventListener("change", handleFileSelect);
  el("updateSubmitBtn")?.addEventListener("click", submitMilestoneUpdate);
  el("closeUpdateModal")?.addEventListener("click", closeUpdateModal);
  el("cancelUpdateBtn")?.addEventListener("click", closeUpdateModal);
  
  // Delay modal
  el("delaySubmitBtn")?.addEventListener("click", submitDelay);
  el("closeDelayModal")?.addEventListener("click", closeDelayModal);
  el("cancelDelayBtn")?.addEventListener("click", closeDelayModal);
  
  // Modal close on overlay click
  el("updateModal")?.addEventListener("click", (e) => {
    if (e.target === el("updateModal")) closeUpdateModal();
  });
  
  el("delayModal")?.addEventListener("click", (e) => {
    if (e.target === el("delayModal")) closeDelayModal();
  });
  
  // Refresh button
  el("refreshBtn")?.addEventListener("click", () => {
    loadProductionData();
    Toast.info("Refreshing production status...");
  });
  
  // Back button
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = `${CONFIG.ROUTES.SUPPLIER_ORDER_DETAILS}?id=${State.orderId}`;
  });
  
  // Sidebar / auth
  el("logoutBtn")?.addEventListener("click", () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
  
  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeUpdateModal();
      closeDelayModal();
    }
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
      window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
    }, 2000);
    return;
  }
  
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "Supplier");
  
  bindEvents();
  await loadOrderInfo();
  await loadProductionData();
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