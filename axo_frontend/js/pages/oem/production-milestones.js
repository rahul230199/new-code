/* =============================================================
   AXO NETWORKS — PRODUCTION MILESTONE TRACKING
   pages/oem/production-milestones.js

   PRD Alignment: Page 6 (Production Started → Production Complete → 
                  Ready for Dispatch → Shipped → Delivered → Closed)
   
   Features:
   - View all production milestones for an order
   - Track milestone status (pending, in_progress, completed, delayed)
   - View evidence photos and notes from supplier
   - Add comments on milestones
   - Receive real-time updates on milestone changes
   - View production progress percentage
   
   Backend endpoints:
     GET  /api/oem/orders/:orderId/milestones     → Get all milestones
     GET  /api/oem/orders/:orderId/progress       → Get progress percentage
     POST /api/oem/milestones/:milestoneId/comment → Add comment
     GET  /api/oem/milestones/:milestoneId/evidence → Get evidence files
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
// Guard — OEM + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  orderId: null,
  milestones: [],
  progress: 0,
  currentMilestoneId: null,
  pollingInterval: null,
  POLL_INTERVAL_MS: 15000,  // Poll every 15 seconds
  expandedMilestones: new Set(),
};

// =================================================================
// MILESTONE CONFIGURATION (PRD Page 6 Status Workflow)
// =================================================================
const MILESTONE_CONFIG = {
  order_placed: {
    name: "Order Placed",
    icon: "fa-shopping-cart",
    color: "primary",
    order: 1,
    description: "Purchase Order has been created and accepted"
  },
  production_started: {
    name: "Production Started",
    icon: "fa-microchip",
    color: "info",
    order: 2,
    description: "Manufacturing process has begun"
  },
  production_complete: {
    name: "Production Complete",
    icon: "fa-check-circle",
    color: "info",
    order: 3,
    description: "All parts have been manufactured"
  },
  quality_inspection: {
    name: "Quality Inspection",
    icon: "fa-clipboard-check",
    color: "warning",
    order: 4,
    description: "Quality control and testing in progress"
  },
  packaging_completed: {
    name: "Packaging Completed",
    icon: "fa-box",
    color: "info",
    order: 5,
    description: "Parts have been packaged for shipment"
  },
  ready_for_dispatch: {
    name: "Ready for Dispatch",
    icon: "fa-truck-loading",
    color: "success",
    order: 6,
    description: "Order is ready to be shipped"
  },
  shipped: {
    name: "Shipped",
    icon: "fa-shipping-fast",
    color: "primary",
    order: 7,
    description: "Order has been dispatched"
  },
  delivered: {
    name: "Delivered",
    icon: "fa-check-double",
    color: "success",
    order: 8,
    description: "Order has been delivered"
  },
  closed: {
    name: "Order Closed",
    icon: "fa-check-circle",
    color: "secondary",
    order: 9,
    description: "Order is complete and closed"
  }
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
  const container = el("milestonesContainer");
  if (container) {
    if (isLoading) {
      container.classList.add("loading");
    } else {
      container.classList.remove("loading");
    }
  }
};

// =================================================================
// GET STATUS CLASS FOR MILESTONE
// =================================================================
const getMilestoneStatusClass = (status) => {
  const statusMap = {
    pending: "neutral",
    in_progress: "warning",
    completed: "success",
    delayed: "danger",
    skipped: "neutral"
  };
  return statusMap[status] || "neutral";
};

// =================================================================
// GET STATUS ICON
// =================================================================
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
// RENDER MILESTONE TIMELINE (PRD Page 6)
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
    const config = MILESTONE_CONFIG[milestone.milestone_key] || {
      name: milestone.milestone_name,
      icon: "fa-flag-checkered",
      color: "primary"
    };
    
    const statusClass = getMilestoneStatusClass(milestone.status);
    const statusIcon = getStatusIcon(milestone.status);
    const isCompleted = milestone.status === "completed";
    const isInProgress = milestone.status === "in_progress";
    const isDelayed = milestone.status === "delayed";
    const isExpanded = State.expandedMilestones.has(milestone.id);
    
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
            <div class="timeline-node__icon">
              <i class="fas ${config.icon}"></i>
            </div>
            <div class="timeline-node__info">
              <h4>${sanitizeHTML(config.name)}</h4>
              <p class="timeline-node__description">${config.description}</p>
            </div>
            <span class="badge badge--${statusClass}">
              <i class="fas ${statusIcon}"></i>
              ${milestone.status.replace('_', ' ').toUpperCase()}
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
            
            <div class="timeline-node__comments" id="comments-${milestone.id}">
              <div class="comments-header">
                <i class="fas fa-comments"></i>
                <span>Activity Log</span>
              </div>
              <div class="comments-list" id="commentsList-${milestone.id}">
                ${renderComments(milestone.comments || [])}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
  
  // Bind expand/collapse events
  document.querySelectorAll('.timeline-node__expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const milestoneId = parseInt(btn.dataset.milestoneId);
      toggleMilestoneExpand(milestoneId);
    });
  });
};

// =================================================================
// RENDER COMMENTS
// =================================================================
const renderComments = (comments) => {
  if (!comments || comments.length === 0) {
    return '<div class="no-comments">No activity yet</div>';
  }
  
  return comments.map(comment => `
    <div class="comment-item">
      <div class="comment-avatar">
        <span>${(comment.author_name || 'U').charAt(0).toUpperCase()}</span>
      </div>
      <div class="comment-content">
        <div class="comment-header">
          <span class="comment-author">${sanitizeHTML(comment.author_name || 'User')}</span>
          <span class="comment-role badge badge--sm badge--${comment.author_role === 'supplier' ? 'info' : 'primary'}">
            ${comment.author_role === 'supplier' ? 'Supplier' : 'OEM'}
          </span>
          <span class="comment-time">${formatRelativeTime(comment.created_at)}</span>
        </div>
        <p class="comment-text">${sanitizeHTML(comment.message)}</p>
      </div>
    </div>
  `).join('');
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
// RENDER PROGRESS BAR
// =================================================================
const renderProgressBar = () => {
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
    const completedCount = State.milestones.filter(m => m.status === "completed").length;
    const totalCount = State.milestones.length;
    progressLabel.textContent = `${completedCount} of ${totalCount} milestones completed`;
  }
};

// =================================================================
// RENDER STATS CARDS
// =================================================================
const renderStatsCards = () => {
  const totalMilestones = State.milestones.length;
  const completedMilestones = State.milestones.filter(m => m.status === "completed").length;
  const inProgressMilestones = State.milestones.filter(m => m.status === "in_progress").length;
  const delayedMilestones = State.milestones.filter(m => m.status === "delayed").length;
  
  setText("totalMilestones", totalMilestones);
  setText("completedMilestones", completedMilestones);
  setText("inProgressMilestones", inProgressMilestones);
  setText("delayedMilestones", delayedMilestones);
  
  // Estimated completion date (if last milestone has estimated date)
  const lastMilestone = State.milestones[State.milestones.length - 1];
  if (lastMilestone?.estimated_completion_date) {
    setText("estimatedCompletion", formatDate(lastMilestone.estimated_completion_date));
    showEl("estimatedCompletionSection");
  } else {
    hideEl("estimatedCompletionSection");
  }
};

// =================================================================
// LOAD MILESTONES
// =================================================================
const loadMilestones = async () => {
  if (!State.orderId) return;
  
  try {
    const response = await API.get(`/oem/orders/${State.orderId}/milestones`);
    
    if (response.milestones) {
      State.milestones = response.milestones;
      State.progress = response.progress || 0;
      
      renderMilestoneTimeline();
      renderProgressBar();
      renderStatsCards();
    }
    
  } catch (err) {
    console.error("Load milestones error:", err);
    // Don't show toast for polling errors
  }
};

// =================================================================
// REFRESH DATA (for polling)
// =================================================================
const refreshData = async () => {
  if (!State.orderId) return;
  
  try {
    const [milestonesRes, progressRes] = await Promise.all([
      API.get(`/oem/orders/${State.orderId}/milestones`),
      API.get(`/oem/orders/${State.orderId}/progress`)
    ]);
    
    const hasChanges = JSON.stringify(State.milestones) !== JSON.stringify(milestonesRes.milestones);
    
    if (hasChanges) {
      State.milestones = milestonesRes.milestones;
      State.progress = progressRes.progress || 0;
      
      renderMilestoneTimeline();
      renderProgressBar();
      renderStatsCards();
      
      // Show notification for milestone update
      showMilestoneUpdateNotification();
    }
    
  } catch (err) {
    console.error("Refresh error:", err);
  }
};

// =================================================================
// SHOW MILESTONE UPDATE NOTIFICATION
// =================================================================
let lastNotificationTime = 0;
const showMilestoneUpdateNotification = () => {
  const now = Date.now();
  // Only show notification once per minute to avoid spam
  if (now - lastNotificationTime > 60000) {
    lastNotificationTime = now;
    Toast.info("Production status has been updated", "Status Update", 3000);
    
    // Optional: Play sound
    playNotificationSound();
  }
};

// =================================================================
// PLAY NOTIFICATION SOUND
// =================================================================
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 660;
    gainNode.gain.value = 0.2;
    
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
    oscillator.stop(audioContext.currentTime + 0.3);
    
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  } catch (err) {
    // Silent fail
  }
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
// EXPORT MILESTONES REPORT
// =================================================================
const exportMilestonesReport = () => {
  const reportData = {
    orderId: State.orderId,
    generatedAt: new Date().toISOString(),
    progress: State.progress,
    milestones: State.milestones.map(m => ({
      name: m.milestone_name,
      status: m.status,
      started_at: m.started_at,
      completed_at: m.completed_at,
      notes: m.notes,
      has_evidence: !!m.photo_url
    }))
  };
  
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `milestones_report_order_${State.orderId}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  Toast.success("Report downloaded");
};

// =================================================================
// BIND EVENTS
// =================================================================
const bindEvents = () => {
  el("exportReportBtn")?.addEventListener("click", exportMilestonesReport);
  el("refreshBtn")?.addEventListener("click", () => {
    loadMilestones();
    Toast.info("Refreshing milestones...");
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
  setText("orderIdDisplay", `#${State.orderId}`);
  
  bindEvents();
  await loadMilestones();
  startPolling();
};

// Stop polling on page unload
window.addEventListener("beforeunload", stopPolling);
window.addEventListener("pagehide", stopPolling);

// Resume polling when page becomes visible
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && State.orderId) {
    refreshData();
    startPolling();
  } else if (document.hidden) {
    stopPolling();
  }
});

document.addEventListener("DOMContentLoaded", init);