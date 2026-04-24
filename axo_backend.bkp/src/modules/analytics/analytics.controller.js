/* =========================================================
   AXO NETWORKS — ANALYTICS CONTROLLER
========================================================= */

const asyncHandler = require("../../utils/asyncHandler");
const analyticsEngine = require("./analytics.engine");

exports.getDashboardOverview = asyncHandler(async (req, res) => {

  const orgId = req.user.organization_id;

  const overview =
    await analyticsEngine.getExecutiveOverview(orgId);

  res.status(200).json({
    success: true,
    data: overview
  });

});