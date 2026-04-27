/* =============================================================
   AXO NETWORKS — SUPPLIER MY QUOTES
   pages/supplier/quotes.js

   Features:
   - List all quotes submitted by this supplier
   - Client-side filter by status (pending / accepted / rejected)
   - Client-side search by RFQ title or OEM name

   Backend endpoint used:
     GET /api/supplier/quotes
       → { quotes: [ { id, price, currency, lead_time_days,
                        payment_terms, notes, status, submitted_at,
                        title, part_name, quantity, oem_name } ] }
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
  debounce,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard
// -----------------------------------------------------------------
if (!Router.guardPage(["supplier", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  allQuotes:    [],
  statusFilter: "all",
  searchQuery:  "",
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)       => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML   = html; };

const _tableLoading = () => `
  <tr class="table-skeleton">
    <td colspan="7">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </td>
  </tr>`;

const _tableEmpty = (msg) => `
  <tr>
    <td colspan="7" class="table-empty">
      <span class="table-empty__icon">💬</span>
      <span>${msg}</span>
    </td>
  </tr>`;

// =================================================================
// FILTER — pure, no side effects
// =================================================================
const applyFilters = (quotes, { statusFilter, searchQuery }) => {
  let result = quotes;

  if (statusFilter !== "all") {
    result = result.filter((q) => q.status === statusFilter);
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (quote) =>
        (quote.title    || "").toLowerCase().includes(q) ||
        (quote.oem_name || "").toLowerCase().includes(q) ||
        (quote.part_name || "").toLowerCase().includes(q)
    );
  }

  return result;
};

// =================================================================
// RENDER — QUOTES TABLE
// =================================================================
const renderQuoteRow = (quote) => {
  const statusClass = getStatusClass(quote.status);
  const isAccepted  = quote.status === "accepted";

  return `
    <tr>
      <td>
        <div class="cell-primary">${sanitizeHTML(quote.title || "—")}</div>
        ${quote.part_name
          ? `<div class="cell-secondary">${sanitizeHTML(quote.part_name)}</div>`
          : ""}
      </td>
      <td>${sanitizeHTML(quote.oem_name || "—")}</td>
      <td class="td-number">
        <strong>${formatCurrency(quote.price, quote.currency || "USD")}</strong>
      </td>
      <td class="td-number">${quote.lead_time_days ?? "—"} days</td>
      <td>${sanitizeHTML(quote.payment_terms || "Net 30")}</td>
      <td>${formatDate(quote.submitted_at)}</td>
      <td>
        <span class="badge badge--${statusClass}">
          ${formatStatus(quote.status)}
        </span>
        ${isAccepted
          ? `<div class="cell-secondary">PO Created</div>`
          : ""}
      </td>
    </tr>
    ${quote.notes ? `
    <tr class="quote-notes-row">
      <td colspan="7" class="quote-notes-cell">
        <span class="quote-notes-label">Notes:</span>
        ${sanitizeHTML(quote.notes)}
      </td>
    </tr>` : ""}`;
};

const renderQuotes = () => {
  const tbody = el("quotesTableBody");
  if (!tbody) return;

  const filtered = applyFilters(State.allQuotes, {
    statusFilter: State.statusFilter,
    searchQuery:  State.searchQuery,
  });

  // Summary counts
  const pending  = State.allQuotes.filter((q) => q.status === "pending").length;
  const accepted = State.allQuotes.filter((q) => q.status === "accepted").length;
  const rejected = State.allQuotes.filter((q) => q.status === "rejected").length;

  setText("countAll",      State.allQuotes.length);
  setText("countPending",  pending);
  setText("countAccepted", accepted);
  setText("countRejected", rejected);
  setText("resultCount",
    `${filtered.length} of ${State.allQuotes.length} quote${State.allQuotes.length !== 1 ? "s" : ""}`
  );

  if (!State.allQuotes.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="table-empty">
          <span class="table-empty__icon">💬</span>
          <p>No quotes submitted yet.</p>
          <a href="${CONFIG.ROUTES.SUPPLIER_RFQ}" class="btn btn--primary btn--sm">
            Browse Open RFQs
          </a>
        </td>
      </tr>`;
    return;
  }

  if (!filtered.length) {
    tbody.innerHTML = _tableEmpty("No quotes match your current filters.");
    return;
  }

  tbody.innerHTML = filtered.map(renderQuoteRow).join("");
};

// =================================================================
// LOAD QUOTES
// =================================================================
const loadQuotes = async () => {
  const tbody = el("quotesTableBody");
  if (tbody) tbody.innerHTML = _tableLoading();

  try {
    const { quotes } = await API.get("/supplier/quotes");
    State.allQuotes = quotes || [];
    renderQuotes();
  } catch (err) {
    Toast.error(err.message || "Failed to load quotes.");
    setHTML("quotesTableBody", _tableEmpty("Failed to load quotes. Please refresh."));
  }
};

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── Status filter tabs ────────────────────────────────────────
  document.querySelectorAll(".js-status-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".js-status-filter")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      State.statusFilter = btn.dataset.status || "all";
      renderQuotes();
    });
  });

  // ── Search ────────────────────────────────────────────────────
  el("searchInput")?.addEventListener(
    "input",
    debounce((e) => {
      State.searchQuery = e.target.value;
      renderQuotes();
    }, 250)
  );

  el("clearSearchBtn")?.addEventListener("click", () => {
    const input = el("searchInput");
    if (input) input.value = "";
    State.searchQuery = "";
    renderQuotes();
  });

  // ── Refresh ───────────────────────────────────────────────────
  el("refreshBtn")?.addEventListener("click", loadQuotes);

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
  loadQuotes();
};

document.addEventListener("DOMContentLoaded", init);