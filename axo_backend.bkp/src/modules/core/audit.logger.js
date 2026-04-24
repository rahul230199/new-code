const pool = require("../../config/db");

exports.logAudit = async ({
  client,
  actorId,
  actorRole,
  actionType,
  entityId,
  metadata = {},
  module,
  ipAddress
}) => {

  const db = client || pool;

  try {
    await db.query(
      `
      INSERT INTO admin_audit_logs (
        admin_user_id,
        actor_role,
        action,
        action_type,
        target_user_id,
        entity_id,
        metadata,
        module,
        ip_address
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        actorId,
        actorRole,
        actionType || "UNKNOWN_ACTION",   // ✅ ensures NOT NULL
        actionType,
        entityId,
        entityId,
        metadata,
        module || "admin",
        ipAddress || null
      ]
    );

  } catch (err) {
    console.error("Audit logging failed:", err.message);
  }
};
