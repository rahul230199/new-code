/**
 * AXO NETWORKS
 * Enterprise Role Permission Matrix
 */

const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  BUYER: "buyer",
  SUPPLIER: "supplier",
};

const ROLE_PERMISSIONS = {
  super_admin: ["*"],

  admin: [
    "VIEW_DASHBOARD",
    "VIEW_USERS",
    "MANAGE_USERS",
    "VIEW_NETWORK_REQUESTS",
    "APPROVE_NETWORK_REQUEST",
    "REJECT_NETWORK_REQUEST",
    "VIEW_DISPUTES",
    "RESOLVE_DISPUTE",
    "VIEW_PO",
    "FORCE_PO_ACTION",
    "VIEW_ANALYTICS",
    "VIEW_STATS",

    // 🔥 ADD THESE
    "VIEW_RFQS",
    "MANAGE_RFQS",
    "VIEW_AUDIT_LOGS",
    "VIEW_SYSTEM_HEALTH",
    "MANAGE_DASHBOARD_CONFIG"
  ],

  buyer: [
  "VIEW_BUYER_DASHBOARD",
  "CREATE_RFQ",
  "VIEW_RFQ",
  "ACCEPT_QUOTE",
  "REJECT_QUOTE",
  "VIEW_ORDERS",
  "UPDATE_ORDER_STATUS",
  "CREATE_ORDER",
  "PAY_MILESTONE",
  "RAISE_DISPUTE",
  "VIEW_ORDERS",
  "VIEW_ANALYTICS",
  "VIEW_NOTIFICATIONS"
  ],

  supplier: [
    "VIEW_OPEN_RFQS",
    "SUBMIT_QUOTE",
    "VIEW_SUPPLIER_POS",
    "ACCEPT_PO",
    "UPDATE_MILESTONE",
  ],
};

module.exports = {
  ROLES,
  ROLE_PERMISSIONS,
};

