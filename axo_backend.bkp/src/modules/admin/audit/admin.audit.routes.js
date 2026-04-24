const express = require("express");
const controller = require("./admin.audit.controller");

const router = express.Router();

/* =========================================================
   AXO NETWORKS — ADMIN AUDIT ROUTES
   - Parent router handles auth
   - Deterministic route order
   - ID-safe routing
========================================================= */

/**
 * GET /admin/audit
 * Query:
 *  ?page=
 *  ?limit=
 *  ?admin_user_id=
 *  ?action_type=
 *  ?module=
 *  ?search=
 *  ?start_date=
 *  ?end_date=
 */
router.get("/", controller.getAuditLogs);

/**
 * GET /admin/audit/:id
 * Used for metadata modal view
 */
router.get("/:id", controller.getAuditLogById);

module.exports = router;