/* =========================================================
   AXO NETWORKS — ADMIN USERS CONTROLLER
   ENTERPRISE USER MANAGEMENT (PRODUCTION SAFE)
========================================================= */

const asyncHandler = require("../../../utils/asyncHandler");
const AppError = require("../../../utils/AppError");
const service = require("./admin.users.service");

/* =========================================================
   HELPER: BUILD SERVICE CONTEXT
========================================================= */
function buildContext(req) {
  return {
    adminId: req.user && req.user.id,
    role: req.user && req.user.role,
    ip: req.ip
  };
}

/* =========================================================
   GET USERS
========================================================= */
exports.getUsers = asyncHandler(async (req, res) => {
  const data = await service.getUsers(req.query);

  res.status(200).json({
    success: true,
    data
  });
});

/* =========================================================
   GET USER BY ID
========================================================= */
exports.getUserById = asyncHandler(async (req, res) => {
  const user = await service.getUserById(req.params.id);

  res.status(200).json({
    success: true,
    data: user
  });
});

/* =========================================================
   UPDATE USER STATUS
========================================================= */
exports.updateStatus = asyncHandler(async (req, res) => {
  if (!req.body.status) {
    throw new AppError("Status is required", 400);
  }

  const data = await service.updateStatus(
    req.params.id,
    req.body.status,
    buildContext(req)
  );

  res.status(200).json({
    success: true,
    message: "User status updated successfully",
    data
  });
});

/* =========================================================
   UPDATE USER ROLE
========================================================= */
exports.updateRole = asyncHandler(async (req, res) => {
  if (!req.body.role) {
    throw new AppError("Role is required", 400);
  }

  const data = await service.updateRole(
    req.params.id,
    req.body.role,
    buildContext(req)
  );

  res.status(200).json({
    success: true,
    message: "User role updated successfully",
    data
  });
});

/* =========================================================
   SOFT DELETE USER
========================================================= */
exports.softDeleteUser = asyncHandler(async (req, res) => {
  const result = await service.softDeleteUser(
    req.params.id,
    buildContext(req)
  );

  res.status(200).json({
    success: true,
    message: "User deleted successfully",
    data: result
  });
});

/* =========================================================
   RESET PASSWORD
========================================================= */
exports.resetPassword = asyncHandler(async (req, res) => {
  const data = await service.resetPassword(
    req.params.id,
    buildContext(req)
  );

  res.status(200).json({
    success: true,
    message: "Password reset successful",
    data
  });
});
