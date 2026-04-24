/* =========================================================
   AXO NETWORKS — ADMIN PO CONTROLLER (ENTERPRISE SAFE)
========================================================= */

const pool = require("../../config/db");
const AppError = require("../../utils/AppError");
const asyncHandler = require("../../utils/asyncHandler");
const { logAdminAction } = require("../../utils/auditLogger");

/* =========================================================
   1️⃣ GET ALL PURCHASE ORDERS (PAGINATED + FILTERED)
========================================================= */
exports.getAllPurchaseOrders = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  const numericPage = Math.max(Number(page) || 1, 1);
  const numericLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const offset = (numericPage - 1) * numericLimit;

  let whereClause = [];
  let values = [];
  let index = 1;

  if (status && status !== "ALL") {
    whereClause.push(`po.status = $${index}`);
    values.push(status.toLowerCase());
    index++;
  }

  const whereSQL =
    whereClause.length > 0
      ? `WHERE ${whereClause.join(" AND ")}`
      : "";

  /* ---------- Total Count ---------- */
  const countResult = await pool.query(
    `
    SELECT COUNT(*)
    FROM purchase_orders po
    ${whereSQL}
    `,
    values
  );

  const totalRecords = Number(countResult.rows[0].count);

  /* ---------- Data Query ---------- */
  const result = await pool.query(
    `
    SELECT
      po.id,
      po.po_number,
      po.part_name,
      po.quantity,
      po.value,
      po.status,
      po.dispute_flag,
      po.created_at,
      buyer.company_name AS buyer_company,
      supplier.company_name AS supplier_company
    FROM purchase_orders po
    JOIN organizations buyer
      ON po.buyer_org_id = buyer.id
    JOIN organizations supplier
      ON po.supplier_org_id = supplier.id
    ${whereSQL}
    ORDER BY po.created_at DESC
    LIMIT $${index}
    OFFSET $${index + 1}
    `,
    [...values, numericLimit, offset]
  );

  res.status(200).json({
    success: true,
    message: "Purchase orders fetched successfully",
    data: {
      total_records: totalRecords,
      current_page: numericPage,
      total_pages: Math.ceil(totalRecords / numericLimit),
      purchase_orders: result.rows,
    },
  });
});

/* =========================================================
   2️⃣ GET SINGLE PO FULL DETAILS
========================================================= */
exports.getPurchaseOrderDetails = asyncHandler(async (req, res) => {
  const { poId } = req.params;

  const poResult = await pool.query(
    `
    SELECT *
    FROM purchase_orders
    WHERE id = $1
    `,
    [poId]
  );

  if (poResult.rowCount === 0) {
    throw new AppError("Purchase order not found", 404);
  }

  const [milestones, payments, disputes] = await Promise.all([
    pool.query(
      `
      SELECT *
      FROM po_milestones
      WHERE po_id = $1
      ORDER BY sequence_order ASC
      `,
      [poId]
    ),
    pool.query(
      `SELECT * FROM payments WHERE po_id = $1`,
      [poId]
    ),
    pool.query(
      `SELECT * FROM po_disputes WHERE po_id = $1`,
      [poId]
    ),
  ]);

  res.status(200).json({
    success: true,
    message: "Purchase order details fetched",
    data: {
      purchase_order: poResult.rows[0],
      milestones: milestones.rows,
      payments: payments.rows,
      disputes: disputes.rows,
    },
  });
});

/* =========================================================
   3️⃣ ADMIN FORCE CANCEL PURCHASE ORDER (TX SAFE)
========================================================= */
exports.forceCancelPurchaseOrder = asyncHandler(async (req, res) => {
  const { poId } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const poResult = await client.query(
      `
      SELECT *
      FROM purchase_orders
      WHERE id = $1
      FOR UPDATE
      `,
      [poId]
    );

    if (poResult.rowCount === 0) {
      throw new AppError("Purchase order not found", 404);
    }

    const po = poResult.rows[0];

    if (["completed", "cancelled"].includes(po.status)) {
      throw new AppError("PO already closed", 400);
    }

    await client.query(
      `
      UPDATE purchase_orders
      SET status = 'cancelled'
      WHERE id = $1
      `,
      [poId]
    );

    await client.query(
      `
      INSERT INTO po_events
      (po_id, event_type, description,
       actor_user_id, organization_id,
       actor_role, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        poId,
        "PO_FORCE_CANCELLED",
        reason || "Admin force cancelled purchase order",
        req.user.id,
        req.user.organization_id || null,
        req.user.role,
        JSON.stringify({ admin_override: true }),
      ]
    );

    await logAdminAction({
      adminUserId: req.user.id,
      actionType: "PO_FORCE_CANCELLED",
      targetTable: "purchase_orders",
      targetId: poId,
      metadata: { reason: reason || null },
    });

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Purchase order force cancelled successfully",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

/* =========================================================
   4️⃣ ADMIN FORCE CLOSE PURCHASE ORDER (TX SAFE)
========================================================= */
exports.forceClosePurchaseOrder = asyncHandler(async (req, res) => {
  const { poId } = req.params;
  const { note } = req.body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const poResult = await client.query(
      `
      SELECT *
      FROM purchase_orders
      WHERE id = $1
      FOR UPDATE
      `,
      [poId]
    );

    if (poResult.rowCount === 0) {
      throw new AppError("Purchase order not found", 404);
    }

    const po = poResult.rows[0];

    if (po.status === "completed") {
      throw new AppError("PO already completed", 400);
    }

    await client.query(
      `
      UPDATE purchase_orders
      SET status = 'completed'
      WHERE id = $1
      `,
      [poId]
    );

    await client.query(
      `
      INSERT INTO po_events
      (po_id, event_type, description,
       actor_user_id, organization_id,
       actor_role, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        poId,
        "PO_FORCE_CLOSED",
        note || "Admin force closed purchase order",
        req.user.id,
        req.user.organization_id || null,
        req.user.role,
        JSON.stringify({ admin_override: true }),
      ]
    );

    await logAdminAction({
      adminUserId: req.user.id,
      actionType: "PO_FORCE_CLOSED",
      targetTable: "purchase_orders",
      targetId: poId,
      metadata: { note: note || null },
    });

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Purchase order force closed successfully",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});