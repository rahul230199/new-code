/* =========================================================
   AXO NETWORKS — GLOBAL ERROR HANDLER (STRICT SAFE)
========================================================= */

const AppError = require("../utils/AppError");

const errorMiddleware = (err, req, res, next) => {

  const isProduction = process.env.NODE_ENV === "production";

  let error = err;

  /* ===================================================
     NORMALIZE UNKNOWN ERRORS (DB / SYSTEM)
  =================================================== */

  if (!(error instanceof AppError)) {

    // Always hide raw internal errors
    error = new AppError(
      "Unable to process your request. Please try again.",
      500
    );
  }

  /* ===================================================
     SERVER LOGGING ONLY
  =================================================== */

  console.error("SERVER ERROR:", {
    path: req.originalUrl,
    method: req.method,
    statusCode: error.statusCode,
    message: err.message, // log real message internally
    stack: isProduction ? undefined : err.stack,
  });

  /* ===================================================
     CLIENT RESPONSE (SAFE ONLY)
  =================================================== */

  return res.status(error.statusCode).json({
    success: false,
    message: error.message,
    errorCode: error.errorCode || null
  });

};

module.exports = errorMiddleware;