/* =============================================================
   AXO NETWORKS — AUTH (ENTERPRISE FIXED)
============================================================= */

import CONFIG from "./config.js";
import StorageManager from "./storage.js";

// --------------------------------------------------
// JWT Decode (safe)
// --------------------------------------------------
const _decodeToken = (token) => {
  try {
    const base64Payload = token.split(".")[1];
    if (!base64Payload) return null;

    const normalized = base64Payload
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
};

// --------------------------------------------------
// TOKEN
// --------------------------------------------------
const getToken = () => StorageManager.getToken();

// --------------------------------------------------
// AUTH CHECK (with expiry)
// --------------------------------------------------
const isAuthenticated = () => {
  const token = getToken();
  if (!token) return false;

  const payload = _decodeToken(token);

  // invalid token
  if (!payload || !payload.exp) {
    StorageManager.clearSession();
    return false;
  }

  const isExpired = payload.exp < Date.now() / 1000;

  if (isExpired) {
    console.warn("[Auth] Token expired. Clearing session.");
    StorageManager.clearSession();
    return false;
  }

  return true;
};

// --------------------------------------------------
// USER
// --------------------------------------------------
const getCurrentUser = () => StorageManager.getUser();

const getRole = () => {
  const user = getCurrentUser();
  return user?.role ?? null;
};

// --------------------------------------------------
// SAVE SESSION (LOGIN)
// --------------------------------------------------
const saveSession = (token, user) => {
  if (!token || !user) {
    console.error("[Auth] Invalid session data");
    return;
  }

  StorageManager.setSession(token, user);
};

// --------------------------------------------------
// REDIRECT AFTER LOGIN
// --------------------------------------------------
const redirectAfterLogin = (forcePasswordChange = false, role = null) => {
  if (forcePasswordChange) {
    window.location.replace(CONFIG.ROUTES.CHANGE_PASSWORD);
    return;
  }

  const destination =
    CONFIG.ROLE_HOME[role] || CONFIG.ROUTES.LOGIN;

  window.location.replace(destination);
};

// --------------------------------------------------
// REDIRECT TO HOME (used by router)
// --------------------------------------------------
const redirectToHome = () => {
  const role = getRole();

  const destination =
    CONFIG.ROLE_HOME[role] || CONFIG.ROUTES.LOGIN;

  window.location.replace(destination);
};

// --------------------------------------------------
// CLEAR SESSION
// --------------------------------------------------
const clearSession = () => {
  StorageManager.clearSession();
};

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------
const logout = () => {
  clearSession();
  window.location.replace(CONFIG.ROUTES.LOGIN);
};

// --------------------------------------------------
// EXPORT
// --------------------------------------------------
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