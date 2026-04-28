/* =============================================================
   AXO NETWORKS — API CLIENT (ENTERPRISE FIXED)
============================================================= */

import CONFIG from "./config.js";
import StorageManager from "./storage.js";
import Auth from "./auth.js";

// --------------------------------------------------
// STANDARD ERROR
// --------------------------------------------------
class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name   = "ApiError";
    this.status = status;
    this.data   = data;
  }
}

// --------------------------------------------------
// TOKEN (from storage manager)
// --------------------------------------------------
const _getToken = () => StorageManager.getToken();

// --------------------------------------------------
// HANDLE 401 (SESSION EXPIRED)
// --------------------------------------------------
let _redirecting = false;

const _handleUnauthorized = () => {
  if (_redirecting) return;
  _redirecting = true;

  console.warn("[API] Unauthorized — logging out");

  Auth.clearSession();

  setTimeout(() => {
    window.location.replace(CONFIG.ROUTES.LOGIN);
  }, 100);
};

// --------------------------------------------------
// HEADERS
// --------------------------------------------------
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

// --------------------------------------------------
// SAFE RESPONSE PARSER
// --------------------------------------------------
const _parseBody = async (response) => {
  const type = response.headers.get("Content-Type") || "";

  if (type.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  if (
    type.includes("application/octet-stream") ||
    type.includes("application/pdf") ||
    type.includes("application/vnd")
  ) {
    return response.blob();
  }

  return response.text();
};

// --------------------------------------------------
// CORE REQUEST
// --------------------------------------------------
const _request = async (method, endpoint, options = {}) => {
  const {
    body = null,
    isMultipart = false,
    timeout = CONFIG.API.TIMEOUT_MS,
    raw = false,
  } = options;

  const url = `${CONFIG.API.BASE_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let response;

  try {
    response = await fetch(url, {
      method,
      headers: _buildHeaders(isMultipart),
      body: body
        ? (isMultipart ? body : JSON.stringify(body))
        : null,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      throw new ApiError("Request timed out.", 0);
    }

    throw new ApiError("Network error. Check connection.", 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (raw) return response;

  const data = await _parseBody(response);

  // ----------------------------
  // ERROR HANDLING
  // ----------------------------

  if (response.status === 401) {
    _handleUnauthorized();
    throw new ApiError(
      data?.error || "Session expired. Please login again.",
      401,
      data
    );
  }

  if (response.status === 403) {
    throw new ApiError(
      data?.error || "Access denied.",
      403,
      data
    );
  }

  if (response.status === 404) {
    throw new ApiError(
      data?.error || "Resource not found.",
      404,
      data
    );
  }

  if (response.status === 422) {
    throw new ApiError(
      data?.error || "Validation failed.",
      422,
      data
    );
  }

  if (response.status >= 500) {
    throw new ApiError(
      data?.error || "Server error. Try again later.",
      response.status,
      data
    );
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error || `Request failed (${response.status})`,
      response.status,
      data
    );
  }

  return data;
};

// --------------------------------------------------
// METHODS
// --------------------------------------------------
const API = Object.freeze({
  get:    (url)        => _request("GET", url),
  post:   (url, body)  => _request("POST", url, { body }),
  put:    (url, body)  => _request("PUT", url, { body }),
  patch:  (url, body)  => _request("PATCH", url, { body }),
  del:    (url)        => _request("DELETE", url),

  upload: (url, formData) =>
    _request("POST", url, { body: formData, isMultipart: true }),

  download: (url) =>
    _request("GET", url, { raw: true }),

  ApiError,
});

export default API;
export { ApiError };