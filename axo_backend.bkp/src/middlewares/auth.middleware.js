/* =========================================================
   AXO NETWORKS — AUTHENTICATION MIDDLEWARE (FIXED)
========================================================= */

const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");

/* =========================================================
   AUTHENTICATE
========================================================= */

const authenticate = asyncHandler(async (req, res, next) => {

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("Authentication required.", 401);
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new AppError("Invalid authorization format.", 401);
  }

  const token = parts[1];

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "axo-networks",
      audience: "axo-users",
    });
  } catch {
    throw new AppError("Session expired. Please login again.", 401);
  }

  if (!decoded || !decoded.id) {
    throw new AppError("Invalid token payload.", 401);
  }

  /* =====================================================
     FETCH LATEST USER STATE (FIXED)
  ====================================================== */

  const result = await pool.query(
    `
    SELECT id, user_role, organization_id, is_active
    FROM public.users
    WHERE id = $1
    `,
    [decoded.id]
  );

  if (!result.rowCount) {
    throw new AppError("User not found.", 401);
  }

  const user = result.rows[0];

  /* =====================================================
     STATUS CHECK (FIXED)
  ====================================================== */

  if (!user.is_active) {
    throw new AppError("Account is not active.", 403);
  }

  /* =====================================================
     ATTACH USER OBJECT (FIXED)
  ====================================================== */

  req.user = {
    id: user.id,
    role: user.user_role,           // ✅ FIXED
    organization_id: user.organization_id, // ✅ mapped for compatibility
  };

  next();

});

module.exports = {
  authenticate,
};
