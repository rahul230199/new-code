/* =========================================================
   AXO NETWORKS — AUTH ROUTES (ENTERPRISE CLEAN)
========================================================= */

const express = require("express");
const { authenticate } = require("../../middlewares/auth.middleware");
const {
  validateRequiredFields,
} = require("../../middlewares/validation.middleware");

const authController = require("./auth.controller");
const { authLimiter } = require("../../middlewares/rateLimit.middleware");

const router = express.Router();
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */


/* =========================================================
   LOGIN
========================================================= */
router.post(
  "/login",
  authLimiter,
  validateRequiredFields(["email", "password"]),
  authController.login
);

/* =========================================================
   FORCE CHANGE PASSWORD
========================================================= */
router.post(
  "/change-password",
  authenticate,
  validateRequiredFields(["newPassword"]),
  authController.changePassword
);

module.exports = router;
