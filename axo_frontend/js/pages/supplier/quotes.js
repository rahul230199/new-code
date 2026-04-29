// =============================================================
// SUPPLIER QUOTES — FINAL FIXED VERSION
// =============================================================

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatCurrency,
  formatStatus,
  getStatusClass,
  debounce,
} from "../../core/utils.js";

// Guard
if (!Router.guardPage(["supplier", "both", "admin"])) throw new Error("REDIRECT");

// =============================================================
// STATE
// =============================================================
const State = {
  allQuotes: [],
  statusFilter: "all",
  searchQuery: "",
  isLoading: false, // ✅ FIX
};

// =============================================================
// DOM
// =============================================================
const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };

// =============================================================
// LOADING / EMPTY
// =============================================================
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
    <span>💬</span>
    <span>${msg}</span>
  </td>
</tr>`;

// =============================================================
// FILTER
// =============================================================
const applyFilters = (quotes) => {
  let result = quotes;

  if (State.statusFilter !== "all") {
    result = result.filter(q => q.status === State.statusFilter);
  }

  const q = State.searchQuery.toLowerCase();

  if (q) {
    result = result.filter(quote =>
      (quote.title || "").toLowerCase().includes(q) ||
      (quote.oem_name || "").toLowerCase().includes(q) ||
      (quote.part_name || "").toLowerCase().includes(q)
    );
  }

  return result;
};

// =============================================================
// RENDER
// =============================================================
const renderQuoteRow = (quote) => {
  const statusClass = getStatusClass(quote.status);

  return `
<tr>
  <td>
    <div>${sanitizeHTML(quote.title || "—")}</div>
    ${quote.part_name ? `<small>${sanitizeHTML(quote.part_name)}</small>` : ""}
  </td>
  <td>${sanitizeHTML(quote.oem_name || "—")}</td>
  <td><strong>${formatCurrency(quote.price, quote.currency)}</strong></td>
  <td>${quote.lead_time_days ?? "—"} days</td>
  <td>${sanitizeHTML(quote.payment_terms || "Net 30")}</td>
  <td>${formatDate(quote.submitted_at)}</td>
  <td>
    <span class="badge badge--${statusClass}">
      ${formatStatus(quote.status)}
    </span>
  </td>
</tr>
${quote.notes ? `
<tr>
  <td colspan="7">${sanitizeHTML(quote.notes)}</td>
</tr>` : ""}
`;
};

const renderQuotes = () => {
  const tbody = el("quotesTableBody");
  if (!tbody) return;

  const filtered = applyFilters(State.allQuotes);

  // counts
  setText("countAll", State.allQuotes.length);
  setText("countPending", State.allQuotes.filter(q => q.status === "pending").length);
  setText("countAccepted", State.allQuotes.filter(q => q.status === "accepted").length);
  setText("countRejected", State.allQuotes.filter(q => q.status === "rejected").length);

  setText("resultCount", `${filtered.length} results`);

  if (!State.allQuotes.length) {
    tbody.innerHTML = _tableEmpty("No quotes yet");
    return;
  }

  if (!filtered.length) {
    tbody.innerHTML = _tableEmpty("No matching results");
    return;
  }

  tbody.innerHTML = filtered.map(renderQuoteRow).join("");
};

// =============================================================
// LOAD
// =============================================================
const loadQuotes = async () => {

  if (State.isLoading) return; // ✅ FIX

  State.isLoading = true;

  const tbody = el("quotesTableBody");
  if (tbody) tbody.innerHTML = _tableLoading();

  try {
    const { quotes } = await API.get("/supplier/quotes");
    State.allQuotes = quotes || [];
    renderQuotes();
  } catch (err) {
    console.error(err);
    Toast.error("Failed to load quotes");
    setHTML("quotesTableBody", _tableEmpty("Failed to load"));
  } finally {
    State.isLoading = false;
  }
};

// =============================================================
// EVENTS
// =============================================================
const bindEvents = () => {

  // filter tabs
  document.querySelectorAll(".js-status-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".js-status-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      State.statusFilter = btn.dataset.status;
      renderQuotes();
    });
  });

  // search
  el("searchInput")?.addEventListener("input",
    debounce((e) => {
      State.searchQuery = e.target.value;
      renderQuotes();
    }, 300)
  );

  el("clearSearchBtn")?.addEventListener("click", () => {
    const input = el("searchInput");
    if (input) input.value = "";
    State.searchQuery = "";
    renderQuotes();
  });

  el("refreshBtn")?.addEventListener("click", loadQuotes);

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
  loadQuotes();
};

document.addEventListener("DOMContentLoaded", init);