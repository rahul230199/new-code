/* =========================================================
   AXO NETWORKS — STANDARDIZED APPLICATION ERROR
========================================================= */

class AppError extends Error {

  constructor(message, statusCode = 500, options = {}) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.success = false;

    this.isOperational = statusCode >= 400 && statusCode < 500;

    this.errorCode = options.errorCode || null;
    this.meta = options.meta || null;

    Error.captureStackTrace(this, this.constructor);
  }

}

module.exports = AppError;