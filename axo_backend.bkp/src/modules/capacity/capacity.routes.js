/* =========================================================
   AXO NETWORKS — CAPACITY ROUTES
========================================================= */

const express = require("express");
const router = express.Router();
const { authenticate } = require("../../middlewares/auth.middleware");
const controller = require("./capacity.controller");

router.get("/overview", authenticate, controller.getCapacityOverview);
router.get("/supplier/:id", authenticate, controller.getSupplierUtilization);

module.exports = router;