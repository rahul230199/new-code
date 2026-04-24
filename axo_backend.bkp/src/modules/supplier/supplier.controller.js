/* =========================================================
   AXO NETWORKS — SUPPLIER CONTROLLER (ENTERPRISE FINAL)
========================================================= */

const pool = require("../../config/db");
const PO_STATUS = require("../../constants/poStatus.constants");
const EVENT_TYPES = require("../../constants/eventTypes.constants");
const { logPoEvent } = require("../../utils/auditLogger");
const AppError = require("../../utils/AppError");
const asyncHandler = require("../../utils/asyncHandler");
const eventLogger = require("../../utils/eventLogger");
/* =========================================================
   GET OPEN RFQs (ENTERPRISE VISIBILITY CONTROL)
========================================================= */
exports.getOpenRFQs = asyncHandler(async (req, res) => {

  const supplierOrgId = req.user.organization_id;

  if (!supplierOrgId)
    throw new AppError("Supplier organization not found", 400);

  const result = await pool.query(
    `
    SELECT
      r.id,
      r.part_name,
      r.part_description,
      r.quantity,
      r.ppap_level,
      r.design_file_url,
      r.priority,
      r.visibility_type,
      r.assigned_supplier_org_id,
      r.created_at,

      EXISTS (
        SELECT 1
        FROM quotes q
        WHERE q.rfq_id = r.id
        AND q.supplier_org_id = $1
      ) AS already_quoted,

      (
        SELECT COUNT(*)
        FROM quotes q2
        WHERE q2.rfq_id = r.id
      )::INT AS total_quotes

    FROM rfqs r

    WHERE r.status = 'open'
    AND (
      r.visibility_type = 'public'
      OR r.visibility_type = 'invited'
      OR (
        r.visibility_type = 'private'
        AND r.assigned_supplier_org_id = $1
      )
    )

    ORDER BY
      CASE r.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END,
      r.created_at DESC
    `,
    [supplierOrgId]
  );

  res.status(200).json({
    success: true,
    data: result.rows
  });

});

/* =========================================================
   SUBMIT QUOTE
========================================================= */
exports.submitQuote = asyncHandler(async (req, res) => {
  const supplierOrgId = req.user.organization_id;
  const { rfqId } = req.params;
  const { price, timeline_days, certifications } = req.body;
  const { calculateSupplierScore, getReliabilityTier } =
  require("../../utils/reliability.service");

const reliability = await calculateSupplierScore(supplierOrgId);
const tierInfo = getReliabilityTier(reliability.score);

  if (!supplierOrgId)
    throw new AppError("Supplier organization not found", 400);

  const rfqCheck = await pool.query(
    `SELECT id FROM rfqs WHERE id = $1 AND status = 'open'`,
    [rfqId]
  );

  if (rfqCheck.rowCount === 0)
    throw new AppError("RFQ not found or not open", 400);

  const existingQuote = await pool.query(
    `SELECT id FROM quotes WHERE rfq_id = $1 AND supplier_org_id = $2`,
    [rfqId, supplierOrgId]
  );

  if (existingQuote.rowCount > 0)
    throw new AppError("Quote already submitted", 400);

  const result = await pool.query(
    `
   INSERT INTO quotes
(rfq_id,
 supplier_org_id,
 price,
 timeline_days,
 certifications,
 reliability_snapshot)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *
    `,
    [
      rfqId,
      supplierOrgId,
      price,
      timeline_days || null,
      certifications || null,
       JSON.stringify({
    score: reliability.score,
    tier: tierInfo.tier
  })
    ]
  );

  res.status(201).json({
    success: true,
    data: result.rows[0]
  });
});

/* =========================================================
   GET SUPPLIER PURCHASE ORDERS
========================================================= */
exports.getSupplierPurchaseOrders = asyncHandler(async (req, res) => {
  const supplierOrgId = req.user.organization_id;

  if (!supplierOrgId)
    throw new AppError("Supplier organization not found", 400);

  const result = await pool.query(
    `
    SELECT
      po.id,
      po.po_number,
      po.part_name,
      po.quantity,
      po.value,
      po.status,
      po.accepted_at,
      po.actual_delivery_date,
      po.agreed_delivery_date,
      po.created_at,
      o.company_name AS buyer_company
    FROM purchase_orders po
    JOIN organizations o
      ON po.buyer_org_id = o.id
    WHERE po.supplier_org_id = $1
    ORDER BY po.created_at DESC
    `,
    [supplierOrgId]
  );

  res.status(200).json({
    success: true,
    data: result.rows
  });
});

/* =========================================================
   GET SINGLE PO WITH MILESTONES
========================================================= */
exports.getSinglePO = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supplierOrgId = req.user.organization_id;

  const poResult = await pool.query(
    `SELECT * FROM purchase_orders
     WHERE id = $1 AND supplier_org_id = $2`,
    [id, supplierOrgId]
  );

  if (poResult.rowCount === 0)
    throw new AppError("PO not found", 404);

  const milestones = await pool.query(
    `SELECT * FROM po_milestones
     WHERE po_id = $1
     ORDER BY sequence_order ASC`,
    [id]
  );

  res.status(200).json({
    success: true,
    data: {
      po: poResult.rows[0],
      milestones: milestones.rows
    }
  });
});

/* =========================================================
   ACCEPT PURCHASE ORDER
========================================================= */
exports.acceptPurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const supplierOrgId = req.user.organization_id;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const poResult = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (poResult.rowCount === 0)
      throw new AppError("Purchase order not found", 404);

    const po = poResult.rows[0];

    if (po.supplier_org_id !== supplierOrgId)
      throw new AppError("Unauthorized", 403);

    if (po.status !== PO_STATUS.ISSUED)
      throw new AppError("Only issued POs can be accepted", 400);

    await client.query(
      `UPDATE purchase_orders
       SET status = $1,
           accepted_at = NOW()
       WHERE id = $2`,
      [PO_STATUS.ACCEPTED, id]
    );

    const milestones = [
      "PO_ACCEPTED",
      "RAW_MATERIAL_ORDERED",
      "PRODUCTION_STARTED",
      "QC",
      "DISPATCH",
      "DELIVERED",
      "INVOICE_RAISED",
      "PAID"
    ];

    for (let i = 0; i < milestones.length; i++) {
      await client.query(
        `
        INSERT INTO po_milestones
        (po_id, milestone_name, status, sequence_order, created_at, updated_at)
        VALUES ($1,$2,$3,$4,NOW(),NOW())
        `,
        [
          id,
          milestones[i],
          milestones[i] === "PO_ACCEPTED" ? "completed" : "pending",
          i + 1
        ]
      );
    }

    await logPoEvent(client, {
      poId: id,
      eventType: EVENT_TYPES.PO_ACCEPTED,
      description: "Supplier accepted the PO",
      actorUserId: req.user.id,
      organizationId: supplierOrgId,
      actorRole: req.user.role
    });

    await eventLogger.logPOAccepted(
  id,
  req.user.id,
  client
);

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "PO accepted successfully"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

/* =========================================================
   UPDATE MILESTONE (FINAL ENTERPRISE VERSION)
========================================================= */
exports.updateMilestone = asyncHandler(async (req, res) => {
  const { poId, milestoneId } = req.params;
  const { evidence_url, remarks } = req.body;
  const supplierOrgId = req.user.organization_id;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const poResult = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE`,
      [poId]
    );

    if (poResult.rowCount === 0)
      throw new AppError("PO not found", 404);

    const po = poResult.rows[0];

    if (po.supplier_org_id !== supplierOrgId)
      throw new AppError("Unauthorized", 403);

    const milestoneResult = await client.query(
      `SELECT * FROM po_milestones
       WHERE id = $1 AND po_id = $2 FOR UPDATE`,
      [milestoneId, poId]
    );

    if (milestoneResult.rowCount === 0)
      throw new AppError("Milestone not found", 404);

    const milestone = milestoneResult.rows[0];

    if (milestone.status === "completed")
      throw new AppError("Already completed", 400);

    await client.query(
      `
      UPDATE po_milestones
      SET status = 'completed',
          completed_at = NOW(),
          evidence_url = $1,
          remarks = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [evidence_url || null, remarks || null, milestoneId]
    );

if (milestone.milestone_name === "DELIVERED") {

  await client.query(
    `UPDATE purchase_orders
     SET actual_delivery_date = NOW()
     WHERE id = $1`,
    [poId]
  );

  await eventLogger.logDeliveryConfirmed(
    poId,
    req.user.id,
    client
  );
}

    const remaining = await client.query(
      `SELECT id FROM po_milestones
       WHERE po_id = $1 AND status != 'completed'`,
      [poId]
    );

    if (remaining.rowCount === 0) {
      await client.query(
        `UPDATE purchase_orders
         SET status = $1
         WHERE id = $2`,
        [PO_STATUS.COMPLETED, poId]
      );
    }

    await logPoEvent(client, {
      poId,
      eventType: EVENT_TYPES.MILESTONE_UPDATED,
      description: `Milestone ${milestone.milestone_name} completed`,
      actorUserId: req.user.id,
      organizationId: supplierOrgId,
      actorRole: req.user.role
    });

    await eventLogger.logMilestoneUpdate(
  poId,
  req.user.id,
  milestone.milestone_name,
  client
);

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Milestone updated successfully"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

/* =========================================================
   GET RELIABILITY SCORE (BASIC VERSION)
========================================================= */
exports.getReliabilityScore = asyncHandler(async (req, res) => {
  const supplierOrgId = req.user.organization_id;

  const result = await pool.query(
    `
    SELECT
      COUNT(*)::INT AS total_pos,

      COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed,

      COUNT(*) FILTER (
        WHERE status = 'completed'
        AND actual_delivery_date IS NOT NULL
        AND promised_delivery_date IS NOT NULL
        AND actual_delivery_date <= promised_delivery_date
      )::INT AS on_time,

      COUNT(*) FILTER (
        WHERE status = 'completed'
        AND actual_delivery_date IS NOT NULL
        AND promised_delivery_date IS NOT NULL
        AND actual_delivery_date > promised_delivery_date
      )::INT AS late_deliveries,

      COUNT(*) FILTER (
        WHERE status = 'DISPUTED'
      )::INT AS disputes

    FROM purchase_orders
    WHERE supplier_org_id = $1
    `,
    [supplierOrgId]
  );

  const total = Number(result.rows[0].total_pos);
  const completed = Number(result.rows[0].completed);
  const onTime = Number(result.rows[0].on_time);
  const late = Number(result.rows[0].late_deliveries);
  const disputes = Number(result.rows[0].disputes);

  if (total === 0) {
    return res.status(200).json({
      success: true,
      data: { score: 0 }
    });
  }

  let score = 100;

  // 🔻 Late delivery penalty (10 points per late PO)
  score -= late * 10;

  // 🔻 Dispute penalty (15 points per dispute)
  score -= disputes * 15;

  // 🔻 Completion consistency penalty
  const completionRate = completed / total;
  if (completionRate < 0.8) {
    score -= 10;
  }

  // Floor and ceiling
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  res.status(200).json({
    success: true,
    data: {
      score,
      breakdown: {
        total,
        completed,
        on_time: onTime,
        late_deliveries: late,
        disputes
      }
    }
  });
});

exports.getSupplierReliabilityScore = asyncHandler(async (req, res) => {

  const supplierOrgId = req.user.organization_id;

  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') AS completed_orders,
      COUNT(*) FILTER (
        WHERE status = 'completed'
        AND actual_delivery_date <= promised_delivery_date
      ) AS on_time_orders,
      COUNT(*) FILTER (WHERE dispute_flag = true) AS disputed_orders,
      COUNT(*) AS total_orders
    FROM purchase_orders
    WHERE supplier_org_id = $1
  `, [supplierOrgId]);

  const {
    completed_orders,
    on_time_orders,
    disputed_orders,
    total_orders
  } = result.rows[0];

  const completed = Number(completed_orders);
  const onTime = Number(on_time_orders);
  const disputed = Number(disputed_orders);
  const total = Number(total_orders);

  let score = 0;

  if (total > 0) {
    const completionRate = completed / total;
    const onTimeRate = completed > 0 ? onTime / completed : 0;
    const disputeRate = total > 0 ? disputed / total : 0;

    score =
      (completionRate * 40) +
      (onTimeRate * 40) +
      ((1 - disputeRate) * 20);
  }

  score = Math.round(score);

  res.status(200).json({
    success: true,
    data: {
      score,
      completed,
      onTime,
      disputed,
      total
    }
  });

});
