/* =========================================================
   AXO NETWORKS — ANALYTICS ROUTES
========================================================= */

const express = require("express");
const router = express.Router();
const { authenticate } = require("../../middlewares/auth.middleware");
const controller = require("./analytics.controller");

router.get("/overview", authenticate, controller.getDashboardOverview);

module.exports = router;