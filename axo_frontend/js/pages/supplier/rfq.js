/* =============================================================
   AXO NETWORKS — SUPPLIER RFQ INBOX
   pages/supplier/rfq.js

   Features:
   - Browse all open RFQs from OEMs
   - Submit a quote on any RFQ via modal form
   - After successful quote → redirects to My Quotes page

   Backend endpoints used:
     GET  /api/supplier/rfqs/open
       → { rfqs: [ { id, rfq_number, title, part_name,
                      quantity, description, oem_name, created_at } ] }
     POST /api/supplier/quotes
       → { success, quote: { id, quote_number, price, status } }
       Body: { rfqId, price, currency, leadTimeDays, paymentTerms, notes }
   ============================================================= */

import Router  from "../../core/router.js";
import API     from "../../core/api.js";
import Auth    from "../../core/auth.js";
import Toast   from "../../core/toast.js";
import CONFIG  from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatNumber,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard
// -----------------------------------------------------------------
if (!Router.guardPage(["supplier", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  rfqs:          [],
  activeRfqId:   null,   // RFQ currently open in quote modal
  activeRfqTitle: "",
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)       => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML   = html; };
const showEl  = (id)       => { const n = el(id); if (n) n.style.display = ""; };
const hideEl  = (id)       => { const n = el(id); if (n) n.style.display = "none"; };

const _listLoading = () => `
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>`;

const _listEmpty = (msg) => `
  <div class="empty-state">
    <span class="empty-state__icon">📥</span>
    <p class="empty-state__msg">${msg}</p>
  </div>`;

// =================================================================
// RENDER — RFQ CARDS
// =================================================================
const renderRFQCard = (rfq) => `
  <div
    class="rfq-card js-rfq-card"
    data-rfq-id="${rfq.id}"
    data-rfq-title="${sanitizeHTML(rfq.title)}"
  >
    <div class="rfq-card__header">
      <div>
        <div class="rfq-card__title">${sanitizeHTML(rfq.title)}</div>
        <div class="rfq-card__number">
          ${sanitizeHTML(rfq.rfq_number || `RFQ-${rfq.id}`)}
        </div>
      </div>
      <span class="badge badge--success">Open</span>
    </div>

    <div class="rfq-card__meta">
      <span>${sanitizeHTML(rfq.oem_name || "—")}</span>
      <span>Qty: ${formatNumber(rfq.quantity)}</span>
      ${rfq.part_name
        ? `<span>Part: ${sanitizeHTML(rfq.part_name)}</span>`
        : ""}
      <span>Posted: ${formatDate(rfq.created_at)}</span>
    </div>

    ${rfq.description
      ? `<p class="rfq-card__description">
           ${sanitizeHTML(rfq.description)}
         </p>`
      : ""}

    <div class="rfq-card__footer">
      <button
        class="btn btn--primary btn--sm js-open-quote"
        data-rfq-id="${rfq.id}"
        data-rfq-title="${sanitizeHTML(rfq.title)}"
        aria-label="Submit quote for ${sanitizeHTML(rfq.title)}"
      >
        Submit Quote
      </button>
    </div>
  </div>`;

const renderRFQList = (rfqs) => {
  const container = el("rfqList");
  if (!container) return;

  setText("rfqCount", `${rfqs.length} open RFQ${rfqs.length !== 1 ? "s" : ""}`);

  if (!rfqs.length) {
    container.innerHTML = _listEmpty(
      "No open RFQs available right now. Check back soon for new opportunities."
    );
    return;
  }

  container.innerHTML = rfqs.map(renderRFQCard).join("");
};

// =================================================================
// LOAD RFQs
// =================================================================
const loadRFQs = async () => {
  setHTML("rfqList", _listLoading());

  try {
    const { rfqs } = await API.get("/supplier/rfqs/open");
    State.rfqs = rfqs || [];
    renderRFQList(State.rfqs);
  } catch (err) {
    Toast.error(err.message || "Failed to load RFQs.");
    setHTML("rfqList", _listEmpty("Failed to load RFQs. Please refresh."));
  }
};

// =================================================================
// QUOTE MODAL
// =================================================================
const openQuoteModal = (rfqId, rfqTitle) => {
  State.activeRfqId    = rfqId;
  State.activeRfqTitle = rfqTitle;

  // Show which RFQ is being quoted on
  setText("quoteModalTitle", `Submit Quote — ${rfqTitle}`);

  // Reset form
  el("quoteForm")?.reset();

  showEl("quoteModal");
  // Focus first input for accessibility
  el("quotePrice")?.focus();
};

const closeQuoteModal = () => {
  hideEl("quoteModal");
  State.activeRfqId    = null;
  State.activeRfqTitle = "";
};

// =================================================================
// SUBMIT QUOTE
// =================================================================
const handleQuoteSubmit = async (e) => {
  e.preventDefault();

  const price    = el("quotePrice")?.value.trim()    ?? "";
  const leadTime = el("leadTime")?.value.trim()      ?? "";
  const currency = el("currency")?.value.trim()      || "USD";
  const terms    = el("paymentTerms")?.value.trim()  || "Net 30";
  const notes    = el("quoteNotes")?.value.trim()    || "";

  // Validate required fields
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    Toast.warning("Please enter a valid price.");
    return;
  }
  if (!leadTime || isNaN(parseInt(leadTime)) || parseInt(leadTime) <= 0) {
    Toast.warning("Please enter a valid lead time in days.");
    return;
  }
  if (!State.activeRfqId) {
    Toast.error("No RFQ selected. Please close and try again.");
    return;
  }

  const submitBtn = el("quoteSubmitBtn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting…"; }

  try {
    await API.post("/supplier/quotes", {
      rfqId:        State.activeRfqId,
      price:        parseFloat(price),
      currency,
      leadTimeDays: parseInt(leadTime),
      paymentTerms: terms,
      notes,
    });

    Toast.success("Quote submitted successfully.");
    closeQuoteModal();

    // Redirect to My Quotes so supplier can see their submission
    setTimeout(() => {
      window.location.href = CONFIG.ROUTES.SUPPLIER_QUOTES;
    }, 800);

  } catch (err) {
    // 400 = already quoted on this RFQ (backend enforces one quote per supplier per RFQ)
    if (err.status === 400) {
      Toast.warning(err.message || "You have already submitted a quote for this RFQ.");
    } else {
      Toast.error(err.message || "Failed to submit quote. Please try again.");
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit Quote"; }
  }
};

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── RFQ list — open quote modal ───────────────────────────────
  // Both card click and button click open the modal
  el("rfqList")?.addEventListener("click", (e) => {
    const btn  = e.target.closest(".js-open-quote");
    const card = e.target.closest(".js-rfq-card");

    // Button takes priority
    if (btn) {
      openQuoteModal(btn.dataset.rfqId, btn.dataset.rfqTitle);
      return;
    }

    // Card click (not on a button inside it)
    if (card && !e.target.closest("button")) {
      openQuoteModal(card.dataset.rfqId, card.dataset.rfqTitle);
    }
  });

  // ── Quote form submit ─────────────────────────────────────────
  el("quoteForm")?.addEventListener("submit", handleQuoteSubmit);

  // ── Close modal ───────────────────────────────────────────────
  document.querySelectorAll(".js-close-modal").forEach((btn) => {
    btn.addEventListener("click", closeQuoteModal);
  });

  el("quoteModal")?.addEventListener("click", (e) => {
    if (e.target === el("quoteModal")) closeQuoteModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeQuoteModal();
  });

  // ── Refresh ───────────────────────────────────────────────────
  el("refreshBtn")?.addEventListener("click", loadRFQs);

  // ── Sidebar / auth ────────────────────────────────────────────
  el("logoutBtn")?.addEventListener("click",  () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
};

// =================================================================
// INIT
// =================================================================
const init = () => {
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "Supplier");

  bindEvents();
  loadRFQs();
};

document.addEventListener("DOMContentLoaded", init);