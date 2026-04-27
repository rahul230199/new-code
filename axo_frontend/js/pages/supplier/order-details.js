/* =============================================================
   AXO NETWORKS — SUPPLIER ORDER DETAILS
   pages/supplier/order-details.js

   Sections:
   - Order header  : PO number, OEM name, value, status
   - Info cards    : part, payment terms, dates
   - Milestone tracker : 7-step timeline, supplier marks steps complete
   - Message thread    : real-time chat with OEM (30s poll)

   Backend endpoints used:
     GET  /api/supplier/orders/:id
          → { order, communications, milestones }
     PUT  /api/supplier/orders/:orderId/milestones/:milestoneId
          → { success, progress }
     POST /api/supplier/orders/:id/messages
          → { success, message }
   ============================================================= */

import Router  from "../../core/router.js";
import API     from "../../core/api.js";
import Auth    from "../../core/auth.js";
import Toast   from "../../core/toast.js";
import CONFIG  from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatCurrency,
  formatRelativeTime,
  formatStatus,
  getStatusClass,
  getQueryParam,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard
// -----------------------------------------------------------------
if (!Router.guardPage(["supplier", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// RESOLVE ORDER ID
// =================================================================
const ORDER_ID = getQueryParam("id");

// =================================================================
// STATE
// =================================================================
const State = {
  order:          null,
  milestones:     [],
  messages:       [],
  lastMessageId:  null,
  pollTimer:      null,
  sending:        false,
  POLL_MS:        30_000,
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)       => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML   = html; };

// =================================================================
// RENDER — ORDER HEADER + INFO CARDS
// =================================================================
const renderOrderHeader = (order) => {
  const statusClass = getStatusClass(order.status);

  setText("poNumber",      order.po_number     || `PO-${order.id}`);
  setText("oemName",       order.oem_name      || "—");
  setText("orderDate",     formatDate(order.created_at));
  setText("orderValue",    formatCurrency(order.total_value || 0, "USD"));
  setText("orderQuantity", `${order.quantity ?? "—"} ${order.unit || "units"}`);
  setText("partName",      order.part_name     || "—");
  setText("paymentTerms",  order.payment_terms || "Net 30");

  const statusEl = el("orderStatus");
  if (statusEl) {
    statusEl.textContent = formatStatus(order.status);
    statusEl.className   = `badge badge--${statusClass}`;
  }
};

// =================================================================
// RENDER — MILESTONE TRACKER
// Supplier can mark each pending milestone as complete or in_progress
// =================================================================
const renderMilestones = (milestones) => {
  const container = el("timelineSteps");
  if (!container) return;

  const completed = milestones.filter((m) => m.status === "completed").length;
  const total     = milestones.length;
  const progress  = total > 0 ? Math.round((completed / total) * 100) : 0;

  const bar = el("progressBarFill");
  if (bar) bar.style.width = `${progress}%`;
  setText("progressText", `${progress}% Complete`);

  if (!milestones.length) {
    container.innerHTML = `<p class="text-muted">No milestones found.</p>`;
    return;
  }

  const allDone = completed === total;

  container.innerHTML = milestones.map((m, index) => {
    const isCompleted   = m.status === "completed";
    const isInProgress  = m.status === "in_progress";
    const isActive      = !isCompleted && index === completed;
    const isDelayed     = m.status === "delayed";

    const stepClass = isCompleted
      ? "milestone-step--completed"
      : isInProgress
      ? "milestone-step--in-progress"
      : isActive
      ? "milestone-step--active"
      : isDelayed
      ? "milestone-step--delayed"
      : "milestone-step--pending";

    const completedAt = isCompleted && m.completed_at
      ? `<span class="milestone-step__date">${formatDate(m.completed_at)}</span>`
      : "";

    // Supplier can update any non-completed milestone
    const canUpdate = !isCompleted && !allDone;

    const updateControls = canUpdate
      ? `<div class="milestone-step__update">
           <button
             class="btn btn--xs btn--success js-mark-complete"
             data-milestone-id="${m.id}"
             data-milestone-name="${sanitizeHTML(m.milestone_name)}"
           >
             Mark Complete
           </button>
           ${!isInProgress
             ? `<button
                  class="btn btn--xs btn--outline js-mark-progress"
                  data-milestone-id="${m.id}"
                  data-milestone-name="${sanitizeHTML(m.milestone_name)}"
                >
                  Mark In Progress
                </button>`
             : ""}
         </div>`
      : "";

    return `
      <div class="milestone-step ${stepClass}" data-id="${m.id}">
        <div class="milestone-step__indicator" aria-hidden="true">
          <span class="milestone-step__dot"></span>
          ${index < milestones.length - 1
            ? `<span class="milestone-step__connector"></span>`
            : ""}
        </div>
        <div class="milestone-step__body">
          <span class="milestone-step__name">${sanitizeHTML(m.milestone_name)}</span>
          ${completedAt}
          ${isInProgress
            ? `<span class="milestone-step__status-label">In Progress</span>`
            : ""}
          ${m.notes
            ? `<span class="milestone-step__note">${sanitizeHTML(m.notes)}</span>`
            : ""}
          ${updateControls}
        </div>
      </div>`;
  }).join("");

  if (allDone) {
    const doneEl = document.createElement("div");
    doneEl.className = "milestone-all-done";
    doneEl.textContent = "✓ All milestones completed!";
    container.appendChild(doneEl);
  }
};

// =================================================================
// RENDER — MESSAGE THREAD
// =================================================================
const renderMessages = (messages, scrollToBottom = false) => {
  const chatDiv = el("chatMessages");
  if (!chatDiv) return;

  if (!messages.length) {
    chatDiv.innerHTML = `
      <div class="chat-empty">
        <p>No messages yet. Start the conversation with the buyer.</p>
      </div>`;
    return;
  }

  chatDiv.innerHTML = messages.map((msg) => {
    const isSent = msg.sender_type === "Supplier";

    return `
      <div class="chat-msg ${isSent ? "chat-msg--sent" : "chat-msg--received"}">
        <div class="chat-msg__bubble">
          <div class="chat-msg__meta">
            <strong>${sanitizeHTML(msg.sender_name)}</strong>
            <span class="chat-msg__role">${isSent ? "You" : "Buyer"}</span>
          </div>
          <p class="chat-msg__text">${sanitizeHTML(msg.message)}</p>
          <span class="chat-msg__time">${formatRelativeTime(msg.created_at)}</span>
        </div>
      </div>`;
  }).join("");

  if (scrollToBottom) chatDiv.scrollTop = chatDiv.scrollHeight;
};

// =================================================================
// APPEND SINGLE MESSAGE (optimistic send — no full re-render)
// =================================================================
const appendMessage = (msg) => {
  const chatDiv = el("chatMessages");
  if (!chatDiv) return;

  chatDiv.querySelector(".chat-empty")?.remove();

  const isSent = msg.sender_type === "Supplier";
  const div    = document.createElement("div");
  div.className = `chat-msg ${isSent ? "chat-msg--sent" : "chat-msg--received"}`;
  div.innerHTML = `
    <div class="chat-msg__bubble">
      <div class="chat-msg__meta">
        <strong>${sanitizeHTML(msg.sender_name)}</strong>
        <span class="chat-msg__role">${isSent ? "You" : "Buyer"}</span>
      </div>
      <p class="chat-msg__text">${sanitizeHTML(msg.message)}</p>
      <span class="chat-msg__time">Just now</span>
    </div>`;

  chatDiv.appendChild(div);
  chatDiv.scrollTop = chatDiv.scrollHeight;
};

// =================================================================
// UPDATE MILESTONE
// =================================================================
const updateMilestone = async (milestoneId, status, btn) => {
  const original = btn.textContent;
  btn.disabled    = true;
  btn.textContent = "Updating…";

  try {
    await API.put(
      `/supplier/orders/${ORDER_ID}/milestones/${milestoneId}`,
      { status, notes: "" }
    );

    const label = status === "completed" ? "complete" : "in progress";
    Toast.success(`Milestone marked as ${label}.`);

    // Reload full detail to sync progress + milestones
    await loadOrderDetails({ silently: true });

  } catch (err) {
    Toast.error(err.message || "Failed to update milestone.");
    btn.disabled    = false;
    btn.textContent = original;
  }
};

// =================================================================
// SEND MESSAGE
// =================================================================
const sendMessage = async () => {
  if (State.sending) return;

  const input   = el("messageInput");
  const sendBtn = el("sendBtn");
  const message = input?.value.trim() ?? "";

  if (!message) {
    Toast.warning("Please enter a message before sending.");
    return;
  }

  State.sending = true;
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending…"; }

  try {
    const { message: saved } = await API.post(
      `/supplier/orders/${ORDER_ID}/messages`,
      { message }
    );

    if (input) input.value = "";

    const user = Auth.getCurrentUser();
    appendMessage({
      sender_type: "Supplier",
      sender_name: saved?.sender_name || user?.company_name || "You",
      message,
      created_at:  new Date().toISOString(),
    });

    if (saved?.id) State.lastMessageId = saved.id;

  } catch (err) {
    Toast.error(err.message || "Failed to send message.");
  } finally {
    State.sending = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
  }
};

// =================================================================
// LOAD ORDER DETAILS
// =================================================================
const loadOrderDetails = async ({ silently = false } = {}) => {
  if (!ORDER_ID) {
    setHTML("orderDetailsContainer", `
      <div class="empty-state">
        <p>No order ID provided.</p>
        <a href="${CONFIG.ROUTES.SUPPLIER_ORDERS}" class="btn btn--primary">Back to Orders</a>
      </div>`);
    return;
  }

  if (!silently) el("orderDetailsContainer")?.classList.add("loading");

  try {
    const data = await API.get(`/supplier/orders/${ORDER_ID}`);

    if (!data.order || !Object.keys(data.order).length) {
      setHTML("orderDetailsContainer", `
        <div class="empty-state">
          <p>Order not found.</p>
          <a href="${CONFIG.ROUTES.SUPPLIER_ORDERS}" class="btn btn--primary">Back to Orders</a>
        </div>`);
      stopPolling();
      return;
    }

    State.order      = data.order;
    State.milestones = data.milestones     || [];
    const newMsgs    = data.communications || [];

    renderOrderHeader(State.order);
    renderMilestones(State.milestones);

    // Only re-render messages if new ones arrived
    const latestId = newMsgs[newMsgs.length - 1]?.id ?? null;
    const hasNew   = newMsgs.length !== State.messages.length ||
                     latestId !== State.lastMessageId;

    if (hasNew) {
      State.messages      = newMsgs;
      State.lastMessageId = latestId;
      renderMessages(State.messages, true);
    }

  } catch (err) {
    if (!silently) Toast.error(err.message || "Failed to load order details.");
  } finally {
    el("orderDetailsContainer")?.classList.remove("loading");
  }
};

// =================================================================
// POLLING
// =================================================================
const startPolling = () => {
  if (State.pollTimer) return;
  State.pollTimer = setInterval(
    () => loadOrderDetails({ silently: true }),
    State.POLL_MS
  );
};

const stopPolling = () => {
  if (State.pollTimer) {
    clearInterval(State.pollTimer);
    State.pollTimer = null;
  }
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling();
  else { loadOrderDetails({ silently: true }); startPolling(); }
});

window.addEventListener("pagehide", stopPolling);

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── Milestone buttons — event delegation on timeline ─────────
  el("timelineSteps")?.addEventListener("click", (e) => {
    const completeBtn  = e.target.closest(".js-mark-complete");
    const progressBtn  = e.target.closest(".js-mark-progress");

    if (completeBtn) {
      updateMilestone(completeBtn.dataset.milestoneId, "completed",   completeBtn);
    }
    if (progressBtn) {
      updateMilestone(progressBtn.dataset.milestoneId, "in_progress", progressBtn);
    }
  });

  // ── Send message ──────────────────────────────────────────────
  el("sendBtn")?.addEventListener("click", sendMessage);

  el("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ── Back button ───────────────────────────────────────────────
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
  });

  // ── Sidebar / auth ────────────────────────────────────────────
  el("logoutBtn")?.addEventListener("click",  () => Auth.logout());
  el("menuToggle")?.addEventListener("click", () => {
    el("sidebar")?.classList.toggle("open");
  });
};

// =================================================================
// INIT
// =================================================================
const init = () => {
  const user = Auth.getCurrentUser();
  setText("companyName", user?.company_name || "Supplier");

  bindEvents();
  loadOrderDetails();
  startPolling();
};

document.addEventListener("DOMContentLoaded", init);