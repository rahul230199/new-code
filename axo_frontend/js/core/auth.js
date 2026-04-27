/* =============================================================
   AXO NETWORKS — AUTH
   core/auth.js

   Responsibilities:
   - Store / retrieve / clear JWT token and user object
   - Decode token to check expiry (no round-trip needed)
   - Expose getToken() for api.js
   - Expose getCurrentUser() / getRole() for every page
   - Handle post-login redirect (including force-password-change)
   - Handle logout (clear session + redirect)

   ⚠️  Rule: ALL localStorage access for auth goes through this
       file. No page or component reads TOKEN/USER keys directly.
   ============================================================= */

import CONFIG from "./config.js";

// -----------------------------------------------------------------
// Internal — Raw storage helpers
// Keeps JSON serialization in one place.
// -----------------------------------------------------------------
const _store = {
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or private browsing — fail silently
      // api.js will handle missing token as unauthenticated
    }
  },

  get: (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },
};

// -----------------------------------------------------------------
// Internal — Decode JWT payload (no signature verification)
// Signature verification happens on the server on every request.
// We only use the payload to check expiry client-side so we can
// avoid sending known-expired tokens.
// -----------------------------------------------------------------
const _decodeToken = (token) => {
  try {
    const base64Payload = token.split(".")[1];
    if (!base64Payload) return null;

    // atob requires standard base64 — JWT uses base64url
    const normalized = base64Payload
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
};

// -----------------------------------------------------------------
// getToken
// Used by api.js to attach Authorization header.
// Returns null if no token is stored.
// -----------------------------------------------------------------
const getToken = () =>
  _store.get(CONFIG.STORAGE_KEYS.TOKEN);

// -----------------------------------------------------------------
// isAuthenticated
// Returns true only if a token exists AND has not expired.
// Does NOT verify the signature — server does that.
// -----------------------------------------------------------------
const isAuthenticated = () => {
  const token = getToken();
  if (!token) return false;

  const payload = _decodeToken(token);
  if (!payload || !payload.exp) return false;

  // exp is in seconds; Date.now() is in ms
  const isExpired = payload.exp < Date.now() / 1000;
  return !isExpired;
};

// -----------------------------------------------------------------
// getCurrentUser
// Returns the user object saved at login, or null.
// Shape: { id, email, role, company_name }
// -----------------------------------------------------------------
const getCurrentUser = () =>
  _store.get(CONFIG.STORAGE_KEYS.USER);

// -----------------------------------------------------------------
// getRole
// Convenience shortcut used by router.js and components.
// -----------------------------------------------------------------
const getRole = () => {
  const user = getCurrentUser();
  return user?.role ?? null;
};

// -----------------------------------------------------------------
// saveSession
// Called by login.js after a successful POST /auth/login.
// Stores token and user object, then routes the user.
//
// Backend response shape:
// {
//   success: true,
//   token: "...",
//   forcePasswordChange: true | undefined,
//   user: { id, email, role, company_name }
// }
// -----------------------------------------------------------------
const saveSession = (token, user) => {
  _store.set(CONFIG.STORAGE_KEYS.TOKEN, token);
  _store.set(CONFIG.STORAGE_KEYS.USER, user);
};

// -----------------------------------------------------------------
// redirectAfterLogin
// Called by login.js after saveSession().
// Handles the two post-login cases:
//   1. Temp password → must change password first
//   2. Normal login  → go to role home page
// -----------------------------------------------------------------
const redirectAfterLogin = (forcePasswordChange = false, role = null) => {
  if (forcePasswordChange) {
    window.location.href = CONFIG.ROUTES.CHANGE_PASSWORD;
    return;
  }

  const destination =
    CONFIG.ROLE_HOME[role] || CONFIG.ROUTES.LOGIN;

  window.location.href = destination;
};

// -----------------------------------------------------------------
// redirectToHome
// Used by router.js when an authenticated user lands on login page.
// Sends them to their role's home page.
// -----------------------------------------------------------------
const redirectToHome = () => {
  const role = getRole();
  const destination = CONFIG.ROLE_HOME[role] || CONFIG.ROUTES.LOGIN;
  window.location.href = destination;
};

// -----------------------------------------------------------------
// clearSession
// Wipes token and user from storage.
// Called internally by logout() and by api.js on 401.
// -----------------------------------------------------------------
const clearSession = () => {
  _store.remove(CONFIG.STORAGE_KEYS.TOKEN);
  _store.remove(CONFIG.STORAGE_KEYS.USER);
};

// -----------------------------------------------------------------
// logout
// Clears session and sends user to login page.
// Used by Topbar.js logout button.
// -----------------------------------------------------------------
const logout = () => {
  clearSession();
  window.location.href = CONFIG.ROUTES.LOGIN;
};

// -----------------------------------------------------------------
// Public Export
// -----------------------------------------------------------------
const Auth = Object.freeze({
  getToken,
  isAuthenticated,
  getCurrentUser,
  getRole,
  saveSession,
  redirectAfterLogin,
  redirectToHome,
  clearSession,
  logout,
});

export default Auth;