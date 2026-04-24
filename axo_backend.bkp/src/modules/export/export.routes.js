/* =========================================================
   AXO NETWORKS — EXPORT ROUTES
========================================================= */

const express = require("express");
const router = express.Router();
const { authenticate } = require("../../middlewares/auth.middleware");
const controller = require("./export.controller");

router.get("/po/:poId", authenticate, controller.downloadPOPackage);

module.exports = router;