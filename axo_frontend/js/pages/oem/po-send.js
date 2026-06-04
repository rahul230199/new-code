/* =============================================================
   AXO NETWORKS — OEM SEND PO (PO WORKFLOW)
   pages/oem/po-send.js

   PRD Alignment: Pages 3-4 (Send PO to Supplier, Supplier Response)
   
   Workflow:
   Step 4: Send PO to supplier with email notification
   Step 5: Track supplier response (Accept/Revision/Reject)
   Step 6: Handle supplier acceptance with signature
   
   Backend endpoints:
     POST /api/oem/purchase-orders/send/:poId     → Send PO to supplier
     GET  /api/oem/purchase-orders/:poId/status   → Get PO status
     POST /api/oem/purchase-orders/:poId/sign     → Add OEM signature
   ============================================================= */

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatCurrency,
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
  poId: null,              // PO ID from URL
  poData: null,            // Full PO data
  supplierResponse: null,   // Supplier response (accept/reject/revision)
  isSubmitting: false,     // Prevent double submission
  signatureModalOpen: false,
  pollingInterval: null,
  POLL_INTERVAL_MS: 10000,  // Poll every 10 seconds for supplier response
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
const setLoading = (isLoading, elementId = null) => {
  if (elementId) {
    const btn = el(elementId);
    if (btn) {
      btn.disabled = isLoading;
      const originalText = btn.getAttribute("data-original-text") || btn.textContent;
      if (!btn.getAttribute("data-original-text")) {
        btn.setAttribute("data-original-text", originalText);
      }
      btn.innerHTML = isLoading 
        ? `<i class="fas fa-spinner fa-spin"></i> ${originalText}...` 
        : originalText;
    }
  }
  
  const container = el("poSendContainer");
  if (container) {
    if (isLoading) {
      container.classList.add("loading");
    } else {
      container.classList.remove("loading");
    }
  }
};

// =================================================================
// RENDER PO DETAILS
// =================================================================
const renderPODetails = (po) => {
  // Basic Information
  setText("poNumber", po.po_number || `PO-${po.id}`);
  setText("poStatus", po.status || "Draft");
  setText("supplierName", po.supplier_name || "—");
  setText("oemName", po.oem_company_name || Auth.getCurrentUser()?.company_name || "—");
  setText("partName", po.part_name || "—");
  setText("quantity", `${po.quantity || 0} units`);
  setText("totalValue", formatCurrency(po.total_value || 0, po.currency || "USD"));
  setText("paymentTerms", po.payment_terms || "Net 30");
  setText("orderDate", formatDate(po.created_at));
  
  // Delivery date
  if (po.delivery_date) {
    setText("deliveryDate", formatDate(po.delivery_date));
  } else {
    setText("deliveryDate", "To be confirmed");
  }
  
  // Special instructions
  if (po.special_instructions) {
    setHTML("specialInstructions", sanitizeHTML(po.special_instructions));
    showEl("specialInstructionsSection");
  } else {
    hideEl("specialInstructionsSection");
  }
  
  // Status badge styling
  const statusBadge = el("poStatusBadge");
  if (statusBadge) {
    const statusClass = getStatusClass(po.status);
    statusBadge.className = `badge badge--${statusClass}`;
  }
  
  // Show/hide action buttons based on status
  const isSent = po.status === "sent" || po.status === "supplier_reviewing";
  const isAccepted = po.status === "accepted";
  const isRejected = po.status === "rejected";
  const isRevisionRequested = po.status === "revision_requested";
  const isSigned = po.oem_signed === true;
  
  if (isSent) {
    // PO is sent, waiting for supplier response
    hideEl("sendPoSection");
    showEl("awaitingResponseSection");
    showEl("supplierResponseCard");
    setText("awaitingMessage", `PO sent to ${po.supplier_name} on ${formatDate(po.sent_at)}`);
    
    // Start polling for response
    startPolling();
    
  } else if (isAccepted && !isSigned) {
    // Supplier accepted, waiting for OEM signature
    hideEl("sendPoSection");
    hideEl("awaitingResponseSection");
    showEl("signatureRequiredSection");
    showEl("supplierResponseCard");
    renderSupplierAcceptance(po);
    
  } else if (isAccepted && isSigned) {
    // Fully signed and active
    hideEl("sendPoSection");
    hideEl("awaitingResponseSection");
    hideEl("signatureRequiredSection");
    showEl("orderActiveSection");
    setText("activeMessage", `PO is active. Production has started.`);
    
  } else if (isRevisionRequested) {
    // Supplier requested revisions
    hideEl("sendPoSection");
    showEl("revisionRequestedSection");
    renderRevisionDetails(po);
    
  } else if (isRejected) {
    // Supplier rejected
    hideEl("sendPoSection");
    showEl("poRejectedSection");
    setText("rejectionReason", po.rejection_reason || "No reason provided");
    
  } else {
    // Draft status - show send button
    showEl("sendPoSection");
    hideEl("awaitingResponseSection");
    hideEl("signatureRequiredSection");
    hideEl("revisionRequestedSection");
    hideEl("poRejectedSection");
    hideEl("orderActiveSection");
  }
};

// =================================================================
// RENDER SUPPLIER ACCEPTANCE DETAILS
// =================================================================
const renderSupplierAcceptance = (po) => {
  if (po.supplier_signature) {
    setHTML("supplierSignatureName", sanitizeHTML(po.supplier_signature.name || "—"));
    setHTML("supplierSignatureDesignation", sanitizeHTML(po.supplier_signature.designation || "—"));
    setText("supplierSignatureDate", formatDate(po.supplier_signature.date));
    showEl("supplierSignatureDetails");
  }
  
  setHTML("acceptedCompany", sanitizeHTML(po.supplier_name));
  setText("acceptedDate", formatDate(po.accepted_at));
  
  if (po.supplier_notes) {
    setHTML("supplierNotes", sanitizeHTML(po.supplier_notes));
    showEl("supplierNotesSection");
  }
};

// =================================================================
// RENDER REVISION DETAILS
// =================================================================
const renderRevisionDetails = (po) => {
  setHTML("revisionReason", sanitizeHTML(po.revision_reason || "No reason provided"));
  setText("revisionRequestedDate", formatDate(po.revision_requested_at));
  
  if (po.revision_details) {
    setHTML("revisionDetails", sanitizeHTML(po.revision_details));
    showEl("revisionDetailsSection");
  }
};

// =================================================================
// SEND PO TO SUPPLIER
// =================================================================
const sendPOToSupplier = async () => {
  if (State.isSubmitting) return;
  
  // Confirm before sending
  if (!confirm("Are you sure you want to send this Purchase Order to the supplier?\n\nOnce sent, the supplier will be notified and can accept, request revisions, or reject the PO.")) {
    return;
  }
  
  State.isSubmitting = true;
  setLoading(true, "sendPoBtn");
  
  try {
    const response = await API.post(`/oem/purchase-orders/send/${State.poId}`);
    
    if (response.success) {
      Toast.success("Purchase Order sent to supplier successfully!");
      
      // Update local state
      State.poData = response.purchaseOrder;
      renderPODetails(State.poData);
      
      // Send email notification to supplier (handled by backend)
      Toast.info("Email notification sent to supplier");
      
    } else {
      Toast.error(response.error || "Failed to send PO");
    }
    
  } catch (err) {
    console.error("Send PO error:", err);
    Toast.error(err.message || "Failed to send PO");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "sendPoBtn");
  }
};

// =================================================================
// RESEND PO (if supplier didn't receive)
// =================================================================
const resendPO = async () => {
  if (State.isSubmitting) return;
  
  State.isSubmitting = true;
  setLoading(true, "resendBtn");
  
  try {
    const response = await API.post(`/oem/purchase-orders/resend/${State.poId}`);
    
    if (response.success) {
      Toast.success("PO resent to supplier successfully!");
    } else {
      Toast.error(response.error || "Failed to resend PO");
    }
    
  } catch (err) {
    console.error("Resend PO error:", err);
    Toast.error(err.message || "Failed to resend PO");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "resendBtn");
  }
};

// =================================================================
// OPEN SIGNATURE MODAL (PRD Step 6: OEM Final Acknowledgement)
// =================================================================
const openSignatureModal = () => {
  State.signatureModalOpen = true;
  showEl("signatureModal");
  
  // Reset form
  setVal("signatureName", "");
  setVal("signatureDesignation", "");
  setVal("signatureDate", new Date().toISOString().split("T")[0]);
  
  // Get user info for default values
  const user = Auth.getCurrentUser();
  setVal("signatureName", user?.company_name || "");
  
  el("signatureName")?.focus();
};

const closeSignatureModal = () => {
  State.signatureModalOpen = false;
  hideEl("signatureModal");
};

// =================================================================
// SUBMIT OEM SIGNATURE (PRD Step 6)
// =================================================================
const submitSignature = async () => {
  const name = el("signatureName")?.value.trim();
  const designation = el("signatureDesignation")?.value.trim();
  const date = el("signatureDate")?.value;
  
  if (!name) {
    Toast.warning("Please enter your name");
    el("signatureName")?.focus();
    return;
  }
  
  if (!designation) {
    Toast.warning("Please enter your designation");
    el("signatureDesignation")?.focus();
    return;
  }
  
  if (State.isSubmitting) return;
  
  State.isSubmitting = true;
  setLoading(true, "submitSignatureBtn");
  
  try {
    const response = await API.post(`/oem/purchase-orders/${State.poId}/sign`, {
      signature: {
        name,
        designation,
        date: date || new Date().toISOString(),
      }
    });
    
    if (response.success) {
      Toast.success("Signature added! Purchase Order is now active.");
      closeSignatureModal();
      
      // Update local state
      State.poData = response.purchaseOrder;
      renderPODetails(State.poData);
      
      // Redirect to order details after 2 seconds
      setTimeout(() => {
        window.location.href = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${State.poId}`;
      }, 2000);
      
    } else {
      Toast.error(response.error || "Failed to add signature");
    }
    
  } catch (err) {
    console.error("Signature error:", err);
    Toast.error(err.message || "Failed to add signature");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "submitSignatureBtn");
  }
};

// =================================================================
// REQUEST REVISION (if OEM wants to modify after supplier request)
// =================================================================
const requestRevision = async () => {
  const revisionReason = el("revisionResponseReason")?.value.trim();
  
  if (!revisionReason) {
    Toast.warning("Please provide revision details");
    el("revisionResponseReason")?.focus();
    return;
  }
  
  if (State.isSubmitting) return;
  
  State.isSubmitting = true;
  setLoading(true, "submitRevisionBtn");
  
  try {
    const response = await API.post(`/oem/purchase-orders/${State.poId}/revise`, {
      revision_details: revisionReason
    });
    
    if (response.success) {
      Toast.success("Revision request sent to supplier");
      closeRevisionModal();
      
      // Update local state
      State.poData = response.purchaseOrder;
      renderPODetails(State.poData);
      
    } else {
      Toast.error(response.error || "Failed to send revision");
    }
    
  } catch (err) {
    console.error("Revision error:", err);
    Toast.error(err.message || "Failed to send revision");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "submitRevisionBtn");
  }
};

// =================================================================
// OPEN REVISION RESPONSE MODAL
// =================================================================
const openRevisionModal = () => {
  setVal("revisionResponseReason", "");
  showEl("revisionModal");
};

const closeRevisionModal = () => {
  hideEl("revisionModal");
};

// =================================================================
// VIEW REVISED PO (after supplier updates)
// =================================================================
const viewRevisedPO = () => {
  // Reload PO data to get latest version
  loadPOData();
  Toast.info("Loading updated PO details...");
};

// =================================================================
// CANCEL PO (if needed)
// =================================================================
const cancelPO = async () => {
  if (!confirm("Are you sure you want to cancel this Purchase Order?\n\nThis action cannot be undone.")) {
    return;
  }
  
  if (State.isSubmitting) return;
  
  State.isSubmitting = true;
  setLoading(true, "cancelPoBtn");
  
  try {
    const response = await API.post(`/oem/purchase-orders/${State.poId}/cancel`);
    
    if (response.success) {
      Toast.success("Purchase Order cancelled");
      
      // Redirect to orders page
      setTimeout(() => {
        window.location.href = CONFIG.ROUTES.OEM_ORDERS;
      }, 1500);
      
    } else {
      Toast.error(response.error || "Failed to cancel PO");
    }
    
  } catch (err) {
    console.error("Cancel PO error:", err);
    Toast.error(err.message || "Failed to cancel PO");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "cancelPoBtn");
  }
};

// =================================================================
// POLL FOR SUPPLIER RESPONSE
// =================================================================
const pollSupplierResponse = async () => {
  if (!State.poId) return;
  
  try {
    const response = await API.get(`/oem/purchase-orders/${State.poId}/status`);
    
    if (response.purchaseOrder && response.purchaseOrder.status !== State.poData?.status) {
      // Status changed - update UI
      State.poData = response.purchaseOrder;
      renderPODetails(State.poData);
      
      // Show notification based on new status
      if (response.purchaseOrder.status === "accepted") {
        Toast.success("Supplier has accepted the Purchase Order!");
        // Play notification sound (optional)
        playNotificationSound();
      } else if (response.purchaseOrder.status === "rejected") {
        Toast.warning("Supplier has rejected the Purchase Order");
        playNotificationSound();
      } else if (response.purchaseOrder.status === "revision_requested") {
        Toast.info("Supplier has requested revisions");
        playNotificationSound();
      }
    }
    
  } catch (err) {
    console.error("Polling error:", err);
    // Don't show error toast for polling failures
  }
};

const startPolling = () => {
  if (State.pollingInterval) {
    clearInterval(State.pollingInterval);
  }
  State.pollingInterval = setInterval(pollSupplierResponse, State.POLL_INTERVAL_MS);
};

const stopPolling = () => {
  if (State.pollingInterval) {
    clearInterval(State.pollingInterval);
    State.pollingInterval = null;
  }
};

// =================================================================
// PLAY NOTIFICATION SOUND
// =================================================================
const playNotificationSound = () => {
  try {
    // Simple beep using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 880;
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
    oscillator.stop(audioContext.currentTime + 0.5);
    
    // Resume audio context if suspended
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  } catch (err) {
    console.log("Sound notification not supported");
  }
};

// =================================================================
// LOAD PO DATA
// =================================================================
const loadPOData = async () => {
  if (!State.poId) {
    Toast.error("No PO ID provided");
    window.location.href = CONFIG.ROUTES.OEM_ORDERS;
    return;
  }
  
  setLoading(true);
  
  try {
    const response = await API.get(`/oem/purchase-orders/${State.poId}`);
    
    if (!response.purchaseOrder) {
      Toast.error("Purchase Order not found");
      window.location.href = CONFIG.ROUTES.OEM_ORDERS;
      return;
    }
    
    State.poData = response.purchaseOrder;
    renderPODetails(State.poData);
    
  } catch (err) {
    console.error("Load PO error:", err);
    Toast.error(err.message || "Failed to load PO details");
  } finally {
    setLoading(false);
  }
};

// =================================================================
// BIND EVENT LISTENERS
// =================================================================
const bindEvents = () => {
  // Send PO button
  el("sendPoBtn")?.addEventListener("click", sendPOToSupplier);
  el("resendBtn")?.addEventListener("click", resendPO);
  
  // Signature modal
  el("addSignatureBtn")?.addEventListener("click", openSignatureModal);
  el("submitSignatureBtn")?.addEventListener("click", submitSignature);
  el("closeSignatureModal")?.addEventListener("click", closeSignatureModal);
  el("cancelSignatureBtn")?.addEventListener("click", closeSignatureModal);
  
  // Revision modal
  el("requestRevisionBtn")?.addEventListener("click", openRevisionModal);
  el("submitRevisionBtn")?.addEventListener("click", requestRevision);
  el("closeRevisionModal")?.addEventListener("click", closeRevisionModal);
  el("cancelRevisionBtn")?.addEventListener("click", closeRevisionModal);
  
  // Cancel PO
  el("cancelPoBtn")?.addEventListener("click", cancelPO);
  
  // View revised PO
  el("viewRevisedBtn")?.addEventListener("click", viewRevisedPO);
  
  // Back button
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.OEM_ORDERS;
  });
  
  // Modal close on overlay click
  el("signatureModal")?.addEventListener("click", (e) => {
    if (e.target === el("signatureModal")) closeSignatureModal();
  });
  
  el("revisionModal")?.addEventListener("click", (e) => {
    if (e.target === el("revisionModal")) closeRevisionModal();
  });
  
  // Escape key closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (State.signatureModalOpen) closeSignatureModal();
      closeRevisionModal();
    }
  });
  
  // Sidebar / auth
  el("logoutBtn")?.addEventListener("click", () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
};

// =================================================================
// GET STATUS CLASS FOR BADGE
// =================================================================
const getStatusClass = (status) => {
  const statusMap = {
    draft: "neutral",
    sent: "info",
    supplier_reviewing: "warning",
    accepted: "success",
    revision_requested: "warning",
    rejected: "danger",
    active: "success",
    cancelled: "neutral"
  };
  return statusMap[status] || "neutral";
};

// =================================================================
// INITIALIZE
// =================================================================
const init = () => {
  // Get PO ID from URL
  State.poId = getQueryParam("id");
  
  if (!State.poId) {
    Toast.error("No Purchase Order selected");
    setTimeout(() => {
      window.location.href = CONFIG.ROUTES.OEM_ORDERS;
    }, 2000);
    return;
  }
  
  // Set company name in header
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "OEM");
  
  // Bind events
  bindEvents();
  
  // Load PO data
  loadPOData();
};

// Stop polling on page unload
window.addEventListener("beforeunload", () => {
  stopPolling();
});

// Stop polling when page is hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
  } else if (State.poData?.status === "sent" || State.poData?.status === "supplier_reviewing") {
    startPolling();
    pollSupplierResponse(); // Immediate check
  }
});

document.addEventListener("DOMContentLoaded", init);