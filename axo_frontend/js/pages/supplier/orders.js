/* =============================================================
   AXO NETWORKS — SUPPLIER ORDERS
   pages/supplier/orders.js

   Features:
   - List all purchase orders assigned to this supplier
   - Client-side filter by status
   - Client-side search by PO number, part name, OEM name
   - Progress bar per order (from milestone completion %)
   - Click row → order detail page

   Backend endpoint used:
     GET /api/supplier/orders
       → { orders: [ { id, po_number, part_name, quantity,
                        total_value, status, created_at,
                        progress, oem_name } ] }
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
  allOrders:    [],
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

const _tableEmpty = (msg = "No orders found.") => `
  <tr>
    <td colspan="7" class="table-empty">
      <span class="table-empty__icon">📦</span>
      <span>${msg}</span>
    </td>
  </tr>`;

// =================================================================
// FILTER — pure, no side effects
// =================================================================
const applyFilters = (orders, { statusFilter, searchQuery }) => {
  let result = orders;

  if (statusFilter !== "all") {
    result = result.filter((o) => o.status === statusFilter);
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (o) =>
        (o.po_number  || "").toLowerCase().includes(q) ||
        (o.part_name  || "").toLowerCase().includes(q) ||
        (o.oem_name   || "").toLowerCase().includes(q)
    );
  }

  return result;
};

// =================================================================
// RENDER — ORDERS TABLE
// =================================================================
const renderOrderRow = (order) => {
  const statusClass = getStatusClass(order.status);
  const progress    = Math.min(100, Math.max(0, order.progress ?? 0));
  const detailUrl   = `${CONFIG.ROUTES.SUPPLIER_ORDER_DETAILS}?id=${order.id}`;

  return `
    <tr
      class="tr-clickable js-order-row"
      data-href="${detailUrl}"
      role="button"
      tabindex="0"
      aria-label="View order ${sanitizeHTML(order.po_number || order.id)}"
    >
      <td>
        <strong class="po-number">${sanitizeHTML(order.po_number || `PO-${order.id}`)}</strong>
      </td>
      <td>${sanitizeHTML(order.oem_name  || "—")}</td>
      <td>${sanitizeHTML(order.part_name || "—")}</td>
      <td class="td-number">${order.quantity ?? "—"}</td>
      <td class="td-number">
        ${order.total_value
          ? formatCurrency(order.total_value, "USD")
          : "—"}
      </td>
      <td>
        <span class="badge badge--${statusClass}">
          ${formatStatus(order.status)}
        </span>
      </td>
      <td>
        <div class="progress-wrap" title="${progress}% complete">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${progress}%"></div>
          </div>
          <span class="progress-label">${progress}%</span>
        </div>
      </td>
      <td>${formatDate(order.created_at)}</td>
    </tr>`;
};

const renderOrders = () => {
  const tbody = el("ordersTableBody");
  if (!tbody) return;

  const filtered = applyFilters(State.allOrders, {
    statusFilter: State.statusFilter,
    searchQuery:  State.searchQuery,
  });

  setText(
    "resultCount",
    `${filtered.length} of ${State.allOrders.length} order${State.allOrders.length !== 1 ? "s" : ""}`
  );

  if (!State.allOrders.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty">
          <span class="table-empty__icon">📦</span>
          <p>No orders yet. Orders appear here when your quotes are accepted by an OEM.</p>
        </td>
      </tr>`;
    return;
  }

  if (!filtered.length) {
    tbody.innerHTML = _tableEmpty("No orders match your current filters.");
    return;
  }

  tbody.innerHTML = filtered.map(renderOrderRow).join("");
};

// =================================================================
// LOAD ORDERS — once, filter client-side
// =================================================================
const loadOrders = async () => {
  const tbody = el("ordersTableBody");
  if (tbody) tbody.innerHTML = _tableLoading();

  try {
    const { orders } = await API.get("/supplier/orders");
    State.allOrders = orders || [];
    renderOrders();
  } catch (err) {
    Toast.error(err.message || "Failed to load orders.");
    setHTML("ordersTableBody", _tableEmpty("Failed to load orders. Please refresh."));
  }
};

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── Status filter ──────────────────────────────────────────────
  el("statusFilter")?.addEventListener("change", (e) => {
    State.statusFilter = e.target.value;
    renderOrders();
  });

  // ── Search — debounced, filters state not DOM ─────────────────
  el("searchInput")?.addEventListener(
    "input",
    debounce((e) => {
      State.searchQuery = e.target.value;
      renderOrders();
    }, 250)
  );

  el("clearSearchBtn")?.addEventListener("click", () => {
    const input = el("searchInput");
    if (input) input.value = "";
    State.searchQuery = "";
    renderOrders();
  });

  // ── Clickable rows — mouse + keyboard ─────────────────────────
  el("ordersTableBody")?.addEventListener("click", (e) => {
    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  el("ordersTableBody")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  // ── Refresh ───────────────────────────────────────────────────
  el("refreshBtn")?.addEventListener("click", loadOrders);

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
  loadOrders();
};

document.addEventListener("DOMContentLoaded", init);