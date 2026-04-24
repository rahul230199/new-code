/* =========================================================
   AXO NETWORKS — CENTRALIZED AUDIT LOGGER
   Enterprise Audit Utility Layer
========================================================= */

const pool = require("../config/db");

/* =========================================================
   LOG PO EVENT (MUST BE CALLED INSIDE TRANSACTION)
========================================================= */
async function logPoEvent(client, options) {
  const {
    poId,
    eventType,
    description,
    actorUserId,
    organizationId,
    actorRole,
    metadata = null
  } = options;

  if (!poId || !eventType || !actorUserId) {
    throw new Error("Invalid PO audit log parameters");
  }

  await client.query(
    `
    INSERT INTO po_events
    (
      po_id,
      event_type,
      description,
      actor_user_id,
      organization_id,
      actor_role,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      poId,
      eventType,
      description || null,
      actorUserId,
      organizationId || null,
      actorRole || null,
      metadata ? JSON.stringify(metadata) : null
    ]
  );
}

/* =========================================================
   LOG ADMIN ACTION (OUTSIDE OR INSIDE TRANSACTION SAFE)
========================================================= */
async function logAdminAction({
  adminUserId,
  actionType,
  targetTable,
  targetId,
  metadata = {}
}) {
  if (!adminUserId || !actionType) {
    throw new Error("Invalid admin audit log parameters");
  }

  await pool.query(
    `
    INSERT INTO admin_audit_logs
    (
      admin_user_id,
      action_type,
      target_table,
      target_id,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5)
    `,
    [
      adminUserId,
      actionType,
      targetTable || null,
      targetId || null,
      metadata
    ]
  );
}

module.exports = {
  logPoEvent,
  logAdminAction
};