/* =============================================================
   AXO NETWORKS — API CLIENT
   core/api.js

   Central fetch wrapper for every HTTP call in the app.

   Responsibilities:
   - Attach Authorization header automatically
   - Enforce request timeout
   - Normalize all errors into a consistent shape
   - Handle 401 (token expired) → auto logout + redirect
   - Handle network failures (offline, DNS, CORS)
   - Provide typed helpers: get / post / put / patch / del / upload

   ⚠️  Rule: NO page file or component ever calls fetch() directly.
       All HTTP goes through this file.
   ============================================================= */

import CONFIG from "./config.js";

// -----------------------------------------------------------------
// Internal — Error Shape
// Every rejected promise from this file resolves to ApiError.
// Page files can always safely read err.message and err.status.
// -----------------------------------------------------------------
class ApiError extends Error {
  /**
   * @param {string} message   - Human-readable error message
   * @param {number} status    - HTTP status code (0 = network failure)
   * @param {any}    data      - Raw response body if available
   */
  constructor(message, status = 0, data = null) {
    super(message);
    this.name    = "ApiError";
    this.status  = status;
    this.data    = data;
  }
}

// -----------------------------------------------------------------
// Internal — Read token from storage
// Imported here directly to avoid circular dep with auth.js.
// auth.js is the public interface; this is the raw read.
// -----------------------------------------------------------------
const _getToken = () =>
  localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN) || null;

// -----------------------------------------------------------------
// Internal — Handle 401 Unauthorized
// Token expired or revoked. Clear session and redirect to login.
// Debounced so parallel requests don't cause multiple redirects.
// -----------------------------------------------------------------
let _redirectingToLogin = false;

const _handleUnauthorized = () => {
  if (_redirectingToLogin) return;
  _redirectingToLogin = true;

  localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
  localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);

  // Small delay so any in-flight toast can render before navigation
  setTimeout(() => {
    window.location.href = CONFIG.ROUTES.LOGIN;
  }, 100);
};

// -----------------------------------------------------------------
// Internal — Build request headers
// -----------------------------------------------------------------
const _buildHeaders = (isMultipart = false) => {
  const headers = {};

  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }

  const token = _getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

// -----------------------------------------------------------------
// Internal — Parse response body safely
// Backend may return JSON or plain text depending on the endpoint.
// -----------------------------------------------------------------
const _parseBody = async (response) => {
  const contentType = response.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  // Blob (file download)
  if (
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/pdf") ||
    contentType.includes("application/vnd")
  ) {
    return response.blob();
  }

  return response.text();
};

// -----------------------------------------------------------------
// Internal — Core request executor
// All public helpers (get, post, etc.) funnel through here.
// -----------------------------------------------------------------
const _request = async (method, endpoint, options = {}) => {
  const {
    body        = null,
    isMultipart = false,   // set true for FormData / file upload
    timeout     = CONFIG.API.TIMEOUT_MS,
    raw         = false,   // set true to get the raw Response object back
  } = options;

  const url = `${CONFIG.API.BASE_URL}${endpoint}`;

  // AbortController handles request timeout
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeout);

  const fetchOptions = {
    method,
    headers: _buildHeaders(isMultipart),
    signal:  controller.signal,
  };

  if (body !== null) {
    fetchOptions.body = isMultipart ? body : JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    clearTimeout(timeoutId);

    // AbortError = our timeout fired
    if (err.name === "AbortError") {
      throw new ApiError(
        "Request timed out. Please check your connection and try again.",
        0
      );
    }

    // Everything else = network failure (offline, DNS, CORS)
    throw new ApiError(
      "Unable to reach the server. Please check your internet connection.",
      0
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Caller wants the raw Response (e.g. file download streaming)
  if (raw) return response;

  const data = await _parseBody(response);

  // 401 — token expired / invalid
  if (response.status === 401) {
    _handleUnauthorized();
    throw new ApiError(
      data?.error || "Your session has expired. Please log in again.",
      401,
      data
    );
  }

  // 403 — authenticated but not authorized
  if (response.status === 403) {
    throw new ApiError(
      data?.error || "You do not have permission to perform this action.",
      403,
      data
    );
  }

  // 404
  if (response.status === 404) {
    throw new ApiError(
      data?.error || "The requested resource was not found.",
      404,
      data
    );
  }

  // 422 — validation errors from backend
  if (response.status === 422) {
    throw new ApiError(
      data?.error || "Validation failed. Please check your input.",
      422,
      data
    );
  }

  // 5xx — server errors
  if (response.status >= 500) {
    throw new ApiError(
      data?.error || "A server error occurred. Please try again later.",
      response.status,
      data
    );
  }

  // Any other non-2xx
  if (!response.ok) {
    throw new ApiError(
      data?.error || `Request failed with status ${response.status}.`,
      response.status,
      data
    );
  }

  return data;
};

// -----------------------------------------------------------------
// Public API — HTTP Method Helpers
// -----------------------------------------------------------------

/**
 * GET /endpoint
 * @param {string} endpoint  - e.g. "/oem/dashboard/stats"
 * @returns {Promise<any>}
 */
const get = (endpoint) =>
  _request("GET", endpoint);

/**
 * POST /endpoint with JSON body
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 */
const post = (endpoint, body) =>
  _request("POST", endpoint, { body });

/**
 * PUT /endpoint with JSON body
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 */
const put = (endpoint, body) =>
  _request("PUT", endpoint, { body });

/**
 * PATCH /endpoint with JSON body
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 */
const patch = (endpoint, body) =>
  _request("PATCH", endpoint, { body });

/**
 * DELETE /endpoint
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
const del = (endpoint) =>
  _request("DELETE", endpoint);

/**
 * POST /endpoint with FormData (file upload)
 * Body must be a FormData instance — do NOT JSON.stringify it.
 * @param {string}   endpoint
 * @param {FormData} formData
 * @returns {Promise<any>}
 */
const upload = (endpoint, formData) =>
  _request("POST", endpoint, { body: formData, isMultipart: true });

/**
 * GET /endpoint — returns raw Response for file downloads
 * Caller is responsible for reading the blob and triggering download.
 * @param {string} endpoint
 * @returns {Promise<Response>}
 */
const download = (endpoint) =>
  _request("GET", endpoint, { raw: true });

// -----------------------------------------------------------------
// Public Export
// -----------------------------------------------------------------
const API = Object.freeze({
  get,
  post,
  put,
  patch,
  del,
  upload,
  download,
  ApiError,
});

export default API;
export { ApiError };