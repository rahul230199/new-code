/* =============================================================
   AXO NETWORKS — SUPPLIER ORDER DETAILS
   js/pages/supplier/order-details.js

   Features:
   - Order header, stats row, info cards
   - Milestone tracker: modal with notes + optional photo upload
   - Message thread with 30 s poll (paused when tab hidden)
   - Optimistic message append (no full re-render on send)

   Backend endpoints:
     GET  /api/supplier/orders/:id
          → { order, communications, milestones }
     PUT  /api/supplier/orders/:orderId/milestones/:milestoneId
          Body: { status, notes }  → { success, progress }
     POST /api/supplier/orders/:orderId/milestones/:milestoneId/photo
          multipart: photo  → { success, photo_url }
     POST /api/supplier/orders/:id/messages
          Body: { message }  → { success, message }
   ============================================================= */

import Router from '../../core/router.js';
import API    from '../../core/api.js';
import Auth   from '../../core/auth.js';
import Toast  from '../../core/toast.js';
import CONFIG from '../../core/config.js';
import {
  sanitizeHTML,
  formatDate,
  formatCurrency,
  formatRelativeTime,
  formatStatus,
  getStatusClass,
  getQueryParam,
} from '../../core/utils.js';

// ── guard ─────────────────────────────────────────────────────────
if (!Router.guardPage(['supplier', 'both', 'admin'])) throw new Error('REDIRECT');

// ── order id from URL ─────────────────────────────────────────────
const ORDER_ID = getQueryParam('id');

// =================================================================
// STATE
// =================================================================
const State = {
  order:         null,
  milestones:    [],
  messages:      [],
  lastMessageId: null,
  pollTimer:     null,
  sending:       false,
  // milestone modal
  modal: {
    milestoneId:   null,
    milestoneName: '',
    targetStatus:  '',
    uploading:     false,
  },
  POLL_MS: 30_000,
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = id       => document.getElementById(id);
const setText = (id, v) => { const n = el(id); if (n) n.textContent = v; };
const setHTML = (id, v) => { const n = el(id); if (n) n.innerHTML   = v; };
const show    = id       => { const n = el(id); if (n) n.style.display = ''; };
const hide    = id       => { const n = el(id); if (n) n.style.display = 'none'; };

// =================================================================
// RENDER — ORDER HEADER + INFO
// =================================================================
const renderOrderHeader = order => {
  const statusClass = getStatusClass(order.status);

  setText('poNumber',      order.po_number    || `PO-${order.id}`);
  setText('oemName',       order.oem_name     || '—');
  setText('orderDate',     formatDate(order.created_at));
  setText('orderValue',    formatCurrency(order.total_value || 0, order.currency || 'USD'));
  setText('orderQuantity', `${order.quantity ?? '—'} ${order.unit || 'units'}`);
  setText('partName',      order.part_name    || '—');
  setText('paymentTerms',  order.payment_terms|| 'Net 30');

  const statusEl = el('orderStatus');
  if (statusEl) {
    statusEl.textContent = formatStatus(order.status);
    statusEl.className   = `badge badge--${statusClass}`;
  }
};

// =================================================================
// RENDER — MILESTONE TRACKER
// =================================================================
const renderMilestones = milestones => {
  const container = el('timelineSteps');
  if (!container) return;

  const completedCount = milestones.filter(m => m.status === 'completed').length;
  const total          = milestones.length;
  const progress       = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const bar = el('progressBarFill');
  if (bar) bar.style.width = `${progress}%`;
  setText('progressText', `${progress}% Complete`);

  if (!milestones.length) {
    container.innerHTML = '<p class="text-muted">No milestones found.</p>';
    return;
  }

  container.innerHTML = milestones.map((m, idx) => {
    const isCompleted  = m.status === 'completed';
    const isInProgress = m.status === 'in_progress';
    const isDelayed    = m.status === 'delayed';
    const isActive     = !isCompleted && idx === completedCount;

    const stepClass = isCompleted
      ? 'milestone-step--completed'
      : isInProgress
      ? 'milestone-step--in-progress'
      : isDelayed
      ? 'milestone-step--delayed'
      : isActive
      ? 'milestone-step--active'
      : 'milestone-step--pending';

    const dateStr = isCompleted && m.completed_at
      ? `<span class="milestone-step__date">${formatDate(m.completed_at)}</span>`
      : '';

    const noteStr = m.notes
      ? `<span class="milestone-step__note">"${sanitizeHTML(m.notes)}"</span>`
      : '';

    const photoStr = m.photo_url
      ? `<a
           class="milestone-step__photo-link"
           href="${sanitizeHTML(m.photo_url)}"
           target="_blank"
           rel="noopener noreferrer"
           aria-label="View milestone photo"
         >
           <img
             class="milestone-step__photo"
             src="${sanitizeHTML(m.photo_url)}"
             alt="Milestone photo"
             loading="lazy"
           />
         </a>`
      : '';

    const inProgressBadge = isInProgress
      ? '<span class="milestone-step__status-label">In Progress</span>'
      : '';

    const delayedBadge = isDelayed
      ? '<span class="milestone-step__status-label milestone-step__status-label--delayed">Delayed</span>'
      : '';

    // Buttons: show for non-completed milestones
    let controls = '';
    if (!isCompleted) {
      controls = `
        <div class="milestone-step__actions">
          <button
            class="btn btn--xs btn--success js-milestone-action"
            data-milestone-id="${m.id}"
            data-milestone-name="${sanitizeHTML(m.milestone_name)}"
            data-target-status="completed"
          >
            <i class="fas fa-check" aria-hidden="true"></i> Mark Complete
          </button>
          ${!isInProgress ? `
          <button
            class="btn btn--xs btn--outline js-milestone-action"
            data-milestone-id="${m.id}"
            data-milestone-name="${sanitizeHTML(m.milestone_name)}"
            data-target-status="in_progress"
          >
            <i class="fas fa-spinner" aria-hidden="true"></i> Mark In Progress
          </button>` : ''}
          ${!isDelayed ? `
          <button
            class="btn btn--xs btn--danger-outline js-milestone-action"
            data-milestone-id="${m.id}"
            data-milestone-name="${sanitizeHTML(m.milestone_name)}"
            data-target-status="delayed"
          >
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i> Mark Delayed
          </button>` : ''}
        </div>`;
    }

    return `
      <div class="milestone-step ${stepClass}" data-id="${m.id}">
        <div class="milestone-step__indicator" aria-hidden="true">
          <span class="milestone-step__dot"></span>
          ${idx < milestones.length - 1
            ? '<span class="milestone-step__connector"></span>'
            : ''}
        </div>
        <div class="milestone-step__body">
          <span class="milestone-step__name">${sanitizeHTML(m.milestone_name)}</span>
          ${dateStr}
          ${inProgressBadge}
          ${delayedBadge}
          ${noteStr}
          ${photoStr}
          ${controls}
        </div>
      </div>`;
  }).join('');

  if (completedCount === total && total > 0) {
    const doneDiv = document.createElement('div');
    doneDiv.className = 'milestone-all-done';
    doneDiv.innerHTML = '<i class="fas fa-trophy"></i> All milestones completed!';
    container.appendChild(doneDiv);
  }
};

// =================================================================
// MILESTONE MODAL
// =================================================================
const openMilestoneModal = (milestoneId, milestoneName, targetStatus) => {
  State.modal.milestoneId   = milestoneId;
  State.modal.milestoneName = milestoneName;
  State.modal.targetStatus  = targetStatus;

  // Set modal title
  const labels = {
    completed:   'Mark Complete',
    in_progress: 'Mark In Progress',
    delayed:     'Mark Delayed',
  };
  setText('milestoneModalTitle', `${labels[targetStatus] || 'Update'}: ${milestoneName}`);

  // Reset form
  el('milestoneNotes').value = '';
  const photoInput = el('milestonePhoto');
  if (photoInput) photoInput.value = '';
  el('milestonePhotoPreview')?.classList.add('hidden');
  el('milestonePhotoPreviewImg')?.setAttribute('src', '');

  // Set status badge
  const badgeEl = el('milestoneStatusBadge');
  if (badgeEl) {
    const badgeMap = {
      completed:   ['badge--success',  'Completed'],
      in_progress: ['badge--warning',  'In Progress'],
      delayed:     ['badge--danger',   'Delayed'],
    };
    const [cls, label] = badgeMap[targetStatus] || ['badge--neutral', targetStatus];
    badgeEl.className   = `badge ${cls}`;
    badgeEl.textContent = label;
  }

  show('milestoneModal');
  el('milestoneNotes')?.focus();
};

const closeMilestoneModal = () => {
  hide('milestoneModal');
  State.modal.milestoneId   = null;
  State.modal.milestoneName = '';
  State.modal.targetStatus  = '';
};

// =================================================================
// SUBMIT MILESTONE UPDATE
// =================================================================
const submitMilestoneUpdate = async () => {
  const { milestoneId, milestoneName, targetStatus } = State.modal;
  if (!milestoneId || !targetStatus) return;

  const notes        = el('milestoneNotes')?.value.trim() || '';
  const photoInput   = el('milestonePhoto');
  const photoFile    = photoInput?.files?.[0] || null;
  const submitBtn    = el('milestoneSubmitBtn');

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

  try {
    // 1 — update status + notes (JSON PUT)
    const { progress } = await API.put(
      `/supplier/orders/${ORDER_ID}/milestones/${milestoneId}`,
      { status: targetStatus, notes }
    );

    // 2 — upload photo if provided (multipart POST)
    if (photoFile) {
      try {
        const fd = new FormData();
        fd.append('photo', photoFile);
        // Use raw fetch (FormData incompatible with JSON API wrapper)
        const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
        const res   = await fetch(
          `/api/supplier/orders/${ORDER_ID}/milestones/${milestoneId}/photo`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          Toast.warning(err.error || 'Photo upload failed — milestone status was saved.');
        }
      } catch (_) {
        Toast.warning('Photo upload failed — milestone status was saved.');
      }
    }

    Toast.success(`"${milestoneName}" marked as ${targetStatus.replace('_', ' ')}.`);
    closeMilestoneModal();

    // Reload silently to sync state
    await loadOrderDetails({ silently: true });

  } catch (err) {
    Toast.error(err.message || 'Failed to update milestone.');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save Update'; }
  }
};

// =================================================================
// RENDER — MESSAGE THREAD
// =================================================================
const renderMessages = (messages, scrollToBottom = false) => {
  const chatDiv = el('chatMessages');
  if (!chatDiv) return;

  if (!messages.length) {
    chatDiv.innerHTML = `
      <div class="chat-empty">
        <i class="fas fa-comments" aria-hidden="true"></i>
        <p>No messages yet. Start the conversation with your buyer.</p>
      </div>`;
    return;
  }

  chatDiv.innerHTML = messages.map(msg => {
    const isSent = msg.sender_type === 'Supplier';
    return `
      <div class="chat-msg ${isSent ? 'chat-msg--sent' : 'chat-msg--received'}">
        <div class="chat-msg__bubble">
          <div class="chat-msg__meta">
            <strong>${sanitizeHTML(msg.sender_name)}</strong>
            <span class="chat-msg__role">${isSent ? 'You' : 'Buyer'}</span>
          </div>
          <p class="chat-msg__text">${sanitizeHTML(msg.message)}</p>
          <span class="chat-msg__time">${formatRelativeTime(msg.created_at)}</span>
        </div>
      </div>`;
  }).join('');

  if (scrollToBottom) chatDiv.scrollTop = chatDiv.scrollHeight;
};

const appendMessage = msg => {
  const chatDiv = el('chatMessages');
  if (!chatDiv) return;

  chatDiv.querySelector('.chat-empty')?.remove();

  const isSent = msg.sender_type === 'Supplier';
  const div    = document.createElement('div');
  div.className = `chat-msg ${isSent ? 'chat-msg--sent' : 'chat-msg--received'}`;
  div.innerHTML = `
    <div class="chat-msg__bubble">
      <div class="chat-msg__meta">
        <strong>${sanitizeHTML(msg.sender_name)}</strong>
        <span class="chat-msg__role">${isSent ? 'You' : 'Buyer'}</span>
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

  const input   = el('messageInput');
  const sendBtn = el('sendBtn');
  const message = input?.value.trim() ?? '';

  if (!message) {
    Toast.warning('Please type a message before sending.');
    return;
  }

  State.sending = true;
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

  try {
    const { message: saved } = await API.post(
      `/supplier/orders/${ORDER_ID}/messages`,
      { message }
    );

    if (input) input.value = '';

    const user = Auth.getCurrentUser();
    appendMessage({
      sender_type: 'Supplier',
      sender_name: saved?.sender_name || user?.company_name || 'You',
      message,
      created_at:  new Date().toISOString(),
    });

    if (saved?.id) State.lastMessageId = saved.id;

  } catch (err) {
    Toast.error(err.message || 'Failed to send message. Please try again.');
  } finally {
    State.sending = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
    input?.focus();
  }
};

// =================================================================
// LOAD ORDER DETAILS
// =================================================================
const loadOrderDetails = async ({ silently = false } = {}) => {
  if (!ORDER_ID) {
    setHTML('orderDetailsContainer', `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle empty-state__icon"></i>
        <p>No order ID found in URL.</p>
        <a href="${CONFIG.ROUTES.SUPPLIER_ORDERS}" class="btn btn--primary">Back to Orders</a>
      </div>`);
    return;
  }

  if (!silently) el('orderDetailsContainer')?.classList.add('loading');

  try {
    const data = await API.get(`/supplier/orders/${ORDER_ID}`);

    if (!data.order || !Object.keys(data.order).length) {
      setHTML('orderDetailsContainer', `
        <div class="empty-state">
          <i class="fas fa-inbox empty-state__icon"></i>
          <p>Order not found or you do not have access.</p>
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

    // Only re-render chat if something new arrived
    const latestId = newMsgs.at(-1)?.id ?? null;
    const hasNew   = newMsgs.length !== State.messages.length
                  || latestId !== State.lastMessageId;

    if (hasNew) {
      State.messages      = newMsgs;
      State.lastMessageId = latestId;
      renderMessages(State.messages, true);
    }

  } catch (err) {
    if (!silently) Toast.error(err.message || 'Failed to load order details.');
  } finally {
    el('orderDetailsContainer')?.classList.remove('loading');
  }
};

// =================================================================
// POLLING
// =================================================================
const startPolling = () => {
  if (State.pollTimer) return;
  State.pollTimer = setInterval(() => loadOrderDetails({ silently: true }), State.POLL_MS);
};

const stopPolling = () => {
  clearInterval(State.pollTimer);
  State.pollTimer = null;
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPolling();
  else { loadOrderDetails({ silently: true }); startPolling(); }
});

window.addEventListener('pagehide', stopPolling);

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── Milestone action buttons (delegated) ──────────────────────
  el('timelineSteps')?.addEventListener('click', e => {
    const btn = e.target.closest('.js-milestone-action');
    if (!btn) return;
    openMilestoneModal(
      btn.dataset.milestoneId,
      btn.dataset.milestoneName,
      btn.dataset.targetStatus
    );
  });

  // ── Milestone modal submit ────────────────────────────────────
  el('milestoneSubmitBtn')?.addEventListener('click', submitMilestoneUpdate);

  // ── Milestone modal close ─────────────────────────────────────
  document.querySelectorAll('.js-close-milestone-modal').forEach(btn => {
    btn.addEventListener('click', closeMilestoneModal);
  });
  el('milestoneModal')?.addEventListener('click', e => {
    if (e.target === el('milestoneModal')) closeMilestoneModal();
  });

  // ── Photo preview ─────────────────────────────────────────────
  el('milestonePhoto')?.addEventListener('change', e => {
    const file    = e.target.files?.[0];
    const preview = el('milestonePhotoPreview');
    const img     = el('milestonePhotoPreviewImg');
    if (!file || !preview || !img) return;

    if (!file.type.startsWith('image/')) {
      Toast.warning('Please select an image file.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      Toast.warning('Photo must be smaller than 5 MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      img.src = ev.target.result;
      preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  // ── Remove photo preview ──────────────────────────────────────
  el('milestonePhotoRemove')?.addEventListener('click', () => {
    const photoInput = el('milestonePhoto');
    if (photoInput) photoInput.value = '';
    el('milestonePhotoPreviewImg')?.setAttribute('src', '');
    el('milestonePhotoPreview')?.classList.add('hidden');
  });

  // ── Escape key closes milestone modal ─────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMilestoneModal();
  });

  // ── Chat: send button + Enter ────────────────────────────────
  el('sendBtn')?.addEventListener('click', sendMessage);
  el('messageInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // ── Back button ───────────────────────────────────────────────
  el('backBtn')?.addEventListener('click', () => {
    window.location.href = CONFIG.ROUTES.SUPPLIER_ORDERS;
  });

  // ── Sidebar / auth ────────────────────────────────────────────
  el('logoutBtn')?.addEventListener('click',  () => Auth.logout());
  el('menuToggle')?.addEventListener('click', () => {
    el('sidebar')?.classList.toggle('open');
  });
};

// =================================================================
// INIT
// =================================================================
const init = () => {
  const user = Auth.getCurrentUser();
  setText('companyName', user?.company_name || 'Supplier');

  bindEvents();
  loadOrderDetails();
  startPolling();
};

document.addEventListener('DOMContentLoaded', init);
