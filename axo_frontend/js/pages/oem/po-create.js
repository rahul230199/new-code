/* =============================================================
   AXO NETWORKS — OEM PO CREATION
   pages/oem/po-create.js

   PRD Alignment: Pages 2-3 (Quote Acceptance → PO Draft → Review & Edit)
   
   Workflow:
   Step 1: Load quote data from accepted quote
   Step 2: Auto-populate PO form (Buyer Info, Supplier Info, Order Info, Line Items)
   Step 3: OEM reviews and edits (delivery date, payment terms, special instructions)
   Step 4: Save as draft OR Send to supplier
   
   Backend endpoints:
     GET  /api/oem/quotes/:quoteId      → Get quote details
     POST /api/oem/purchase-orders/draft → Save PO as draft
     POST /api/oem/purchase-orders/send  → Send PO to supplier
   ============================================================= */

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import {
  sanitizeHTML,
  formatCurrency,
  formatDate,
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
  quoteId: null,           // Quote ID from URL
  quoteData: null,         // Full quote data from API
  poNumber: null,          // Generated PO number (if draft exists)
  poId: null,              // Existing PO ID (if editing draft)
  isDraft: false,          // Whether we're editing an existing draft
  isSubmitting: false,     // Prevent double submission
  formData: {
    // Order Information
    deliveryDate: "",
    paymentTerms: "Net 30",
    currency: "USD",
    specialInstructions: "",
    shippingRequirements: "",
    
    // Line Items (auto from quote, can be modified)
    quantity: 0,
    unitPrice: 0,
    totalValue: 0,
    
    // Notes
    internalNotes: "",
  },
};

// =================================================================
// DOM ELEMENTS
// =================================================================
const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setVal = (id, val) => { const n = el(id); if (n) n.value = val ?? ""; };
const getVal = (id) => el(id)?.value ?? "";
const showEl = (id) => { const n = el(id); if (n) n.style.display = ""; };
const hideEl = (id) => { const n = el(id); if (n) n.style.display = "none"; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };

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
      btn.textContent = isLoading ? `<i class="fas fa-spinner fa-spin"></i> ${originalText}...` : originalText;
    }
  }
  
  const formContainer = el("poFormContainer");
  if (formContainer) {
    if (isLoading) {
      formContainer.classList.add("loading");
    } else {
      formContainer.classList.remove("loading");
    }
  }
};

// =================================================================
// CURRENCY FORMATTING (Live display)
// =================================================================
const formatLiveCurrency = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const updateLiveCalculations = () => {
  const quantity = parseFloat(getVal("quantity")) || 0;
  const unitPrice = parseFloat(getVal("unitPrice")) || 0;
  const totalValue = quantity * unitPrice;
  
  State.formData.quantity = quantity;
  State.formData.unitPrice = unitPrice;
  State.formData.totalValue = totalValue;
  
  const subtotalEl = el("subtotalValue");
  if (subtotalEl) subtotalEl.textContent = formatLiveCurrency(totalValue);
  
  // Update grand total (subtotal + tax + shipping)
  const tax = 0; // Can be customized later
  const shipping = 0; // Can be customized later
  const grandTotal = totalValue + tax + shipping;
  const grandTotalEl = el("grandTotalValue");
  if (grandTotalEl) grandTotalEl.textContent = formatLiveCurrency(grandTotal);
};

// =================================================================
// POPULATE FORM FROM QUOTE DATA (PRD Page 2-3)
// =================================================================
const populateFormFromQuote = (quote) => {
  // Order Information
  setVal("quantity", quote.quantity);
  setVal("unitPrice", quote.price);
  setVal("currency", quote.currency || "USD");
  setVal("paymentTerms", quote.payment_terms || "Net 30");
  
  // Part Information
  setText("partNameDisplay", quote.part_name || "—");
  setText("partNumberDisplay", quote.part_number || "—");
  setText("descriptionDisplay", quote.description || "—");
  
  // Buyer Information (from logged-in user)
  const user = Auth.getCurrentUser();
  setText("buyerCompany", user?.company_name || "—");
  setText("buyerEmail", user?.email || "—");
  setText("buyerPhone", user?.phone || "—");
  setText("buyerBillingAddress", user?.billing_address || "Not provided");
  setText("buyerShippingAddress", user?.shipping_address || "Same as billing");
  
  // Supplier Information (from quote)
  setText("supplierCompany", quote.supplier_name || "—");
  setText("supplierEmail", quote.supplier_email || "—");
  setText("supplierAddress", quote.supplier_address || "—");
  setText("supplierGst", quote.supplier_gst || "—");
  
  // Ship From Information
  setText("manufacturingFacility", quote.manufacturing_facility || quote.supplier_name || "—");
  setText("dispatchAddress", quote.dispatch_address || quote.supplier_address || "—");
  
  // Order Summary
  setText("poNumberDisplay", State.poNumber || "To be generated");
  setText("orderDateDisplay", formatDate(new Date()));
  setText("expectedDeliveryDate", State.formData.deliveryDate || "To be confirmed");
  
  // Update live calculations
  updateLiveCalculations();
};

// =================================================================
// LOAD QUOTE DATA
// =================================================================
const loadQuoteData = async () => {
  if (!State.quoteId) {
    Toast.error("No quote ID provided");
    window.location.href = CONFIG.ROUTES.OEM_RFQ;
    return false;
  }
  
  setLoading(true, null);
  
  try {
    // Fetch quote details with RFQ information
    const response = await API.get(`/oem/quotes/${State.quoteId}`);
    State.quoteData = response.quote;
    
    if (!State.quoteData) {
      Toast.error("Quote not found");
      window.location.href = CONFIG.ROUTES.OEM_RFQ;
      return false;
    }
    
    // Populate form
    populateFormFromQuote(State.quoteData);
    
    // Generate temporary PO number
    State.poNumber = `PO-${Date.now()}`;
    setText("poNumberDisplay", State.poNumber);
    
    return true;
    
  } catch (err) {
    console.error("Load quote error:", err);
    Toast.error(err.message || "Failed to load quote data");
    return false;
  } finally {
    setLoading(false, null);
  }
};

// =================================================================
// SAVE AS DRAFT (PRD Step 3)
// =================================================================
const saveAsDraft = async () => {
  if (State.isSubmitting) return;
  
  const payload = {
    quoteId: State.quoteId,
    poNumber: State.poNumber,
    poId: State.poId || null,
    
    // Order Information
    deliveryDate: getVal("deliveryDate") || null,
    paymentTerms: getVal("paymentTerms"),
    currency: getVal("currency"),
    specialInstructions: getVal("specialInstructions") || null,
    shippingRequirements: getVal("shippingRequirements") || null,
    
    // Line Items
    quantity: parseFloat(getVal("quantity")) || 0,
    unitPrice: parseFloat(getVal("unitPrice")) || 0,
    totalValue: State.formData.totalValue,
    
    // Notes
    internalNotes: getVal("internalNotes") || null,
  };
  
  State.isSubmitting = true;
  setLoading(true, "saveDraftBtn");
  
  try {
    const response = await API.post("/oem/purchase-orders/draft", payload);
    
    if (response.success) {
      State.poId = response.purchaseOrder?.id;
      State.poNumber = response.purchaseOrder?.po_number || State.poNumber;
      State.isDraft = true;
      
      setText("poNumberDisplay", State.poNumber);
      Toast.success("PO saved as draft");
      
      // Show send button and update UI
      showEl("sendPoBtn");
      el("saveDraftBtn").textContent = "Update Draft";
    } else {
      Toast.error(response.error || "Failed to save draft");
    }
    
  } catch (err) {
    console.error("Save draft error:", err);
    Toast.error(err.message || "Failed to save draft");
  } finally {
    State.isSubmitting = false;
    setLoading(false, "saveDraftBtn");
  }
};

// =================================================================
// SEND PO TO SUPPLIER (PRD Step 4)
// =================================================================
const sendPOToSupplier = async () => {
  if (State.isSubmitting) return;
  
  // Validate required fields
  const deliveryDate = getVal("deliveryDate");
  if (!deliveryDate) {
    Toast.warning("Please set an expected delivery date before sending");
    el("deliveryDate")?.focus();
    return;
  }
  
  const payload = {
    quoteId: State.quoteId,
    poId: State.poId || null,
    poNumber: State.poNumber,
    
    // Order Information
    deliveryDate: deliveryDate,
    paymentTerms: getVal("paymentTerms"),
    currency: getVal("currency"),
    specialInstructions: getVal("specialInstructions") || null,
    shippingRequirements: getVal("shippingRequirements") || null,
    
    // Line Items
    quantity: parseFloat(getVal("quantity")) || 0,
    unitPrice: parseFloat(getVal("unitPrice")) || 0,
    totalValue: State.formData.totalValue,
    
    // Notes
    internalNotes: getVal("internalNotes") || null,
  };
  
  State.isSubmitting = true;
  setLoading(true, "sendPoBtn");
  
  try {
    const response = await API.post("/oem/purchase-orders/send", payload);
    
    if (response.success) {
      Toast.success("PO sent to supplier successfully!");
      
      // Redirect to order details
      setTimeout(() => {
        window.location.href = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${response.purchaseOrder.id}`;
      }, 1500);
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
// HANDLE QUANTITY/PRICE CHANGES
// =================================================================
const bindCalculationEvents = () => {
  const quantityInput = el("quantity");
  const priceInput = el("unitPrice");
  
  if (quantityInput) {
    quantityInput.addEventListener("input", debounce(() => {
      updateLiveCalculations();
    }, 100));
  }
  
  if (priceInput) {
    priceInput.addEventListener("input", debounce(() => {
      updateLiveCalculations();
    }, 100));
  }
};

// =================================================================
// HANDLE CANCEL
// =================================================================
const handleCancel = () => {
  if (confirm("Are you sure you want to cancel? Any unsaved changes will be lost.")) {
    window.location.href = CONFIG.ROUTES.OEM_ORDERS;
  }
};

// =================================================================
// BIND EVENT LISTENERS
// =================================================================
const bindEvents = () => {
  // Buttons
  el("saveDraftBtn")?.addEventListener("click", saveAsDraft);
  el("sendPoBtn")?.addEventListener("click", sendPOToSupplier);
  el("cancelBtn")?.addEventListener("click", handleCancel);
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.OEM_ORDERS;
  });
  
  // Live calculation bindings
  bindCalculationEvents();
  
  // Delivery date minimum (today)
  const deliveryDateInput = el("deliveryDate");
  if (deliveryDateInput) {
    const today = new Date().toISOString().split("T")[0];
    deliveryDateInput.min = today;
  }
  
  // Sidebar / auth
  el("logoutBtn")?.addEventListener("click", () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
};

// =================================================================
// RENDER COMMERCIAL SUMMARY (PRD Page 3)
// =================================================================
const renderCommercialSummary = () => {
  const container = el("commercialSummary");
  if (!container) return;
  
  // This will be updated dynamically via updateLiveCalculations
  // The HTML structure is in the .html file
};

// =================================================================
// CHECK FOR EXISTING DRAFT
// =================================================================
const checkExistingDraft = async () => {
  // Optional: Check if a draft already exists for this quote
  try {
    const response = await API.get(`/oem/purchase-orders/draft?quoteId=${State.quoteId}`);
    if (response.purchaseOrder) {
      State.poId = response.purchaseOrder.id;
      State.poNumber = response.purchaseOrder.po_number;
      State.isDraft = true;
      
      // Load existing draft data
      setVal("deliveryDate", response.purchaseOrder.delivery_date?.split("T")[0] || "");
      setVal("paymentTerms", response.purchaseOrder.payment_terms || "Net 30");
      setVal("currency", response.purchaseOrder.currency || "USD");
      setVal("specialInstructions", response.purchaseOrder.special_instructions || "");
      setVal("shippingRequirements", response.purchaseOrder.shipping_requirements || "");
      setVal("internalNotes", response.purchaseOrder.internal_notes || "");
      setVal("quantity", response.purchaseOrder.quantity);
      setVal("unitPrice", response.purchaseOrder.unit_price);
      
      updateLiveCalculations();
      showEl("sendPoBtn");
      el("saveDraftBtn").textContent = "Update Draft";
    }
  } catch (err) {
    // No existing draft, continue normally
    console.log("No existing draft found");
  }
};

// =================================================================
// INITIALIZE
// =================================================================
const init = async () => {
  // Get quote ID from URL
  State.quoteId = getQueryParam("quoteId");
  
  if (!State.quoteId) {
    Toast.error("No quote selected. Please accept a quote first.");
    setTimeout(() => {
      window.location.href = CONFIG.ROUTES.OEM_RFQ;
    }, 2000);
    return;
  }
  
  // Set company name in header
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "OEM");
  
  // Bind events
  bindEvents();
  
  // Load quote data
  const success = await loadQuoteData();
  if (!success) return;
  
  // Check for existing draft
  await checkExistingDraft();
  
  // Render commercial summary
  renderCommercialSummary();
  
  // Focus on delivery date for quick editing
  setTimeout(() => {
    el("deliveryDate")?.focus();
  }, 500);
};

// =================================================================
// EXPORT (for module usage if needed)
// =================================================================
export { init };

// Auto-initialize on DOM ready
document.addEventListener("DOMContentLoaded", init);