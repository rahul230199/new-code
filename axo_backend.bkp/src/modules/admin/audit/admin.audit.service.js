const queries = require("./admin.audit.queries");

/* =========================================================
   AXO NETWORKS — ADMIN AUDIT SERVICE
   Enterprise Orchestration Layer
   - Immutable input
   - Strict normalization
   - Deterministic defaults
   - No business leakage
   - Pass-through contract
========================================================= */

exports.getAuditLogs = async (filters = {}) => {

  /* ================= DEFENSIVE COPY ================= */

  const safeFilters = Object.freeze({
    adminUserId:
      Number.isInteger(filters.adminUserId) && filters.adminUserId > 0
        ? filters.adminUserId
        : null,

    actionType:
      typeof filters.actionType === "string" && filters.actionType.trim()
        ? filters.actionType.trim()
        : null,

    module:
      typeof filters.module === "string" && filters.module.trim()
        ? filters.module.trim()
        : null,

    search:
      typeof filters.search === "string" && filters.search.trim()
        ? filters.search.trim()
        : null,

    startDate:
      typeof filters.startDate === "string"
        ? filters.startDate
        : null,

    endDate:
      typeof filters.endDate === "string"
        ? filters.endDate
        : null,

    page:
      Number.isInteger(filters.page) && filters.page > 0
        ? filters.page
        : 1,

    limit:
      Number.isInteger(filters.limit) &&
      filters.limit > 0 &&
      filters.limit <= 100
        ? filters.limit
        : 20
  });

  /* ================= PASS THROUGH ================= */

  return queries.getAuditLogs(safeFilters);
};

/* =========================================================
   GET AUDIT LOG BY ID
========================================================= */

exports.getAuditLogById = async (id) => {
  return queries.getAuditLogById(id);
};