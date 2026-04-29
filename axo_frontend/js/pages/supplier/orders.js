// =============================================================
// SUPPLIER ORDERS — FIXED VERSION
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
  allOrders: [],
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
  <td colspan="8"> <!-- ✅ FIX -->
    <div class="skeleton-row"></div>
    <div class="skeleton-row"></div>
    <div class="skeleton-row"></div>
  </td>
</tr>`;

const _tableEmpty = (msg = "No orders found.") => `
<tr>
  <td colspan="8" class="table-empty"> <!-- ✅ FIX -->
    <span>📦</span>
    <span>${msg}</span>
  </td>
</tr>`;

// =============================================================
// FILTER
// =============================================================
const applyFilters = (orders) => {
  let result = orders;

  if (State.statusFilter !== "all") {
    result = result.filter(o => o.status === State.statusFilter);
  }

  const q = State.searchQuery.toLowerCase();

  if (q) {
    result = result.filter(o =>
      (o.po_number || "").toLowerCase().includes(q) ||
      (o.part_name || "").toLowerCase().includes(q) ||
      (o.oem_name || "").toLowerCase().includes(q)
    );
  }

  return result;
};

// =============================================================
// RENDER
// =============================================================
const renderOrderRow = (order) => {
  const statusClass = getStatusClass(order.status);
  const progress = Math.min(100, Math.max(0, order.progress ?? 0));

  return `
<tr class="js-order-row" data-href="${CONFIG.ROUTES.SUPPLIER_ORDER_DETAILS}?id=${order.id}">
  <td><strong>${sanitizeHTML(order.po_number || `PO-${order.id}`)}</strong></td>
  <td>${sanitizeHTML(order.oem_name || "—")}</td>
  <td>${sanitizeHTML(order.part_name || "—")}</td>
  <td>${order.quantity ?? "—"}</td>
  <td>${order.total_value ? formatCurrency(order.total_value) : "—"}</td>
  <td><span class="badge badge--${statusClass}">${formatStatus(order.status)}</span></td>
  <td>${progress}%</td>
  <td>${formatDate(order.created_at)}</td>
</tr>`;
};

const renderOrders = () => {
  const tbody = el("ordersTableBody");
  if (!tbody) return;

  const filtered = applyFilters(State.allOrders);

  setText("resultCount", `${filtered.length} of ${State.allOrders.length} orders`);

  if (!State.allOrders.length) {
    tbody.innerHTML = _tableEmpty("No orders yet");
    return;
  }

  if (!filtered.length) {
    tbody.innerHTML = _tableEmpty("No matching orders");
    return;
  }

  tbody.innerHTML = filtered.map(renderOrderRow).join("");
};

// =============================================================
// LOAD
// =============================================================
const loadOrders = async () => {

  if (State.isLoading) return; // ✅ FIX
  State.isLoading = true;

  const tbody = el("ordersTableBody");
  if (tbody) tbody.innerHTML = _tableLoading();

  try {
    const { orders } = await API.get("/supplier/orders");
    State.allOrders = orders || [];
    renderOrders();
  } catch (err) {
    console.error(err);
    Toast.error("Failed to load orders");
    setHTML("ordersTableBody", _tableEmpty("Failed to load orders"));
  } finally {
    State.isLoading = false;
  }
};

// =============================================================
// EVENTS
// =============================================================
const bindEvents = () => {

  el("statusFilter")?.addEventListener("change", (e) => {
    State.statusFilter = e.target.value;
    renderOrders();
  });

  el("searchInput")?.addEventListener("input",
    debounce((e) => {
      State.searchQuery = e.target.value;
      renderOrders();
    }, 300)
  );

  el("clearSearchBtn")?.addEventListener("click", () => {
    const input = el("searchInput");
    if (input) input.value = "";
    State.searchQuery = "";
    renderOrders();
  });

  // ✅ safer row click
  el("ordersTableBody")?.addEventListener("click", (e) => {
    if (e.target.closest("button") || e.target.closest("a")) return;

    const row = e.target.closest(".js-order-row");
    if (row?.dataset.href) window.location.href = row.dataset.href;
  });

  el("refreshBtn")?.addEventListener("click", loadOrders);

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
  loadOrders();
};

document.addEventListener("DOMContentLoaded", init);