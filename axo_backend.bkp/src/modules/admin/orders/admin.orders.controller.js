
/* =========================================================
   AXO NETWORKS — ADMIN ORDERS CONTROLLER
   HTTP Layer
========================================================= */

const asyncHandler = require("../../../utils/asyncHandler");
const orderService = require("./admin.orders.service");
const pool = require("../../../config/db");

/* =========================================================
   GET ALL PURCHASE ORDERS
========================================================= */

exports.getAllOrders = asyncHandler(async (req, res) => {

  const data = await orderService.getAllOrders(req.query);

  res.status(200).json({
    success: true,
    message: "Purchase orders fetched successfully",
    data
  });

});


/* =========================================================
   GET PURCHASE ORDER DETAILS
========================================================= */

exports.getOrderDetails = asyncHandler(async (req, res) => {

  const { poId } = req.params;

  const data = await orderService.getOrderDetails(poId);

  res.status(200).json({
    success: true,
    message: "Purchase order details fetched successfully",
    data
  });

});


/* =========================================================
   SEND MESSAGE
   POST /admin/orders/:poId/messages
========================================================= */

exports.sendMessage = asyncHandler(async (req, res) => {

  const { poId } = req.params;
  const { message } = req.body;

  const userId = req.user.id;
  const role = req.user.role;

  const result = await pool.query(
    `
    INSERT INTO po_messages
    (po_id, sender_user_id, sender_role, message)
    VALUES ($1,$2,$3,$4)
    RETURNING *
    `,
    [poId, userId, role, message]
  );

  const newMessage = result.rows[0];

  /* REALTIME BROADCAST */

  if (global.io) {
    global.io.to(`po_${poId}`).emit("po_message", newMessage);
  }

  res.status(201).json({
    success: true,
    message: "Message sent successfully",
    data: newMessage
  });

});

/* =========================================================
UPDATE ORDER STATUS
========================================================= */

exports.updateOrderStatus = async (req, res) => {

  const { poId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Status required"
    });
  }

  try {

    const result =
      await orderService.updateOrderStatus(poId, status);

    res.json({
      success: true,
      data: result
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  }

};


/* =========================================================
COMPLETE MILESTONE
========================================================= */

exports.completeMilestone = async (req, res) => {

  const { poId } = req.params;
  const { milestone_name } = req.body;

  if (!milestone_name) {
    return res.status(400).json({
      success: false,
      message: "Milestone required"
    });
  }

  try {

    const result =
      await orderService.completeMilestone(poId, milestone_name);

    res.json({
      success: true,
      data: result
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  }

};
