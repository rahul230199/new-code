/* =========================================================
   AXO NETWORKS — ADMIN USERS SERVICE
   ENTERPRISE USER MANAGEMENT (PRODUCTION HARDENED)
========================================================= */
const pool = require("../../../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const AppError = require("../../../utils/AppError");
const { logAudit } = require("../../core/audit.logger");

/* =========================================================
   CONSTANTS
========================================================= */

const VALID_ROLES = ["admin", "buyer", "supplier", "both"];
const VALID_STATUS = ["active", "inactive"];

/* =========================================================
   INTERNAL AUDIT WRAPPER (SERVICE SCOPED)
========================================================= */

async function audit(client, payload = {}) {
  await logAudit({
    ...payload,
    module: "users",
    client
  });
}

/* =========================================================
   HELPERS
========================================================= */

function parsePositiveNumber(value, field) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return num;
}

function sanitizeText(value) {
  if (!value) return null;
  return String(value).trim();
}

/* =========================================================
   GET USERS (PAGINATED + FILTERED + SAFE)
========================================================= */

exports.getUsers = async (query = {}) => {

  let {
    page = 1,
    limit = 10,
    search,
    role,
    status
  } = query;

  page = Number(page);
  limit = Number(limit);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  const where = ["u.is_deleted = FALSE"];
  const values = [];

  role = sanitizeText(role)?.toLowerCase();
  status = sanitizeText(status)?.toLowerCase();
  search = sanitizeText(search);

  if (role && VALID_ROLES.includes(role)) {
    values.push(role);
    where.push(`u.role = $${values.length}`);
  }

  if (status && VALID_STATUS.includes(status)) {
    values.push(status);
    where.push(`u.status = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    where.push(`
      (
        u.email ILIKE $${values.length}
        OR u.username ILIKE $${values.length}
      )
    `);
  }

  const whereSQL = `WHERE ${where.join(" AND ")}`;

  const countResult = await pool.query(
    `
    SELECT COUNT(*)::INT AS total
    FROM users u
    ${whereSQL}
    `,
    values
  );

  const totalRecords = countResult.rows[0].total;

  values.push(limit, offset);

  const dataResult = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.username,
      u.role,
      u.status,
      u.created_at
    FROM users u
    ${whereSQL}
    ORDER BY u.created_at DESC
    LIMIT $${values.length - 1}
    OFFSET $${values.length}
    `,
    values
  );

  return {
    total_records: totalRecords,
    current_page: page,
    total_pages: Math.ceil(totalRecords / limit),
    users: dataResult.rows
  };
};


/* =========================================================
   GET USER BY ID
========================================================= */

exports.getUserById = async (id) => {

  id = parsePositiveNumber(id, "User ID");

  const result = await pool.query(
    `
    SELECT id, email, username, role, status, created_at
    FROM users
    WHERE id = $1
      AND is_deleted = FALSE
    `,
    [id]
  );

  if (!result.rowCount) {
    throw new AppError("User not found", 404);
  }

  return result.rows[0];
};
/* =========================================================
   UPDATE STATUS (TRANSACTION SAFE + CONTEXT DRIVEN)
========================================================= */

exports.updateStatus = async (id, status, context) => {
  const { adminId, role, ip } = context;

  id = parsePositiveNumber(id, "User ID");
  const actorId = parsePositiveNumber(adminId, "Admin ID");
  status = String(status).toLowerCase();

  if (!VALID_STATUS.includes(status)) {
    throw new AppError("Invalid status value", 400);
  }

  if (id === actorId) {
    throw new AppError("You cannot change your own status", 400);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
      [id]
    );

    if (!userCheck.rowCount) {
      throw new AppError("User not found", 404);
    }

    const result = await client.query(
      `
      UPDATE users
      SET status = $1
      WHERE id = $2
      RETURNING id, email, role, status
      `,
      [status, id]
    );

    await audit(client, {
      actorId,
      actorRole: role,
      actionType: "USER_STATUS_UPDATED",
      entityId: id,
      metadata: { new_status: status },
      ipAddress: ip
    });

    await client.query("COMMIT");
    return result.rows[0];

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/* =========================================================
   UPDATE ROLE (TRANSACTION SAFE)
========================================================= */

exports.updateRole = async (id, newRole, context) => {
  const { adminId, role, ip } = context;

  id = parsePositiveNumber(id, "User ID");
  const actorId = parsePositiveNumber(adminId, "Admin ID");
  newRole = String(newRole).toLowerCase();

  if (!VALID_ROLES.includes(newRole)) {
    throw new AppError("Invalid role value", 400);
  }

  if (id === actorId) {
    throw new AppError("You cannot change your own role", 400);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
      [id]
    );

    if (!userCheck.rowCount) {
      throw new AppError("User not found", 404);
    }

    const result = await client.query(
      `
      UPDATE users
      SET role = $1
      WHERE id = $2
      RETURNING id, email, role, status
      `,
      [newRole, id]
    );

    await audit(client, {
      actorId,
      actorRole: role,
      actionType: "USER_ROLE_UPDATED",
      entityId: id,
      metadata: { new_role: newRole },
      ipAddress: ip
    });

    await client.query("COMMIT");
    return result.rows[0];

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/* =========================================================
   SOFT DELETE USER
========================================================= */

exports.softDeleteUser = async (id, context) => {
  const { adminId, role, ip } = context;

  id = parsePositiveNumber(id, "User ID");
  const actorId = parsePositiveNumber(adminId, "Admin ID");

  if (id === actorId) {
    throw new AppError("You cannot delete yourself", 400);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
      [id]
    );

    if (!userCheck.rowCount) {
      throw new AppError("User not found or already deleted", 404);
    }

    await client.query(
      `UPDATE users SET is_deleted = TRUE WHERE id = $1`,
      [id]
    );

    await audit(client, {
      actorId,
      actorRole: role,
      actionType: "USER_SOFT_DELETED",
      entityId: id,
      ipAddress: ip
    });

    await client.query("COMMIT");

    return { message: "User deleted successfully" };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/* =========================================================
   RESET PASSWORD
========================================================= */

exports.resetPassword = async (id, context) => {
  const { adminId, role, ip } = context;

  id = parsePositiveNumber(id, "User ID");
  const actorId = parsePositiveNumber(adminId, "Admin ID");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
      [id]
    );

    if (!userCheck.rowCount) {
      throw new AppError("User not found", 404);
    }

    const tempPassword = "AXO@" + crypto.randomBytes(6).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const result = await client.query(
      `
      UPDATE users
      SET password_hash = $1,
          must_change_password = TRUE
      WHERE id = $2
      RETURNING id, email, role
      `,
      [passwordHash, id]
    );

    await audit(client, {
      actorId,
      actorRole: role,
      actionType: "USER_PASSWORD_RESET",
      entityId: id,
      ipAddress: ip
    });

    await client.query("COMMIT");

    return {
      user: result.rows[0],
      temporary_password: tempPassword
    };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};