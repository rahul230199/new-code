/**
 * AXO NETWORKS — AUTHORIZATION MIDDLEWARE (HARDENED)
 * Enterprise RBAC + Defensive Enforcement
 */

const { ROLE_PERMISSIONS } = require("../config/roles.config");
const AppError = require("../utils/AppError");

const authorize = (requiredPermissions = []) => {

  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  const normalizedPermissions = permissions.map(p =>
    typeof p === "string" ? p.toUpperCase() : p
  );

  return (req, res, next) => {

    /* =====================================================
       ENSURE AUTHENTICATION EXISTS
    ====================================================== */
    if (!req.user) {
      return next(
        new AppError("Authentication required.", 401, {
          errorCode: "AUTH_REQUIRED"
        })
      );
    }

    const { role } = req.user;

    if (!role) {
      return next(
        new AppError("Access denied. Role missing.", 403, {
          errorCode: "AUTH_ROLE_MISSING",
        })
      );
    }

    const roleKey = role.toLowerCase();
    const rolePermissions = ROLE_PERMISSIONS[roleKey];

    if (!rolePermissions) {
      return next(
        new AppError("Access denied. Invalid role.", 403, {
          errorCode: "AUTH_INVALID_ROLE",
        })
      );
    }

    /* =====================================================
       SUPER ADMIN WILDCARD
    ====================================================== */
    if (rolePermissions.includes("*")) {
      return next();
    }

    const normalizedRolePermissions =
      rolePermissions.map(p => p.toUpperCase());

    const hasPermission = normalizedPermissions.some(permission =>
      normalizedRolePermissions.includes(permission)
    );

    if (!hasPermission) {
      return next(
        new AppError("Forbidden. Insufficient permissions.", 403, {
          errorCode: "AUTH_PERMISSION_DENIED",
          meta: {
            requiredPermissions: normalizedPermissions,
            userRole: roleKey,
          },
        })
      );
    }

    next();
  };
};

module.exports = authorize;