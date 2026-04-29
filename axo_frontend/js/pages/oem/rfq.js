/* =============================================================
   AXO NETWORKS — OEM RFQ MANAGEMENT
   pages/oem/rfq.js

   Features:
   - List all RFQs created by this OEM
   - Create new RFQ via modal (with optional document attachment)
   - View quotes received per RFQ
   - Accept / reject quotes → PO auto-created by backend
   - View documents attached to each RFQ
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
  formatFileSize,
  formatStatus,
  getStatusClass,
} from "../../core/utils.js";

if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  rfqs:         [],
  activeRfqId:  null,
  rfqFile:      null,   // File object for RFQ document attachment
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)            => document.getElementById(id);
const setText = (id, text)      => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html)      => { const n = el(id); if (n) n.innerHTML   = html; };
const showEl  = (id, mode = "flex") => { const n = el(id); if (n) n.style.display = mode; };
const hideEl  = (id)            => { const n = el(id); if (n) n.style.display = "none"; };

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

// =================================================================
// FILE TYPE HELPER
// =================================================================
const FILE_ICONS = { pdf:"📄", dwg:"📐", step:"🧊", stp:"🧊", jpg:"🖼️",
                     jpeg:"🖼️", png:"🖼️", doc:"📝", docx:"📝",
                     xls:"📊", xlsx:"📊", zip:"🗜️" };
const fileIcon = (name = "") =>
  FILE_ICONS[(name.split(".").pop() || "").toLowerCase()] || "📁";

// =================================================================
// RENDER — RFQ CARDS
// =================================================================
const renderRFQCard = (rfq) => {
  const statusClass  = getStatusClass(rfq.status);
  const quoteCount   = rfq.quote_count  ?? 0;
  const docCount     = rfq.document_count ?? 0;

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
        <div class="rfq-card__counts">
          <span class="rfq-card__badge">
            💬 ${quoteCount} ${quoteCount === 1 ? "quote" : "quotes"}
          </span>
          ${docCount > 0 ? `<span class="rfq-card__badge rfq-card__badge--doc">
            📎 ${docCount} ${docCount === 1 ? "document" : "documents"}
          </span>` : ""}
        </div>
        <div class="rfq-card__actions">
          ${docCount > 0 ? `
            <button class="btn btn--outline btn--sm js-view-rfq-docs"
              data-rfq-id="${rfq.id}"
              data-rfq-title="${sanitizeHTML(rfq.title)}">
              Documents
            </button>` : ""}
          <button class="btn btn--outline btn--sm js-view-quotes"
            data-rfq-id="${rfq.id}"
            data-rfq-title="${sanitizeHTML(rfq.title)}">
            View Quotes
          </button>
        </div>
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
// RENDER — QUOTE CARD
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
        <span class="quote-card__price">${formatCurrency(q.price, q.currency || "USD")}</span>
      </div>
      <div class="quote-card__meta">
        <span>Lead time: ${q.lead_time_days ?? "—"} days</span>
        <span>Payment: ${sanitizeHTML(q.payment_terms || "Net 30")}</span>
        <span>Submitted: ${formatDate(q.submitted_at)}</span>
        <span>Status: <strong class="badge badge--${statusClass}">${formatStatus(q.status)}</strong></span>
      </div>
      ${q.notes ? `<p class="quote-card__notes">${sanitizeHTML(q.notes)}</p>` : ""}
      <div class="quote-card__actions">
        ${isPending ? `
          <button class="btn btn--success btn--sm js-accept-quote" data-quote-id="${q.id}">Accept</button>
          <button class="btn btn--danger  btn--sm js-reject-quote" data-quote-id="${q.id}">Reject</button>
        ` : isAccepted ? `
          <span class="status-message status-message--success">✓ Accepted — Purchase Order created</span>
        ` : `
          <span class="status-message status-message--danger">✗ Rejected</span>
        `}
      </div>
    </div>`;
};

// =================================================================
// RENDER — RFQ DOCUMENTS CARD
// =================================================================
const renderDocCard = (doc) => `
  <div class="doc-card doc-card--compact">
    <span class="doc-card__icon">${fileIcon(doc.file_name)}</span>
    <div class="doc-card__body">
      <div class="doc-card__name" title="${sanitizeHTML(doc.file_name)}">${sanitizeHTML(doc.file_name)}</div>
      <div class="doc-card__meta">
        <span>${sanitizeHTML(doc.category || "General")}</span>
        ${doc.file_size ? `<span>${formatFileSize(doc.file_size)}</span>` : ""}
        <span>${formatDate(doc.created_at)}</span>
      </div>
    </div>
  </div>`;

// =================================================================
// API HELPERS
// =================================================================
const RfqAPI = {
  list:         ()         => API.get("/oem/rfqs"),
  create:       (payload)  => API.post("/oem/rfqs", payload),
  getQuotes:    (rfqId)    => API.get(`/oem/rfqs/${rfqId}/quotes`),
  getDocuments: (rfqId)    => API.get(`/oem/rfqs/${rfqId}/documents`),
  acceptQuote:  (quoteId)  => API.post(`/oem/rfqs/quotes/${quoteId}/accept`),
  rejectQuote:  (quoteId)  => API.post(`/oem/rfqs/quotes/${quoteId}/reject`),
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
    Toast.error(err.message || err.error || "Something went wrong" || "Failed to load RFQs.");
    setHTML("rfqList", _listEmpty("Failed to load RFQs. Please refresh."));
  }
};

// =================================================================
// QUOTES MODAL
// =================================================================
const openQuotesModal = async (rfqId, rfqTitle) => {
  State.activeRfqId = rfqId;
  setText("quotesModalTitle", `Quotes — ${rfqTitle}`);
  setHTML("quotesList", `<div class="skeleton-card"></div><div class="skeleton-card"></div>`);
  showEl("quotesModal");

  try {
    const { quotes } = await RfqAPI.getQuotes(rfqId);
    if (!quotes?.length) {
      setHTML("quotesList", `
        <div class="empty-state">
          <span class="empty-state__icon">💬</span>
          <p class="empty-state__msg">No quotes yet. Suppliers will respond once the RFQ is live.</p>
        </div>`);
      return;
    }
    setHTML("quotesList", quotes.map(renderQuoteCard).join(""));
  } catch (err) {
    Toast.error(err.message || err.error || "Something went wrong" || "Failed to load quotes.");
    setHTML("quotesList", `<p class="text-error">Failed to load quotes.</p>`);
  }
};

// =================================================================
// DOCUMENTS MODAL (per-RFQ)
// =================================================================
const openDocsModal = async (rfqId, rfqTitle) => {
  setText("docsModalTitle", `Documents — ${rfqTitle}`);
  setHTML("docsModalBody", `<div class="skeleton-card"></div>`);
  showEl("docsModal");

  try {
    const { documents } = await RfqAPI.getDocuments(rfqId);
    if (!documents?.length) {
      setHTML("docsModalBody", `
        <div class="empty-state">
          <span class="empty-state__icon">📂</span>
          <p class="empty-state__msg">No documents attached to this RFQ.</p>
        </div>`);
      return;
    }
    setHTML("docsModalBody", documents.map(renderDocCard).join(""));
  } catch (err) {
    Toast.error(err.message || err.error || "Something went wrong" || "Failed to load documents.");
    setHTML("docsModalBody", `<p class="text-error">Failed to load documents.</p>`);
  }
};

const closeModal = (id) => hideEl(id);

// =================================================================
// ACCEPT / REJECT QUOTE
// =================================================================
const handleAcceptQuote = async (quoteId, btn) => {
  btn.disabled    = true;
  btn.textContent = "Accepting…";
  try {
    await RfqAPI.acceptQuote(quoteId);
    Toast.success("Quote accepted. Purchase Order has been created.");
    closeModal("quotesModal");
    State.rfqs.unshift(rfq);
renderRFQList(State.rfqs);
  } catch (err) {
    Toast.error(err.message || err.error || "Something went wrong" || "Failed to accept quote.");
    btn.disabled    = false;
    btn.textContent = "Accept";
  }
};

const handleRejectQuote = async (quoteId, btn) => {
  btn.disabled    = true;
  btn.textContent = "Rejecting…";
  try {
    await RfqAPI.rejectQuote(quoteId);
    Toast.success("Quote rejected.");
    if (State.activeRfqId) {
      const rfq = State.rfqs.find((r) => r.id == State.activeRfqId);
      await openQuotesModal(State.activeRfqId, rfq?.title || "");
    }
  } catch (err) {
    Toast.error(err.message || err.error || "Something went wrong" || "Failed to reject quote.");
    btn.disabled    = false;
    btn.textContent = "Reject";
  }
};

// =================================================================
// CREATE RFQ MODAL (with optional document upload)
// =================================================================
const openCreateModal = () => {
  el("createRfqForm")?.reset();
  State.rfqFile = null;
  _updateFilePreview(null);
  showEl("createRfqModal");
};

const closeCreateModal = () => {
  hideEl("createRfqModal");
  State.rfqFile = null;
};

// File preview in create form
const _updateFilePreview = (file) => {
  const preview = el("rfqFilePreview");
  if (!preview) return;

  if (!file) {
    preview.style.display = "none";
    preview.innerHTML     = "";
    return;
  }
  preview.style.display = "flex";
  preview.innerHTML = `
    <span>${fileIcon(file.name)}</span>
    <span class="rfq-file__name">${sanitizeHTML(file.name)}</span>
    <span class="rfq-file__size">${formatFileSize(file.size)}</span>
    <button type="button" class="btn btn--icon btn--ghost js-clear-rfq-file" aria-label="Remove file">✕</button>`;
};

const _validateCreateForm = (data) => {
  if (!data.title.trim())            return "RFQ title is required.";
  if (!data.quantity || data.quantity <= 0) return "A valid quantity is required.";
  return null;
};

const handleCreateSubmit = async (e) => {
  e.preventDefault();

  const payload = {
    title:       el("rfqTitle")?.value.trim()         || "",
    partNumber:  el("partNumber")?.value.trim()       || "",
    partName:    el("partName")?.value.trim()         || "",
    quantity:    parseInt(el("quantity")?.value)      || 0,
    unit:        el("unit")?.value.trim()             || "units",
    targetPrice: parseFloat(el("targetPrice")?.value) || null,
    currency:    el("currency")?.value.trim()         || "USD",
    description: el("description")?.value.trim()      || "",
  };

  const validationErr = _validateCreateForm(payload);
  if (validationErr) { Toast.warning(validationErr); return; }

  const submitBtn = el("createRfqSubmitBtn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Publishing…"; }
  Toast.info("Creating RFQ...");

  try {
    // Step 1: Create the RFQ
    const { rfq } = await RfqAPI.create(payload);

    // Step 2: If a document was attached, upload it linked to this RFQ
    if (State.rfqFile && rfq?.id) {
      try {
        const formData = new FormData();
        formData.append("document",    State.rfqFile);
        formData.append("rfqId",       rfq.id);
        formData.append("category",    "RFQ Documents");
        formData.append("description", `Document for ${payload.title}`);
        await API.upload("/documents/upload", formData);
      } catch (uploadErr) {
        // RFQ was created; just warn about the doc
        console.error("Document upload failed:", uploadErr);
        Toast.warning(
  uploadErr.message || 
  uploadErr.error || 
  "RFQ created but document upload failed"
);
      }
    }

    Toast.success("RFQ published successfully.");
    closeCreateModal();
    State.rfqs.unshift(rfq);
renderRFQList(State.rfqs);
  } catch (err) {
    Toast.error(err.message || err.error || "Something went wrong" || "Failed to create RFQ.");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Publish RFQ"; }
  }
};

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── RFQ list ──────────────────────────────────────────────────
  el("rfqList")?.addEventListener("click", (e) => {
    const viewBtn    = e.target.closest(".js-view-quotes");
    const docsBtn    = e.target.closest(".js-view-rfq-docs");
    const createBtn  = e.target.closest(".js-open-create");

    if (viewBtn)   openQuotesModal(viewBtn.dataset.rfqId, viewBtn.dataset.rfqTitle);
    if (docsBtn)   openDocsModal(docsBtn.dataset.rfqId,  docsBtn.dataset.rfqTitle);
    if (createBtn) openCreateModal();
  });

  // ── Quotes modal ──────────────────────────────────────────────
  el("quotesList")?.addEventListener("click", (e) => {
    const acceptBtn = e.target.closest(".js-accept-quote");
    const rejectBtn = e.target.closest(".js-reject-quote");
    if (acceptBtn) handleAcceptQuote(acceptBtn.dataset.quoteId, acceptBtn);
    if (rejectBtn) handleRejectQuote(rejectBtn.dataset.quoteId, rejectBtn);
  });

  // ── Create RFQ button ─────────────────────────────────────────
  el("createRfqBtn")?.addEventListener("click", openCreateModal);

  // ── File input for RFQ document ───────────────────────────────
  el("rfqFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      Toast.error("File too large. Maximum size is 10 MB.");
      e.target.value = "";
      return;
    }
    State.rfqFile = file;
    _updateFilePreview(file);
  });

  // ── Browse button ─────────────────────────────────────────────
  el("rfqBrowseBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    el("rfqFileInput")?.click();
  });

  // ── Clear file ────────────────────────────────────────────────
  el("rfqFilePreview")?.addEventListener("click", (e) => {
    if (e.target.closest(".js-clear-rfq-file")) {
      State.rfqFile = null;
      const fi = el("rfqFileInput");
      if (fi) fi.value = "";
      _updateFilePreview(null);
    }
  });

  // ── Create form submit ────────────────────────────────────────
  el("createRfqForm")?.addEventListener("submit", handleCreateSubmit);

  // ── Close modals ──────────────────────────────────────────────
  document.querySelectorAll(".js-close-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeModal("quotesModal");
      closeModal("docsModal");
      closeCreateModal();
    });
  });

  ["quotesModal", "docsModal", "createRfqModal"].forEach((id) => {
    el(id)?.addEventListener("click", (e) => {
      if (e.target === el(id)) {
        closeModal(id);
        if (id === "createRfqModal") closeCreateModal();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeModal("quotesModal");
    closeModal("docsModal");
    closeCreateModal();
  });

  // ── Sidebar / auth ────────────────────────────────────────────
  el("logoutBtn")?.addEventListener("click",  () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => el("sidebar")?.classList.toggle("open"));
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