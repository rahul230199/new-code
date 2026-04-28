/* =========================================================
   AXO NETWORKS — ROUTE GUARD (FINAL ENTERPRISE)
========================================================= */

import CONFIG from "../core/config.js";
import Auth from "../core/auth.js";

/* =========================================================
   INTERNAL REDIRECT (LOOP SAFE)
========================================================= */

let _redirecting = false;

function redirect(path) {
  if (_redirecting) return;

  const current = window.location.pathname;
  const normalize = (p) => p.replace(/\/$/, "");

  if (normalize(current) === normalize(path)) return;

  _redirecting = true;

  console.warn("RouteGuard → Redirect:", path);
  window.location.replace(path);
}

/* =========================================================
   AUTH CHECK
========================================================= */

function requireAuth() {
  if (!Auth.isAuthenticated()) {
    console.warn("RouteGuard: Not authenticated");
    redirect(CONFIG.ROUTES.LOGIN);
    return false;
  }

  const user = Auth.getCurrentUser();

  if (!user || !user.role) {
    console.warn("RouteGuard: Invalid session");
    Auth.clearSession();
    redirect(CONFIG.ROUTES.LOGIN);
    return false;
  }

  return true;
}

/* =========================================================
   ROLE CHECK
========================================================= */

function requireRole(allowedRoles = []) {
  const user = Auth.getCurrentUser();
  const role = user?.role;

  if (!role) {
    redirect(CONFIG.ROUTES.LOGIN);
    return false;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    console.warn("RouteGuard: Role not allowed:", role);
    redirect(CONFIG.ROLE_HOME[role] || CONFIG.ROUTES.LOGIN);
    return false;
  }

  return true;
}

/* =========================================================
   FORCE PASSWORD CHECK
========================================================= */

function checkForcePassword() {
  const user = Auth.getCurrentUser();

  if (!user) return false;

  const current = window.location.pathname;
  const isChangePage = current.includes(
    CONFIG.ROUTES.CHANGE_PASSWORD.split("/").pop()
  );

  if (user.forcePasswordChange && !isChangePage) {
    console.warn("RouteGuard: Force password change");
    redirect(CONFIG.ROUTES.CHANGE_PASSWORD);
    return false;
  }

  return true;
}

/* =========================================================
   LOGIN PAGE GUARD
========================================================= */

function guardLoginPage() {
  if (!Auth.isAuthenticated()) return true;

  const user = Auth.getCurrentUser();

  if (!user) {
    Auth.clearSession();
    return true;
  }

  if (user.forcePasswordChange) {
    redirect(CONFIG.ROUTES.CHANGE_PASSWORD);
    return false;
  }

  redirect(CONFIG.ROLE_HOME[user.role] || CONFIG.ROUTES.LOGIN);
  return false;
}

/* =========================================================
   MAIN PROTECT FUNCTION
========================================================= */

function protect(options = {}) {
  const { requireAuth: needAuth = true, role = [] } = options;

  if (needAuth && !requireAuth()) return false;
  if (!checkForcePassword()) return false;
  if (role.length && !requireRole(role)) return false;

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

const RouteGuard = {
  protect,
  guardLoginPage,
};

export default RouteGuard;