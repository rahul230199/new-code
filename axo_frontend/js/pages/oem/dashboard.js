/* =============================================================
   AXO NETWORKS — OEM DASHBOARD
   pages/oem/dashboard.js

   Backend endpoints used:
     GET /api/oem/dashboard/stats
       → { kpis, charts.order_status_distribution,
            charts.monthly_volume_trend, heatmap, live_orders }

   Sections on this page:
   - KPI cards   : active RFQs, quotes pending, active orders, delayed
   - Charts      : order status donut + monthly value trend line
   - Heatmap     : bottleneck severity bars
   - Live orders : latest 5 POs with click-through to detail page
   ============================================================= */

import Router   from "../../core/router.js";
import API      from "../../core/api.js";
import Auth     from "../../core/auth.js";
import Toast    from "../../core/toast.js";
import CONFIG   from "../../core/config.js";
import {
  sanitizeHTML,
  formatCurrency,
  formatDate,
  formatStatus,
  getStatusClass,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard — OEM + both + admin allowed
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  charts: {
    orderStatus: null,
    monthly:     null,
  },
  refreshTimer: null,
  REFRESH_INTERVAL_MS: 60_000,
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)         => document.getElementById(id);
const setText = (id, text)   => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html)   => { const n = el(id); if (n) n.innerHTML   = html; };

// KPI skeleton — pulsing placeholder while data loads
const _setKpiLoading = () => {
  ["activeRfqs", "quotesPending", "activeOrders", "delayedOrders"].forEach(
    (id) => setText(id, "—")
  );
};

// Table loading row
const _tableLoading = (cols) => `
  <tr class="table-skeleton">
    <td colspan="${cols}">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </td>
  </tr>`;

const _tableEmpty = (cols, msg = "No records found.") => `
  <tr>
    <td colspan="${cols}" class="table-empty">
      <span class="table-empty__icon">📭</span>
      <span>${msg}</span>
    </td>
  </tr>`;

// =================================================================
// RENDER — KPI CARDS
// =================================================================
const renderKPIs = (kpis = {}) => {
  setText("activeRfqs",    kpis.active_rfqs    ?? 0);
  setText("quotesPending", kpis.quotes_pending ?? 0);
  setText("activeOrders",  kpis.active_orders  ?? 0);
  setText("delayedOrders", kpis.delayed_orders ?? 0);
};

// =================================================================
// RENDER — ORDER STATUS DOUGHNUT
// =================================================================
const renderOrderStatusChart = (orderStatus = []) => {
  const canvas = el("orderStatusChart");
  if (!canvas || !window.Chart) return;

  // Destroy previous instance before creating new one
  if (State.charts.orderStatus) {
    State.charts.orderStatus.destroy();
    State.charts.orderStatus = null;
  }

  const hasData = orderStatus.length > 0;

  const labels = hasData
    ? orderStatus.map((item) => formatStatus(item.status))
    : ["No Orders Yet"];

  const counts = hasData
    ? orderStatus.map((item) => parseInt(item.count) || 0)
    : [1];

  const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  State.charts.orderStatus = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data:            counts,
        backgroundColor: hasData ? colors.slice(0, counts.length) : ["#e5e7eb"],
        borderWidth:     0,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels:   { font: { size: 11 }, padding: 16 },
        },
      },
    },
  });
};

// =================================================================
// RENDER — MONTHLY VALUE TREND LINE
// =================================================================
const renderMonthlyTrendChart = (trend = []) => {
  const canvas = el("monthlyTrendChart");
  if (!canvas || !window.Chart) return;

  if (State.charts.monthly) {
    State.charts.monthly.destroy();
    State.charts.monthly = null;
  }

  const labels = trend.map((m) => m.month);
  const values = trend.map((m) => parseFloat(m.total_value) || 0);

  State.charts.monthly = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: labels.length ? labels : [],
      datasets: [{
        label:           "Order Value (USD)",
        data:            values,
        borderColor:     "#6366f1",
        backgroundColor: "rgba(99,102,241,0.06)",
        borderWidth:     2,
        pointRadius:     4,
        pointHoverRadius: 6,
        fill:            true,
        tension:         0.4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => formatCurrency(v, "USD"),
          },
        },
      },
    },
  });
};

// =================================================================
// RENDER — BOTTLENECK HEATMAP
// =================================================================
const renderHeatmap = (heatmapData = []) => {
  const container = el("bottleneckHeatmap");
  if (!container) return;

  // Backend always returns 3 rows even with 0 values — use them
  const data = heatmapData.length ? heatmapData : [
    { name: "Delayed Milestones",    value: 0, severity: "high"   },
    { name: "Raw Material Shortages", value: 0, severity: "medium" },
    { name: "QC Hold",               value: 0, severity: "low"    },
  ];

  const max = Math.max(...data.map((d) => parseInt(d.value) || 0), 1);

  container.innerHTML = data.map((item) => {
    const pct = Math.round(((parseInt(item.value) || 0) / max) * 100);
    return `
      <div class="heatmap-item">
        <span class="heatmap-item__label">${sanitizeHTML(item.name)}</span>
        <div class="heatmap-item__track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="heatmap-item__fill heatmap-item__fill--${sanitizeHTML(item.severity)}" style="width:${pct}%"></div>
        </div>
        <span class="heatmap-item__value">${parseInt(item.value) || 0}</span>
      </div>`;
  }).join("");
};

// =================================================================
// RENDER — LIVE ORDERS TABLE
// =================================================================
const renderLiveOrders = (orders = []) => {
  const tbody = el("liveOrdersList");
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = _tableEmpty(6, "No active orders. Create an RFQ to get started.");
    return;
  }

  tbody.innerHTML = orders.map((order) => {
    const statusClass = getStatusClass(order.status);
    // Detail page URL — id passed as query param
    const detailUrl = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${order.id}`;

    return `
      <tr class="tr-clickable js-order-row" data-href="${detailUrl}" role="button" tabindex="0" aria-label="View order ${sanitizeHTML(order.po_number)}">
        <td><strong>${sanitizeHTML(order.po_number || "—")}</strong></td>
        <td>${sanitizeHTML(order.part_name    || "—")}</td>
        <td>${sanitizeHTML(order.supplier_name || "—")}</td>
        <td>${order.quantity ?? "—"}</td>
        <td>
          <span class="badge badge--${statusClass}">
            ${formatStatus(order.status)}
          </span>
        </td>
        <td>
          <a href="${detailUrl}" class="link-primary">View →</a>
        </td>
      </tr>`;
  }).join("");
};

// =================================================================
// DATA LOADER
// =================================================================
const loadDashboard = async () => {
  _setKpiLoading();
  setHTML("liveOrdersList", _tableLoading(6));

  try {
    const data = await API.get("/oem/dashboard/stats");

    renderKPIs(data.kpis);
    renderOrderStatusChart(data.charts?.order_status_distribution);
    renderMonthlyTrendChart(data.charts?.monthly_volume_trend);
    renderHeatmap(data.heatmap);
    renderLiveOrders(data.live_orders);

  } catch (err) {
    Toast.error(err.message || "Failed to load dashboard data.");

    // Render zeroes so UI isn't broken
    renderKPIs({});
    renderHeatmap([]);
    renderLiveOrders([]);
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

// Stop refresh when user navigates away — prevents memory leak
window.addEventListener("pagehide", stopAutoRefresh);

// =================================================================
// EVENT LISTENERS
// =================================================================
const bindEvents = () => {

  // ── Clickable order rows (keyboard + mouse) ───────────────────
  // Using delegation — rows are rendered dynamically
  el("liveOrdersList")?.addEventListener("click", (e) => {
    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  el("liveOrdersList")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  // ── Quick-action nav buttons (if present in HTML) ─────────────
  el("btnCreateRfq")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.OEM_RFQ;
  });

  el("btnViewOrders")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.OEM_ORDERS;
  });

  // ── Sidebar / topbar ─────────────────────────────────────────
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
  setText("companyName", user?.company_name || "OEM Partner");
  setText("userCompany", user?.company_name || "OEM Partner");

  bindEvents();
  loadDashboard();
  startAutoRefresh();
};

document.addEventListener("DOMContentLoaded", init);