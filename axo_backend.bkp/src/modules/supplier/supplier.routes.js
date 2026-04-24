/* =========================================================
   AXO NETWORKS — SUPPLIER ROUTES (ENTERPRISE STRUCTURED)
========================================================= */

const express = require("express");
const router = express.Router();

const supplierController = require("./supplier.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/authorize.middleware");
const {
  validateRequiredFields,
} = require("../../middlewares/validation.middleware");

/* =========================================================
   GLOBAL AUTH
========================================================= */
router.use(authenticate);

/* =========================================================
   RFQ MARKETPLACE
========================================================= */

router.get(
  "/rfqs",
  authorize("VIEW_OPEN_RFQS"),
  supplierController.getOpenRFQs
);

router.post(
  "/rfqs/:rfqId/quote",
  authorize("SUBMIT_QUOTE"),
  validateRequiredFields(["price"]),
  supplierController.submitQuote
);

/* =========================================================
   SUPPLIER PURCHASE ORDERS
========================================================= */

router.get(
  "/purchase-orders",
  authorize("VIEW_SUPPLIER_POS"),
  supplierController.getSupplierPurchaseOrders
);

router.post(
  "/purchase-orders/:id/accept",
  authorize("ACCEPT_PO"),
  supplierController.acceptPurchaseOrder
);

router.post(
  "/purchase-orders/:poId/milestones/:milestoneId/update",
  authorize("UPDATE_MILESTONE"),
  supplierController.updateMilestone
);

module.exports = router;
