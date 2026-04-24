/* =========================================================
   AXO NETWORKS — ASYNC HANDLER (PRODUCTION SAFE)
   - Proper error forwarding
   - Clean stack trace preservation
========================================================= */

const asyncHandler = (fn) => {

  if (typeof fn !== "function") {
    throw new TypeError("asyncHandler expects a function");
  }

  return async function asyncWrapper(req, res, next) {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };

};

module.exports = asyncHandler;