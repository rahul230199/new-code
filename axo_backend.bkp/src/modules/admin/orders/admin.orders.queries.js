/* =========================================================
   AXO NETWORKS — ADMIN ORDERS QUERIES
   Data Access Layer (Pure SQL)
========================================================= */

const pool = require("../../../config/db");

/* =========================================================
   GET ALL PURCHASE ORDERS
   Admin global view
========================================================= */

exports.getAllOrders = async ({ status, limit, offset }) => {

  let where = [];
  let values = [];
  let index = 1;

  if (status && status !== "ALL") {
    where.push(`po.status = $${index}`);
    values.push(status);
    index++;
  }

  const whereSQL =
    where.length > 0
      ? `WHERE ${where.join(" AND ")}`
      : "";

  const countQuery = `
    SELECT COUNT(*)
    FROM purchase_orders po
    ${whereSQL}
  `;

  const countResult = await pool.query(countQuery, values);
  const totalRecords = Number(countResult.rows[0].count);

  const dataQuery = `
    SELECT
      po.id,
      po.po_number,
      po.part_name,
      po.quantity,
      po.value,
      po.status,
      po.dispute_flag,
      po.created_at,
      po.promised_delivery_date,

      buyer.company_name   AS buyer_company,
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
  `;

  const result = await pool.query(
    dataQuery,
    [...values, limit, offset]
  );

  return {
    total_records: totalRecords,
    orders: result.rows
  };
};


/* =========================================================
   GET SINGLE PURCHASE ORDER
========================================================= */

exports.getOrderById = async (poId) => {

  const result = await pool.query(`
    SELECT
      po.*,

      buyer.company_name AS buyer_company,
      supplier.company_name AS supplier_company

    FROM purchase_orders po

    JOIN organizations buyer
      ON po.buyer_org_id = buyer.id

    JOIN organizations supplier
      ON po.supplier_org_id = supplier.id

    WHERE po.id = $1
  `, [poId]);

  return result.rows[0];
};


/* =========================================================
   GET PO MILESTONES
========================================================= */

exports.getMilestones = async (poId) => {

  const result = await pool.query(`
    SELECT *
    FROM po_milestones
    WHERE po_id = $1
    ORDER BY sequence_order ASC
  `, [poId]);

  return result.rows;
};


/* =========================================================
   GET PO PAYMENTS
========================================================= */

exports.getPayments = async (poId) => {

  const result = await pool.query(`
    SELECT *
    FROM payments
    WHERE po_id = $1
    ORDER BY created_at ASC
  `, [poId]);

  return result.rows;
};


/* =========================================================
   GET PO DISPUTES
========================================================= */

exports.getDisputes = async (poId) => {

  const result = await pool.query(`
    SELECT *
    FROM po_disputes
    WHERE po_id = $1
    ORDER BY created_at DESC
  `, [poId]);

  return result.rows;
};


/* =========================================================
   GET PO EVENTS
========================================================= */

exports.getEvents = async (poId) => {

  const result = await pool.query(`
    SELECT *
    FROM po_events
    WHERE po_id = $1
    ORDER BY event_timestamp ASC
  `, [poId]);

  return result.rows;
};


/* =========================================================
   GET PO MESSAGES
========================================================= */

exports.getMessages = async (poId) => {

  const result = await pool.query(`
    SELECT
      m.id,
      m.po_id,
      m.sender_id,
      u.organization_id,
      m.message,
      m.created_at

    FROM po_messages m

    JOIN users u
      ON u.id = m.sender_id

    WHERE m.po_id = $1

    ORDER BY m.created_at ASC
  `, [poId]);

  return result.rows;
};

/* =========================================================
   GET SLA BREACHES
========================================================= */

exports.getSLABreaches = async (poId) => {

  const result = await pool.query(`
    SELECT *
    FROM sla_breaches
    WHERE po_id = $1
    ORDER BY due_date ASC
  `, [poId]);

  return result.rows;
};