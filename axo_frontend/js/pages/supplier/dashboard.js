/* =============================================================
   AXO NETWORKS — SUPPLIER DASHBOARD
   pages/supplier/dashboard.js

   Backend endpoints used:
     GET /api/supplier/dashboard/stats
       → { stats: { open_rfqs, pending_quotes,
                    active_orders, completed_orders } }
     GET /api/supplier/rfqs/open
       → { rfqs: [ { id, rfq_number, title, part_name,
                      quantity, oem_name, created_at } ] }
     GET /api/supplier/quotes
       → { quotes: [ { status, ... } ] }

   Sections:
   - KPI cards   : open RFQs, pending quotes, active orders, completed
   - Quote status chart : doughnut from real quote statuses
   - Recent open RFQs   : latest 5, click → rfq page
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
  charts: {
    quoteStatus: null,
  },
  refreshTimer:        null,
  REFRESH_INTERVAL_MS: 60_000,
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)       => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML   = html; };

const _kpiLoading = () =>
  ["openRfqs", "pendingQuotes", "activeOrders", "completedOrders"]
    .forEach((id) => setText(id, "—"));

const _rfqListLoading = () => `
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>`;

const _rfqListEmpty = (msg) => `
  <div class="empty-state">
    <span class="empty-state__icon">📋</span>
    <p class="empty-state__msg">${msg}</p>
  </div>`;

// =================================================================
// RENDER — KPI CARDS
// =================================================================
const renderKPIs = (stats = {}) => {
  setText("openRfqs",        stats.open_rfqs        ?? 0);
  setText("pendingQuotes",   stats.pending_quotes   ?? 0);
  setText("activeOrders",    stats.active_orders    ?? 0);
  setText("completedOrders", stats.completed_orders ?? 0);
};

// =================================================================
// RENDER — QUOTE STATUS DOUGHNUT
// Built from real quote data — no hardcoded numbers
// =================================================================
const renderQuoteChart = (quotes = []) => {
  const canvas = el("quoteStatusChart");
  if (!canvas || !window.Chart) return;

  if (State.charts.quoteStatus) {
    State.charts.quoteStatus.destroy();
    State.charts.quoteStatus = null;
  }

  // Count by status from actual quote data
  const counts = {
    Pending:  quotes.filter((q) => q.status === "pending").length,
    Accepted: quotes.filter((q) => q.status === "accepted").length,
    Rejected: quotes.filter((q) => q.status === "rejected").length,
  };

  const hasData = Object.values(counts).some((v) => v > 0);

  State.charts.quoteStatus = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels:   hasData ? Object.keys(counts)   : ["No Quotes Yet"],
      datasets: [{
        data:            hasData ? Object.values(counts) : [1],
        backgroundColor: hasData
          ? ["#f59e0b", "#10b981", "#ef4444"]
          : ["#e5e7eb"],
        borderWidth: 0,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: "bottom", labels: { padding: 16, font: { size: 11 } } },
      },
    },
  });
};

// =================================================================
// RENDER — RECENT OPEN RFQs
// =================================================================
const renderRecentRFQs = (rfqs = []) => {
  const container = el("recentRfqsList");
  if (!container) return;

  if (!rfqs.length) {
    container.innerHTML = _rfqListEmpty(
      "No open RFQs available right now. Check back soon."
    );
    return;
  }

  container.innerHTML = rfqs.slice(0, 5).map((rfq) => `
    <div
      class="rfq-item js-rfq-row"
      data-href="${CONFIG.ROUTES.SUPPLIER_RFQ}"
      role="button"
      tabindex="0"
      aria-label="View RFQ: ${sanitizeHTML(rfq.title)}"
    >
      <div class="rfq-item__header">
        <span class="rfq-item__title">${sanitizeHTML(rfq.title)}</span>
        <span class="badge badge--success">Open</span>
      </div>
      <div class="rfq-item__meta">
        <span>${sanitizeHTML(rfq.oem_name || "—")}</span>
        <span>Qty: ${formatNumber(rfq.quantity)}</span>
        <span>${formatDate(rfq.created_at)}</span>
      </div>
      <div class="rfq-item__footer">
        <a
          href="${CONFIG.ROUTES.SUPPLIER_RFQ}"
          class="btn btn--outline btn--sm"
          aria-label="Submit quote for ${sanitizeHTML(rfq.title)}"
        >
          Submit Quote →
        </a>
      </div>
    </div>`).join("");
};

// =================================================================
// LOAD — all data in parallel where possible
// =================================================================
const loadDashboard = async () => {
  _kpiLoading();
  setHTML("recentRfqsList", _rfqListLoading());

  try {
    // Stats + RFQs + quotes in parallel — 1 round trip instead of 3 sequential
    const [statsRes, rfqsRes, quotesRes] = await Promise.allSettled([
      API.get("/supplier/dashboard/stats"),
      API.get("/supplier/rfqs/open"),
      API.get("/supplier/quotes"),
    ]);

    // KPIs
    if (statsRes.status === "fulfilled") {
      renderKPIs(statsRes.value?.stats);
    } else {
      renderKPIs({});
      Toast.error("Failed to load dashboard stats.");
    }

    // Recent RFQs
    if (rfqsRes.status === "fulfilled") {
      renderRecentRFQs(rfqsRes.value?.rfqs || []);
    } else {
      setHTML("recentRfqsList", _rfqListEmpty("Failed to load RFQs."));
    }

    // Quote status chart — built from real data
    if (quotesRes.status === "fulfilled") {
      renderQuoteChart(quotesRes.value?.quotes || []);
    } else {
      renderQuoteChart([]);
    }

  } catch (err) {
    // Outer catch for unexpected errors
    Toast.error(err.message || "Dashboard failed to load.");
    renderKPIs({});
    renderRecentRFQs([]);
  }
};

// =================================================================
// AUTO-REFRESH
// =================================================================
const startAutoRefresh = () => {
  State.refreshTimer = setInterval(loadDashboard, State.REFRESH_INTERVAL_MS);
};

const stopAutoRefresh = () => {
  if (State.refreshTimer) {
    clearInterval(State.refreshTimer);
    State.refreshTimer = null;
  }
};

window.addEventListener("pagehide", stopAutoRefresh);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopAutoRefresh();
  else { loadDashboard(); startAutoRefresh(); }
});

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── RFQ rows — click + keyboard ──────────────────────────────
  el("recentRfqsList")?.addEventListener("click", (e) => {
    const row = e.target.closest(".js-rfq-row");
    // Don't navigate if the inner <a> was clicked — let it handle itself
    if (row && !e.target.closest("a")) {
      window.location.href = row.dataset.href;
    }
  });

  el("recentRfqsList")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const row = e.target.closest(".js-rfq-row");
    if (row) window.location.href = row.dataset.href;
  });

  // ── Quick-action buttons ──────────────────────────────────────
  el("btnBrowseRfqs")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.SUPPLIER_RFQ;
  });

  el("btnMyOrders")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
  });

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
  setText("userCompany", user?.company_name || "Supplier");

  bindEvents();
  loadDashboard();
  startAutoRefresh();
};

document.addEventListener("DOMContentLoaded", init);