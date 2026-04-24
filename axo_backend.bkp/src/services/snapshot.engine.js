/* =========================================================
   AXO NETWORKS — SUPPLIER SNAPSHOT ENGINE
   - Scalable intelligence builder
   - 50k supplier ready
========================================================= */

const pool = require("../config/db");
const { getReliabilityTier } = require("../utils/reliability.service");

exports.rebuildSnapshot = async () => {

  console.log("🔄 Rebuilding supplier intelligence snapshot...");

  /* =====================================================
     STEP 1 — GET ALL SUPPLIERS
  ===================================================== */
  const suppliers = await pool.query(`
    SELECT id, monthly_capacity
    FROM organizations
    WHERE role_type = 'supplier'
  `);

  for (const supplier of suppliers.rows) {

    const { id, monthly_capacity } = supplier;

    /* =====================================================
       STEP 2 — GET RELIABILITY
    ===================================================== */
    /* =====================================================
   STEP 2 — GET RELIABILITY
===================================================== */
const reliabilityResult = await pool.query(`
  SELECT COALESCE(final_score,0) AS score
  FROM reliability_scores
  WHERE organization_id = $1
`, [id]);

const reliabilityScore =
  reliabilityResult.rowCount
    ? Number(reliabilityResult.rows[0].score)
    : 0;

    const tier =
      getReliabilityTier(reliabilityScore).tier;

    /* =====================================================
       STEP 3 — GET ACTIVE WORKLOAD
    ===================================================== */
    const workloadResult = await pool.query(`
      SELECT COALESCE(SUM(quantity),0) AS active_workload
      FROM purchase_orders
      WHERE supplier_org_id = $1
      AND status IN ('ISSUED','ACCEPTED','IN_PROGRESS')
    `, [id]);

    const activeWorkload =
      workloadResult.rows[0].active_workload;

    const capacity = Number(monthly_capacity || 0);
    const active = Number(activeWorkload || 0);

    const utilization =
      capacity > 0
        ? Math.round((active / capacity) * 100)
        : 0;

    const available = 100 - utilization;

    /* =====================================================
       STEP 4 — UPSERT SNAPSHOT
    ===================================================== */
    await pool.query(`
      INSERT INTO supplier_intelligence_snapshot (
        supplier_org_id,
        reliability_score,
        reliability_tier,
        monthly_capacity,
        active_workload,
        utilization_percent,
        available_capacity_percent,
        overload,
        capacity_risk,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (supplier_org_id)
      DO UPDATE SET
        reliability_score = EXCLUDED.reliability_score,
        reliability_tier = EXCLUDED.reliability_tier,
        monthly_capacity = EXCLUDED.monthly_capacity,
        active_workload = EXCLUDED.active_workload,
        utilization_percent = EXCLUDED.utilization_percent,
        available_capacity_percent = EXCLUDED.available_capacity_percent,
        overload = EXCLUDED.overload,
        capacity_risk = EXCLUDED.capacity_risk,
        updated_at = NOW()
    `, [
      id,
      reliabilityScore,
      tier,
      capacity,
      active,
      utilization,
      available,
      utilization > 100,
      utilization >= 85
    ]);
  }

  console.log("✅ Snapshot rebuild complete.");
};