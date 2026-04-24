/* =========================================================
   AXO NETWORKS — RISK CONTROLLER
========================================================= */

const asyncHandler = require("../../utils/asyncHandler");
const riskEngine = require("./risk.engine");

exports.getRiskOverview = asyncHandler(async (req, res) => {

  const summary = await riskEngine.getRiskSummary();

  res.status(200).json({
    success: true,
    data: summary
  });

});