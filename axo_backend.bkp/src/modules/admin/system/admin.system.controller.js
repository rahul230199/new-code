/* =========================================================
   AXO NETWORKS — ADMIN SYSTEM CONTROLLER
   Clean Contract | No Double Wrap | Production Safe
========================================================= */

const asyncHandler = require("../../../utils/asyncHandler");
const service = require("./admin.system.service");

exports.getSystemHealth = asyncHandler(async (req, res) => {

  const result = await service.getSystemHealth();

  // Service already guarantees safe structure
  return res.status(200).json(result);

});