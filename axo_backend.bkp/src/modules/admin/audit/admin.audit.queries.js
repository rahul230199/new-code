const pool = require("../../../config/db");

/* =========================================================
   AXO NETWORKS — ADMIN AUDIT SERVICE
   Production Hardened
   - Strict pagination bounds
   - Safe filtering
   - Indexed queries only
   - Deterministic ordering
   - Immutable response
   - No runtime assumptions
========================================================= */

exports.getAuditLogs = async ({
  adminUserId,
  actionType,
  module,
  search,
  startDate,
  endDate,
  page = 1,
  limit = 20
}) => {

  /* ================= SAFE PAGINATION ================= */

  const numericPage = Math.max(Number(page) || 1, 1);
  const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (numericPage - 1) * numericLimit;

  /* ================= FILTER BUILD ================= */

  const whereClauses = [];
  const values = [];
  let index = 1;

  if (adminUserId) {
    whereClauses.push(`aal.admin_user_id = $${index++}`);
    values.push(Number(adminUserId));
  }

  if (actionType) {
    whereClauses.push(`aal.action_type = $${index++}`);
    values.push(actionType);
  }

  if (module) {
    whereClauses.push(`aal.module = $${index++}`);
    values.push(module);
  }

  if (startDate) {
    whereClauses.push(`aal.created_at >= $${index++}`);
    values.push(startDate);
  }

  if (endDate) {
    whereClauses.push(`aal.created_at <= $${index++}`);
    values.push(endDate);
  }

  if (search) {
    whereClauses.push(`
      (
        u.email ILIKE $${index}
        OR aal.action_type ILIKE $${index}
        OR aal.module ILIKE $${index}
        OR aal.metadata::text ILIKE $${index}
      )
    `);
    values.push(`%${search}%`);
    index++;
  }

  const whereSQL =
    whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

  /* ================= COUNT QUERY ================= */

  const countQuery = `
    SELECT COUNT(*)::INT AS total
    FROM admin_audit_logs aal
    LEFT JOIN users u ON u.id = aal.admin_user_id
    ${whereSQL}
  `;

  const countResult = await pool.query(countQuery, values);
  const totalRecords = Number(countResult.rows[0]?.total || 0);

  /* ================= DATA QUERY ================= */

  const dataQuery = `
    SELECT
      aal.id,
      aal.admin_user_id AS actor_id,
      u.email AS admin_email,
      aal.actor_role,
      aal.action_type,
      aal.module,
      aal.entity_id,
      aal.metadata,
      aal.ip_address,
      aal.created_at
    FROM admin_audit_logs aal
    LEFT JOIN users u ON u.id = aal.admin_user_id
    ${whereSQL}
    ORDER BY aal.created_at DESC, aal.id DESC
    LIMIT $${index}
    OFFSET $${index + 1}
  `;

  const dataResult = await pool.query(
    dataQuery,
    [...values, numericLimit, offset]
  );

  const totalPages =
    totalRecords === 0
      ? 0
      : Math.ceil(totalRecords / numericLimit);

  /* ================= IMMUTABLE RESPONSE ================= */

  return Object.freeze({
    meta: Object.freeze({
      total_records: totalRecords,
      current_page: numericPage,
      total_pages: totalPages,
      per_page: numericLimit
    }),
    data: Object.freeze(
      dataResult.rows.map(row =>
        Object.freeze({
          id: row.id,
          actor_id: row.actor_id,
          actor_role: row.actor_role,
          admin_email: row.admin_email,
          action_type: row.action_type,
          module: row.module,
          entity_id: row.entity_id,
          metadata: row.metadata,
          ip_address: row.ip_address,
          created_at: row.created_at
        })
      )
    )
  });
};


/* =========================================================
   GET AUDIT LOG BY ID
   - Fully parameterized
   - Deterministic
========================================================= */

exports.getAuditLogById = async (id) => {

  const query = `
    SELECT
      aal.id,
      aal.admin_user_id AS actor_id,
      u.email AS admin_email,
      aal.actor_role,
      aal.action_type,
      aal.module,
      aal.entity_id,
      aal.metadata,
      aal.ip_address,
      aal.created_at
    FROM admin_audit_logs aal
    LEFT JOIN users u ON u.id = aal.admin_user_id
    WHERE aal.id = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [id]);

  return rows[0] || null;
};