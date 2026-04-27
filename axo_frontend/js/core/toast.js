/* =============================================================
   AXO NETWORKS — TOAST NOTIFICATION SYSTEM
   core/toast.js

   Features:
   - 4 types: success / error / warning / info
   - Icon per type (inline SVG — zero external dependency)
   - Click to dismiss
   - Max 5 visible toasts (oldest auto-removed on overflow)
   - CSS injected once into <head> — no inline style spaghetti
   - requestAnimationFrame-based animation (no setTimeout hacks)
   - Accessible: role="alert" + aria-live="polite"
   - Safe DOM removal (guards against double-remove)

   ⚠️  No dependencies. This file imports nothing.
       Load it before any page file that needs feedback UI.
   ============================================================= */

// -----------------------------------------------------------------
// Constants
// -----------------------------------------------------------------
const CONTAINER_ID  = "axo-toast-container";
const TOAST_CLASS   = "axo-toast";
const MAX_TOASTS    = 5;
const DEFAULT_DURATION_MS = 4000;

// -----------------------------------------------------------------
// Icons — inline SVG strings per type
// Keeps this file self-contained. No icon font / image needed.
// -----------------------------------------------------------------
const ICONS = Object.freeze({
  success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
});

const CLOSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

// -----------------------------------------------------------------
// Inject styles — runs once on first import
// Using a <style> tag keeps styles out of every element
// while still being fully JS-contained (no .css file required).
// -----------------------------------------------------------------
const _injectStyles = (() => {
  let injected = false;

  return () => {
    if (injected) return;
    injected = true;

    const style = document.createElement("style");
    style.id = "axo-toast-styles";
    style.textContent = `
      #${CONTAINER_ID} {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 360px;
        width: calc(100vw - 40px);
      }

      .${TOAST_CLASS} {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 8px;
        font-size: 13.5px;
        font-weight: 500;
        line-height: 1.45;
        color: #ffffff;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        pointer-events: all;
        cursor: default;
        border-left: 4px solid rgba(255, 255, 255, 0.35);

        /* Enter state */
        opacity: 0;
        transform: translateX(16px);
        transition: opacity 0.25s ease, transform 0.25s ease;
      }

      .${TOAST_CLASS}.axo-toast--visible {
        opacity: 1;
        transform: translateX(0);
      }

      .${TOAST_CLASS}.axo-toast--hide {
        opacity: 0;
        transform: translateX(16px);
      }

      .${TOAST_CLASS}--success { background: #1a7a4a; }
      .${TOAST_CLASS}--error   { background: #c0392b; }
      .${TOAST_CLASS}--warning { background: #b7760a; }
      .${TOAST_CLASS}--info    { background: #1a5fa8; }

      .axo-toast__icon {
        flex-shrink: 0;
        margin-top: 1px;
        opacity: 0.92;
      }

      .axo-toast__message {
        flex: 1;
        word-break: break-word;
      }

      .axo-toast__close {
        flex-shrink: 0;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        padding: 0;
        margin-top: 1px;
        line-height: 1;
        transition: color 0.15s ease;
      }

      .axo-toast__close:hover {
        color: #ffffff;
      }
    `;

    document.head.appendChild(style);
  };
})();

// -----------------------------------------------------------------
// Internal — get or create container
// -----------------------------------------------------------------
const _getContainer = () => {
  let container = document.getElementById(CONTAINER_ID);

  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "false");
    document.body.appendChild(container);
  }

  return container;
};

// -----------------------------------------------------------------
// Internal — enforce max toast cap
// If we're at the limit, remove the oldest (first child).
// -----------------------------------------------------------------
const _enforceLimit = (container) => {
  while (container.children.length >= MAX_TOASTS) {
    const oldest = container.firstElementChild;
    if (oldest) _removeToast(oldest);
  }
};

// -----------------------------------------------------------------
// Internal — animate out then remove from DOM
// Guards against double-removal if user clicks close
// and the auto-timer fires at the same moment.
// -----------------------------------------------------------------
const _removeToast = (toast) => {
  if (!toast.isConnected) return; // Already removed — do nothing

  toast.classList.remove("axo-toast--visible");
  toast.classList.add("axo-toast--hide");

  toast.addEventListener(
    "transitionend",
    () => {
      if (toast.isConnected) toast.remove();
    },
    { once: true }
  );
};

// -----------------------------------------------------------------
// Core — show(message, type, duration)
// All public helpers call this.
// -----------------------------------------------------------------
const show = (message, type = "success", duration = DEFAULT_DURATION_MS) => {
  // Sanitize type
  const validTypes = ["success", "error", "warning", "info"];
  const safeType   = validTypes.includes(type) ? type : "info";

  // Sanitize message — accept string or Error object
  const safeMessage =
    typeof message === "string"
      ? message
      : message?.message || "Something went wrong.";

  _injectStyles();

  const container = _getContainer();
  _enforceLimit(container);

  // Build toast element
  const toast = document.createElement("div");
  toast.className = `${TOAST_CLASS} ${TOAST_CLASS}--${safeType}`;
  toast.setAttribute("role", "alert");

  toast.innerHTML = `
    <span class="axo-toast__icon">${ICONS[safeType]}</span>
    <span class="axo-toast__message">${safeMessage}</span>
    <button class="axo-toast__close" aria-label="Dismiss notification">
      ${CLOSE_ICON}
    </button>
  `;

  // Click close button
  toast
    .querySelector(".axo-toast__close")
    .addEventListener("click", () => _removeToast(toast), { once: true });

  container.appendChild(toast);

  // Trigger enter animation on next paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("axo-toast--visible");
    });
  });

  // Auto-dismiss
  const timerId = setTimeout(() => _removeToast(toast), duration);

  // If user dismisses manually, cancel the timer
  toast
    .querySelector(".axo-toast__close")
    .addEventListener("click", () => clearTimeout(timerId), { once: true });
};

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------
const Toast = Object.freeze({
  /**
   * Show a toast manually with full control.
   * @param {string|Error} message
   * @param {"success"|"error"|"warning"|"info"} type
   * @param {number} duration  - ms before auto-dismiss
   */
  show,

  /** Positive confirmation — action completed */
  success: (message, duration) => show(message, "success", duration),

  /** Something failed — user needs to act */
  error: (message, duration) => show(message, "error", duration),

  /** Non-blocking caution */
  warning: (message, duration) => show(message, "warning", duration),

  /** Neutral information */
  info: (message, duration) => show(message, "info", duration),
});

export default Toast;