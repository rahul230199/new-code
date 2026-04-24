/* =========================================================
   AXO NETWORKS — DASHBOARD CONFIG SERVICE
   Admin Controlled
   Validation Safe
   Production Hardened
========================================================= */

const queries = require("./dashboard.config.queries");
const AppError = require("../../../utils/AppError");

/* =========================================================
   GET CONFIG (AUTO DEFAULT)
========================================================= */

const getDashboardConfig = async (orgId) => {

  const result = await queries.getDashboardConfig(orgId);

  if (!result.rowCount) {
    return {
      organization_id: orgId,
      risk_overdue_weight: 5,
      risk_dispute_weight: 10,
      risk_reliability_penalty: 30,
      reliability_threshold: 60,
      high_risk_threshold: 50,
      elevated_risk_threshold: 25,
      default_chart_months: 6
    };
  }

  return result.rows[0];
};

/* =========================================================
   UPDATE CONFIG (VALIDATED)
========================================================= */

const upsertDashboardConfig = async (orgId, config) => {

  if (!orgId) {
    throw new AppError("Organization ID required", 400);
  }

  const safeConfig = {
    risk_overdue_weight: Number(config.risk_overdue_weight || 5),
    risk_dispute_weight: Number(config.risk_dispute_weight || 10),
    risk_reliability_penalty: Number(config.risk_reliability_penalty || 30),
    reliability_threshold: Number(config.reliability_threshold || 60),
    high_risk_threshold: Number(config.high_risk_threshold || 50),
    elevated_risk_threshold: Number(config.elevated_risk_threshold || 25),
    default_chart_months: Number(config.default_chart_months || 6)
  };

  const result = await queries.upsertDashboardConfig(orgId, safeConfig);

  return result.rows[0];
};

module.exports = {
  getDashboardConfig,
  upsertDashboardConfig
};