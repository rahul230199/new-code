/* =========================================================
   AXO NETWORKS — EVENT LOGGER
   Central Behavioral Ledger Engine
========================================================= */

const pool = require("../config/db");

/* =========================================================
   CORE EVENT WRITER
========================================================= */

async function logEvent({
  poId,
  eventType,
  actorId,
  organizationId = null,
  actorRole = null,
  description = null,
  metadata = {},
  client = pool
}) {

  try {

    /* ================= VALIDATION ================= */

    if (!poId || !eventType || !actorId) {
      throw new Error("Missing required event logging fields");
    }

    if (typeof metadata !== "object" || metadata === null) {
      metadata = {};
    }

    /* ================= INSERT EVENT ================= */

    await client.query(
      `
      INSERT INTO po_events (
        po_id,
        event_type,
        actor_user_id,
        organization_id,
        actor_role,
        description,
        metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        poId,
        eventType,
        actorId,
        organizationId,
        actorRole,
        description,
        JSON.stringify(metadata)
      ]
    );

  } catch (err) {

    /*
      IMPORTANT:
      Event logging must NEVER crash business logic.
      If event fails, we log it but do not block the transaction.
    */

    console.error("AXO EVENT LOGGER FAILURE:", {
      poId,
      eventType,
      actorId,
      error: err.message
    });

  }

}


/* =========================================================
   HELPER WRAPPERS
========================================================= */

async function logPOAccepted(poId, actorId, client = pool) {
  return logEvent({
    poId,
    eventType: "PO_ACCEPTED",
    actorId,
    description: "Purchase order accepted",
    client
  });
}

async function logPOCancelled(poId, actorId, reason, client = pool) {
  return logEvent({
    poId,
    eventType: "PO_CANCELLED",
    actorId,
    description: "Purchase order cancelled",
    metadata: { reason },
    client
  });
}

async function logMilestoneUpdate(poId, actorId, milestoneName, client = pool) {
  return logEvent({
    poId,
    eventType: "MILESTONE_UPDATED",
    actorId,
    description: "Milestone updated",
    metadata: { milestoneName },
    client
  });
}

async function logDeliveryConfirmed(poId, actorId, client = pool) {
  return logEvent({
    poId,
    eventType: "DELIVERY_CONFIRMED",
    actorId,
    description: "Delivery confirmed",
    client
  });
}

async function logPaymentConfirmed(poId, actorId, amount, client = pool) {
  return logEvent({
    poId,
    eventType: "PAYMENT_CONFIRMED",
    actorId,
    description: "Payment confirmed",
    metadata: { amount },
    client
  });
}

async function logDisputeRaised(poId, actorId, disputeId, client = pool) {
  return logEvent({
    poId,
    eventType: "DISPUTE_RAISED",
    actorId,
    description: "Dispute raised",
    metadata: { disputeId },
    client
  });
}

async function logMessageSent(poId, actorId, client = pool) {
  return logEvent({
    poId,
    eventType: "PO_THREAD_MESSAGE_SENT",
    actorId,
    description: "Thread message sent",
    metadata: {},
    client
  });
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  logEvent,
  logPOAccepted,
  logPOCancelled,
  logMilestoneUpdate,
  logDeliveryConfirmed,
  logPaymentConfirmed,
  logDisputeRaised,
  logMessageSent
};