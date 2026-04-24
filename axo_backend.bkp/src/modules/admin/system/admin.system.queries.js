/* =========================================================
   AXO NETWORKS — ADMIN SYSTEM QUERIES
   Defensive | Parallel Safe | Production Hardened
========================================================= */

const pool = require("../../../config/db");

exports.getSystemMetrics = async () => {

  try {

    const results = await Promise.allSettled([

      pool.query(`
        SELECT COUNT(*)::INT AS total
        FROM users
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `),

      pool.query(`
        SELECT COUNT(*)::INT AS total
        FROM organizations
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `),

      pool.query(`
        SELECT COALESCE(SUM(amount),0)::NUMERIC AS total
        FROM payments
        WHERE status = 'paid'
        AND paid_at >= NOW() - INTERVAL '30 days'
      `),

      pool.query(`
        SELECT COUNT(*)::INT AS total
        FROM po_disputes
        WHERE status = 'pending'
      `),

      pool.query(`
        SELECT COUNT(*)::INT AS total
        FROM network_access_requests
        WHERE status = 'pending'
      `),

      pool.query(`
        SELECT COUNT(*)::INT AS total
        FROM rfqs
        WHERE status = 'open'
      `),

      pool.query(`
        SELECT COUNT(*)::INT AS total
        FROM purchase_orders
        WHERE status = 'in_progress'
      `)

    ]);

    const safeValue = (result, fallback = 0) => {
      if (result.status !== "fulfilled") return fallback;
      return result.value?.rows?.[0]?.total ?? fallback;
    };

    return {
      user_growth_7_days: Number(safeValue(results[0])),
      new_organizations_7_days: Number(safeValue(results[1])),
      revenue_last_30_days: Number(safeValue(results[2])),
      active_disputes: Number(safeValue(results[3])),
      pending_network_requests: Number(safeValue(results[4])),
      open_rfqs: Number(safeValue(results[5])),
      in_progress_pos: Number(safeValue(results[6]))
    };

  } catch (error) {

    // Last line defense
    return {
      user_growth_7_days: 0,
      new_organizations_7_days: 0,
      revenue_last_30_days: 0,
      active_disputes: 0,
      pending_network_requests: 0,
      open_rfqs: 0,
      in_progress_pos: 0
    };
  }
};