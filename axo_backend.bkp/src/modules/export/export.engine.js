/* =========================================================
   AXO NETWORKS — PO EXPORT ENGINE
   Purpose:
   - Generate full enterprise PO package
   - Structured JSON export
   - Includes milestones, payments, events, messages
========================================================= */

const pool = require("../../config/db");

async function generatePOPackage(poId, orgId, client = pool) {

  /* -------------------------
     Validate Ownership
  -------------------------- */
  const poRes = await client.query(
    `
    SELECT *
    FROM purchase_orders
    WHERE id = $1
      AND (buyer_org_id = $2 OR supplier_org_id = $2)
    `,
    [poId, orgId]
  );

  if (!poRes.rowCount)
    throw new Error("Unauthorized or PO not found");

  const po = poRes.rows[0];

  /* -------------------------
     Milestones
  -------------------------- */
  const milestones = await client.query(
    `SELECT * FROM po_milestones
     WHERE po_id = $1
     ORDER BY sequence_order ASC`,
    [poId]
  );

  /* -------------------------
     Payments
  -------------------------- */
  const payments = await client.query(
    `SELECT * FROM payments
     WHERE po_id = $1
     ORDER BY created_at ASC`,
    [poId]
  );

  /* -------------------------
     Events Timeline
  -------------------------- */
  const events = await client.query(
    `SELECT event_type, metadata, created_at
     FROM po_events
     WHERE entity_id = $1
     ORDER BY created_at ASC`,
    [poId]
  );

  /* -------------------------
     Messages
  -------------------------- */
  const messages = await client.query(
    `SELECT user_id, organization_id, message, created_at
     FROM po_messages
     WHERE po_id = $1
     ORDER BY created_at ASC`,
    [poId]
  );

  return {
    purchase_order: po,
    milestones: milestones.rows,
    payments: payments.rows,
    timeline_events: events.rows,
    communication_thread: messages.rows
  };
}

module.exports = {
  generatePOPackage
};