/* =============================================================
   AXO NETWORKS — FRONTEND CONFIG
   core/config.js

   Single source of truth for:
   - API base URL
   - Storage keys
   - Route paths
   - Role → home page mapping
   - App-wide constants

   ⚠️  Nothing in this file should import from any other file.
       All other files import FROM this file.
   ============================================================= */

// -----------------------------------------------------------------
// Environment Detection
// -----------------------------------------------------------------
const _isDev =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// -----------------------------------------------------------------
// API
// -----------------------------------------------------------------
const API = Object.freeze({
  BASE_URL: _isDev ? "http://localhost:5000/api" : "/api",
  TIMEOUT_MS: 15_000,
});

// -----------------------------------------------------------------
// LocalStorage Keys
// (all stored values go through auth.js — never access storage
//  directly from page files)
// -----------------------------------------------------------------
const STORAGE_KEYS = Object.freeze({
  TOKEN: "axo_access_token",
  USER:  "axo_user",
});

// -----------------------------------------------------------------
// Route Paths
// (every page navigation uses these constants — never raw strings)
// -----------------------------------------------------------------
const ROUTES = Object.freeze({
  // Auth
  LOGIN:           "/pages/auth/login.html",
  CHANGE_PASSWORD: "/pages/auth/change-password.html",

  // Admin
  ADMIN_DASHBOARD: "/pages/admin/dashboard.html",

  // OEM
  OEM_DASHBOARD:     "/pages/oem/dashboard.html",
  OEM_RFQ:           "/pages/oem/rfq.html",
  OEM_ORDERS:        "/pages/oem/orders.html",
  OEM_ORDER_DETAILS: "/pages/oem/order-details.html",
  OEM_DOCUMENTS:     "/pages/oem/documents.html",
  OEM_SUPPLIERS:     "/pages/oem/suppliers.html",
  OEM_PROFILE:       "/pages/oem/profile.html",

  // Supplier
  SUPPLIER_DASHBOARD:     "/pages/supplier/dashboard.html",
  SUPPLIER_RFQ:           "/pages/supplier/rfq.html",
  SUPPLIER_QUOTES:        "/pages/supplier/quotes.html",
  SUPPLIER_ORDERS:        "/pages/supplier/orders.html",
  SUPPLIER_ORDER_DETAILS: "/pages/supplier/order-details.html",
  SUPPLIER_PROFILE:       "/pages/supplier/profile.html",
});

// -----------------------------------------------------------------
// Role → Home Page Mapping
// (used by router.js after login & on every protected page load)
// -----------------------------------------------------------------
const ROLE_HOME = Object.freeze({
  admin:    ROUTES.ADMIN_DASHBOARD,
  oem:      ROUTES.OEM_DASHBOARD,
  supplier: ROUTES.SUPPLIER_DASHBOARD,
  both:     ROUTES.OEM_DASHBOARD, // "both" defaults to OEM home
});

// -----------------------------------------------------------------
// Role → Allowed Routes
// (router.js checks this before rendering any protected page)
// -----------------------------------------------------------------
const ROLE_ROUTES = Object.freeze({
  admin: [
    ROUTES.ADMIN_DASHBOARD,
  ],
  oem: [
    ROUTES.OEM_DASHBOARD,
    ROUTES.OEM_RFQ,
    ROUTES.OEM_ORDERS,
    ROUTES.OEM_ORDER_DETAILS,
    ROUTES.OEM_DOCUMENTS,
    ROUTES.OEM_SUPPLIERS,
    ROUTES.OEM_PROFILE,
  ],
  supplier: [
    ROUTES.SUPPLIER_DASHBOARD,
    ROUTES.SUPPLIER_RFQ,
    ROUTES.SUPPLIER_QUOTES,
    ROUTES.SUPPLIER_ORDERS,
    ROUTES.SUPPLIER_ORDER_DETAILS,
    ROUTES.SUPPLIER_PROFILE,
  ],
  both: [
    ROUTES.OEM_DASHBOARD,
    ROUTES.OEM_RFQ,
    ROUTES.OEM_ORDERS,
    ROUTES.OEM_ORDER_DETAILS,
    ROUTES.OEM_DOCUMENTS,
    ROUTES.OEM_SUPPLIERS,
    ROUTES.OEM_PROFILE,
    ROUTES.SUPPLIER_DASHBOARD,
    ROUTES.SUPPLIER_RFQ,
    ROUTES.SUPPLIER_QUOTES,
    ROUTES.SUPPLIER_ORDERS,
    ROUTES.SUPPLIER_ORDER_DETAILS,
    ROUTES.SUPPLIER_PROFILE,
  ],
});

// -----------------------------------------------------------------
// Pagination Defaults
// -----------------------------------------------------------------
const PAGINATION = Object.freeze({
  DEFAULT_PAGE_SIZE: 20,
  NOTIFICATION_PAGE_SIZE: 50,
});

// -----------------------------------------------------------------
// App Meta
// -----------------------------------------------------------------
const APP = Object.freeze({
  NAME:    "AXO Networks",
  VERSION: "1.0.0",
});

// -----------------------------------------------------------------
// Public Export
// -----------------------------------------------------------------
const CONFIG = Object.freeze({
  API,
  STORAGE_KEYS,
  ROUTES,
  ROLE_HOME,
  ROLE_ROUTES,
  PAGINATION,
  APP,
});

export default CONFIG;