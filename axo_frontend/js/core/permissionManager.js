/* =========================================================
   AXO NETWORKS — PERMISSION MANAGER
   Hardened Frontend RBAC Mirror
========================================================= */

import { StorageManager as Storage } from "./storage.js";

/* =======================================================
   ROLE PERMISSION MATRIX
======================================================= */
const ROLE_PERMISSIONS = {
  super_admin: ["*"],

  admin: [
    "VIEW_USERS",
    "MANAGE_USERS",
    "VIEW_STATS",
    "VIEW_NETWORK_REQUESTS",
    "APPROVE_NETWORK_REQUEST",
    "REJECT_NETWORK_REQUEST",
    "VIEW_PO",
    "FORCE_PO_ACTION",
    "VIEW_DASHBOARD",
    "VIEW_ANALYTICS",
    "VIEW_DISPUTES",
    "RESOLVE_DISPUTE",
  ],

  buyer: [
    "VIEW_BUYER_DASHBOARD",

    "CREATE_RFQ",
    "VIEW_RFQ",
    "ACCEPT_QUOTE",
    "REJECT_QUOTE",

    "VIEW_ORDERS",
    "REQUEST_PAYMENT",
    "APPROVE_PAYMENT",
    "PAY_MILESTONE",
    "RAISE_DISPUTE",

    "VIEW_NOTIFICATIONS",
  ],

  supplier: [
    "VIEW_OPEN_RFQS",
    "SUBMIT_QUOTE",
    "VIEW_SUPPLIER_POS",
    "ACCEPT_PO",
    "UPDATE_MILESTONE",
  ],
};

/* =======================================================
   SAFE ROLE RESOLUTION
======================================================= */
function getCurrentRole() {
  const user = Storage.getUser();
  const role = user?.role;

  // Defensive: ensure role exists in matrix
  if (!role || !ROLE_PERMISSIONS[role]) {
    return null;
  }

  return role;
}

/* =======================================================
   CHECK PERMISSION
======================================================= */
function has(permission) {

  if (!permission || typeof permission !== "string") {
    return false;
  }

  const role = getCurrentRole();
  if (!role) return false;

  const permissions = ROLE_PERMISSIONS[role];

  if (permissions.includes("*")) return true;

  return permissions.includes(permission);
}

/* =======================================================
   DOM AUTO-HIDE (SAFE + REVERSIBLE)
======================================================= */
function applyPermissionsToDOM() {

  const elements = document.querySelectorAll("[data-permission]");

  elements.forEach((el) => {

    const permission = el.getAttribute("data-permission");

    if (!has(permission)) {
      el.classList.add("permission-hidden");
    } else {
      el.classList.remove("permission-hidden");
    }

  });
}

/* =======================================================
   EXPORT
======================================================= */
export const PermissionManager = {
  has,
  applyPermissionsToDOM,
};

export default PermissionManager;