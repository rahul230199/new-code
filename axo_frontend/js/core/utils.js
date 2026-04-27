/* =============================================================
   AXO NETWORKS — UTILITIES
   core/utils.js

   Pure, stateless helper functions used across all page files
   and components.

   Rules:
   - No imports. This file has zero dependencies.
   - No side effects. Every function takes input, returns output.
   - No DOM manipulation. That belongs in components.
   - Functions are individually exported so pages only import
     what they need (tree-shakeable).
   ============================================================= */


// =================================================================
// DATE & TIME
// =================================================================

/**
 * Format an ISO date string or Date object into a readable date.
 * @param {string|Date} value
 * @param {"short"|"medium"|"long"} style
 * @returns {string}  e.g. "Apr 24, 2026"  /  "24 Apr 2026"  /  "April 24, 2026"
 *
 * @example
 * formatDate("2026-04-24T10:30:00Z")          // "Apr 24, 2026"
 * formatDate("2026-04-24T10:30:00Z", "long")  // "April 24, 2026"
 */
const formatDate = (value, style = "medium") => {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date)) return "—";

  const options = {
    short:  { day: "2-digit", month: "short",  year: "numeric" },
    medium: { day: "numeric", month: "short",  year: "numeric" },
    long:   { day: "numeric", month: "long",   year: "numeric" },
  };

  return date.toLocaleDateString("en-IN", options[style] ?? options.medium);
};

/**
 * Format an ISO datetime string into date + time.
 * @param {string|Date} value
 * @returns {string}  e.g. "Apr 24, 2026 · 10:30 AM"
 */
const formatDateTime = (value) => {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date)) return "—";

  const datePart = date.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  const timePart = date.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  return `${datePart} · ${timePart}`;
};

/**
 * Return a human-readable relative time string.
 * Falls back to formatDate for anything older than 30 days.
 * @param {string|Date} value
 * @returns {string}  e.g. "Just now" / "5 min ago" / "3 days ago" / "Apr 24, 2026"
 */
const formatRelativeTime = (value) => {
  if (!value) return "—";

  const date  = value instanceof Date ? value : new Date(value);
  if (isNaN(date)) return "—";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds <  60)                return "Just now";
  if (seconds < 3_600)              return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400)             return `${Math.floor(seconds / 3_600)} hr ago`;
  if (seconds < 86_400 * 2)         return "Yesterday";
  if (seconds < 86_400 * 30)        return `${Math.floor(seconds / 86_400)} days ago`;

  return formatDate(date);
};


// =================================================================
// CURRENCY & NUMBERS
// =================================================================

/**
 * Format a number as currency.
 * @param {number|string} value
 * @param {string} currency  - ISO 4217 code, e.g. "USD", "INR"
 * @returns {string}  e.g. "$1,250.00" / "₹1,25,000.00"
 *
 * @example
 * formatCurrency(1250)          // "$1,250.00"
 * formatCurrency(125000, "INR") // "₹1,25,000.00"
 */
const formatCurrency = (value, currency = "USD") => {
  const num = parseFloat(value);
  if (isNaN(num)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style:    "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

/**
 * Format a large number with locale-aware thousands separators.
 * @param {number|string} value
 * @returns {string}  e.g. 1250000 → "12,50,000"
 */
const formatNumber = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return "—";

  return new Intl.NumberFormat("en-IN").format(num);
};

/**
 * Format bytes into a human-readable file size.
 * Used by the document controller — file_size is stored in bytes.
 * @param {number} bytes
 * @returns {string}  e.g. "2.4 MB" / "340 KB"
 *
 * @example
 * formatFileSize(2_500_000) // "2.4 MB"
 * formatFileSize(512)       // "512 B"
 */
const formatFileSize = (bytes) => {
  if (bytes == null || isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);

  return `${value} ${units[i]}`;
};


// =================================================================
// STRING
// =================================================================

/**
 * Truncate a string to a max length, appending "…" if cut.
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 *
 * @example
 * truncate("Long company name here", 15) // "Long company na…"
 */
const truncate = (value, maxLength = 40) => {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trimEnd() + "…";
};

/**
 * Extract initials from a name or company name.
 * Used for avatar placeholders in Topbar and tables.
 * @param {string} value
 * @returns {string}  e.g. "Tata Motors" → "TM"  /  "Acme" → "AC"
 *
 * @example
 * getInitials("Tata Motors Ltd") // "TM"
 * getInitials("Acme")            // "AC"
 */
const getInitials = (value) => {
  if (!value) return "?";

  const words = value.trim().split(/\s+/);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (words[0][0] + words[1][0]).toUpperCase();
};

/**
 * Sanitize a string for safe innerHTML insertion.
 * Escapes HTML entities to prevent XSS when rendering user-generated
 * content (company names, messages, notes) into the DOM.
 * @param {string} value
 * @returns {string}
 *
 * @example
 * sanitizeHTML('<script>alert(1)</script>') // '&lt;script&gt;...'
 */
const sanitizeHTML = (value) => {
  if (!value) return "";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
};

/**
 * Capitalize the first letter of a string.
 * @param {string} value
 * @returns {string}
 */
const capitalize = (value) => {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};


// =================================================================
// URL & QUERY
// =================================================================

/**
 * Build a query string from a plain object.
 * Skips keys with null, undefined, or empty-string values.
 * Used by admin getAllRequests filter (status, role params).
 * @param {Record<string, any>} params
 * @returns {string}  e.g. "?status=pending&role=oem"
 *
 * @example
 * buildQueryString({ status: "pending", role: null })
 * // "?status=pending"
 */
const buildQueryString = (params = {}) => {
  const filtered = Object.entries(params).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  if (filtered.length === 0) return "";

  const qs = new URLSearchParams(filtered).toString();
  return `?${qs}`;
};

/**
 * Read a single query parameter from the current page URL.
 * Used by order-details pages to get the order ID from the URL.
 * @param {string} key
 * @returns {string|null}
 *
 * @example
 * // URL: /pages/oem/order-details.html?id=42
 * getQueryParam("id") // "42"
 */
const getQueryParam = (key) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
};


// =================================================================
// PERFORMANCE
// =================================================================

/**
 * Debounce a function — delays execution until after `wait` ms
 * have elapsed since the last call.
 * Used for search inputs and resize handlers.
 * @param {Function} fn
 * @param {number}   wait  - ms
 * @returns {Function}
 *
 * @example
 * const onSearch = debounce((e) => fetchResults(e.target.value), 400);
 * input.addEventListener("input", onSearch);
 */
const debounce = (fn, wait = 300) => {
  let timerId;

  return function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn.apply(this, args), wait);
  };
};


// =================================================================
// STATUS BADGES
// =================================================================

/**
 * Map a backend status string to a CSS modifier class.
 * Used by DataTable and order detail pages to colour status badges.
 *
 * Covers statuses from:
 *   network_access_requests: pending / approved / rejected
 *   rfqs:                    open / awarded / closed
 *   quotes:                  pending / accepted / rejected
 *   purchase_orders:         accepted / in_progress / completed / delayed
 *   order_milestones:        pending / in_progress / completed / delayed
 *
 * @param {string} status
 * @returns {string}  CSS class suffix
 *
 * @example
 * getStatusClass("completed") // "success"
 * getStatusClass("delayed")   // "danger"
 */
const getStatusClass = (status) => {
  const map = {
    // Positive
    approved:    "success",
    accepted:    "success",
    completed:   "success",
    awarded:     "success",
    active:      "success",
    open:        "success",

    // In flight
    in_progress: "info",
    pending:     "warning",

    // Negative
    rejected:    "danger",
    delayed:     "danger",
    closed:      "neutral",
    inactive:    "neutral",
  };

  return map[status?.toLowerCase()] ?? "neutral";
};

/**
 * Convert a snake_case or underscore status to a display label.
 * @param {string} status
 * @returns {string}  e.g. "in_progress" → "In Progress"
 */
const formatStatus = (status) => {
  if (!status) return "—";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};


// =================================================================
// Public Export
// =================================================================
export {
  // Date & Time
  formatDate,
  formatDateTime,
  formatRelativeTime,

  // Currency & Numbers
  formatCurrency,
  formatNumber,
  formatFileSize,

  // String
  truncate,
  getInitials,
  sanitizeHTML,
  capitalize,

  // URL & Query
  buildQueryString,
  getQueryParam,

  // Performance
  debounce,

  // Status
  getStatusClass,
  formatStatus,
};