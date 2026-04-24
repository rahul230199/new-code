/* =========================================================
   AXO NETWORKS — ADMIN SYSTEM SERVICE
   Enterprise Hardened | Defensive | Deterministic
========================================================= */

const queries = require("./admin.system.queries");
const AppError = require("../../../utils/AppError");

/* =========================================================
   GET SYSTEM HEALTH / METRICS
========================================================= */

exports.getSystemHealth = async () => {

  try {

    const metrics = await queries.getSystemMetrics();

    if (!metrics || typeof metrics !== "object") {
      throw new AppError("Invalid system metrics response", 500);
    }

    return {
      success: true,
      data: metrics
    };

  } catch (error) {

    // Prevent leaking raw DB errors
    throw new AppError(
      error?.message || "Failed to fetch system metrics",
      error?.statusCode || 500
    );
  }
};