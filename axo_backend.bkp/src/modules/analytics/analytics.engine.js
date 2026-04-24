/* =========================================================
   AXO NETWORKS — ANALYTICS ENGINE
   Purpose:
   - Executive dashboard intelligence layer
   - Aggregated metrics only
   - Performance optimized
========================================================= */

const pool = require("../../config/db");
const riskEngine = require("../risk/risk.engine");

/* =========================================================
   GET EXECUTIVE OVERVIEW
========================================================= */
async function getExecutiveOverview(orgId, client = pool) {

  /* -------------------------
     KPI SECTION
  -------------------------- */
  const kpiQuery = await client.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'open')::INT AS active_rfqs,
      COUNT(*) FILTER (WHERE status IN ('ISSUED','ACCEPTED','IN_PROGRESS'))::INT AS active_orders,
      COUNT(*) FILTER (WHERE status = 'DISPUTED')::INT AS disputed_orders
    FROM purchase_orders
    WHERE buyer_org_id = $1
    `,
    [orgId]
  );

  /* -------------------------
     Payment Pending
  -------------------------- */
  const paymentQuery = await client.query(
    `
    SELECT
      COALESCE(SUM(po.value),0)::NUMERIC -
      COALESCE(SUM(p.amount),0)::NUMERIC AS payments_pending
    FROM purchase_orders po
    LEFT JOIN payments p ON po.id = p.po_id
    WHERE po.buyer_org_id = $1
    `,
    [orgId]
  );

  /* -------------------------
     On-Time Delivery %
  -------------------------- */
  const deliveryQuery = await client.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE status = 'completed'
        AND actual_delivery_date <= promised_delivery_date
      )::INT AS on_time,
      COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed
    FROM purchase_orders
    WHERE buyer_org_id = $1
    `,
    [orgId]
  );

  const completed = Number(deliveryQuery.rows[0].completed);
  const onTime = Number(deliveryQuery.rows[0].on_time);

  const onTimePercent =
    completed > 0
      ? Math.round((onTime / completed) * 100)
      : 0;

  /* -------------------------
     Reliability Average
  -------------------------- */
  const reliabilityQuery = await client.query(
    `
    SELECT AVG(score)::INT AS avg_reliability
    FROM reliability_scores rs
    JOIN organizations o ON rs.organization_id = o.id
    WHERE o.role_type = 'supplier'
    `
  );

  /* -------------------------
     Risk Summary
  -------------------------- */
  const riskSummary = await riskEngine.getRiskSummary(client);

  return {
    kpis: kpiQuery.rows[0],
    payments_pending: Number(paymentQuery.rows[0].payments_pending),
    on_time_delivery_percent: onTimePercent,
    average_supplier_reliability: reliabilityQuery.rows[0].avg_reliability || 0,
    risk_summary: riskSummary
  };
}

module.exports = {
  getExecutiveOverview
};