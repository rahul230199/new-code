/* =========================================================
   AXO NETWORKS — ROUTE GUARD (ENTERPRISE SAFE)
========================================================= */

import { StorageManager as Storage } from "../core/storage.js";
import { AuthManager as Auth } from "../core/auth.js";

/* =========================================================
   INTERNAL HELPERS
========================================================= */

function redirect(path) {
  if (window.location.pathname !== path) {
    console.log(`RouteGuard: Redirecting to ${path}`);
    window.location.href = path;
  }
}

/* =========================================================
   REQUIRE AUTH FUNCTION
========================================================= */

function requireAuth() {
  // Not logged in
  if (!Storage.isAuthenticated()) {
    console.log("RouteGuard: Not authenticated, redirecting to login");
    redirect("/login");
    return false;
  }

  const user = Auth.getCurrentUser();
  if (!user) {
    console.log("RouteGuard: No user data, redirecting to login");
    redirect("/login");
    return false;
  }

  console.log("RouteGuard: User authenticated", { email: user.email, role: user.role });
  return true;
}

/* =========================================================
   REQUIRE ROLE FUNCTION
========================================================= */

function requireRole(allowedRoles = []) {
  if (!requireAuth()) return false;
  
  const user = Auth.getCurrentUser();
  const userRole = user?.role || user?.user_role;
  
  console.log("RouteGuard: Checking role", { userRole, allowedRoles });
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    console.log(`RouteGuard: Role ${userRole} not allowed, redirecting to home`);
    redirect("/");
    return false;
  }
  
  return true;
}

/* =========================================================
   PROTECT PAGE
========================================================= */

export const RouteGuard = {
  protect(options = {}) {
    const { requireAuth: needAuth = true, role = [] } = options;
    
    console.log("RouteGuard: protect called with", options);
    
    if (needAuth && !requireAuth()) return false;
    if (role.length > 0 && !requireRole(role)) return false;
    
    return true;
  }
};

export default RouteGuard;
