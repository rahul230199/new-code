/* =========================================================
   AXO NETWORKS — EXPORT CONTROLLER
========================================================= */

const asyncHandler = require("../../utils/asyncHandler");
const exportEngine = require("./export.engine");

exports.downloadPOPackage = asyncHandler(async (req, res) => {

  const poId = Number(req.params.poId);
  const orgId = req.user.organization_id;

  if (!poId || isNaN(poId))
    throw new Error("Invalid PO id");

  const data =
    await exportEngine.generatePOPackage(poId, orgId);

  res.set({
    "Content-Type": "application/json",
    "Content-Disposition": `attachment; filename="PO-${poId}-package.json"`
  });

  res.status(200).json(data);

});