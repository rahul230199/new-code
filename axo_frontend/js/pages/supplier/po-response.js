/* =============================================================
   AXO NETWORKS — SUPPLIER PO RESPONSE
   pages/supplier/po-response.js

   PRD Alignment: Pages 4-5 (Supplier Review, Accept, Sign)
   
   Workflow:
   - View received PO details
   - Accept PO with digital signature
   - Request revisions with comments
   - Reject PO with reason
   
   Backend endpoints:
     GET  /api/supplier/purchase-orders/:poId     → Get PO details
     POST /api/supplier/purchase-orders/:poId/accept   → Accept PO with signature
     POST /api/supplier/purchase-orders/:poId/reject   → Reject PO
     POST /api/supplier/purchase-orders/:poId/revision → Request revisions
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
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard — Supplier + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["supplier", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  poId: null,              // PO ID from URL
  poData: null,            // Full PO data
  activeModal: null,       // Track which modal is open
  isSubmitting: false,     // Prevent double submission
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
  
  const container = el("poResponseContainer");
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
  setText("poStatus", po.status || "Pending");
  setText("oemName", po.oem_company_name || "—");
  setText("oemContact", po.oem_contact_email || "—");
  setText("partName", po.part_name || "—");
  setText("quantity", `${po.quantity || 0} units`);
  setText("unitPrice", formatCurrency(po.unit_price || 0, po.currency || "USD"));
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
  
  // Shipping requirements
  if (po.shipping_requirements) {
    setHTML("shippingRequirements", sanitizeHTML(po.shipping_requirements));
    showEl("shippingRequirementsSection");
  } else {
    hideEl("shippingRequirementsSection");
  }
  
  // Status badge styling
  const statusBadge = el("poStatusBadge");
  if (statusBadge) {
    const statusClass = getStatusClass(po.status);
    statusBadge.className = `badge badge--${statusClass}`;
  }
  
  // Show/hide action buttons based on status
  const isPending = po.status === "sent" || po.status === "supplier_reviewing";
  const isAccepted = po.status === "accepted";
  const isRejected = po.status === "rejected";
  const isExpired = po.status === "expired";
  
  if (isPending) {
    // PO is pending supplier response
    showEl("actionButtonsSection");
    hideEl("alreadyRespondedSection");
    hideEl("expiredSection");
    setText("responseDeadline", formatDate(po.response_deadline) || "7 days from receipt");
    
  } else if (isAccepted) {
    // Already accepted
    hideEl("actionButtonsSection");
    showEl("alreadyRespondedSection");
    setHTML("responseMessage", `You accepted this PO on ${formatDate(po.accepted_at)}`);
    renderSupplierSignature(po);
    
  } else if (isRejected) {
    // Already rejected
    hideEl("actionButtonsSection");
    showEl("alreadyRespondedSection");
    setHTML("responseMessage", `You rejected this PO on ${formatDate(po.rejected_at)}`);
    if (po.rejection_reason) {
      setHTML("rejectionReasonDisplay", sanitizeHTML(po.rejection_reason));
      showEl("rejectionReasonDisplaySection");
    }
    
  } else if (isExpired) {
    // PO expired
    hideEl("actionButtonsSection");
    showEl("expiredSection");
  }
};

// =================================================================
// RENDER SUPPLIER SIGNATURE (if already signed)
// =================================================================
const renderSupplierSignature = (po) => {
  if (po.supplier_signature) {
    setHTML("existingSignatureName", sanitizeHTML(po.supplier_signature.name || "—"));
    setHTML("existingSignatureDesignation", sanitizeHTML(po.supplier_signature.designation || "—"));
    setText("existingSignatureDate", formatDate(po.supplier_signature.date));
    showEl("existingSignatureSection");
  }
};

// =================================================================
// OPEN ACCEPT MODAL (PRD Step 5: Supplier Acceptance)
// =================================================================
const openAcceptModal = () => {
  State.activeModal = "accept";
  showEl("acceptModal");
  
  // Reset form
  setVal("supplierSignatureName", "");
  setVal("supplierSignatureDesignation", "");
  setVal("supplierSignatureDate", new Date().toISOString().split("T")[0]);
  setVal("supplierNotes", "");
  
  // Pre-fill with user data
  const user = Auth.getCurrentUser();
  setVal("supplierSignatureName", user?.company_name || "");
  setVal("supplierSignatureDesignation", user?.role === "supplier" ? "Supplier Representative" : "");
  
  el("supplierSignatureName")?.focus();
};

// =================================================================
// SUBMIT ACCEPTANCE WITH SIGNATURE (PRD Step 5)
// =================================================================
const submitAcceptance = async () => {
  const name = el("supplierSignatureName")?.value.trim();
  const designation = el("supplierSignatureDesignation")?.value.trim();
  const date = el("supplierSignatureDate")?.value;
  const notes = el("supplierNotes")?.value.trim();
  
  if (!name) {
    Toast.warning("Please enter your name");
    el("supplierSignatureName")?.focus();
    return;
  }
  
  if (!designation) {
    Toast.warning("Please enter your designation");
    el("supplierSignatureDesignation")?.focus();
    return;
  }
  
  if (State.isSubmitting) return;
  
  State.isSubmitting = true;
  setLoading(true, "acceptSubmitBtn");
  
  try {
    const response = await API.post(`/supplier/purchase-orders/${State.poId}/accept`, {
      signature: {
        name,
        designation,
        date: date || new Date().toISOString(),
      },
      notes: notes || null
    });
    
    if (response.success) {
      Toast.success("Purchase Order accepted successfully!");
      closeAcceptModal();
      
      // Update local state
      State.poData = response.purchaseOrder;
      renderPODetails(State.poData);
      
      // Show success message
      Toast.info("The OEM has been notified of your acceptance");
      
      // Optional: Redirect to orders page after 3 seconds
      setTimeout(() => {
        if (confirm("PO accepted! Would you like to view all your orders?")) {
          window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
        }
      }, 3000);
      
    } else {
      Toast.error(response.error || "Failed to accept PO");
    }
    
  } catch (err) {
    console.error("Accept PO error:", err);
    Toast.error(err.message || "Failed to accept PO");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "acceptSubmitBtn");
  }
};

// =================================================================
// OPEN REJECT MODAL
// =================================================================
const openRejectModal = () => {
  State.activeModal = "reject";
  showEl("rejectModal");
  setVal("rejectReason", "");
  el("rejectReason")?.focus();
};

// =================================================================
// SUBMIT REJECTION
// =================================================================
const submitRejection = async () => {
  const reason = el("rejectReason")?.value.trim();
  
  if (!reason) {
    Toast.warning("Please provide a reason for rejection");
    el("rejectReason")?.focus();
    return;
  }
  
  if (State.isSubmitting) return;
  
  State.isSubmitting = true;
  setLoading(true, "rejectSubmitBtn");
  
  try {
    const response = await API.post(`/supplier/purchase-orders/${State.poId}/reject`, {
      reason: reason
    });
    
    if (response.success) {
      Toast.success("Purchase Order rejected");
      closeRejectModal();
      
      // Update local state
      State.poData = response.purchaseOrder;
      renderPODetails(State.poData);
      
      // Optional: Redirect after 2 seconds
      setTimeout(() => {
        window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
      }, 2000);
      
    } else {
      Toast.error(response.error || "Failed to reject PO");
    }
    
  } catch (err) {
    console.error("Reject PO error:", err);
    Toast.error(err.message || "Failed to reject PO");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "rejectSubmitBtn");
  }
};

// =================================================================
// OPEN REVISION MODAL
// =================================================================
const openRevisionModal = () => {
  State.activeModal = "revision";
  showEl("revisionModal");
  setVal("revisionReason", "");
  setVal("revisionDetails", "");
  el("revisionReason")?.focus();
};

// =================================================================
// SUBMIT REVISION REQUEST (PRD Step 5: Request Revision)
// =================================================================
const submitRevision = async () => {
  const reason = el("revisionReason")?.value.trim();
  const details = el("revisionDetails")?.value.trim();
  
  if (!reason) {
    Toast.warning("Please provide a reason for revision");
    el("revisionReason")?.focus();
    return;
  }
  
  if (State.isSubmitting) return;
  
  State.isSubmitting = true;
  setLoading(true, "revisionSubmitBtn");
  
  try {
    const response = await API.post(`/supplier/purchase-orders/${State.poId}/revision`, {
      reason: reason,
      details: details || null
    });
    
    if (response.success) {
      Toast.info("Revision request sent to OEM");
      closeRevisionModal();
      
      // Update local state
      State.poData = response.purchaseOrder;
      renderPODetails(State.poData);
      
      Toast.info("The OEM has been notified of your revision request");
      
      // Stay on page to wait for response
      
    } else {
      Toast.error(response.error || "Failed to request revision");
    }
    
  } catch (err) {
    console.error("Revision request error:", err);
    Toast.error(err.message || "Failed to request revision");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "revisionSubmitBtn");
  }
};

// =================================================================
// DOWNLOAD PO PDF
// =================================================================
const downloadPO = async () => {
  if (State.isSubmitting) return;
  
  State.isSubmitting = true;
  
  try {
    // Use window.open for PDF download
    const token = Auth.getToken();
    const downloadUrl = `/api/supplier/purchase-orders/${State.poId}/download?token=${encodeURIComponent(token)}`;
    window.open(downloadUrl, '_blank');
    
    Toast.success("Download started");
    
  } catch (err) {
    console.error("Download error:", err);
    Toast.error("Failed to download PO");
  } finally {
    State.isSubmitting = false;
  }
};

// =================================================================
// CLOSE MODALS
// =================================================================
const closeAcceptModal = () => {
  State.activeModal = null;
  hideEl("acceptModal");
};

const closeRejectModal = () => {
  State.activeModal = null;
  hideEl("rejectModal");
};

const closeRevisionModal = () => {
  State.activeModal = null;
  hideEl("revisionModal");
};

const closeAllModals = () => {
  closeAcceptModal();
  closeRejectModal();
  closeRevisionModal();
};

// =================================================================
// LOAD PO DATA
// =================================================================
const loadPOData = async () => {
  if (!State.poId) {
    Toast.error("No Purchase Order selected");
    window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
    return;
  }
  
  setLoading(true);
  
  try {
    const response = await API.get(`/supplier/purchase-orders/${State.poId}`);
    
    if (!response.purchaseOrder) {
      Toast.error("Purchase Order not found");
      window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
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
    expired: "danger",
    cancelled: "neutral"
  };
  return statusMap[status] || "neutral";
};

// =================================================================
// BIND EVENT LISTENERS
// =================================================================
const bindEvents = () => {
  // Action buttons
  el("acceptPoBtn")?.addEventListener("click", openAcceptModal);
  el("rejectPoBtn")?.addEventListener("click", openRejectModal);
  el("requestRevisionBtn")?.addEventListener("click", openRevisionModal);
  el("downloadPoBtn")?.addEventListener("click", downloadPO);
  
  // Accept modal
  el("acceptSubmitBtn")?.addEventListener("click", submitAcceptance);
  el("closeAcceptModal")?.addEventListener("click", closeAcceptModal);
  el("cancelAcceptBtn")?.addEventListener("click", closeAcceptModal);
  
  // Reject modal
  el("rejectSubmitBtn")?.addEventListener("click", submitRejection);
  el("closeRejectModal")?.addEventListener("click", closeRejectModal);
  el("cancelRejectBtn")?.addEventListener("click", closeRejectModal);
  
  // Revision modal
  el("revisionSubmitBtn")?.addEventListener("click", submitRevision);
  el("closeRevisionModal")?.addEventListener("click", closeRevisionModal);
  el("cancelRevisionBtn")?.addEventListener("click", closeRevisionModal);
  
  // Modal close on overlay click
  el("acceptModal")?.addEventListener("click", (e) => {
    if (e.target === el("acceptModal")) closeAcceptModal();
  });
  
  el("rejectModal")?.addEventListener("click", (e) => {
    if (e.target === el("rejectModal")) closeRejectModal();
  });
  
  el("revisionModal")?.addEventListener("click", (e) => {
    if (e.target === el("revisionModal")) closeRevisionModal();
  });
  
  // Escape key closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
  });
  
  // Back button
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
  });
  
  // View order details (if accepted)
  el("viewOrderBtn")?.addEventListener("click", () => {
    window.location.href = `${CONFIG.ROUTES.SUPPLIER_ORDER_DETAILS}?id=${State.poId}`;
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
const init = () => {
  // Get PO ID from URL
  State.poId = getQueryParam("id");
  
  if (!State.poId) {
    Toast.error("No Purchase Order selected");
    setTimeout(() => {
      window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
    }, 2000);
    return;
  }
  
  // Set company name in header
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "Supplier");
  
  // Bind events
  bindEvents();
  
  // Load PO data
  loadPOData();
};

document.addEventListener("DOMContentLoaded", init);