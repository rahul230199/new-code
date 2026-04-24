/* =========================================================
   AXO NETWORKS — ADMIN ANALYTICS CONTROLLER (ENTERPRISE)
========================================================= */

const pool = require("../../config/db");
const asyncHandler = require("../../utils/asyncHandler");

/* =========================================================
   MONTHLY REVENUE
========================================================= */
exports.getMonthlyRevenue = asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT 
      TO_CHAR(paid_at, 'YYYY-MM') AS month,
      SUM(amount)::NUMERIC AS total_revenue
    FROM payments
    WHERE status = 'paid'
    GROUP BY month
    ORDER BY month ASC
  `);

  res.status(200).json({
    success: true,
    message: "Monthly revenue fetched successfully",
    data: result.rows,
  });
});

/* =========================================================
   TOP SUPPLIERS BY REVENUE
========================================================= */
exports.getTopSuppliers = asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT 
      o.company_name,
      SUM(po.value)::NUMERIC AS total_business
    FROM purchase_orders po
    JOIN organizations o 
      ON po.supplier_org_id = o.id
    WHERE po.status = 'completed'
    GROUP BY o.company_name
    ORDER BY total_business DESC
    LIMIT 5
  `);

  res.status(200).json({
    success: true,
    message: "Top suppliers fetched successfully",
    data: result.rows,
  });
});

/* =========================================================
   RFQ TO PO CONVERSION RATE
========================================================= */
exports.getConversionRate = asyncHandler(async (req, res) => {
  const [rfqCount, poCount] = await Promise.all([
    pool.query(`SELECT COUNT(*)::INT AS total FROM rfqs`),
    pool.query(`SELECT COUNT(*)::INT AS total FROM purchase_orders`),
  ]);

  const totalRFQ = rfqCount.rows[0].total;
  const totalPO = poCount.rows[0].total;

  const conversionRate =
    totalRFQ === 0
      ? 0
      : Number(((totalPO / totalRFQ) * 100).toFixed(2));

  res.status(200).json({
    success: true,
    message: "Conversion rate calculated",
    data: {
      total_rfqs: totalRFQ,
      total_pos: totalPO,
      conversion_rate_percentage: conversionRate,
    },
  });
});

/* =========================================================
   DISPUTE RATIO
========================================================= */
exports.getDisputeRatio = asyncHandler(async (req, res) => {
  const [totalPO, disputedPO] = await Promise.all([
    pool.query(`SELECT COUNT(*)::INT AS total FROM purchase_orders`),
    pool.query(`
      SELECT COUNT(*)::INT AS total 
      FROM purchase_orders
      WHERE status = 'disputed'
    `),
  ]);

  const total = totalPO.rows[0].total;
  const disputed = disputedPO.rows[0].total;

  const ratio =
    total === 0
      ? 0
      : Number(((disputed / total) * 100).toFixed(2));

  res.status(200).json({
    success: true,
    message: "Dispute ratio calculated",
    data: {
      total_pos: total,
      disputed_pos: disputed,
      dispute_ratio_percentage: ratio,
    },
  });
});
