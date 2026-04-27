/* =============================================================
   AXO NETWORKS — OEM ORDERS
   pages/oem/orders.js

   Features:
   - List all purchase orders for this OEM
   - Client-side filter by status (no extra API call per filter)
   - Client-side search by PO number, part name, supplier name
   - Click row → order detail page

   Backend endpoints used:
     GET /api/oem/orders
       → { orders: [ { id, po_number, part_name, supplier_name,
                        quantity, total_value, status, created_at,
                        progress } ] }
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
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  allOrders:    [],   // full list from API — never mutated after load
  searchQuery:  "",
  statusFilter: "all",
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
// FILTER — pure function, no side effects
// =================================================================
const applyFilters = (orders, { statusFilter, searchQuery }) => {
  let result = orders;

  // Status filter
  if (statusFilter && statusFilter !== "all") {
    result = result.filter((o) => o.status === statusFilter);
  }

  // Search — matches PO number, part name, supplier name (case-insensitive)
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter((o) =>
      (o.po_number     || "").toLowerCase().includes(q) ||
      (o.part_name     || "").toLowerCase().includes(q) ||
      (o.supplier_name || "").toLowerCase().includes(q)
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
  const detailUrl   = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${order.id}`;

  return `
    <tr
      class="tr-clickable js-order-row"
      data-href="${detailUrl}"
      role="button"
      tabindex="0"
      aria-label="View order ${sanitizeHTML(order.po_number)}"
    >
      <td>
        <strong class="po-number">${sanitizeHTML(order.po_number || "—")}</strong>
      </td>
      <td>${sanitizeHTML(order.part_name    || "—")}</td>
      <td>${sanitizeHTML(order.supplier_name || "—")}</td>
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

  // Update result count
  setText("resultCount",
    `${filtered.length} of ${State.allOrders.length} order${State.allOrders.length !== 1 ? "s" : ""}`
  );

  if (!filtered.length) {
    const msg = State.allOrders.length
      ? "No orders match your current filters."
      : "No orders yet. Accept a quote to create your first Purchase Order.";

    tbody.innerHTML = _tableEmpty(msg);
    return;
  }

  tbody.innerHTML = filtered.map(renderOrderRow).join("");
};

// =================================================================
// DATA LOADER — fetches once, filters client-side
// =================================================================
const loadOrders = async () => {
  const tbody = el("ordersTableBody");
  if (tbody) tbody.innerHTML = _tableLoading();

  try {
    const { orders } = await API.get("/oem/orders");
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

  // ── Status filter dropdown ─────────────────────────────────────
  el("statusFilter")?.addEventListener("change", (e) => {
    State.statusFilter = e.target.value;
    renderOrders();
  });

  // ── Search input — debounced so we don't re-render on every keystroke
  el("searchInput")?.addEventListener(
    "input",
    debounce((e) => {
      State.searchQuery = e.target.value;
      renderOrders();
    }, 250)
  );

  // ── Clear search button ────────────────────────────────────────
  el("clearSearchBtn")?.addEventListener("click", () => {
    const input = el("searchInput");
    if (input) input.value = "";
    State.searchQuery = "";
    renderOrders();
  });

  // ── Clickable rows (mouse + keyboard) — event delegation ──────
  el("ordersTableBody")?.addEventListener("click", (e) => {
    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  el("ordersTableBody")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  // ── Sidebar / auth ─────────────────────────────────────────────
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
  setText("companyName", user?.company_name || "OEM");

  bindEvents();
  loadOrders();
};

document.addEventListener("DOMContentLoaded", init);