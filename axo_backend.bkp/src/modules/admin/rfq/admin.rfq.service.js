/* =========================================================
   AXO NETWORKS — ADMIN RFQ SERVICE
   ENTERPRISE PROCUREMENT (PRODUCTION HARDENED)
========================================================= */

const pool = require("../../../config/db");
const AppError = require("../../../utils/AppError");

/* =========================================================
   CONSTANTS
========================================================= */

const VALID_STATUSES = ["open", "closed", "awarded", "cancelled"];
const VALID_VISIBILITY = ["public", "private"];
const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

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
   GET ALL RFQS
========================================================= */

exports.getAllRFQs = async (query = {}) => {

  let {
    page = 1,
    limit = 10,
    status,
    priority,
    visibility_type,
    search
  } = query;

  page = Number(page);
  limit = Number(limit);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  const offset = (page - 1) * limit;

  const where = [];
  const values = [];

  status = sanitizeText(status)?.toLowerCase();
  priority = sanitizeText(priority)?.toLowerCase();
  visibility_type = sanitizeText(visibility_type)?.toLowerCase();
  search = sanitizeText(search);

  if (status && VALID_STATUSES.includes(status)) {
    values.push(status);
    where.push(`r.status = $${values.length}`);
  }

  if (priority && VALID_PRIORITIES.includes(priority)) {
    values.push(priority);
    where.push(`r.priority = $${values.length}`);
  }

  if (visibility_type && VALID_VISIBILITY.includes(visibility_type)) {
    values.push(visibility_type);
    where.push(`r.visibility_type = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    where.push(`(r.part_name ILIKE $${values.length} OR o.company_name ILIKE $${values.length})`);
  }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await pool.query(
    `
    SELECT COUNT(*)
    FROM rfqs r
    JOIN organizations o ON r.buyer_org_id = o.id
    ${whereSQL}
    `,
    values
  );

  const totalRecords = Number(countResult.rows[0]?.count || 0);

  values.push(limit);
  values.push(offset);

  const dataResult = await pool.query(
    `
    SELECT
      r.id,
      r.part_name,
      r.quantity,
      r.status,
      r.priority,
      r.visibility_type,
      r.created_at,
      o.company_name AS buyer_company,
      (
        SELECT COUNT(*)
        FROM quotes q
        WHERE q.rfq_id = r.id
      )::INT AS quote_count
    FROM rfqs r
    JOIN organizations o ON r.buyer_org_id = o.id
    ${whereSQL}
    ORDER BY r.created_at DESC
    LIMIT $${values.length - 1}
    OFFSET $${values.length}
    `,
    values
  );

  return {
    total_records: totalRecords,
    current_page: page,
    total_pages: Math.ceil(totalRecords / limit),
    rfqs: dataResult.rows
  };

};

/* =========================================================
   ASSIGN SUPPLIERS WITH QUOTES
========================================================= */

exports.assignSuppliersWithQuotes = async (rfqId, quotes, adminContext) => {

  const { adminId, role, ip } = adminContext;

  rfqId = parsePositiveNumber(rfqId, "RFQ ID");

  if (!Array.isArray(quotes) || !quotes.length) {
    throw new AppError("Quotes array required", 400);
  }

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    const rfqCheck = await client.query(
      `SELECT status FROM rfqs WHERE id = $1 FOR UPDATE`,
      [rfqId]
    );

    if (!rfqCheck.rowCount) {
      throw new AppError("RFQ not found", 404);
    }

    if (rfqCheck.rows[0].status !== "open") {
      throw new AppError("Cannot modify awarded RFQ", 400);
    }

    let savedCount = 0;

    for (const q of quotes) {

      const supplierId = parsePositiveNumber(q.supplier_org_id, "Supplier ID");
      const price = parsePositiveNumber(q.price, "Price");

      let timeline = null;

      if (q.timeline_days) {
        timeline = parsePositiveNumber(q.timeline_days, "Timeline");
      }

      const supplierData = await client.query(
        `
        SELECT
          o.certifications,
          rs.final_score AS reliability_score
        FROM organizations o
        LEFT JOIN reliability_scores rs
          ON rs.organization_id = o.id
        WHERE o.id = $1 AND o.type = 'supplier'
        `,
        [supplierId]
      );

      if (!supplierData.rowCount) {
        throw new AppError("Invalid supplier", 400);
      }

      const supplier = supplierData.rows[0];

      await client.query(
        `
        INSERT INTO quotes
        (
          rfq_id,
          supplier_org_id,
          price,
          timeline_days,
          certifications,
          reliability_snapshot,
          status,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,'submitted',NOW())
        ON CONFLICT (rfq_id, supplier_org_id)
        DO UPDATE SET
          price = EXCLUDED.price,
          timeline_days = EXCLUDED.timeline_days,
          certifications = EXCLUDED.certifications,
          reliability_snapshot = EXCLUDED.reliability_snapshot,
          status = 'submitted',
          updated_at = NOW()
        `,
        [
          rfqId,
          supplierId,
          price,
          timeline,
          supplier.certifications || null,
          supplier.reliability_score || null
        ]
      );

      savedCount++;

    }

    /* =========================================================
       ADMIN AUDIT LOG
    ========================================================= */

    try {

      await client.query(
        `
        INSERT INTO admin_audit_logs
        (
          admin_user_id,
          action,
          action_type,
          module,
          metadata,
          actor_role,
          ip_address
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          adminId,
          "ASSIGN_RFQ_SUPPLIERS",
          "RFQ_SUPPLIERS_ASSIGNED",
          "RFQ",
          JSON.stringify({ rfq_id: rfqId, suppliers_count: savedCount }),
          role || null,
          ip || null
        ]
      );

    } catch (auditError) {

      console.warn("⚠ Audit log failed:", auditError.message);

    }

    await client.query("COMMIT");

    return {
      rfq_id: rfqId,
      quotes_saved: savedCount
    };

  } catch (err) {

    await client.query("ROLLBACK");
    throw err;

  } finally {

    client.release();

  }

};

/* =========================================================
   GET RFQ QUOTES
========================================================= */

exports.getRFQQuotes = async (rfqId) => {

  rfqId = parsePositiveNumber(rfqId, "RFQ ID");

  const result = await pool.query(
    `
    SELECT
      q.*,
      o.company_name
    FROM quotes q
    JOIN organizations o
      ON o.id = q.supplier_org_id
    WHERE q.rfq_id = $1
    ORDER BY
      CASE WHEN q.status = 'accepted' THEN 0 ELSE 1 END,
      q.price ASC
    `,
    [rfqId]
  );

  return result.rows;

};

/* =========================================================
   GET SUPPLIERS
========================================================= */

exports.getSuppliers = async () => {

  const result = await pool.query(
    `
    SELECT
      o.id,
      o.company_name,
      o.certifications,
      rs.final_score AS reliability_score
    FROM organizations o
    LEFT JOIN reliability_scores rs
      ON rs.organization_id = o.id
    WHERE o.type = 'supplier'
    ORDER BY o.company_name ASC
    `
  );

  return result.rows;

};
/* =========================================================
   GET RFQ BY ID
========================================================= */

exports.getRFQById = async (rfqId) => {

  rfqId = parsePositiveNumber(rfqId, "RFQ ID");

  const result = await pool.query(
    `
    SELECT
      r.id,
      r.part_name,
      r.part_description,
      r.quantity,
      r.status,
      r.priority,
      r.visibility_type,
      r.created_at,
      o.company_name AS buyer_company
    FROM rfqs r
    JOIN organizations o
      ON o.id = r.buyer_org_id
    WHERE r.id = $1
    `,
    [rfqId]
  );

  if (!result.rowCount) {
    throw new AppError("RFQ not found", 404);
  }

  return result.rows[0];

};
/* =========================================================
   AWARD RFQ AND CREATE PURCHASE ORDER
========================================================= */

exports.awardRFQ = async (rfqId, quoteId, adminContext) => {

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    /* -----------------------------------------------------
       VERIFY RFQ
    ----------------------------------------------------- */

    const rfqResult = await client.query(
      `SELECT * FROM rfqs WHERE id = $1 FOR UPDATE`,
      [rfqId]
    );

    if (!rfqResult.rowCount) {
      throw new AppError("RFQ not found", 404);
    }

    const rfq = rfqResult.rows[0];

    if (rfq.status === "awarded") {
      throw new AppError("RFQ already awarded", 400);
    }

    /* -----------------------------------------------------
       VERIFY QUOTE
    ----------------------------------------------------- */

    const quoteResult = await client.query(
      `
      SELECT *
      FROM quotes
      WHERE id = $1 AND rfq_id = $2
      `,
      [quoteId, rfqId]
    );

    if (!quoteResult.rowCount) {
      throw new AppError("Quote not found", 404);
    }

    const quote = quoteResult.rows[0];

    /* -----------------------------------------------------
       ACCEPT SELECTED QUOTE
    ----------------------------------------------------- */

    await client.query(
      `
      UPDATE quotes
      SET status = 'accepted',
          updated_at = NOW()
      WHERE id = $1
      `,
      [quoteId]
    );

    /* -----------------------------------------------------
       REJECT OTHER QUOTES
    ----------------------------------------------------- */

    await client.query(
      `
      UPDATE quotes
      SET status = 'rejected',
          updated_at = NOW()
      WHERE rfq_id = $1
      AND id <> $2
      `,
      [rfqId, quoteId]
    );

    /* -----------------------------------------------------
       UPDATE RFQ STATUS
    ----------------------------------------------------- */

    await client.query(
      `
      UPDATE rfqs
      SET status = 'awarded',
          updated_at = NOW()
      WHERE id = $1
      `,
      [rfqId]
    );

    /* -----------------------------------------------------
       CREATE PURCHASE ORDER
    ----------------------------------------------------- */

    const poNumber = `PO-${Date.now()}`;

    const poResult = await client.query(
      `
      INSERT INTO purchase_orders
      (
        po_number,
        rfq_id,
        buyer_org_id,
        supplier_org_id,
        part_name,
        quantity,
        total_amount,
        status,
        quote_id,
        created_at,
        updated_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,'issued',$8,NOW(),NOW())
      RETURNING *
      `,
      [
        poNumber,
        rfqId,
        rfq.buyer_org_id,
        quote.supplier_org_id,
        rfq.part_name,
        rfq.quantity,
        quote.price * rfq.quantity,
        quoteId
      ]
    );

    const po = poResult.rows[0];

    await client.query("COMMIT");

    return {
      rfq_id: rfqId,
      quote_id: quoteId,
      po
    };

  } catch (err) {

    await client.query("ROLLBACK");
    throw err;

  } finally {

    client.release();

  }

};

