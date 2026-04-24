/* =========================================================
AXO NETWORKS — ADMIN ORDERS ROUTES
========================================================= */

const express = require("express");
const router = express.Router();

const { authenticate } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/authorize.middleware");

const controller = require("./admin.orders.controller");

/* =========================================================
GLOBAL AUTH
========================================================= */

router.use(authenticate);

/* =========================================================
GET ALL PURCHASE ORDERS
GET /admin/orders
========================================================= */

router.get(
  "/",
  authorize("VIEW_PO"),
  controller.getAllOrders
);

/* =========================================================
GET PURCHASE ORDER DETAILS (THREAD DATA)
GET /admin/orders/:poId
========================================================= */

router.get(
  "/:poId",
  authorize("VIEW_PO"),
  controller.getOrderDetails
);

/* =========================================================
SEND MESSAGE
POST /admin/orders/:poId/messages
========================================================= */

router.post(
  "/:poId/messages",
  authorize("VIEW_PO"),
  controller.sendMessage
);


router.patch(
  "/:poId/status",
  authorize("VIEW_PO"),
  controller.updateOrderStatus
);

router.patch(
  "/:poId/milestones",
  authorize("VIEW_PO"),
  controller.completeMilestone
);
module.exports = router;