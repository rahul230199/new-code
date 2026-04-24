/* =========================================================
   AXO NETWORKS — ADMIN USERS ROUTES
   ENTERPRISE USER MANAGEMENT (PRODUCTION HARDENED)
========================================================= */

const express = require("express");
const authorize = require("../../../middlewares/authorize.middleware");
const controller = require("./admin.users.controller");
const {
  validateRequiredFields
} = require("../../../middlewares/validation.middleware");

const router = express.Router();

/* =========================================================
   LIST USERS (Paginated + Filtered)
========================================================= */
router.get(
  "/",
  authorize("VIEW_USERS"),
  controller.getUsers
);

/* =========================================================
   GET SINGLE USER (DETAIL MODAL)
========================================================= */
router.get(
  "/:id",
  authorize("VIEW_USERS"),
  controller.getUserById
);

/* =========================================================
   UPDATE USER STATUS
========================================================= */
router.patch(
  "/:id/status",
  authorize("MANAGE_USERS"),
  validateRequiredFields(["status"]),
  controller.updateStatus
);

/* =========================================================
   UPDATE USER ROLE
========================================================= */
router.patch(
  "/:id/role",
  authorize("MANAGE_USERS"),
  validateRequiredFields(["role"]),
  controller.updateRole
);

/* =========================================================
   SOFT DELETE USER
========================================================= */
router.delete(
  "/:id",
  authorize("MANAGE_USERS"),
  controller.softDeleteUser
);

/* =========================================================
   RESET USER PASSWORD
========================================================= */
router.post(
  "/:id/reset-password",
  authorize("MANAGE_USERS"),
  controller.resetPassword
);

module.exports = router;