/* =============================================================
   AXO NETWORKS — OEM ORDER DETAILS
   pages/oem/order-details.js

   Sections:
   - Order header  : PO number, supplier, value, status
   - Info cards    : part, payment terms, dates
   - Milestone tracker : 7-step timeline, OEM can mark steps
   - Message thread    : real-time chat with supplier (30s poll)

   Backend endpoints used:
     GET  /api/oem/orders/:id
          → { order, communications, milestones }
     POST /api/oem/orders/:id/messages
          → { success, message }
     PUT  /api/oem/orders/:orderId/milestones/:milestoneId
          → { success, progress }
   ============================================================= */

import Router  from "../../core/router.js";
import API     from "../../core/api.js";
import Auth    from "../../core/auth.js";
import Toast   from "../../core/toast.js";
import CONFIG  from "../../core/config.js";
import {
  sanitizeHTML,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatCurrency,
  formatStatus,
  getStatusClass,
  getQueryParam,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// RESOLVE ORDER ID FROM URL
// =================================================================
const ORDER_ID = getQueryParam("id");

// =================================================================
// STATE
// =================================================================
const State = {
  order:          null,
  milestones:     [],
  messages:       [],
  lastMessageId:  null,     // used to detect new messages without JSON.stringify
  pollTimer:      null,
  POLL_MS:        30_000,   // 30s — not 5s
  sending:        false,
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

  setText("poNumber",       order.po_number    || `PO-${order.id}`);
  setText("supplierName",   order.supplier_name || "—");
  setText("orderDate",      formatDate(order.created_at));
  setText("orderValue",     formatCurrency(order.total_value || 0, "USD"));
  setText("orderQuantity",  `${order.quantity ?? "—"} ${order.unit || "units"}`);
  setText("partName",       order.part_name     || "—");
  setText("paymentTerms",   order.payment_terms || "Net 30");

  const statusEl = el("orderStatus");
  if (statusEl) {
    statusEl.textContent = formatStatus(order.status);
    statusEl.className   = `badge badge--${statusClass}`;
  }
};

// =================================================================
// RENDER — MILESTONE TRACKER
// =================================================================
const renderMilestones = (milestones) => {
  const container = el("timelineSteps");
  if (!container) return;

  const completed  = milestones.filter((m) => m.status === "completed").length;
  const total      = milestones.length;
  const progress   = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Update progress bar
  const bar = el("progressBarFill");
  if (bar) bar.style.width = `${progress}%`;
  setText("progressText", `${progress}% Complete`);

  if (!milestones.length) {
    container.innerHTML = `<p class="text-muted">No milestones found.</p>`;
    return;
  }

  container.innerHTML = milestones.map((m, index) => {
    const isCompleted   = m.status === "completed";
    const isActive      = !isCompleted && index === completed;
    const isDelayed     = m.status === "delayed";

    const stepClass = isCompleted
      ? "milestone-step--completed"
      : isActive
      ? "milestone-step--active"
      : isDelayed
      ? "milestone-step--delayed"
      : "milestone-step--pending";

    const completedAt = isCompleted && m.completed_at
      ? `<span class="milestone-step__date">${formatDate(m.completed_at)}</span>`
      : "";

    // OEM can mark pending/active milestones as completed
   const canUpdate = false;
    const updateBtn = canUpdate
      ? `<button
           class="btn btn--xs btn--outline js-update-milestone"
           data-milestone-id="${m.id}"
           data-current-status="${m.status}"
           aria-label="Update milestone: ${sanitizeHTML(m.milestone_name)}"
         >
           Mark Complete
         </button>`
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
          ${m.notes
            ? `<span class="milestone-step__note">${sanitizeHTML(m.notes)}</span>`
            : ""}
          <div class="milestone-step__actions">${updateBtn}</div>
        </div>
      </div>`;
  }).join("");
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
        <p>No messages yet. Start the conversation with your supplier.</p>
      </div>`;
    return;
  }

  const currentUser = Auth.getCurrentUser();

  chatDiv.innerHTML = messages.map((msg) => {
    // OEM sent = sender_type is "OEM" or sender matches current user
    const isSent = msg.sender_type === "OEM";

    return `
      <div class="chat-msg ${isSent ? "chat-msg--sent" : "chat-msg--received"}">
        <div class="chat-msg__bubble">
          <div class="chat-msg__meta">
            <strong>${sanitizeHTML(msg.sender_name)}</strong>
            <span class="chat-msg__role">${isSent ? "You" : "Supplier"}</span>
          </div>
          <p class="chat-msg__text">${sanitizeHTML(msg.message)}</p>
          <span class="chat-msg__time">${formatRelativeTime(msg.created_at)}</span>
        </div>
      </div>`;
  }).join("");

  if (scrollToBottom) {
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }
};

// =================================================================
// APPEND A SINGLE MESSAGE (optimistic send — no full re-render)
// =================================================================
const appendMessage = (msg) => {
  const chatDiv = el("chatMessages");
  if (!chatDiv) return;

  // Remove empty state if present
  const emptyEl = chatDiv.querySelector(".chat-empty");
  if (emptyEl) emptyEl.remove();

  const isSent = msg.sender_type === "OEM";

  const div = document.createElement("div");
  div.className = `chat-msg ${isSent ? "chat-msg--sent" : "chat-msg--received"}`;
  div.innerHTML = `
    <div class="chat-msg__bubble">
      <div class="chat-msg__meta">
        <strong>${sanitizeHTML(msg.sender_name)}</strong>
        <span class="chat-msg__role">${isSent ? "You" : "Supplier"}</span>
      </div>
      <p class="chat-msg__text">${sanitizeHTML(msg.message)}</p>
      <span class="chat-msg__time">Just now</span>
    </div>`;

  chatDiv.appendChild(div);
  chatDiv.scrollTop = chatDiv.scrollHeight;
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

  State.sending      = true;
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending…"; }

  try {
    const { message: saved } = await API.post(
      `/oem/orders/${ORDER_ID}/messages`,
      { message }
    );

    if (input) input.value = "";

    // Optimistically append — don't wait for the next poll
    const currentUser = Auth.getCurrentUser();
    appendMessage({
      sender_type: "OEM",
      sender_name: saved?.sender_name || currentUser?.company_name || "You",
      message,
      created_at:  new Date().toISOString(),
    });

    // Track last message ID so poll doesn't re-render the same data
    if (saved?.id) State.lastMessageId = saved.id;

  } catch (err) {
    Toast.error(err.message || "Failed to send message.");
  } finally {
    State.sending      = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
  }
};

// =================================================================
// UPDATE MILESTONE
// =================================================================
const updateMilestone = async (milestoneId, btn) => {
  btn.disabled    = true;
  btn.textContent = "Updating…";
  Toast.info("Updating milestone...");

  try {
    const { progress } = await API.put(
  `/supplier/orders/${ORDER_ID}/milestones/${milestoneId}`,
  { status: "completed" }
);

    Toast.success("Milestone marked as complete.");

    // Reload full order to reflect new milestone + progress state
    await loadOrderDetails({ silently: true });

  } catch (err) {
    Toast.error(err.message || err.error || "Failed to update milestone.");
    btn.disabled    = false;
    btn.textContent = "Mark Complete";
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
        <a href="${CONFIG.ROUTES.OEM_ORDERS}" class="btn btn--primary">Back to Orders</a>
      </div>`);
    return;
  }

  if (!silently) {
    // Show skeleton only on first load
    el("orderDetailsContainer")?.classList.add("loading");
  }

  try {
    const data = await API.get(`/oem/orders/${ORDER_ID}`);

    if (!data.order || !Object.keys(data.order).length) {
      setHTML("orderDetailsContainer", `
        <div class="empty-state">
          <p>Order not found.</p>
          <a href="${CONFIG.ROUTES.OEM_ORDERS}" class="btn btn--primary">Back to Orders</a>
        </div>`);
      stopPolling();
      return;
    }

    State.order      = data.order;
    State.milestones = data.milestones     || [];
    const newMsgs    = data.communications || [];

    renderOrderHeader(State.order);
    renderMilestones(State.milestones);

    // Only re-render messages if new ones arrived (check by count + last id)
    const latestId = newMsgs[newMsgs.length - 1]?.id ?? null;
    const hasNew   = newMsgs.length !== State.messages.length ||
                     latestId !== State.lastMessageId;

    if (hasNew) {
      State.messages     = newMsgs;
      State.lastMessageId = latestId;
      renderMessages(State.messages, true);
    }

  } catch (err) {
    if (!silently) {
      Toast.error(err.message || "Failed to load order details.");
    }
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

// Stop polling when tab is hidden, resume when visible
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
  } else {
    loadOrderDetails({ silently: true });
    startPolling();
  }
});

window.addEventListener("pagehide", stopPolling);

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── Send message — button click ───────────────────────────────
  el("sendBtn")?.addEventListener("click", sendMessage);

  // ── Send message — Enter key (Shift+Enter = new line) ─────────
  el("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ── Milestone update — event delegation ───────────────────────
  el("timelineSteps")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-update-milestone");
    if (btn) updateMilestone(btn.dataset.milestoneId, btn);
  });

  // ── Back button ───────────────────────────────────────────────
  el("backBtn")?.addEventListener("click", () => {
    window.location.href = CONFIG.ROUTES.OEM_ORDERS;
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
  setText("companyName", user?.company_name || "OEM");

  bindEvents();
  loadOrderDetails();
  startPolling();
};

document.addEventListener("DOMContentLoaded", init);