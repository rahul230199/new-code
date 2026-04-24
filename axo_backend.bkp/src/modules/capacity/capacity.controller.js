/* =========================================================
   AXO NETWORKS — CAPACITY CONTROLLER
========================================================= */

const asyncHandler = require("../../utils/asyncHandler");
const capacityEngine = require("./capacity.engine");

exports.getCapacityOverview = asyncHandler(async (req, res) => {

  const summary =
    await capacityEngine.getCapacitySummary();

  res.status(200).json({
    success: true,
    data: summary
  });

});

exports.getSupplierUtilization = asyncHandler(async (req, res) => {

  const supplierId = Number(req.params.id);

  const result =
    await capacityEngine.calculateSupplierUtilization(supplierId);

  res.status(200).json({
    success: true,
    data: result
  });

});