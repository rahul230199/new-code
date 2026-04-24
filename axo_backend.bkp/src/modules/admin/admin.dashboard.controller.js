/* =========================================================
   AXO NETWORKS — ADMIN DASHBOARD CONTROLLER (ENTERPRISE FIXED)
========================================================= */

const pool = require("../../config/db");
const asyncHandler = require("../../utils/asyncHandler");

/* =========================================================
   GET ADMIN KPI DASHBOARD
========================================================= */
exports.getAdminDashboard = asyncHandler(async (req, res) => {

  const [
    usersResult,
    orgResult,
    rfqResult,
    poResult,
    disputeResult,
    paymentResult,
    networkRequestResult
  ] = await Promise.all([

    pool.query(`SELECT COUNT(*)::INT AS total FROM users`),

    pool.query(`SELECT COUNT(*)::INT AS total FROM organizations`),

 pool.query(`
  SELECT
    COUNT(*)::INT AS total_rfqs,

    COUNT(*) FILTER (WHERE status = 'open')::INT AS open_rfqs,
    COUNT(*) FILTER (WHERE status = 'closed')::INT AS closed_rfqs,

    COUNT(*) FILTER (WHERE priority = 'high')::INT AS high_priority_rfqs,
    COUNT(*) FILTER (WHERE priority = 'urgent')::INT AS urgent_rfqs,

    COUNT(*) FILTER (WHERE visibility_type = 'private')::INT AS private_rfqs,
    COUNT(*) FILTER (WHERE visibility_type = 'public')::INT AS public_rfqs,

    COUNT(*) FILTER (WHERE assigned_supplier_org_id IS NOT NULL)::INT AS assigned_rfqs

  FROM rfqs
`),

    pool.query(`
      SELECT
        COUNT(*)::INT AS total_pos,
        COUNT(*) FILTER (WHERE status = 'issued')::INT AS issued_pos,
        COUNT(*) FILTER (WHERE status = 'accepted')::INT AS accepted_pos,
        COUNT(*) FILTER (WHERE status = 'in_progress')::INT AS in_progress_pos,
        COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed_pos,
        COUNT(*) FILTER (WHERE status = 'disputed')::INT AS disputed_pos
      FROM purchase_orders
    `),

    pool.query(`
      SELECT
        COUNT(*)::INT AS total_disputes,
        COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending_disputes,
        COUNT(*) FILTER (WHERE status = 'resolved')::INT AS resolved_disputes,
        COUNT(*) FILTER (WHERE status = 'rejected')::INT AS rejected_disputes
      FROM po_disputes
    `),

    pool.query(`
      SELECT COALESCE(SUM(amount),0)::NUMERIC AS total_payment_value
      FROM payments
      WHERE status = 'paid'
    `),

    /* 🔥 NETWORK ACCESS KPI (THIS WAS MISSING) */
    pool.query(`
      SELECT
        COUNT(*)::INT AS total_requests,
        COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')::INT AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::INT AS rejected
      FROM network_access_requests
    `)
  ]);

  res.status(200).json({
    success: true,
    message: "Admin dashboard fetched successfully",
    data: {
      total_users: usersResult.rows[0].total,
      total_organizations: orgResult.rows[0].total,

      rfqs: rfqResult.rows[0],
      purchase_orders: poResult.rows[0],
      disputes: disputeResult.rows[0],
      total_payment_value: paymentResult.rows[0].total_payment_value,

      /* 🔥 THIS FIXES YOUR CARDS */
      network_requests: networkRequestResult.rows[0]
    },
  });
});