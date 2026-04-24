/* =========================================================
   AXO NETWORKS — RELIABILITY CRON ENGINE
   Purpose:
   - Nightly recalculation of supplier reliability scores
   - Stores computed score in reliability_scores table
   - Prevents heavy live queries
   - Prepares platform for analytics + risk engine
   - Fully transaction safe
   - Enterprise production ready
========================================================= */

const cron = require("node-cron");
const ordersService = require("../buyer/orders/buyer.orders.service");
const { calculateSupplierScore } = require("../../utils/reliability.service");
const pool = require("../../config/db");

/* =========================================================
   RECALCULATE ALL SUPPLIERS
   Purpose:
   - Fetch all supplier organizations
   - Compute reliability score
   - Upsert into reliability_scores
========================================================= */
async function recalculateAllSupplierReliability() {

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    /* -------------------------
       Fetch Supplier Organizations
    -------------------------- */
    const suppliers = await client.query(
      `
      SELECT id
      FROM organizations
      WHERE role_type = 'supplier'
      `
    );

    for (const supplier of suppliers.rows) {

      const reliability = await calculateSupplierScore(
        supplier.id,
        client
      );

      /* -------------------------
         Upsert Reliability Score
      -------------------------- */
      await client.query(
        `
        INSERT INTO reliability_scores
        (organization_id, score, calculated_at)
        VALUES ($1,$2,NOW())
        ON CONFLICT (organization_id)
        DO UPDATE SET
          score = EXCLUDED.score,
          calculated_at = NOW()
        `,
        [
          supplier.id,
          reliability.score
        ]
      );
    }

    await client.query("COMMIT");

  } catch (err) {

    await client.query("ROLLBACK");
    throw err;

  } finally {
    client.release();
  }
}


const runSLANightly = async () => {
  console.log("Running nightly SLA recalculation...");

  await ordersService.checkOverdueMilestones();

  const suppliers = await pool.query(`
    SELECT DISTINCT supplier_org_id FROM purchase_orders
  `);

  for (const row of suppliers.rows) {
    await calculateSupplierScore(row.supplier_org_id);
  }

  console.log("SLA nightly job completed.");
};

cron.schedule("0 2 * * *", async () => {
  try {
    await runSLANightly();
  } catch (err) {
    console.error("SLA cron failed:", err);
  }
});


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  recalculateAllSupplierReliability,
  runSLANightly
};