/* =============================================================
   AXO NETWORKS — ROUTER / ROUTE GUARD
   core/router.js

   Runs on every page load — before any page JS executes.
   Two entry points:

   1. guardPage()
      Call this at the top of every PROTECTED page script.
      Checks: authenticated → role allowed → not forced to
      change password → then renders.

   2. guardLoginPage()
      Call this on login.html only.
      If the user is already authenticated, skip login and send
      them straight to their dashboard.

   How to use in a page file:
   ─────────────────────────────
   import Router from "../core/router.js";

   // Blocks rendering if not authenticated or wrong role
   Router.guardPage(["oem", "both"]);

   // Rest of page init runs only if guard passes
   initDashboard();
   ─────────────────────────────

   ⚠️  This file must be the FIRST import in every page file.
       If the guard redirects, all subsequent code is skipped.
   ============================================================= */

import CONFIG from "./config.js";
import Auth   from "./auth.js";

// -----------------------------------------------------------------
// Internal — silent redirect
// Checks current path first to avoid redirect loops.
// -----------------------------------------------------------------
const _redirectTo = (path) => {
  const currentPath = window.location.pathname;

  // Normalize trailing slash for comparison
  const normalize = (p) => p.replace(/\/$/, "") || "/";

  if (normalize(currentPath) !== normalize(path)) {
    window.location.href = path;
  }
};

// -----------------------------------------------------------------
// Internal — get current page path, normalized for comparison
// Strips query string and hash so "/pages/oem/dashboard.html?id=1"
// matches "/pages/oem/dashboard.html" in ROLE_ROUTES.
// -----------------------------------------------------------------
const _getCurrentPath = () => window.location.pathname;

// -----------------------------------------------------------------
// Internal — check if the current user's role is allowed to view
// the current page, using CONFIG.ROLE_ROUTES as the source of truth.
// -----------------------------------------------------------------
const _isRoleAllowed = (role, allowedRoles) => {
  // No role restriction passed — check via CONFIG.ROLE_ROUTES
  if (!allowedRoles || allowedRoles.length === 0) {
    const permitted = CONFIG.ROLE_ROUTES[role] ?? [];
    const currentPath = _getCurrentPath();
    return permitted.some((route) => currentPath.endsWith(route.split("/").pop()));
  }

  // Explicit allowedRoles passed by the page — use that
  return allowedRoles.includes(role);
};

// =================================================================
// guardPage
// =================================================================
/**
 * Guard a protected page. Call at the top of every app page script.
 *
 * Flow:
 *  1. Not authenticated           → redirect to login
 *  2. Force password change       → redirect to change-password
 *     (unless already on change-password)
 *  3. Role not allowed            → redirect to role's own home
 *  4. All checks pass             → return true, page renders
 *
 * @param {string[]} [allowedRoles]
 *   Optional explicit role whitelist, e.g. ["oem", "both"].
 *   If omitted, CONFIG.ROLE_ROUTES is used automatically.
 *
 * @returns {boolean}
 *   true  = guard passed, page may render
 *   false = guard redirected, page must not render
 *           (all subsequent page code is skipped)
 */
const guardPage = (allowedRoles = []) => {

  // ── Step 1: Must be authenticated ──────────────────────────────
  if (!Auth.isAuthenticated()) {
    _redirectTo(CONFIG.ROUTES.LOGIN);
    return false;
  }

  const user = Auth.getCurrentUser();

  // Corrupt session — token valid but no user object in storage
  if (!user || !user.role) {
    Auth.clearSession();
    _redirectTo(CONFIG.ROUTES.LOGIN);
    return false;
  }

  const { role } = user;

  // ── Step 2: Force password change ──────────────────────────────
  // If backend flagged this user as needing a password change,
  // keep redirecting them to change-password until they comply.
  // Exception: if they ARE on change-password, let it render.
  const onChangePassword = _getCurrentPath().includes(
    CONFIG.ROUTES.CHANGE_PASSWORD.split("/").pop()
  );

  if (user.forcePasswordChange && !onChangePassword) {
    _redirectTo(CONFIG.ROUTES.CHANGE_PASSWORD);
    return false;
  }

  // ── Step 3: Role must be allowed on this page ───────────────────
  if (!_isRoleAllowed(role, allowedRoles)) {
    // Send them to their own dashboard, not a generic 404
    _redirectTo(CONFIG.ROLE_HOME[role] || CONFIG.ROUTES.LOGIN);
    return false;
  }

  // ── All checks passed ───────────────────────────────────────────
  return true;
};

// =================================================================
// guardLoginPage
// =================================================================
/**
 * Guard the login page.
 * If the user is already logged in, skip login and go home.
 *
 * Call this at the top of pages/auth/login.js only.
 *
 * @returns {boolean}
 *   true  = user is NOT logged in, login page may render
 *   false = user is already logged in, redirected to dashboard
 */
const guardLoginPage = () => {
  if (Auth.isAuthenticated()) {
    Auth.redirectToHome();
    return false;
  }

  return true;
};

// -----------------------------------------------------------------
// Public Export
// -----------------------------------------------------------------
const Router = Object.freeze({
  guardPage,
  guardLoginPage,
});

export default Router;