/* =============================================================
   AXO NETWORKS — OEM SUPPLIERS DIRECTORY
   pages/oem/suppliers.js

   Features:
   - List all active suppliers in the network
   - Client-side search by company name or email

   Backend endpoint used:
     GET /api/oem/suppliers
       → { suppliers: [ { id, company_name, email } ] }

   Note: The backend currently returns id, company_name, email only.
   Additional fields (phone, city, capabilities) can be added to
   the backend query in oemController.getSuppliers() when needed.
   ============================================================= */

import Router  from "../../core/router.js";
import API     from "../../core/api.js";
import Auth    from "../../core/auth.js";
import Toast   from "../../core/toast.js";
import {
  sanitizeHTML,
  getInitials,
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
  allSuppliers: [],
  searchQuery:  "",
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)       => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML   = html; };

const _gridLoading = () => `
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>`;

// =================================================================
// FILTER — client-side, no extra API call
// =================================================================
const applySearch = (suppliers, query) => {
  if (!query.trim()) return suppliers;

  const q = query.toLowerCase();
  return suppliers.filter(
    (s) =>
      (s.company_name || "").toLowerCase().includes(q) ||
      (s.email        || "").toLowerCase().includes(q)
  );
};

// =================================================================
// RENDER — SUPPLIER CARDS
// =================================================================
const renderSupplierCard = (supplier) => {
  const initials = getInitials(supplier.company_name);

  return `
    <div class="supplier-card">
      <div class="supplier-card__header">
        <div class="supplier-card__avatar" aria-hidden="true">
          ${sanitizeHTML(initials)}
        </div>
        <div class="supplier-card__identity">
          <div class="supplier-card__name">
            ${sanitizeHTML(supplier.company_name)}
          </div>
          <div class="supplier-card__email">
            ${sanitizeHTML(supplier.email)}
          </div>
        </div>
      </div>
    </div>`;
};

const renderSuppliers = () => {
  const grid = el("suppliersGrid");
  if (!grid) return;

  const filtered = applySearch(State.allSuppliers, State.searchQuery);

  setText(
    "supplierCount",
    `${filtered.length} of ${State.allSuppliers.length} supplier${State.allSuppliers.length !== 1 ? "s" : ""}`
  );

  if (!State.allSuppliers.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">🏭</span>
        <p class="empty-state__msg">No suppliers have joined the network yet.</p>
      </div>`;
    return;
  }

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">🔍</span>
        <p class="empty-state__msg">No suppliers match "<strong>${sanitizeHTML(State.searchQuery)}</strong>".</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(renderSupplierCard).join("");
};

// =================================================================
// LOAD SUPPLIERS
// =================================================================
const loadSuppliers = async () => {
  setHTML("suppliersGrid", _gridLoading());

  try {
    const { suppliers } = await API.get("/oem/suppliers");
    State.allSuppliers = suppliers || [];
    renderSuppliers();
  } catch (err) {
    Toast.error(err.message || "Failed to load suppliers.");
    setHTML("suppliersGrid", `<p class="text-error">Failed to load suppliers. Please refresh.</p>`);
  }
};

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── Search ────────────────────────────────────────────────────
  el("searchInput")?.addEventListener(
    "input",
    debounce((e) => {
      State.searchQuery = e.target.value;
      renderSuppliers();
    }, 250)
  );

  el("clearSearchBtn")?.addEventListener("click", () => {
    const input = el("searchInput");
    if (input) input.value = "";
    State.searchQuery = "";
    renderSuppliers();
  });

  // ── Refresh ───────────────────────────────────────────────────
  el("refreshBtn")?.addEventListener("click", loadSuppliers);

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
  setText("companyName", user?.company_name || "OEM");

  bindEvents();
  loadSuppliers();
};

document.addEventListener("DOMContentLoaded", init);