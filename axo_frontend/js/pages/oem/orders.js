/* =============================================================
   AXO NETWORKS — OEM ORDERS (Milestone-based Status)
   ============================================================= */

import Router from "../../core/router.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import { formatDate, formatCurrency, debounce } from "../../core/utils.js";

if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

let allOrders = [];
let statusFilter = "all";
let searchQuery = "";

const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };

function getStatusClass(status) {
    const statusMap = {
        'Order Confirmed': 'primary',
        'Raw Materials': 'info',
        'Production Started': 'info',
        'Quality Check': 'warning',
        'Ready to Ship': 'success',
        'Delivered': 'success',
        'Invoice Paid': 'success'
    };
    return statusMap[status] || 'neutral';
}

function renderOrderRow(order) {
    const progress = order.progress || 0;
    const statusClass = getStatusClass(order.status);
    
    return `
        <tr class="tr-clickable" data-order-id="${order.id}">
            <td class="po-number">${escapeHtml(order.po_number || "N/A")}</td>
            <td>${escapeHtml(order.part_name || "N/A")}</td>
            <td>${escapeHtml(order.supplier_name || "N/A")}</td>
            <td class="td-number">${order.quantity || 0}</td>
            <td class="td-number">${formatCurrency(order.total_value, order.currency || "USD")}</td>
            <td><span class="badge badge--${statusClass}">${escapeHtml(order.status)}</span></td>
            <td>
                <div class="progress-wrap">
                    <div class="progress-bar">
                        <div class="progress-bar__fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-label">${progress}%</span>
                </div>
            </td>
            <td>${formatDate(order.created_at)}</td>
        </tr>
    `;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function renderOrders() {
    const tbody = el("ordersTableBody");
    const resultCountSpan = el("resultCount");
    
    if (!tbody) return;
    
    let filtered = [...allOrders];
    
    if (statusFilter !== "all") {
        filtered = filtered.filter(o => o.status === statusFilter);
    }
    
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(o => 
            (o.po_number && o.po_number.toLowerCase().includes(query)) ||
            (o.part_name && o.part_name.toLowerCase().includes(query)) ||
            (o.supplier_name && o.supplier_name.toLowerCase().includes(query))
        );
    }
    
    if (resultCountSpan) {
        resultCountSpan.textContent = `${filtered.length} of ${allOrders.length} orders`;
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i class="fas fa-inbox"></i><p>No orders found</p></td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map(order => renderOrderRow(order)).join("");
}

async function loadOrders() {
    const tbody = el("ordersTableBody");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></td></tr>`;
    }
    
    try {
        const token = Auth.getToken();
        const response = await fetch("/api/oem/orders", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            Auth.logout();
            return;
        }
        
        const data = await response.json();
        allOrders = data.orders || [];
        renderOrders();
        
    } catch (error) {
        console.error("Error loading orders:", error);
        Toast.error("Failed to load orders");
    }
}

function applyFilters() {
    statusFilter = el("statusFilter")?.value || "all";
    searchQuery = el("searchInput")?.value || "";
    renderOrders();
}

function bindEvents() {
    el("statusFilter")?.addEventListener("change", applyFilters);
    el("searchInput")?.addEventListener("input", debounce(applyFilters, 300));
    el("clearSearchBtn")?.addEventListener("click", () => {
        if (el("searchInput")) el("searchInput").value = "";
        searchQuery = "";
        applyFilters();
    });
    el("refreshBtn")?.addEventListener("click", loadOrders);
    el("logoutBtn")?.addEventListener("click", () => Auth.logout());
    el("menuToggle")?.addEventListener("click", () => el("sidebar")?.classList.toggle("open"));
    
    const tbody = el("ordersTableBody");
    if (tbody) {
        tbody.addEventListener("click", (e) => {
            const row = e.target.closest(".tr-clickable");
            if (row) {
                const orderId = row.dataset.orderId;
                if (orderId) {
                    window.location.href = `/oem-order-details.html?id=${orderId}`;
                }
            }
        });
    }
}

function init() {
    const user = Auth.getCurrentUser();
    setText("companyName", user?.company_name || "OEM");
    bindEvents();
    loadOrders();
}

document.addEventListener("DOMContentLoaded", init);
