// =============================================================
// AXO — SUPPLIER DASHBOARD (REFACTORED)
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
  chart: null,
  isLoading: false,
};

// =============================================================
// DOM
// =============================================================
const el = (id) => document.getElementById(id);
const setText = (id, v) => { const n = el(id); if (n) n.textContent = v; };
const setHTML = (id, v) => { const n = el(id); if (n) n.innerHTML = v; };

// =============================================================
// API LAYER (separated)
// =============================================================
const fetchStats = () => API.get("/supplier/dashboard/stats");
const fetchRFQs  = () => API.get("/supplier/rfqs/open");
const fetchQuotes = () => API.get("/supplier/quotes");

// =============================================================
// RENDER
// =============================================================
const renderKPIs = (stats = {}) => {
  setText("openRfqs", stats.open_rfqs ?? 0);
  setText("pendingQuotes", stats.pending_quotes ?? 0);
  setText("activeOrders", stats.active_orders ?? 0);
  setText("completedOrders", stats.completed_orders ?? 0);
};

const renderRFQs = (rfqs = []) => {
  if (!rfqs.length) {
    setHTML("recentRfqsList", `<p>No RFQs available</p>`);
    return;
  }

  setHTML("recentRfqsList",
    rfqs.slice(0,4).map(r => `
      <div class="rfq-item">
        <strong>${sanitizeHTML(r.title)}</strong>
        <div>${sanitizeHTML(r.oem_name || "")}</div>
        <small>${formatDate(r.created_at)}</small>
      </div>
    `).join("")
  );
};

const renderChart = (quotes = []) => {
  const ctx = el("quoteStatusChart");
  if (!ctx || !window.Chart) return;

  const counts = {
    pending: 0,
    accepted: 0,
    rejected: 0,
  };


  quotes.forEach(q => counts[q.status]++);
  
  setText("pendingCount", counts.pending);
  setText("acceptedCount", counts.accepted);
  setText("rejectedCount", counts.rejected);

  if (State.chart) {
    State.chart.data.datasets[0].data = Object.values(counts);
    State.chart.update();
    return;
  }


    State.chart = new Chart(ctx, {
    type: "doughnut",

    data: {
      labels: Object.keys(counts),

      datasets: [{
        data: Object.values(counts),

        backgroundColor: [
          "#7C83D6", // pending
          "#363c88", // accepted
          "#9b9b9d", // rejected
        ],

        borderColor: "#ffffff",
        borderWidth: 3,
        hoverOffset: 6,
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "64%",
      radius: "82%",

      plugins: {
        legend: {
          labels: {
            color: "#64748b",
            font: {
              family: "Inter",
              size: 13,
              weight: "600"
            }
          }
        }
      }
    }
  });
};

// =============================================================
// MAIN LOAD (NO SILENT FAIL)
// =============================================================
const loadDashboard = async () => {
  if (State.isLoading) return;
  State.isLoading = true;

  try {
    const [stats, rfqs, quotes] = await Promise.all([
      fetchStats(),
      fetchRFQs(),
      fetchQuotes(),
    ]);

    renderKPIs(stats.stats);
    renderRFQs(rfqs.rfqs);
    renderChart(quotes.quotes);

  } catch (err) {
    console.error(err);
    Toast.error(err.message || "Dashboard failed");

    // Retry after 3s
    setTimeout(loadDashboard, 3000);
  } finally {
    State.isLoading = false;
  }
};

// =============================================================
// INIT
// =============================================================
const init = () => {
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "Supplier");
  setText("userCompany", user?.company_name || "Supplier");

  loadDashboard();
};

document.addEventListener("DOMContentLoaded", init);