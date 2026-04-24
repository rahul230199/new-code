/* =========================================================
   AXO NETWORKS — RATE LIMIT MIDDLEWARE
========================================================= */

const rateLimit = require("express-rate-limit");

/* =========================================================
   GLOBAL API LIMITER
========================================================= */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
});

/* =========================================================
   AUTH LIMITER (Login protection)
========================================================= */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 login attempts per 15 mins
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

/* =========================================================
   PUBLIC NETWORK LIMITER
========================================================= */
const networkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 submissions per hour per IP
  message: {
    success: false,
    message: "Too many requests. Try again later.",
  },
});

module.exports = {
  globalLimiter,
  authLimiter,
  networkLimiter,
};
