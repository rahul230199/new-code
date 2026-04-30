/* =============================================================
   AXO NETWORKS — OEM ORDERS
   ============================================================= */

import Router from "../../core/router.js";
import API from "../../core/api.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import CONFIG from "../../core/config.js";
import { sanitizeHTML, formatDate, formatCurrency, debounce } from "../../core/utils.js";

if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// Status display mapping
const getStatusDisplay = (status) => {
    const statusMap = {
        'processing': { label: 'Processing', class: 'status-processing', icon: 'fa-spinner' },
        'confirmed': { label: 'Confirmed', class: 'status-confirmed', icon: 'fa-check-circle' },
        'in_progress': { label: 'In Progress', class: 'status-progress', icon: 'fa-cogs' },
        'quality_check': { label: 'Quality Check', class: 'status-quality', icon: 'fa-clipboard-check' },
        'shipped': { label: 'Shipped', class: 'status-shipped', icon: 'fa-shipping-fast' },
        'completed': { label: 'Completed', class: 'status-completed', icon: 'fa-check-double' },
        'pending': { label: 'Pending', class: 'status-pending', icon: 'fa-clock' },
        'accepted': { label: 'Accepted', class: 'status-accepted', icon: 'fa-check' },
        'delayed': { label: 'Delayed', class: 'status-delayed', icon: 'fa-exclamation-triangle' },
        'cancelled': { label: 'Cancelled', class: 'status-cancelled', icon: 'fa-ban' }
    };
    return statusMap[status] || { label: status || 'Unknown', class: 'status-default', icon: 'fa-question' };
};

const State = {
    allOrders: [],
    searchQuery: "",
    statusFilter: "all",
};

const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };

const _tableLoading = () => `
    <tr class="table-skeleton">
        <td colspan="8"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></td>
    </tr>`;

const _tableEmpty = (msg) => `
    <tr><td colspan="8" class="table-empty"><span class="table-empty__icon">📦</span><span>${msg}</span></td></tr>`;

const applyFilters = (orders, { statusFilter, searchQuery }) => {
    let result = orders;
    if (statusFilter && statusFilter !== "all") {
        result = result.filter((o) => o.status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
        result = result.filter((o) =>
            (o.po_number || "").toLowerCase().includes(q) ||
            (o.part_name || "").toLowerCase().includes(q) ||
            (o.supplier_name || "").toLowerCase().includes(q)
        );
    }
    return result;
};

const renderOrderRow = (order) => {
    const statusDisplay = getStatusDisplay(order.status);
    const progress = Math.min(100, Math.max(0, order.progress ?? 0));
    const detailUrl = `${CONFIG.ROUTES.OEM_ORDER_DETAILS}?id=${order.id}`;

    return `
        <tr class="tr-clickable js-order-row" data-href="${detailUrl}" role="button" tabindex="0">
            <td><strong class="po-number">${sanitizeHTML(order.po_number || "—")}</strong></td>
            <td>${sanitizeHTML(order.part_name || "—")}</td>
            <td>${sanitizeHTML(order.supplier_name || "—")}</td>
            <td class="td-number">${order.quantity ?? "—"}</td>
            <td class="td-number">${order.total_value ? formatCurrency(order.total_value, order.currency || "USD") : "—"}</td>
            <td><span class="badge ${statusDisplay.class}"><i class="fas ${statusDisplay.icon}"></i> ${statusDisplay.label}</span></td>
            <td><div class="progress-wrap"><div class="progress-bar"><div class="progress-bar__fill" style="width:${progress}%"></div></div><span class="progress-label">${progress}%</span></div></td>
            <td>${formatDate(order.created_at)}</td>
        </tr>
    `;
};

const renderOrders = () => {
    const tbody = el("ordersTableBody");
    if (!tbody) return;

    const filtered = applyFilters(State.allOrders, {
        statusFilter: State.statusFilter,
        searchQuery: State.searchQuery,
    });

    setText("resultCount", `${filtered.length} of ${State.allOrders.length} order${State.allOrders.length !== 1 ? "s" : ""}`);

    if (!filtered.length) {
        const msg = State.allOrders.length ? "No orders match your current filters." : "No orders yet. Accept a quote to create your first Purchase Order.";
        tbody.innerHTML = _tableEmpty(msg);
        return;
    }

    tbody.innerHTML = filtered.map(renderOrderRow).join("");
};

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

const bindEvents = () => {
    el("statusFilter")?.addEventListener("change", (e) => {
        State.statusFilter = e.target.value;
        renderOrders();
    });

    el("searchInput")?.addEventListener("input", debounce((e) => {
        State.searchQuery = e.target.value;
        renderOrders();
    }, 250));

    el("clearSearchBtn")?.addEventListener("click", () => {
        const input = el("searchInput");
        if (input) input.value = "";
        State.searchQuery = "";
        renderOrders();
    });

    el("ordersTableBody")?.addEventListener("click", (e) => {
        const row = e.target.closest(".js-order-row");
        if (row?.dataset.href) window.location.href = row.dataset.href;
    });

    el("ordersTableBody")?.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const row = e.target.closest(".js-order-row");
        if (row?.dataset.href) window.location.href = row.dataset.href;
    });

    el("logoutBtn")?.addEventListener("click", () => Auth.logout());
    el("menuToggle")?.addEventListener("click", () => el("sidebar")?.classList.toggle("open"));
};

const init = () => {
    const user = Auth.getCurrentUser();
    setText("companyName", user?.company_name || "OEM");
    bindEvents();
    loadOrders();
};

document.addEventListener("DOMContentLoaded", init);
