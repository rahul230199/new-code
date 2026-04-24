/* =========================================================
   AXO NETWORKS — ADMIN RFQ CONTROLLER
   ENTERPRISE PROCUREMENT (PRODUCTION HARDENED)
========================================================= */

const asyncHandler = require("../../../utils/asyncHandler");
const AppError = require("../../../utils/AppError");
const rfqService = require("./admin.rfq.service");

/* =========================================================
   HELPERS
========================================================= */

function parseId(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return num;
}

function sanitizeString(value) {
  if (!value) return null;
  return String(value).trim();
}

/* =========================================================
   GET ALL RFQs
========================================================= */
exports.getAllRFQs = asyncHandler(async (req, res) => {

  const data = await rfqService.getAllRFQs(req.query);

  res.status(200).json({
    success: true,
    message: "RFQs fetched successfully",
    data
  });

});


/* =========================================================
   GET RFQ DETAILS
========================================================= */

exports.getRFQById = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");

  const data = await rfqService.getRFQById(rfqId);

  res.status(200).json({
    success: true,
    message: "RFQ details fetched successfully",
    data
  });

});

/* =========================================================
   ASSIGN / EDIT SUPPLIERS WITH QUOTES
========================================================= */

exports.assignSuppliersWithQuotes = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");

  const { quotes } = req.body;

  if (!Array.isArray(quotes) || !quotes.length) {
    throw new AppError("Quotes array required", 400);
  }

  const normalizedQuotes = quotes.map(q => {

    const price = Number(q.price);

    if (!Number.isFinite(price) || price <= 0) {
      throw new AppError("Invalid quote price", 400);
    }

    return {
      supplier_org_id: parseId(q.supplier_org_id, "Supplier ID"),
      price,
      timeline_days: q.timeline_days ? Number(q.timeline_days) : null
    };

  });

  const data = await rfqService.assignSuppliersWithQuotes(
    rfqId,
    normalizedQuotes,
    {
      adminId: req.user.id,
      role: req.user.role,
      ip: req.ip
    }
  );

  res.status(200).json({
    success: true,
    message: "Suppliers assigned successfully",
    data
  });

});

/* =========================================================
   GET QUOTES FOR RFQ
========================================================= */

exports.getRFQQuotes = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");

  const data = await rfqService.getRFQQuotes(rfqId);

  res.status(200).json({
    success: true,
    message: "Quotes fetched successfully",
    data
  });

});

/* =========================================================
   ADMIN AWARD RFQ
========================================================= */

exports.awardRFQ = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");

  const quoteId =
    req.body.quote_id ||
    req.body.quoteId ||
    req.body.id;

  const parsedQuoteId = parseId(quoteId, "Quote ID");

  const data = await rfqService.awardRFQ(
    rfqId,
    parsedQuoteId,
    {
      adminId: req.user.id,
      role: req.user.role,
      ip: req.ip
    }
  );

  res.status(200).json({
    success: true,
    message: "RFQ awarded successfully",
    data
  });

});

/* =========================================================
   AWARD QUOTE
========================================================= */

/*exports.awardQuote = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");
  const quoteId = parseId(req.body.quoteId, "Quote ID");

const data = await rfqService.awardQuote(
  rfqId,
  quoteId,
  {
    adminId: req.user.id,
    role: req.user.role,
    ip: req.ip
  }
);

  res.status(200).json({
    success: true,
    message: "Quote awarded successfully",
    data
  });

});*/

/* =========================================================
   UPDATE RFQ STATUS
========================================================= */

exports.updateStatus = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");

  const status = sanitizeString(req.body.status);

  if (!status) {
    throw new AppError("Status is required", 400);
  }

  const data = await rfqService.updateStatus(rfqId, status);

  res.status(200).json({
    success: true,
    message: "RFQ status updated successfully",
    data
  });

});

/* =========================================================
   UPDATE VISIBILITY
========================================================= */

exports.updateVisibility = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");

  const visibility = sanitizeString(req.body.visibility);

  if (!visibility) {
    throw new AppError("Visibility is required", 400);
  }

  const data = await rfqService.updateVisibility(rfqId, visibility);

  res.status(200).json({
    success: true,
    message: "RFQ visibility updated successfully",
    data
  });

});

/* =========================================================
   UPDATE VISIBILITY
========================================================= */

exports.updateVisibility = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");

  const visibility = sanitizeString(req.body.visibility);

  if (!visibility) {
    throw new AppError("Visibility is required", 400);
  }

  const data = await rfqService.updateVisibility(rfqId, visibility);

  res.status(200).json({
    success: true,
    message: "RFQ visibility updated successfully",
    data
  });

});

/* =========================================================
   GET SUPPLIERS
========================================================= */

exports.getSuppliers = asyncHandler(async (req, res) => {

  const data = await rfqService.getSuppliers();

  res.status(200).json({
    success: true,
    message: "Suppliers fetched successfully",
    data
  });

});

/* =========================================================
   GET SUPPLIERS ASSIGNED TO RFQ
========================================================= */

exports.getSuppliersByRFQ = asyncHandler(async (req, res) => {

  const rfqId = parseId(req.params.rfqId, "RFQ ID");

  const data = await rfqService.getSuppliersByRFQ(rfqId);

  res.status(200).json({
    success: true,
    message: "Assigned suppliers fetched successfully",
    data
  });

});
