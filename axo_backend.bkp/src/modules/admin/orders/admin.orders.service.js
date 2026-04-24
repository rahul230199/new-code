/* =========================================================
   AXO NETWORKS — ADMIN ORDERS SERVICE
   Business Logic Layer
========================================================= */

const AppError = require("../../../utils/AppError");
const queries = require("./admin.orders.queries");

/* =========================================================
   GET ALL PURCHASE ORDERS (ADMIN)
========================================================= */

exports.getAllOrders = async (query = {}) => {

  let {
    page = 1,
    limit = 10,
    status
  } = query;

  page = Number(page);
  limit = Number(limit);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  const result = await queries.getAllOrders({
    status,
    limit,
    offset
  });

  const totalPages = Math.ceil(result.total_records / limit);

  return {
    total_records: result.total_records,
    current_page: page,
    total_pages: totalPages,
    orders: result.orders
  };
};

const pool = require("../../../config/db");

/* =========================================================
UPDATE ORDER STATUS
========================================================= */

exports.updateOrderStatus = async (poId, status) => {

  const result = await pool.query(
`
UPDATE purchase_orders
SET status = $1::varchar,
    updated_at = NOW()
WHERE id = $2::int
RETURNING *
`,
[status, poId]
);

  return result.rows[0];

};


/* =========================================================
COMPLETE MILESTONE
========================================================= */

exports.completeMilestone = async (poId, milestoneName) => {

  const result = await pool.query(
    `
    UPDATE po_milestones
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE po_id = $1
    AND milestone_name = $2
    RETURNING *
    `,
    [poId, milestoneName]
  );

  return result.rows[0];

};


/* =========================================================
   GET FULL ORDER DETAILS
========================================================= */

exports.getOrderDetails = async (poId) => {

  poId = Number(poId);

  if (!Number.isFinite(poId) || poId <= 0) {
    throw new AppError("Invalid Purchase Order ID", 400);
  }

  const po = await queries.getOrderById(poId);

  if (!po) {
    throw new AppError("Purchase Order not found", 404);
  }

  const [
    milestones,
    payments,
    disputes,
    events,
    messages,
    slaBreaches
  ] = await Promise.all([

    queries.getMilestones(poId),
    queries.getPayments(poId),
    queries.getDisputes(poId),
    queries.getEvents(poId),
    queries.getMessages(poId),
    queries.getSLABreaches(poId)

  ]);

/* =========================================================
   NORMALIZE MESSAGE ROLES
========================================================= */

const normalizedMessages = messages.map(m => {

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


return {
  purchase_order: po,
  milestones,
  payments,
  disputes,
  events,
  messages: normalizedMessages,
  sla_breaches: slaBreaches
};}
