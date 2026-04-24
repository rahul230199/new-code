/* =========================================================
   AXO NETWORKS — ADMIN SYSTEM ROUTES
   Secure | Scoped | Production Hardened
========================================================= */

const express = require("express");
const authorize = require("../../../middlewares/authorize.middleware");
const controller = require("./admin.system.controller");

const router = express.Router();

/* =========================================================
   SYSTEM HEALTH
   GET /api/admin/system
========================================================= */

router.get(
  "/",
  authorize("VIEW_SYSTEM_HEALTH"),
  controller.getSystemHealth
);

module.exports = router;