const asyncHandler = require("../../../utils/asyncHandler");
const service = require("./admin.audit.service");

/* =========================================================
   AXO NETWORKS — ADMIN AUDIT CONTROLLER
   Production Hardened
   - Strict validation
   - Safe normalization
   - Deterministic input contract
   - Clean response structure
========================================================= */

exports.getAuditLogs = asyncHandler(async (req, res) => {

  /* ================= DESTRUCTURE QUERY ================= */

  let {
    page = 1,
    limit = 20,
    admin_user_id,
    action_type,
    module,
    search,
    start_date,
    end_date
  } = req.query;

  /* ================= SAFE NUMERIC NORMALIZATION ================= */

  page = Number(page);
  limit = Number(limit);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) limit = 20;

  /* ================= STRICT ID NORMALIZATION ================= */

  let normalizedAdminId = null;
  if (admin_user_id !== undefined && admin_user_id !== null) {
    const parsed = Number(admin_user_id);
    if (Number.isInteger(parsed) && parsed > 0) {
      normalizedAdminId = parsed;
    }
  }

  /* ================= DATE VALIDATION ================= */

  let normalizedStartDate = null;
  let normalizedEndDate = null;

  if (start_date) {
    const d = new Date(start_date);
    if (!isNaN(d.getTime())) {
      normalizedStartDate = d.toISOString();
    }
  }

  if (end_date) {
    const d = new Date(end_date);
    if (!isNaN(d.getTime())) {
      normalizedEndDate = d.toISOString();
    }
  }

  /* ================= SERVICE CALL ================= */

  const result = await service.getAuditLogs({
    adminUserId: normalizedAdminId,
    actionType: action_type || null,
    module: module || null,
    search: search || null,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    page,
    limit
  });

  /* ================= STRICT RESPONSE CONTRACT ================= */

  return res.status(200).json({
    success: true,
    meta: result.meta,
    data: result.data
  });

});

/* =========================================================
   GET SINGLE AUDIT LOG
   - Strict ID validation
   - Deterministic response
   - 404 safe
========================================================= */

exports.getAuditLogById = asyncHandler(async (req, res) => {

  const { id } = req.params;

  /* ================= STRICT ID VALIDATION ================= */

  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid audit log id"
    });
  }

  /* ================= SERVICE CALL ================= */

  const result = await service.getAuditLogById(parsedId);

  if (!result) {
    return res.status(404).json({
      success: false,
      message: "Audit log not found"
    });
  }

  /* ================= STRICT RESPONSE CONTRACT ================= */

  return res.status(200).json({
    success: true,
    data: result
  });

});