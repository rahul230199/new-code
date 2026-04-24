/* =========================================================
AXO NETWORKS — PO THREAD ROUTES
========================================================= */

const express = require("express");
const router = express.Router();

const { authenticate } = require("../../middlewares/auth.middleware");
const controller = require("./poThread.controller");

/* =========================================================
GLOBAL AUTH
========================================================= */

router.use(authenticate);

/* =========================================================
GET MESSAGES
GET /po-thread/:poId/messages
========================================================= */

router.get("/:poId/messages", controller.getMessages);

/* =========================================================
SEND MESSAGE
POST /po-thread/:poId/messages
========================================================= */

router.post("/:poId/messages", controller.sendMessage);

module.exports = router;