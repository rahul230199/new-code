/* =========================================================
   AXO NETWORKS — PO THREAD CONTROLLER (PRODUCTION FIXED)
========================================================= */

const pool = require("../../config/db");
const AppError = require("../../utils/AppError");
const asyncHandler = require("../../utils/asyncHandler");
const eventLogger = require("../../utils/eventLogger");

/* =========================================================
   HELPER — DETERMINE ROLE
========================================================= */

function resolveRole(orgId, po) {
  if (orgId === po.buyer_org_id) return "buyer";
  if (orgId === po.supplier_org_id) return "supplier";
  return "admin";
}


/* =========================================================
   SEND MESSAGE
========================================================= */

exports.sendMessage = asyncHandler(async (req, res) => {

  const poId = Number(req.params.poId);
  const message = req.body.message?.trim();
  const userId = req.user.id;
  const orgId = req.user.organization_id;
  const userRole = req.user.role;

  if (!poId || isNaN(poId))
    throw new AppError("Invalid PO id", 400);

  if (!message)
    throw new AppError("Message cannot be empty", 400);

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    /* ================= PO ACCESS ================= */

    const poRes = await client.query(
      `SELECT id, buyer_org_id, supplier_org_id
       FROM purchase_orders
       WHERE id = $1
       FOR UPDATE`,
      [poId]
    );

    if (!poRes.rowCount)
      throw new AppError("PO not found", 404);

    const po = poRes.rows[0];

    const allowed =
      userRole === "admin" ||
      po.buyer_org_id === orgId ||
      po.supplier_org_id === orgId;

    if (!allowed)
      throw new AppError("Unauthorized access to this PO", 403);


    /* ================= RESPONSE TIME ================= */

    const lastMessageRes = await client.query(
      `SELECT u.organization_id, m.created_at
       FROM po_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.po_id = $1
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [poId]
    );

    let responseTimeHours = null;

    if (lastMessageRes.rowCount) {

      const lastMessage = lastMessageRes.rows[0];

      if (lastMessage.organization_id !== orgId) {

        const now = new Date();
        const previous = new Date(lastMessage.created_at);

        const diffMs = now - previous;
        responseTimeHours = diffMs / (1000 * 60 * 60);

      }
    }


    /* ================= INSERT MESSAGE ================= */

const insertRes = await client.query(
  `INSERT INTO po_messages
  (po_id, sender_id, message)
  VALUES ($1,$2,$3)
  RETURNING *`,
  [poId, userId, message]
);

    const newMessage = insertRes.rows[0];

    let role;

if (orgId === po.buyer_org_id) role = "buyer";
else if (orgId === po.supplier_org_id) role = "supplier";
else role = "admin";

    const socketPayload = {
      ...newMessage,
      po_id: poId,
      role
    };


    /* ================= REALTIME BROADCAST ================= */

    if (global.io) {

      global.io
        .to(`po_${poId}`)
        .emit("po_message", socketPayload);

    }


    /* =========================================================
       EVENT LEDGER — MESSAGE SENT
    ========================================================= */

    await eventLogger.logEvent({
      poId,
      eventType: "PO_THREAD_MESSAGE_SENT",
      actorId: userId,
      actorRole: userRole,
      organizationId: orgId,
      description: "PO thread message sent",
      metadata: {
        messageId: newMessage.id
      },
      client
    });


    /* =========================================================
       EVENT LEDGER — RESPONSE TIME
    ========================================================= */

    if (responseTimeHours !== null) {

      await eventLogger.logEvent({
        poId,
        eventType: "PO_THREAD_RESPONSE_TIME_RECORDED",
        actorId: userId,
        actorRole: userRole,
        organizationId: orgId,
        description: "Thread response time recorded",
        metadata: {
          response_time_hours: responseTimeHours
        },
        client
      });

    }


    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      data: socketPayload
    });

  } catch (err) {

    await client.query("ROLLBACK");
    throw err;

  } finally {

    client.release();

  }

});


/* =========================================================
   GET MESSAGES
========================================================= */

exports.getMessages = asyncHandler(async (req, res) => {

  const poId = Number(req.params.poId);
  const orgId = req.user.organization_id;
  const userRole = req.user.role;

  if (!poId || isNaN(poId))
    throw new AppError("Invalid PO id", 400);


  /* ================= PO ACCESS ================= */

  const poRes = await pool.query(
    `SELECT buyer_org_id, supplier_org_id
     FROM purchase_orders
     WHERE id = $1`,
    [poId]
  );

  if (!poRes.rowCount)
    throw new AppError("PO not found", 404);

  const po = poRes.rows[0];

  const allowed =
    userRole === "admin" ||
    po.buyer_org_id === orgId ||
    po.supplier_org_id === orgId;

  if (!allowed)
    throw new AppError("Unauthorized access to this PO", 403);


  /* ================= FETCH THREAD ================= */

  const messagesRes = await pool.query(
    `SELECT
        m.id,
        m.po_id,
        m.sender_id,
        u.organization_id,
        u.role,
        m.message,
        m.created_at
     FROM po_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.po_id = $1
     ORDER BY m.created_at ASC`,
    [poId]
  );

const messages = messagesRes.rows.map(m => {

  let role;

  if (m.organization_id === po.buyer_org_id) {
    role = "buyer";
  } 
  else if (m.organization_id === po.supplier_org_id) {
    role = "supplier";
  } 
  else {
    role = "admin";
  }

  return {
    ...m,
    role
  };

});


  res.status(200).json({
    success: true,
    data: messages
  });

});