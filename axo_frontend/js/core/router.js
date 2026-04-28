/* =============================================================
   AXO NETWORKS — ROUTER (ENTERPRISE STABLE)
============================================================= */

import CONFIG from "./config.js";
import Auth from "./auth.js";

// --------------------------------------------------
// SAFE REDIRECT (NO LOOP)
// --------------------------------------------------
let _redirecting = false;

const _redirectTo = (path) => {
  if (_redirecting) return;

  const current = window.location.pathname;
  const normalize = (p) => p.replace(/\/$/, "");

  if (normalize(current) === normalize(path)) return;

  _redirecting = true;

  console.warn("[Router] Redirect →", path);

  window.location.replace(path);
};

// --------------------------------------------------
// CURRENT PATH
// --------------------------------------------------
const _getCurrentPath = () => {
  return window.location.pathname.split("?")[0];
};

// --------------------------------------------------
// ROLE ACCESS CHECK (STRICT)
// --------------------------------------------------
const _isRoleAllowed = (role, allowedRoles) => {

  // explicit roles
  if (allowedRoles?.length) {
    return allowedRoles.includes(role);
  }

  // fallback → config based
  const routes = CONFIG.ROLE_ROUTES[role] || [];
  const current = _getCurrentPath();

  return routes.some(route => {
    const routeName = route.split("/").pop();
    return current.endsWith(routeName);
  });
};

// --------------------------------------------------
// MAIN PAGE GUARD
// --------------------------------------------------
const guardPage = (allowedRoles = []) => {

  // 1. AUTH CHECK
  if (!Auth.isAuthenticated()) {
    console.warn("[Router] Not authenticated");
    _redirectTo(CONFIG.ROUTES.LOGIN);
    return false;
  }

  const user = Auth.getCurrentUser();

  if (!user || !user.role) {
    console.warn("[Router] Invalid session");
    Auth.clearSession();
    _redirectTo(CONFIG.ROUTES.LOGIN);
    return false;
  }

  const { role, forcePasswordChange } = user;

  const current = _getCurrentPath();
  const isChangePasswordPage = current.endsWith(
    CONFIG.ROUTES.CHANGE_PASSWORD.split("/").pop()
  );

  // 2. FORCE PASSWORD CHANGE
  if (forcePasswordChange && !isChangePasswordPage) {
    console.warn("[Router] Force password change");
    _redirectTo(CONFIG.ROUTES.CHANGE_PASSWORD);
    return false;
  }

  // 3. ROLE CHECK
  if (!_isRoleAllowed(role, allowedRoles)) {
    console.warn("[Router] Role not allowed:", role);
    _redirectTo(CONFIG.ROLE_HOME[role] || CONFIG.ROUTES.LOGIN);
    return false;
  }

  return true;
};

// --------------------------------------------------
// LOGIN PAGE GUARD
// --------------------------------------------------
const guardLoginPage = () => {

  if (!Auth.isAuthenticated()) {
    return true;
  }

  const user = Auth.getCurrentUser();

  if (!user) {
    Auth.clearSession();
    return true;
  }

  if (user.forcePasswordChange) {
    _redirectTo(CONFIG.ROUTES.CHANGE_PASSWORD);
    return false;
  }

  console.warn("[Router] Already logged in → redirecting");

  _redirectTo(CONFIG.ROLE_HOME[user.role] || CONFIG.ROUTES.LOGIN);
  return false;
};

// --------------------------------------------------
// EXPORT
// --------------------------------------------------
const Router = Object.freeze({
  guardPage,
  guardLoginPage,
});

export default Router;