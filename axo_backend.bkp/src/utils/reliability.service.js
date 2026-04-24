/* =========================================================
   AXO NETWORKS — EVENT-DRIVEN RELIABILITY SERVICE
   Purpose:
   - Fully behavioral scoring
   - Uses po_events ledger
   - Nightly recalculation ready
   - Formula not exposed externally
========================================================= */

const pool = require("../config/db");

/* =========================================================
   CALCULATE SUPPLIER SCORE (EVENT BASED)
========================================================= */
async function calculateSupplierScore(supplierOrgId, client = pool) {

  /* -------------------------
     1. Fetch Relevant POs
  -------------------------- */
  const poRes = await client.query(
    `
    SELECT id, promised_delivery_date
    FROM purchase_orders
    WHERE supplier_org_id = $1
    `,
    [supplierOrgId]
  );

  const poIds = poRes.rows.map(p => p.id);

  if (!poIds.length)
    return { score: 0 };

  /* -------------------------
     2. Fetch Events
  -------------------------- */
  const eventRes = await client.query(
    `
    SELECT entity_id, event_type, metadata, created_at
    FROM po_events
    WHERE entity_id = ANY($1)
    `,
    [poIds]
  );

  const events = eventRes.rows;

  /* -------------------------
     Initialize Counters
  -------------------------- */
  let completed = 0;
  let onTime = 0;
  let disputes = 0;
  let cancelledAfterAccept = 0;
  let acceptedCount = 0;
  let milestoneUpdates = 0;
  let responseTimes = [];

  /* -------------------------
     Group Events By PO
  -------------------------- */
  const eventsByPo = {};

  for (const event of events) {
    if (!eventsByPo[event.entity_id])
      eventsByPo[event.entity_id] = [];
    eventsByPo[event.entity_id].push(event);
  }

  /* -------------------------
     Process Each PO
  -------------------------- */
  for (const po of poRes.rows) {

    const poEvents = eventsByPo[po.id] || [];

    const accepted = poEvents.find(e => e.event_type === "PO_ACCEPTED");
    const delivered = poEvents.find(e => e.event_type === "DELIVERY_CONFIRMED");
    const cancelled = poEvents.find(e => e.event_type === "PO_CANCELLED");

    if (accepted) {
      acceptedCount++;
    }

    if (accepted && cancelled) {
      cancelledAfterAccept++;
    }

    if (delivered) {
      completed++;

      if (
        po.promised_delivery_date &&
        new Date(delivered.created_at) <= new Date(po.promised_delivery_date)
      ) {
        onTime++;
      }
    }

    if (poEvents.some(e => e.event_type === "DISPUTE_RAISED")) {
      disputes++;
    }

    milestoneUpdates +=
      poEvents.filter(e => e.event_type === "MILESTONE_UPDATED").length;

    for (const e of poEvents) {
      if (e.event_type === "RESPONSE_TIME_RECORDED" && e.metadata?.response_time_hours) {
        responseTimes.push(Number(e.metadata.response_time_hours));
      }
    }
  }

  const breachRes = await client.query(`
  SELECT COUNT(*) 
  FROM sla_breaches
  WHERE supplier_org_id = $1
`, [supplierOrgId]);

const breachCount = parseInt(breachRes.rows[0].count, 10);

const breachPenalty = Math.min(breachCount * 2, 15); 
// max 15 point penalty

score -= breachPenalty;

  /* =========================================================
     SCORING WEIGHTS (PRD ALIGNED)
  ========================================================= */

  const total = poRes.rows.length;

  const onTimeRate = completed ? onTime / completed : 0;
  const disputeRate = total ? disputes / total : 0;
  const integrityRate =
    acceptedCount ? 1 - (cancelledAfterAccept / acceptedCount) : 1;

  const avgResponse =
    responseTimes.length
      ? responseTimes.reduce((a,b) => a+b,0) / responseTimes.length
      : null;

  let responseScore = 10;

  if (avgResponse !== null) {
    if (avgResponse > 48) responseScore = 4;
    else if (avgResponse > 24) responseScore = 7;
  }

  const onTimeScore = onTimeRate * 40;
  const disputeScore = (1 - disputeRate) * 10;
  const integrityScore = integrityRate * 10;

  /* Milestone discipline simplified */
  const milestoneScore =
    total ? Math.min((milestoneUpdates / (total * 5)) * 20, 20) : 20;

  /* Data accuracy placeholder (future expansion) */
  const dataAccuracyScore = 10;

  const finalScore =
    onTimeScore +
    milestoneScore +
    integrityScore +
    disputeScore +
    responseScore +
    dataAccuracyScore;

  return {
    score: Math.round(finalScore)
  };
}

/* =========================================================
   TIER ENGINE
========================================================= */
function getReliabilityTier(score) {

  if (score >= 85)
    return { tier: "HIGHLY RELIABLE", badge: "🟢" };

  if (score >= 70)
    return { tier: "RELIABLE", badge: "🟡" };

  if (score >= 55)
    return { tier: "MODERATE", badge: "🟠" };

  return { tier: "HIGH RISK", badge: "🔴" };
}

module.exports = {
  calculateSupplierScore,
  getReliabilityTier
};