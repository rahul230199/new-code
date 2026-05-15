// =============================================================
// SUPPLIER RFQ — FIXED (NO FUNCTION REMOVED)
// =============================================================

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatNumber,
} from "../../core/utils.js";

// Guard
if (!Router.guardPage(["supplier", "both", "admin"])) throw new Error("REDIRECT");

// =============================================================
// STATE
// =============================================================
const State = {
  rfqs: [],
  activeRfqId: null,
  activeRfqTitle: "",
  isSubmitting: false, // ✅ FIX
};

// =============================================================
// DOM HELPERS
// =============================================================
const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };
const showEl = (id) => { const n = el(id); if (n) n.style.display = ""; };
const hideEl = (id) => { const n = el(id); if (n) n.style.display = "none"; };

// =============================================================
// LOADING / EMPTY
// =============================================================
const _listLoading = () => `
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>`;

const _listEmpty = (msg) => `
  <div class="empty-state">
    <span>📥</span>
    <p>${msg}</p>
  </div>`;

// =============================================================
// RENDER
// =============================================================
const renderRFQCard = (rfq) => `
  <div class="rfq-card js-rfq-card"
    data-rfq-id="${rfq.id}"
    data-rfq-title="${sanitizeHTML(rfq.title)}">

    <div class="rfq-card__header">
      <div>
        <div class="rfq-card__title">${sanitizeHTML(rfq.title)}</div>
        <div>${sanitizeHTML(rfq.rfq_number || `RFQ-${rfq.id}`)}</div>
      </div>
      <span class="badge badge--success">Open</span>
    </div>

    <div class="rfq-card__meta">
      <span>${sanitizeHTML(rfq.oem_name || "—")}</span>
      <span>Qty: ${formatNumber(rfq.quantity)}</span>
      <span>${formatDate(rfq.created_at)}</span>
    </div>

    <div class="rfq-card__footer">
      <button class="btn btn--primary js-open-quote"
        data-rfq-id="${rfq.id}"
        data-rfq-title="${sanitizeHTML(rfq.title)}">
        Submit Quote
      </button>
    </div>
  </div>
`;

const renderRFQList = (rfqs) => {
  const container = el("rfqList");
  if (!container) return;

  setText("rfqCount", `${rfqs.length} open RFQs`);

  if (!rfqs.length) {
    container.innerHTML = _listEmpty("No RFQs available");
    return;
  }

  container.innerHTML = rfqs.map(renderRFQCard).join("");
};

// =============================================================
// LOAD
// =============================================================
const loadRFQs = async () => {
  setHTML("rfqList", _listLoading());

  try {
    const { rfqs } = await API.get("/supplier/rfqs/open");
    State.rfqs = rfqs || [];
    renderRFQList(State.rfqs);
  } catch (err) {
    console.error(err);
    Toast.error("Failed to load RFQs");
    setHTML("rfqList", _listEmpty("Failed to load RFQs"));
  }
};

// =============================================================
// MODAL
// =============================================================
const openQuoteModal = (rfqId, rfqTitle) => {
  if (!rfqId) return; // ✅ FIX

  State.activeRfqId = Number(rfqId); // ✅ FIX: ensure number
  State.activeRfqTitle = rfqTitle || "";

  setText("quoteModalTitle", `Submit Quote — ${rfqTitle}`);

  el("quoteForm")?.reset();

  showEl("quoteModal");
  el("quotePrice")?.focus();
};

const closeQuoteModal = () => {
  hideEl("quoteModal");
  State.activeRfqId = null;
  State.activeRfqTitle = "";
};

// =============================================================
// SUBMIT
// =============================================================
const handleQuoteSubmit = async (e) => {
  e.preventDefault();

  if (State.isSubmitting) return; // ✅ FIX

  const price = el("quotePrice")?.value.trim();
  const leadTime = el("leadTime")?.value.trim();

  if (!price || parseFloat(price) <= 0) {
    Toast.warning("Invalid price");
    return;
  }

  if (!leadTime || parseInt(leadTime) <= 0) {
    Toast.warning("Invalid lead time");
    return;
  }

  if (!State.activeRfqId) {
    Toast.error("No RFQ selected");
    return;
  }

  const submitBtn = el("quoteSubmitBtn");

  State.isSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
  }

  try {
    await API.post("/supplier/quotes", {
      rfqId: State.activeRfqId,
      price: parseFloat(price),
      currency: el("currency")?.value || "USD",
      leadTimeDays: parseInt(leadTime),
      paymentTerms: el("paymentTerms")?.value || "Net 30",
      notes: el("quoteNotes")?.value || "",
    });

    Toast.success("Quote submitted");
    closeQuoteModal();

    setTimeout(() => {
      window.location.href = CONFIG.ROUTES.SUPPLIER_QUOTES;
    }, 800);

  } catch (err) {
    if (err.status === 400) {
      Toast.warning(err.message);
    } else {
      Toast.error("Failed to submit quote");
    }
  } finally {
    State.isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Quote";
    }
  }
};

// =============================================================
// EVENTS
// =============================================================
const bindEvents = () => {

  el("rfqList")?.addEventListener("click", (e) => {

    const btn = e.target.closest(".js-open-quote");
    const card = e.target.closest(".js-rfq-card");

    if (btn) {
      openQuoteModal(btn.dataset.rfqId, btn.dataset.rfqTitle);
      return;
    }

    if (card && !e.target.closest("button")) {
      openQuoteModal(card.dataset.rfqId, card.dataset.rfqTitle);
    }
  });

  el("quoteForm")?.addEventListener("submit", handleQuoteSubmit);

  document.querySelectorAll(".js-close-modal").forEach(btn => {
    btn.addEventListener("click", closeQuoteModal);
  });

  el("quoteModal")?.addEventListener("click", (e) => {
    if (e.target === el("quoteModal")) closeQuoteModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeQuoteModal();
  });

  el("refreshBtn")?.addEventListener("click", loadRFQs);

  el("logoutBtn")?.addEventListener("click", () => Auth.logout());

  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
};

// =============================================================
// INIT
// =============================================================
const init = () => {
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "Supplier");

  bindEvents();
  loadRFQs();
};

document.addEventListener("DOMContentLoaded", init);