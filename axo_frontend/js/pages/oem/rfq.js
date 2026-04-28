/* =============================================================
   AXO NETWORKS — OEM RFQ MANAGEMENT
   pages/oem/rfq.js

   Features:
   - List all RFQs created by this OEM
   - Create new RFQ via modal form
   - View quotes received per RFQ
   - Accept a quote  → PO auto-created by backend
   - Reject a quote

   Backend endpoints used:
     GET  /api/oem/rfqs
     POST /api/oem/rfqs
     GET  /api/oem/rfqs/:id/quotes
     POST /api/oem/rfqs/quotes/:id/accept
     POST /api/oem/rfqs/quotes/:id/reject
   ============================================================= */

import Router  from "../../core/router.js";
import API     from "../../core/api.js";
import Auth    from "../../core/auth.js";
import Toast   from "../../core/toast.js";
import CONFIG  from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatCurrency,
  formatStatus,
  getStatusClass,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  rfqs:         [],
  activeRfqId:  null,   // which RFQ's quotes are open in the modal
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)       => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML   = html; };
const showEl  = (id, mode = 'flex') => { const n = el(id); if (n) n.style.display = mode; };
const hideEl  = (id)       => { const n = el(id); if (n) n.style.display = "none"; };

const _cardLoading = () => `
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>`;

const _listEmpty = (msg, showCreate = false) => `
  <div class="empty-state">
    <span class="empty-state__icon">📋</span>
    <p class="empty-state__msg">${msg}</p>
    ${showCreate
      ? `<button class="btn btn--primary js-open-create">Create your first RFQ</button>`
      : ""}
  </div>`;

const _quotesLoading = () => `
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>`;

// =================================================================
// RENDER — RFQ CARDS
// =================================================================
const renderRFQCard = (rfq) => {
  const statusClass = getStatusClass(rfq.status);
  const quoteCount  = rfq.quote_count ?? 0;

  return `
    <div class="rfq-card" data-id="${rfq.id}">
      <div class="rfq-card__header">
        <div>
          <div class="rfq-card__title">${sanitizeHTML(rfq.title)}</div>
          <div class="rfq-card__number">${sanitizeHTML(rfq.rfq_number || `RFQ-${rfq.id}`)}</div>
        </div>
        <span class="badge badge--${statusClass}">${formatStatus(rfq.status)}</span>
      </div>

      <div class="rfq-card__meta">
        <span>Part: ${sanitizeHTML(rfq.part_name || rfq.part_number || "—")}</span>
        <span>Qty: ${rfq.quantity ?? "—"} ${sanitizeHTML(rfq.unit || "")}</span>
        <span>Created: ${formatDate(rfq.created_at)}</span>
        ${rfq.target_price
          ? `<span>Target: ${formatCurrency(rfq.target_price, rfq.currency || "USD")}</span>`
          : ""}
      </div>

      <div class="rfq-card__footer">
        <span class="rfq-card__quote-count">
          ${quoteCount} ${quoteCount === 1 ? "quote" : "quotes"} received
        </span>
        <button
          class="btn btn--outline btn--sm js-view-quotes"
          data-rfq-id="${rfq.id}"
          data-rfq-title="${sanitizeHTML(rfq.title)}"
        >
          View Quotes
        </button>
      </div>
    </div>`;
};

const renderRFQList = (rfqs) => {
  const container = el("rfqList");
  if (!container) return;

  if (!rfqs.length) {
    container.innerHTML = _listEmpty("No RFQs created yet.", true);
    return;
  }

  container.innerHTML = rfqs.map(renderRFQCard).join("");
};

// =================================================================
// RENDER — QUOTES (inside modal)
// =================================================================
const renderQuoteCard = (q) => {
  const isAccepted = q.status === "accepted" || q.status === "awarded";
  const isRejected = q.status === "rejected";
  const isPending  = !isAccepted && !isRejected;
  const statusClass = getStatusClass(q.status);

  return `
    <div class="quote-card" data-quote-id="${q.id}">
      <div class="quote-card__header">
        <span class="quote-card__supplier">${sanitizeHTML(q.supplier_name)}</span>
        <span class="quote-card__price">
          ${formatCurrency(q.price, q.currency || "USD")}
        </span>
      </div>

      <div class="quote-card__meta">
        <span>Lead time: ${q.lead_time_days ?? "—"} days</span>
        <span>Payment: ${sanitizeHTML(q.payment_terms || "Net 30")}</span>
        <span>Submitted: ${formatDate(q.submitted_at)}</span>
        <span>
          Status:
          <strong class="badge badge--${statusClass}">${formatStatus(q.status)}</strong>
        </span>
      </div>

      ${q.notes
        ? `<p class="quote-card__notes">${sanitizeHTML(q.notes)}</p>`
        : ""}

      <div class="quote-card__actions">
        ${isPending ? `
          <button class="btn btn--success btn--sm js-accept-quote" data-quote-id="${q.id}">
            Accept Quote
          </button>
          <button class="btn btn--danger btn--sm js-reject-quote" data-quote-id="${q.id}">
            Reject
          </button>
        ` : isAccepted ? `
          <span class="status-message status-message--success">
            ✓ Quote accepted — Purchase Order created
          </span>
        ` : `
          <span class="status-message status-message--danger">
            ✗ Quote rejected
          </span>
        `}
      </div>
    </div>`;
};

// =================================================================
// API CALLS
// =================================================================
const RfqAPI = {
  list: () =>
    API.get("/oem/rfqs"),

  create: (payload) =>
    API.post("/oem/rfqs", payload),

  getQuotes: (rfqId) =>
    API.get(`/oem/rfqs/${rfqId}/quotes`),

  acceptQuote: (quoteId) =>
    API.post(`/oem/rfqs/quotes/${quoteId}/accept`),

  rejectQuote: (quoteId) =>
    API.post(`/oem/rfqs/quotes/${quoteId}/reject`),
};

// =================================================================
// LOAD RFQ LIST
// =================================================================
const loadRFQs = async () => {
  setHTML("rfqList", _cardLoading());

  try {
    const { rfqs } = await RfqAPI.list();
    State.rfqs = rfqs || [];
    renderRFQList(State.rfqs);
  } catch (err) {
    Toast.error(err.message || "Failed to load RFQs.");
    setHTML("rfqList", _listEmpty("Failed to load RFQs. Please refresh."));
  }
};

// =================================================================
// VIEW QUOTES MODAL
// =================================================================
const openQuotesModal = async (rfqId, rfqTitle) => {
  State.activeRfqId = rfqId;

  setText("quotesModalTitle", `Quotes — ${rfqTitle}`);
  setHTML("quotesList", _quotesLoading());
  showEl("quotesModal");

  try {
    const { quotes } = await RfqAPI.getQuotes(rfqId);

    if (!quotes?.length) {
      setHTML("quotesList",
        `<div class="empty-state">
          <span class="empty-state__icon">💬</span>
          <p class="empty-state__msg">No quotes received yet. Suppliers will quote once the RFQ is live.</p>
        </div>`
      );
      return;
    }

    setHTML("quotesList", quotes.map(renderQuoteCard).join(""));

  } catch (err) {
    Toast.error(err.message || "Failed to load quotes.");
    setHTML("quotesList", `<p class="text-error">Failed to load quotes. Please try again.</p>`);
  }
};

const closeQuotesModal = () => {
  hideEl("quotesModal");
  State.activeRfqId = null;
};

// =================================================================
// ACCEPT QUOTE
// =================================================================
const handleAcceptQuote = async (quoteId, btn) => {
  btn.disabled    = true;
  btn.textContent = "Accepting…";

  try {
    await RfqAPI.acceptQuote(quoteId);

    Toast.success("Quote accepted. Purchase Order has been created.");
    closeQuotesModal();
    await loadRFQs(); // Refresh list — RFQ status changes to "awarded"

  } catch (err) {
    Toast.error(err.message || "Failed to accept quote.");
    btn.disabled    = false;
    btn.textContent = "Accept Quote";
  }
};

// =================================================================
// REJECT QUOTE
// =================================================================
const handleRejectQuote = async (quoteId, btn) => {
  btn.disabled    = true;
  btn.textContent = "Rejecting…";

  try {
    await RfqAPI.rejectQuote(quoteId);

    Toast.success("Quote rejected.");

    // Reload quotes in the modal so status updates inline
    if (State.activeRfqId) {
      const rfq = State.rfqs.find((r) => r.id == State.activeRfqId);
      await openQuotesModal(State.activeRfqId, rfq?.title || "");
    }

  } catch (err) {
    Toast.error(err.message || "Failed to reject quote.");
    btn.disabled    = false;
    btn.textContent = "Reject";
  }
};

// =================================================================
// CREATE RFQ MODAL
// =================================================================
const openCreateModal = () => {
  el("createRfqForm")?.reset();
  showEl("createRfqModal");
};

const closeCreateModal = () => hideEl("createRfqModal");

// -----------------------------------------------------------------
// Form validation + submit
// -----------------------------------------------------------------
const _validateCreateForm = (data) => {
  if (!data.title.trim())          return "RFQ title is required.";
  if (!data.quantity || data.quantity <= 0) return "A valid quantity is required.";
  return null;
};

const handleCreateSubmit = async (e) => {
  e.preventDefault();

  const payload = {
    title:       el("rfqTitle")?.value.trim()          || "",
    partNumber:  el("partNumber")?.value.trim()        || "",
    partName:    el("partName")?.value.trim()          || "",
    quantity:    parseInt(el("quantity")?.value)       || 0,
    unit:        el("unit")?.value.trim()              || "units",
    targetPrice: parseFloat(el("targetPrice")?.value)  || null,
    currency:    el("currency")?.value.trim()          || "USD",
    description: el("description")?.value.trim()       || "",
  };

  const validationErr = _validateCreateForm(payload);
  if (validationErr) {
    Toast.warning(validationErr);
    return;
  }

  const submitBtn = el("createRfqSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled     = true;
    submitBtn.textContent  = "Publishing…";
  }

  try {
    await RfqAPI.create(payload);

    Toast.success("RFQ published successfully.");
    closeCreateModal();
    await loadRFQs();

  } catch (err) {
    Toast.error(err.message || "Failed to create RFQ.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled    = false;
      submitBtn.textContent = "Publish RFQ";
    }
  }
};

// =================================================================
// EVENT BINDING — all delegation, zero inline onclick
// =================================================================
const bindEvents = () => {

  // ── RFQ list — view quotes + create from empty state ─────────
  el("rfqList")?.addEventListener("click", (e) => {
    const viewBtn   = e.target.closest(".js-view-quotes");
    const createBtn = e.target.closest(".js-open-create");

    if (viewBtn) {
      openQuotesModal(viewBtn.dataset.rfqId, viewBtn.dataset.rfqTitle);
    }
    if (createBtn) {
      openCreateModal();
    }
  });

  // ── Quotes modal — accept / reject ────────────────────────────
  el("quotesList")?.addEventListener("click", (e) => {
    const acceptBtn = e.target.closest(".js-accept-quote");
    const rejectBtn = e.target.closest(".js-reject-quote");

    if (acceptBtn) handleAcceptQuote(acceptBtn.dataset.quoteId, acceptBtn);
    if (rejectBtn) handleRejectQuote(rejectBtn.dataset.quoteId, rejectBtn);
  });

  // ── Create RFQ button (topbar / header) ───────────────────────
  el("createRfqBtn")?.addEventListener("click", openCreateModal);

  // ── Create RFQ form submit ────────────────────────────────────
  el("createRfqForm")?.addEventListener("submit", handleCreateSubmit);

  // ── Close modals ──────────────────────────────────────────────
  // Via close button
  document.querySelectorAll(".js-close-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeQuotesModal();
      closeCreateModal();
    });
  });

  // Via backdrop click
  el("quotesModal")?.addEventListener("click", (e) => {
    if (e.target === el("quotesModal")) closeQuotesModal();
  });

  el("createRfqModal")?.addEventListener("click", (e) => {
    if (e.target === el("createRfqModal")) closeCreateModal();
  });

  // Via Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeQuotesModal();
    closeCreateModal();
  });

  // ── Sidebar / auth ────────────────────────────────────────────
  el("logoutBtn")?.addEventListener("click", () => Auth.logout());

  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
};

// =================================================================
// INIT
// =================================================================
const init = () => {
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "OEM");

  bindEvents();
  loadRFQs();
};

document.addEventListener("DOMContentLoaded", init);