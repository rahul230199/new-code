/* =============================================================
   AXO NETWORKS — OEM REVISION RESPONSE
   pages/oem/po-revision-response.js

   PRD Alignment: Page 5 (Supplier requests revision → OEM response)
   
   Workflow:
   - View supplier revision request details
   - Review proposed changes
   - Accept revision request (apply changes)
   - Reject revision request (maintain original terms)
   - Counter-propose alternative changes
   
   Backend endpoints:
     GET  /api/oem/purchase-orders/:poId/revision    → Get revision request details
     POST /api/oem/purchase-orders/:poId/revision/accept   → Accept revision
     POST /api/oem/purchase-orders/:poId/revision/reject   → Reject revision
     POST /api/oem/purchase-orders/:poId/revision/counter  → Counter proposal
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
// Guard — OEM + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  poId: null,                    // PO ID from URL
  poData: null,                  // Full PO data
  revisionData: null,            // Revision request data
  activeTab: "revision",         // Current tab: revision, original, compare
  isSubmitting: false,           // Prevent double submission
  acceptedChanges: new Set(),    // Track which changes OEM accepts
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
  
  const container = el("revisionResponseContainer");
  if (container) {
    if (isLoading) {
      container.classList.add("loading");
    } else {
      container.classList.remove("loading");
    }
  }
};

// =================================================================
// RENDER REVISION REQUEST DETAILS
// =================================================================
const renderRevisionDetails = (revision) => {
  // Revision header
  setText("revisionRequestedBy", revision.requested_by || "Supplier");
  setText("revisionRequestedDate", formatDate(revision.created_at));
  setText("revisionReason", sanitizeHTML(revision.reason || "No reason provided"));
  
  if (revision.details) {
    setHTML("revisionDetails", sanitizeHTML(revision.details));
    showEl("revisionDetailsSection");
  } else {
    hideEl("revisionDetailsSection");
  }
  
  // Render changed fields
  if (revision.changes && revision.changes.length > 0) {
    renderChangedFields(revision.changes);
    showEl("changesSection");
  } else {
    hideEl("changesSection");
  }
};

// =================================================================
// RENDER CHANGED FIELDS WITH COMPARE VIEW
// =================================================================
const renderChangedFields = (changes) => {
  const container = el("changesList");
  if (!container) return;
  
  if (!changes.length) {
    container.innerHTML = '<div class="text-muted">No specific changes listed</div>';
    return;
  }
  
  let html = '';
  changes.forEach((change, index) => {
    const isAccepted = State.acceptedChanges.has(change.field);
    const fieldLabel = getFieldLabel(change.field);
    
    html += `
      <div class="change-item" data-field="${change.field}">
        <div class="change-item__header">
          <div class="change-item__field">
            <i class="fas fa-edit"></i>
            <span>${fieldLabel}</span>
          </div>
          <label class="change-item__accept">
            <input type="checkbox" class="js-accept-change" data-field="${change.field}" ${isAccepted ? 'checked' : ''}>
            <span>Accept this change</span>
          </label>
        </div>
        <div class="change-item__compare">
          <div class="compare-old">
            <span class="compare-label">Current:</span>
            <span class="compare-value">${formatChangeValue(change.field, change.old_value)}</span>
          </div>
          <div class="compare-new">
            <span class="compare-label">Requested:</span>
            <span class="compare-value highlight">${formatChangeValue(change.field, change.new_value)}</span>
          </div>
        </div>
        ${change.reason ? `<div class="change-item__reason">Reason: ${sanitizeHTML(change.reason)}</div>` : ''}
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Bind checkbox events
  document.querySelectorAll('.js-accept-change').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const field = checkbox.dataset.field;
      if (checkbox.checked) {
        State.acceptedChanges.add(field);
      } else {
        State.acceptedChanges.delete(field);
      }
      updateAcceptAllCheckbox();
    });
  });
};

// =================================================================
// GET HUMAN-READABLE FIELD LABEL
// =================================================================
const getFieldLabel = (field) => {
  const labels = {
    delivery_date: "Delivery Date",
    payment_terms: "Payment Terms",
    quantity: "Quantity",
    unit_price: "Unit Price",
    total_value: "Total Value",
    currency: "Currency",
    special_instructions: "Special Instructions",
    shipping_requirements: "Shipping Requirements",
    part_name: "Part Name",
    part_number: "Part Number"
  };
  return labels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// =================================================================
// FORMAT CHANGE VALUE FOR DISPLAY
// =================================================================
const formatChangeValue = (field, value) => {
  if (!value) return "—";
  
  switch(field) {
    case "delivery_date":
      return formatDate(value);
    case "unit_price":
    case "total_value":
      return formatCurrency(parseFloat(value), State.poData?.currency || "USD");
    case "quantity":
      return `${parseInt(value)} units`;
    case "payment_terms":
      return sanitizeHTML(value);
    default:
      return sanitizeHTML(String(value));
  }
};

// =================================================================
// RENDER ORIGINAL PO VALUES
// =================================================================
const renderOriginalValues = (po) => {
  setText("originalDeliveryDate", formatDate(po.delivery_date) || "Not set");
  setText("originalPaymentTerms", po.payment_terms || "Net 30");
  setText("originalQuantity", `${po.quantity || 0} units`);
  setText("originalUnitPrice", formatCurrency(po.unit_price || 0, po.currency || "USD"));
  setText("originalTotalValue", formatCurrency(po.total_value || 0, po.currency || "USD"));
  setText("originalSpecialInstructions", po.special_instructions || "None");
  setText("originalShippingRequirements", po.shipping_requirements || "None");
};

// =================================================================
// RENDER REQUESTED VALUES (After changes)
// =================================================================
const renderRequestedValues = (revision) => {
  // Apply changes to display requested values
  const requested = { ...State.poData };
  
  if (revision.changes) {
    revision.changes.forEach(change => {
      requested[change.field] = change.new_value;
    });
  }
  
  setText("requestedDeliveryDate", formatDate(requested.delivery_date) || "Not set");
  setText("requestedPaymentTerms", requested.payment_terms || "Net 30");
  setText("requestedQuantity", `${requested.quantity || 0} units`);
  setText("requestedUnitPrice", formatCurrency(requested.unit_price || 0, requested.currency || "USD"));
  setText("requestedTotalValue", formatCurrency(requested.total_value || 0, requested.currency || "USD"));
  setText("requestedSpecialInstructions", requested.special_instructions || "None");
  setText("requestedShippingRequirements", requested.shipping_requirements || "None");
};

// =================================================================
// RENDER COMPARE VIEW (Side by side)
// =================================================================
const renderCompareView = () => {
  if (!State.poData || !State.revisionData) return;
  
  renderOriginalValues(State.poData);
  renderRequestedValues(State.revisionData);
};

// =================================================================
// UPDATE ACCEPT ALL CHECKBOX
// =================================================================
const updateAcceptAllCheckbox = () => {
  const acceptAllCheckbox = el("acceptAllChanges");
  if (!acceptAllCheckbox || !State.revisionData?.changes) return;
  
  const allAccepted = State.revisionData.changes.every(
    change => State.acceptedChanges.has(change.field)
  );
  
  acceptAllCheckbox.checked = allAccepted;
  
  // Update button states
  const acceptSelectedBtn = el("acceptSelectedBtn");
  if (acceptSelectedBtn) {
    acceptSelectedBtn.disabled = State.acceptedChanges.size === 0;
  }
};

// =================================================================
// TOGGLE ACCEPT ALL CHANGES
// =================================================================
const toggleAcceptAll = (e) => {
  const isChecked = e.target.checked;
  
  if (State.revisionData?.changes) {
    State.revisionData.changes.forEach(change => {
      if (isChecked) {
        State.acceptedChanges.add(change.field);
      } else {
        State.acceptedChanges.delete(change.field);
      }
    });
  }
  
  // Update all checkboxes
  document.querySelectorAll('.js-accept-change').forEach(checkbox => {
    checkbox.checked = isChecked;
  });
  
  updateAcceptAllCheckbox();
};

// =================================================================
// ACCEPT SELECTED CHANGES
// =================================================================
const acceptSelectedChanges = async () => {
  if (State.acceptedChanges.size === 0) {
    Toast.warning("Please select at least one change to accept");
    return;
  }
  
  if (State.isSubmitting) return;
  
  // Show confirmation dialog
  const confirmed = confirm(
    `Are you sure you want to accept ${State.acceptedChanges.size} change(s)?\n\n` +
    `The selected changes will be applied to the Purchase Order.`
  );
  
  if (!confirmed) return;
  
  State.isSubmitting = true;
  setLoading(true, "acceptSelectedBtn");
  
  try {
    const response = await API.post(`/oem/purchase-orders/${State.poId}/revision/accept`, {
      accepted_fields: Array.from(State.acceptedChanges),
      notes: el("responseNotes")?.value.trim() || null
    });
    
    if (response.success) {
      Toast.success("Changes accepted and applied to PO!");
      
      // Notify supplier
      Toast.info("Supplier has been notified of your decision");
      
      // Redirect to order details
      setTimeout(() => {
        window.location.href = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${State.poId}`;
      }, 2000);
      
    } else {
      Toast.error(response.error || "Failed to accept changes");
    }
    
  } catch (err) {
    console.error("Accept changes error:", err);
    Toast.error(err.message || "Failed to accept changes");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "acceptSelectedBtn");
  }
};

// =================================================================
// REJECT REVISION REQUEST
// =================================================================
const rejectRevisionRequest = async () => {
  if (State.isSubmitting) return;
  
  const reason = el("rejectReason")?.value.trim();
  
  const confirmed = confirm(
    "Are you sure you want to reject this revision request?\n\n" +
    "The supplier will be notified and the original PO terms will remain unchanged."
  );
  
  if (!confirmed) return;
  
  State.isSubmitting = true;
  setLoading(true, "rejectRevisionBtn");
  
  try {
    const response = await API.post(`/oem/purchase-orders/${State.poId}/revision/reject`, {
      reason: reason || null
    });
    
    if (response.success) {
      Toast.info("Revision request rejected");
      Toast.info("Supplier has been notified");
      
      // Redirect back to PO send page
      setTimeout(() => {
        window.location.href = `/oem-po-send.html?id=${State.poId}`;
      }, 2000);
      
    } else {
      Toast.error(response.error || "Failed to reject revision");
    }
    
  } catch (err) {
    console.error("Reject revision error:", err);
    Toast.error(err.message || "Failed to reject revision");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "rejectRevisionBtn");
  }
};

// =================================================================
// OPEN COUNTER PROPOSAL MODAL
// =================================================================
const openCounterModal = () => {
  showEl("counterModal");
  
  // Pre-fill with current values from revision request
  if (State.revisionData?.changes) {
    const changes = State.revisionData.changes;
    changes.forEach(change => {
      const input = el(`counter_${change.field}`);
      if (input) {
        input.value = change.new_value;
      }
    });
  }
  
  el("counterNotes")?.focus();
};

// =================================================================
// SUBMIT COUNTER PROPOSAL
// =================================================================
const submitCounterProposal = async () => {
  if (State.isSubmitting) return;
  
  // Collect counter proposal values
  const counterProposal = {};
  
  if (State.revisionData?.changes) {
    State.revisionData.changes.forEach(change => {
      const input = el(`counter_${change.field}`);
      if (input && input.value) {
        counterProposal[change.field] = input.value;
      }
    });
  }
  
  const notes = el("counterNotes")?.value.trim();
  
  if (Object.keys(counterProposal).length === 0 && !notes) {
    Toast.warning("Please provide counter proposal details");
    return;
  }
  
  const confirmed = confirm(
    "Send counter proposal to supplier?\n\n" +
    "The supplier will review your counter proposal and respond."
  );
  
  if (!confirmed) return;
  
  State.isSubmitting = true;
  setLoading(true, "submitCounterBtn");
  
  try {
    const response = await API.post(`/oem/purchase-orders/${State.poId}/revision/counter`, {
      counter_proposal: counterProposal,
      notes: notes
    });
    
    if (response.success) {
      Toast.success("Counter proposal sent to supplier");
      closeCounterModal();
      
      // Update status
      Toast.info("Awaiting supplier response to counter proposal");
      
      // Refresh page data
      loadRevisionData();
      
    } else {
      Toast.error(response.error || "Failed to send counter proposal");
    }
    
  } catch (err) {
    console.error("Counter proposal error:", err);
    Toast.error(err.message || "Failed to send counter proposal");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "submitCounterBtn");
  }
};

// =================================================================
// CLOSE MODALS
// =================================================================
const closeCounterModal = () => {
  hideEl("counterModal");
};

// =================================================================
// SWITCH TABS
// =================================================================
const switchTab = (tab) => {
  State.activeTab = tab;
  
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  // Show/hide tab content
  hideEl("revisionTabContent");
  hideEl("originalTabContent");
  hideEl("compareTabContent");
  
  if (tab === "revision") showEl("revisionTabContent");
  if (tab === "original") showEl("originalTabContent");
  if (tab === "compare") showEl("compareTabContent");
  
  // Refresh compare view if needed
  if (tab === "compare") {
    renderCompareView();
  }
};

// =================================================================
// LOAD REVISION DATA
// =================================================================
const loadRevisionData = async () => {
  if (!State.poId) {
    Toast.error("No PO ID provided");
    window.location.href = CONFIG.ROUTES.OEM_ORDERS;
    return;
  }
  
  setLoading(true);
  
  try {
    const response = await API.get(`/oem/purchase-orders/${State.poId}/revision`);
    
    if (!response.revision) {
      Toast.error("No revision request found");
      window.location.href = `/oem-po-send.html?id=${State.poId}`;
      return;
    }
    
    State.revisionData = response.revision;
    State.poData = response.purchaseOrder;
    
    // Initialize accepted changes (default: accept all)
    if (State.revisionData.changes) {
      State.revisionData.changes.forEach(change => {
        State.acceptedChanges.add(change.field);
      });
    }
    
    renderRevisionDetails(State.revisionData);
    renderCompareView();
    
  } catch (err) {
    console.error("Load revision error:", err);
    Toast.error(err.message || "Failed to load revision request");
  } finally {
    setLoading(false);
  }
};

// =================================================================
// BIND EVENT LISTENERS
// =================================================================
const bindEvents = () => {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  
  // Accept all checkbox
  el("acceptAllChanges")?.addEventListener("change", toggleAcceptAll);
  
  // Action buttons
  el("acceptSelectedBtn")?.addEventListener("click", acceptSelectedChanges);
  el("rejectRevisionBtn")?.addEventListener("click", rejectRevisionRequest);
  el("counterProposalBtn")?.addEventListener("click", openCounterModal);
  
  // Counter modal
  el("submitCounterBtn")?.addEventListener("click", submitCounterProposal);
  el("closeCounterModal")?.addEventListener("click", closeCounterModal);
  el("cancelCounterBtn")?.addEventListener("click", closeCounterModal);
  
  // Modal close on overlay click
  el("counterModal")?.addEventListener("click", (e) => {
    if (e.target === el("counterModal")) closeCounterModal();
  });
  
  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCounterModal();
    }
  });
  
  // Back button
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = `/oem-po-send.html?id=${State.poId}`;
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
      window.location.href = CONFIG.ROUTES.OEM_ORDERS;
    }, 2000);
    return;
  }
  
  // Set company name in header
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "OEM");
  
  // Bind events
  bindEvents();
  
  // Load revision data
  loadRevisionData();
};

document.addEventListener("DOMContentLoaded", init);