/* =========================================================
   AXO NETWORKS — ADMIN ROUTES (ENTERPRISE STRUCTURED)
   Clean • Modular • Permission Driven • Production Ready
========================================================= */

const express = require("express");
const router = express.Router();

/* ================= MIDDLEWARES ================= */
const { authenticate } = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/authorize.middleware");
const {
  validateRequiredFields,
} = require("../../middlewares/validation.middleware");

/* ================= CORE CONTROLLERS ================= */
const adminController = require("./admin.controller");
const poController = require("./admin.po.controller");
const dashboardController = require("./admin.dashboard.controller");
const analyticsController = require("./admin.analytics.controller");
const ordersRoutes = require("./orders/admin.orders.routes");

/* ================= SUB MODULE ROUTES ================= */
const auditRoutes = require("./audit/admin.audit.routes");
const systemRoutes = require("./system/admin.system.routes");
const rfqRoutes = require("./rfq/admin.rfq.routes");
const userRoutes = require("./users/admin.users.routes");

/* =========================================================
   GLOBAL AUTHENTICATION (All Admin Routes Protected)
========================================================= */
router.use(authenticate);

/* =========================================================
   SUB-MODULES (Feature Isolated & Self-Contained)
========================================================= */

router.use(
  "/audit-logs",
  authorize("VIEW_AUDIT_LOGS"),
  auditRoutes
);

router.use(
  "/system-health",
  authorize("VIEW_SYSTEM_HEALTH"),
  systemRoutes
);

router.use(
  "/rfqs",
  authorize("VIEW_RFQS"),
  rfqRoutes
);

/* 🔥 USERS MODULE (ENTERPRISE ISOLATED) */
router.use(
  "/users",
  userRoutes
);

/* =========================================================
   ORDERS MODULE
========================================================= */

router.use(
  "/orders",
  ordersRoutes
);

/* =========================================================
   DASHBOARD
========================================================= */
router.get(
  "/dashboard",
  authorize("VIEW_DASHBOARD"),
  dashboardController.getAdminDashboard
);

/* =========================================================
   PLATFORM STATS
========================================================= */
router.get(
  "/stats",
  authorize("VIEW_STATS"),
  adminController.getPlatformStats
);

/* =========================================================
   NETWORK ACCESS REQUESTS
========================================================= */
router.get(
  "/network-access-requests",
  authorize("VIEW_NETWORK_REQUESTS"),
  adminController.getAllNetworkAccessRequests
);

router.post(
  "/network-access-requests/:id/approve",
  authorize("APPROVE_NETWORK_REQUEST"),
  validateRequiredFields(["comment"]),
  adminController.approveNetworkRequest
);

router.post(
  "/network-access-requests/:id/reject",
  authorize("REJECT_NETWORK_REQUEST"),
  validateRequiredFields(["comment"]),
  adminController.rejectNetworkRequest
);

/* =========================================================
   DISPUTES
========================================================= */
router.get(
  "/disputes",
  authorize("VIEW_DISPUTES"),
  adminController.getAllDisputes
);

router.post(
  "/purchase-orders/:poId/disputes/:disputeId/resolve",
  authorize("RESOLVE_DISPUTE"),
  validateRequiredFields(["action"]),
  adminController.resolveDispute
);


module.exports = router;