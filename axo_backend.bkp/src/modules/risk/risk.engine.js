/* =========================================================
   AXO NETWORKS — RISK ENGINE (ENTERPRISE SAFE)
   - Tenant Isolated
   - Schema Aligned
   - Production Safe
========================================================= */

const pool = require("../../config/db");

/* =========================================================
   GET OVERDUE MILESTONES (Scoped to Buyer)
========================================================= */
async function getOverdueMilestones(orgId, client = pool) {
  const result = await client.query(
    `
    SELECT pm.po_id
    FROM po_milestones pm
    JOIN purchase_orders po ON pm.po_id = po.id
    WHERE pm.status != 'completed'
      AND po.promised_delivery_date IS NOT NULL
      AND NOW() > po.promised_delivery_date
      AND po.buyer_org_id = $1
    `,
    [orgId]
  );

  return result.rows;
}

/* =========================================================
   GET DELAYED DELIVERIES (Scoped to Buyer)
========================================================= */
async function getDelayedDeliveries(orgId, client = pool) {
  const result = await client.query(
    `
    SELECT id
    FROM purchase_orders
    WHERE status = 'completed'
      AND actual_delivery_date IS NOT NULL
      AND promised_delivery_date IS NOT NULL
      AND actual_delivery_date > promised_delivery_date
      AND buyer_org_id = $1
    `,
    [orgId]
  );

  return result.rows;
}

/* =========================================================
   GET ACTIVE DISPUTES (Scoped to Buyer)
========================================================= */
async function getActiveDisputes(orgId, client = pool) {
  const result = await client.query(
    `
    SELECT d.po_id
    FROM po_disputes d
    JOIN purchase_orders po ON d.po_id = po.id
    WHERE d.resolved_at IS NULL
      AND po.buyer_org_id = $1
    `,
    [orgId]
  );

  return result.rows;
}

/* =========================================================
   GET LOW RELIABILITY SUPPLIERS (Scoped + final_score)
========================================================= */
async function getLowReliabilitySuppliers(orgId, threshold = 60, client = pool) {
  const result = await client.query(
    `
    SELECT DISTINCT rs.organization_id
    FROM purchase_orders po
    JOIN reliability_scores rs
      ON rs.organization_id = po.supplier_org_id
    WHERE po.buyer_org_id = $1
      AND rs.final_score < $2
    `,
    [orgId, threshold]
  );

  return result.rows;
}

/* =========================================================
   AGGREGATED RISK SUMMARY (Tenant Safe)
========================================================= */
async function getRiskSummary(orgId, client = pool) {
  const [
    overdue,
    delayed,
    disputes,
    lowReliability
  ] = await Promise.all([
    getOverdueMilestones(orgId, client),
    getDelayedDeliveries(orgId, client),
    getActiveDisputes(orgId, client),
    getLowReliabilitySuppliers(orgId, 60, client)
  ]);

  return {
    overdue_milestones: overdue.length,
    delayed_deliveries: delayed.length,
    active_disputes: disputes.length,
    low_reliability_suppliers: lowReliability.length
  };
}

/* =========================================================
   CALCULATE ORG RISK SCORE
========================================================= */
async function calculateOrgRisk(orgId, client = pool) {

  const summary = await getRiskSummary(orgId, client);

  const delayImpact = summary.delayed_deliveries;
  const disputeImpact = summary.active_disputes;
  const reliabilityImpact = summary.low_reliability_suppliers;
  const overdueImpact = summary.overdue_milestones;

  // Weighted scoring model
  const riskScore =
      (delayImpact * 5)
    + (disputeImpact * 8)
    + (reliabilityImpact * 4)
    + (overdueImpact * 6);

  let riskLevel = "NORMAL";

  if (riskScore > 150) riskLevel = "CRITICAL";
  else if (riskScore > 100) riskLevel = "HIGH";
  else if (riskScore > 50) riskLevel = "ELEVATED";

  return {
    risk_level: riskLevel,
    risk_score: riskScore,
   metrics: {
  delay_ratio: delayImpact,
  dispute_ratio: disputeImpact,
  reliability_score: reliabilityImpact,
  event_density: overdueImpact
}
  };
}

module.exports = {
  getOverdueMilestones,
  getDelayedDeliveries,
  getActiveDisputes,
  getLowReliabilitySuppliers,
  getRiskSummary,
  calculateOrgRisk
};