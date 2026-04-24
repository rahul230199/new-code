/* =========================================================
   AXO NETWORKS — NETWORK ROUTES (ENTERPRISE SAFE)
========================================================= */

const express = require("express");
const router = express.Router();

const networkController = require("./network.controller");

const {
  validateRequiredFields,
} = require("../../middlewares/validation.middleware");

const {
  networkLimiter
} = require("../../middlewares/rateLimit.middleware");

const {
  authenticate
} = require("../../middlewares/auth.middleware");

/* =========================================================
   PUBLIC ACCESS REQUEST
========================================================= */
router.post(
  "/request-access",
  networkLimiter,
  validateRequiredFields([
    "company_name",
    "city_state",
    "contact_name",
    "email",
    "phone",
    "primary_product",
    "key_components",
    "manufacturing_locations",
    "monthly_capacity",
    "role_in_ev",
    "why_join_axo"
  ]),
  networkController.submitRequest
);

/* =========================================================
   NETWORK ACCESS FORM ENDPOINTS
========================================================= */

// Check if email already exists
router.post(
  "/check-email",
  networkLimiter,
  validateRequiredFields(["email"]),
  networkController.checkEmailExists
);

// Submit network access application
router.post(
  "/access/submit",
  networkLimiter,
  validateRequiredFields([
    "email",
    "companyName",
    "city",
    "role",
    "capabilities"
  ]),
  networkController.submitNetworkAccess
);

/* =========================================================
   ADMIN NETWORK ACCESS ROUTES
========================================================= */

// Get all network access requests (admin)
router.get(
  "/admin/network-access-requests",
  authenticate,
  networkController.getAdminApplicationsList
);

// Approve network access request
router.post(
  "/admin/network-access-requests/:id/approve",
  authenticate,
  networkController.approveNetworkRequest
);

// Reject network access request
router.post(
  "/admin/network-access-requests/:id/reject",
  authenticate,
  networkController.rejectNetworkRequest
);

/* =========================================================
   PROTECTED ROUTES
========================================================= */

router.get(
  "/suppliers",
  authenticate,
  networkController.getNetworkSuppliers
);

router.get(
  "/suppliers/:id",
  authenticate,
  networkController.getSupplierById
);

module.exports = router;
