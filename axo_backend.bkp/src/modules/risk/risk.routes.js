/* =========================================================
   AXO NETWORKS — RISK ROUTES
========================================================= */

const express = require("express");
const router = express.Router();
const { authenticate } = require("../../middlewares/auth.middleware");
const controller = require("./risk.controller");

router.get("/overview", authenticate, controller.getRiskOverview);

module.exports = router;