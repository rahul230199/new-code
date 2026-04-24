/* =========================================================
   AXO NETWORKS — CAPACITY ENGINE
   Purpose:
   - Calculate supplier workload utilization
   - Detect overload conditions
   - Power dashboard heatmap
   - Production safe & scalable
========================================================= */

const pool = require("../../config/db");

/* =========================================================
   CALCULATE SUPPLIER UTILIZATION
   - Active PO quantity vs monthly_capacity
========================================================= */
async function calculateSupplierUtilization(supplierOrgId, client = pool) {

  /* -------------------------
     Get Declared Monthly Capacity
  -------------------------- */
  const orgRes = await client.query(
    `
    SELECT monthly_capacity
    FROM organizations
    WHERE id = $1
      AND role_type = 'supplier'
    `,
    [supplierOrgId]
  );

  if (!orgRes.rowCount)
    return null;

  const capacity = Number(orgRes.rows[0].monthly_capacity || 0);

  if (!capacity || capacity <= 0)
    return {
      supplier_org_id: supplierOrgId,
      utilization_percent: 0,
      overload: false,
      capacity_risk: false
    };

  /* -------------------------
     Calculate Active Workload
  -------------------------- */
  const workloadRes = await client.query(
    `
    SELECT COALESCE(SUM(quantity),0)::NUMERIC AS active_quantity
    FROM purchase_orders
    WHERE supplier_org_id = $1
      AND status IN ('ISSUED','ACCEPTED','IN_PROGRESS')
    `,
    [supplierOrgId]
  );

  const activeQuantity = Number(workloadRes.rows[0].active_quantity);

  const utilizationPercent =
    Math.round((activeQuantity / capacity) * 100);

  return {
    supplier_org_id: supplierOrgId,
    monthly_capacity: capacity,
    active_workload: activeQuantity,
    utilization_percent: utilizationPercent,
    overload: utilizationPercent > 100,
    capacity_risk: utilizationPercent >= 85
  };
}

/* =========================================================
   GET ALL SUPPLIER UTILIZATION
========================================================= */
async function getAllSupplierUtilization(client = pool) {

  const suppliers = await client.query(
    `
    SELECT id
    FROM organizations
    WHERE role_type = 'supplier'
    `
  );

  const results = [];

  for (const supplier of suppliers.rows) {
    const utilization =
      await calculateSupplierUtilization(supplier.id, client);

    if (utilization)
      results.push(utilization);
  }

  return results;
}

/* =========================================================
   GET CAPACITY SUMMARY
   - Used for dashboard heatmap
========================================================= */
async function getCapacitySummary(client = pool) {

  const allUtilization =
    await getAllSupplierUtilization(client);

  const overloaded =
    allUtilization.filter(s => s.overload).length;

  const risk =
    allUtilization.filter(s => s.capacity_risk).length;

  return {
    total_suppliers: allUtilization.length,
    overloaded_suppliers: overloaded,
    high_risk_suppliers: risk
  };
}

module.exports = {
  calculateSupplierUtilization,
  getAllSupplierUtilization,
  getCapacitySummary
};