/* =============================================================
   AXO NETWORKS — ADMIN DASHBOARD
   pages/admin/dashboard.js

   Sections:
   - Overview  : KPI stats cards
   - Requests  : All network access requests with filter + approve/reject
   - Analytics : Role distribution chart + monthly trend + capabilities

   Backend endpoints used:
     GET  /api/admin/stats
     GET  /api/admin/requests/all?status=&role=
     POST /api/admin/requests/:id/approve  → { tempPassword }
     POST /api/admin/requests/:id/reject   → { reason }

   ============================================================= */

import Router          from "../../core/router.js";
import API             from "../../core/api.js";
import Auth            from "../../core/auth.js";
import Toast           from "../../core/toast.js";
import CONFIG          from "../../core/config.js";
import { formatDate, sanitizeHTML, formatStatus, getStatusClass, buildQueryString } from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard — admin only
// -----------------------------------------------------------------
if (!Router.guardPage(["admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  requests:        [],        // current loaded requests
  activeSection:   "overview",
  filters: {
    status: "all",
    role:   "all",
  },
  pendingAction: {            // tracks which request is being acted on
    id:          null,
    companyName: null,
    email:       null,
  },
  charts: {
    role:    null,
    monthly: null,
  },
};

// =================================================================
// DOM HELPERS
// =================================================================
const el = (id) => document.getElementById(id);

const setHTML = (id, html) => {
  const node = el(id);
  if (node) node.innerHTML = html;
};

const setText = (id, text) => {
  const node = el(id);
  if (node) node.textContent = text;
};

const showEl = (id)   => { const n = el(id); if (n) n.style.display = ""; };
const hideEl = (id)   => { const n = el(id); if (n) n.style.display = "none"; };

// -----------------------------------------------------------------
// Loading skeleton for tables
// -----------------------------------------------------------------
const tableLoadingHTML = (cols) => `
  <tr class="table-skeleton">
    <td colspan="${cols}">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </td>
  </tr>`;

// -----------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------
const emptyRowHTML = (cols, message = "No records found.") => `
  <tr>
    <td colspan="${cols}" class="table-empty">
      <span class="table-empty__icon">📭</span>
      <span>${message}</span>
    </td>
  </tr>`;

// =================================================================
// API CALLS
// =================================================================
const AdminAPI = {

  fetchStats: () =>
    API.get("/admin/stats"),

  fetchRequests: (filters = {}) => {
    const qs = buildQueryString({
      status: filters.status !== "all" ? filters.status : undefined,
      role:   filters.role   !== "all" ? filters.role   : undefined,
    });
    return API.get(`/admin/requests/all${qs}`);
  },

  approve: (id) =>
    API.post(`/admin/requests/${id}/approve`),

  reject: (id, reason) =>
    API.post(`/admin/requests/${id}/reject`, { reason }),
};

// =================================================================
// RENDER — STATS CARDS
// =================================================================
const renderStats = (stats) => {
  setText("statPending",   stats.pending    ?? 0);
  setText("statApproved",  stats.approved   ?? 0);
  setText("statRejected",  stats.rejected   ?? 0);
  setText("statTotalUsers", stats.totalUsers ?? 0);
};

// =================================================================
// RENDER — REQUESTS TABLE
// =================================================================
const renderRequestRow = (req) => {
  const statusClass = getStatusClass(req.status);
  const roleLabel   = formatStatus(req.role_requested);
  const isPending   = req.status === "pending";

  return `
    <tr data-id="${req.id}">
      <td class="td-id">#${req.id}</td>
      <td>
        <div class="cell-primary">${sanitizeHTML(req.company_name)}</div>
        <div class="cell-secondary">${sanitizeHTML(req.city || "")}</div>
      </td>
      <td>${sanitizeHTML(req.email)}</td>
      <td><span class="badge badge--neutral">${roleLabel}</span></td>
      <td>
        <span class="badge badge--${statusClass}">
          ${formatStatus(req.status)}
        </span>
      </td>
      <td>${formatDate(req.created_at)}</td>
      <td class="td-actions">
        ${isPending ? `
          <button class="btn btn--sm btn--success js-approve" data-id="${req.id}" data-name="${sanitizeHTML(req.company_name)}" data-email="${sanitizeHTML(req.email)}">
            Approve
          </button>
          <button class="btn btn--sm btn--danger js-reject" data-id="${req.id}" data-name="${sanitizeHTML(req.company_name)}">
            Reject
          </button>
        ` : `
          <span class="text-muted">${req.status === "approved" ? "Approved" : "Rejected"}</span>
        `}
      </td>
    </tr>`;
};

const renderRequestsTable = (requests) => {
  const tbody = el("requestsTableBody");
  if (!tbody) return;

  if (!requests.length) {
    tbody.innerHTML = emptyRowHTML(7, "No requests match the selected filters.");
    return;
  }

  tbody.innerHTML = requests.map(renderRequestRow).join("");
};

// =================================================================
// RENDER — ANALYTICS
// =================================================================
const renderAnalytics = (requests) => {
  const total    = requests.length;
  const approved = requests.filter((r) => r.status === "approved").length;
  const rate     = total > 0 ? ((approved / total) * 100).toFixed(1) : "0.0";

  setText("statTotalReg",    total);
  setText("statApprovalRate", `${rate}%`);

  _renderRoleChart(requests);
  _renderMonthlyChart(requests);
  _renderCapabilities(requests);
};

const _renderRoleChart = (requests) => {
  const canvas = el("roleChart");
  if (!canvas || !window.Chart) return;

  const counts = {
    OEM:      requests.filter((r) => r.role_requested === "oem").length,
    Supplier: requests.filter((r) => r.role_requested === "supplier").length,
    Both:     requests.filter((r) => r.role_requested === "both").length,
  };

  if (State.charts.role) State.charts.role.destroy();

  State.charts.role = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels:   Object.keys(counts),
      datasets: [{
        data:            Object.values(counts),
        backgroundColor: ["#4f46e5", "#10b981", "#f59e0b"],
        borderWidth:     2,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: { legend: { position: "bottom" } },
    },
  });
};

const _renderMonthlyChart = (requests) => {
  const canvas = el("monthlyTrendChart");
  if (!canvas || !window.Chart) return;

  const monthly = {};
  requests.forEach((req) => {
    const key = new Date(req.created_at).toLocaleString("default", {
      month: "short", year: "numeric",
    });
    monthly[key] = (monthly[key] || 0) + 1;
  });

  const labels = Object.keys(monthly).slice(-6);
  const data   = labels.map((m) => monthly[m]);

  if (State.charts.monthly) State.charts.monthly.destroy();

  State.charts.monthly = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label:           "New Requests",
        data,
        borderColor:     "#4f46e5",
        backgroundColor: "rgba(79,70,229,0.08)",
        fill:            true,
        tension:         0.4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales:  { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
};

const _renderCapabilities = (requests) => {
  const container = el("topCapabilities");
  if (!container) return;

  const map = {};
  requests.forEach((req) => {
    if (Array.isArray(req.capabilities)) {
      req.capabilities.forEach((cap) => {
        map[cap] = (map[cap] || 0) + 1;
      });
    }
  });

  const sorted = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!sorted.length) {
    container.innerHTML = "<p class='text-muted'>No capability data available.</p>";
    return;
  }

  const max = sorted[0][1];

  container.innerHTML = sorted.map(([cap, count]) => `
    <div class="cap-item">
      <span class="cap-item__label">${sanitizeHTML(formatStatus(cap))}</span>
      <div class="cap-item__bar-wrap">
        <div class="cap-item__bar" style="width:${(count / max) * 100}%"></div>
      </div>
      <span class="cap-item__count">${count}</span>
    </div>`).join("");
};

// =================================================================
// SECTION NAVIGATION
// =================================================================
const _sections = ["overview", "requests", "analytics"];

const switchSection = async (section) => {
  if (!_sections.includes(section)) return;

  // Update nav active state
  document.querySelectorAll(".js-nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.section === section);
  });

  // Show/hide section panels
  _sections.forEach((s) => {
    const panel = el(`section-${s}`);
    if (panel) panel.style.display = s === section ? "" : "none";
  });

  State.activeSection = section;

  // Load data for the newly visible section
  if (section === "overview")  await loadOverview();
  if (section === "requests")  await loadRequests();
  if (section === "analytics") await loadAnalyticsSection();
};

// =================================================================
// DATA LOADERS
// =================================================================
const loadOverview = async () => {
  try {
    const { stats } = await AdminAPI.fetchStats();
    renderStats(stats);
  } catch (err) {
    Toast.error(err.message || "Failed to load dashboard stats.");
  }
};

const loadRequests = async () => {
  const tbody = el("requestsTableBody");
  if (tbody) tbody.innerHTML = tableLoadingHTML(7);

  try {
    const { requests } = await AdminAPI.fetchRequests(State.filters);
    State.requests = requests || [];
    renderRequestsTable(State.requests);
  } catch (err) {
    Toast.error(err.message || "Failed to load requests.");
    if (tbody) tbody.innerHTML = emptyRowHTML(7, "Failed to load requests.");
  }
};

const loadAnalyticsSection = async () => {
  try {
    // Analytics derives from the full request list
    const { requests } = await AdminAPI.fetchRequests({});
    renderAnalytics(requests || []);
  } catch (err) {
    Toast.error(err.message || "Failed to load analytics.");
  }
};

// =================================================================
// MODALS
// =================================================================

// ── Approve modal ──────────────────────────────────────────────
const openApproveModal = (id, companyName, email) => {
  State.pendingAction = { id, companyName, email };
  setText("approveCompanyName", companyName);
  showEl("approveModal");
};

const confirmApprove = async () => {
  const { id, companyName, email } = State.pendingAction;
  if (!id) return;

  const btn = el("confirmApproveBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Approving…"; }

  try {
    const data = await AdminAPI.approve(id);

    closeModals();

    // Show temp password modal — admin must copy this and share manually
    setText("tempCompanyName", companyName);
    setText("tempUserEmail",   email);
    setText("tempPasswordValue", data.tempPassword || "—");
    showEl("tempPasswordModal");

    // Refresh stats + request list
    await Promise.all([loadOverview(), loadRequests()]);

  } catch (err) {
    Toast.error(err.message || "Failed to approve request.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Approve"; }
  }
};

// ── Reject modal ───────────────────────────────────────────────
const openRejectModal = (id, companyName) => {
  State.pendingAction = { id, companyName, email: null };
  setText("rejectCompanyName", companyName);
  const reason = el("rejectReason");
  if (reason) reason.value = "";
  showEl("rejectModal");
};

const confirmReject = async () => {
  const { id } = State.pendingAction;
  if (!id) return;

  const reason = el("rejectReason")?.value.trim() ?? "";

  const btn = el("confirmRejectBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Rejecting…"; }

  try {
    await AdminAPI.reject(id, reason);

    Toast.success("Request rejected.");
    closeModals();
    await Promise.all([loadOverview(), loadRequests()]);

  } catch (err) {
    Toast.error(err.message || "Failed to reject request.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Reject"; }
  }
};

const closeModals = () => {
  hideEl("approveModal");
  hideEl("rejectModal");
  State.pendingAction = { id: null, companyName: null, email: null };
};

// ── Copy temp password ─────────────────────────────────────────
const copyTempPassword = async () => {
  const pwd = el("tempPasswordValue")?.textContent ?? "";
  if (!pwd || pwd === "—") return;

  try {
    await navigator.clipboard.writeText(pwd);
    Toast.success("Password copied to clipboard.");
  } catch {
    Toast.warning("Unable to copy. Please copy the password manually.");
  }
};

// =================================================================
// EVENT LISTENERS — all via delegation, no inline onclick
// =================================================================
const bindEvents = () => {

  // ── Navigation ────────────────────────────────────────────────
  document.querySelectorAll(".js-nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchSection(item.dataset.section);
    });
  });

  // ── Filter buttons ────────────────────────────────────────────
  el("requestsTableSection")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-filter-btn");
    if (!btn) return;

    const type  = btn.dataset.filterType;  // "status" or "role"
    const value = btn.dataset.filterValue;

    if (type && value) {
      State.filters[type] = value;

      // Update active class within that filter group
      document.querySelectorAll(`.js-filter-btn[data-filter-type="${type}"]`)
        .forEach((b) => b.classList.toggle("active", b.dataset.filterValue === value));

      loadRequests();
    }
  });

  // ── Table action buttons (event delegation) ───────────────────
  el("requestsTableBody")?.addEventListener("click", (e) => {
    const approveBtn = e.target.closest(".js-approve");
    const rejectBtn  = e.target.closest(".js-reject");

    if (approveBtn) {
      openApproveModal(
        approveBtn.dataset.id,
        approveBtn.dataset.name,
        approveBtn.dataset.email
      );
    }

    if (rejectBtn) {
      openRejectModal(rejectBtn.dataset.id, rejectBtn.dataset.name);
    }
  });

  // ── Approve modal ─────────────────────────────────────────────
  el("confirmApproveBtn")?.addEventListener("click", confirmApprove);
  el("cancelApproveBtn")?.addEventListener("click",  closeModals);
  el("approveModal")?.addEventListener("click", (e) => {
    if (e.target === el("approveModal")) closeModals();
  });

  // ── Reject modal ──────────────────────────────────────────────
  el("confirmRejectBtn")?.addEventListener("click", confirmReject);
  el("cancelRejectBtn")?.addEventListener("click",  closeModals);
  el("rejectModal")?.addEventListener("click", (e) => {
    if (e.target === el("rejectModal")) closeModals();
  });

  // ── Temp password modal ───────────────────────────────────────
  el("closeTempModalBtn")?.addEventListener("click",  () => hideEl("tempPasswordModal"));
  el("copyPasswordBtn")?.addEventListener("click",    copyTempPassword);

  // ── Logout ────────────────────────────────────────────────────
  el("logoutBtn")?.addEventListener("click", () => Auth.logout());

  // ── Mobile sidebar toggle ─────────────────────────────────────
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });

  // ── Keyboard: close modals on Escape ─────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModals();
  });
};

// =================================================================
// INIT
// =================================================================
const init = () => {
  // Populate admin name in topbar
  const user = Auth.getCurrentUser();
  setText("adminName", user?.company_name || "Admin");

  bindEvents();

  // Start on overview section
  switchSection("overview");
};

document.addEventListener("DOMContentLoaded", init);