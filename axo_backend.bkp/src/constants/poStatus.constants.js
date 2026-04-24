/* =========================================================
   AXO NETWORKS — PURCHASE ORDER STATUS CONSTANTS
   Enterprise Safe Enumeration
========================================================= */

const PO_STATUS = Object.freeze({
  ISSUED: "issued",
  ACCEPTED: "accepted",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  DISPUTED: "disputed",
  CANCELLED: "cancelled"
});

module.exports = PO_STATUS;
