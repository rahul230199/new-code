/* =============================================================
   AXO NETWORKS — CHANGE PASSWORD PAGE
   pages/auth/change-password.js

   Handles two scenarios:

   A) Forced change (first login with temp password)
      - forcePasswordChange = true on the user object
      - Backend does NOT require currentPassword
      - Only newPassword sent

   B) Voluntary change (user changes their own password)
      - forcePasswordChange = false
      - Backend REQUIRES currentPassword
      - currentPassword + newPassword sent

   After success:
   - Clear forcePasswordChange flag from stored user
   - Redirect to role dashboard (token stays valid)

   Dependencies:
   <script type="module" src="../../js/pages/auth/change-password.js">
   ============================================================= */

import Router from "../../core/router.js";
import API    from "../../core/api.js";
import Auth   from "../../core/auth.js";
import Toast  from "../../core/toast.js";
import CONFIG from "../../core/config.js";

// -----------------------------------------------------------------
// Guard — must be authenticated to access this page
// -----------------------------------------------------------------
if (!Router.guardPage()) {
  throw new Error("REDIRECT");
}

// -----------------------------------------------------------------
// Determine which scenario we're in
// -----------------------------------------------------------------
const _user            = Auth.getCurrentUser();
const _isForced        = _user?.forcePasswordChange === true;

// -----------------------------------------------------------------
// DOM refs
// -----------------------------------------------------------------
const DOM = {
  form:             () => document.getElementById("changePasswordForm"),
  currentPwdRow:    () => document.getElementById("currentPasswordRow"),
  currentPwd:       () => document.getElementById("currentPassword"),
  newPwd:           () => document.getElementById("newPassword"),
  confirmPwd:       () => document.getElementById("confirmPassword"),
  submitBtn:        () => document.getElementById("changeBtn"),
  submitLabel:      () => document.getElementById("changeBtnText"),
  strengthBar:      () => document.getElementById("strengthBar"),
  strengthLabel:    () => document.getElementById("strengthLabel"),
  toggleNew:        () => document.getElementById("toggleNewPassword"),
  toggleConfirm:    () => document.getElementById("toggleConfirmPassword"),
  pageTitle:        () => document.getElementById("pageTitle"),
  pageSubtitle:     () => document.getElementById("pageSubtitle"),
};

// -----------------------------------------------------------------
// Password strength scoring
// Returns { score: 0-4, label, colorClass }
// -----------------------------------------------------------------
const _getStrength = (password) => {
  if (!password) return { score: 0, label: "", colorClass: "" };

  let score = 0;
  if (password.length >= 8)                    score++;
  if (password.length >= 12)                   score++;
  if (/[A-Z]/.test(password))                  score++;
  if (/[0-9]/.test(password))                  score++;
  if (/[^A-Za-z0-9]/.test(password))           score++;

  const levels = [
    { score: 0, label: "",          colorClass: "" },
    { score: 1, label: "Weak",      colorClass: "strength--weak" },
    { score: 2, label: "Fair",      colorClass: "strength--fair" },
    { score: 3, label: "Good",      colorClass: "strength--good" },
    { score: 4, label: "Strong",    colorClass: "strength--strong" },
    { score: 5, label: "Very Strong", colorClass: "strength--very-strong" },
  ];

  return levels[Math.min(score, 5)];
};

// -----------------------------------------------------------------
// Update strength indicator UI
// -----------------------------------------------------------------
const _updateStrengthUI = (password) => {
  const bar   = DOM.strengthBar();
  const label = DOM.strengthLabel();
  if (!bar || !label) return;

  const { score, label: strengthText, colorClass } = _getStrength(password);

  // Remove all modifier classes, set new one
  bar.className = "strength-bar";
  if (colorClass) bar.classList.add(colorClass);
  bar.style.width = `${(score / 5) * 100}%`;

  label.textContent = strengthText;
};

// -----------------------------------------------------------------
// Validation
// -----------------------------------------------------------------
const _validate = (currentPwd, newPwd, confirmPwd) => {
  if (!_isForced && !currentPwd.trim()) {
    return "Current password is required.";
  }

  if (!newPwd || newPwd.length < 8) {
    return "New password must be at least 8 characters.";
  }

  if (newPwd !== confirmPwd) {
    return "Passwords do not match.";
  }

  if (!_isForced && newPwd === currentPwd) {
    return "New password must be different from your current password.";
  }

  return null; // valid
};

// -----------------------------------------------------------------
// UI — loading state
// -----------------------------------------------------------------
const _setLoading = (isLoading) => {
  const btn   = DOM.submitBtn();
  const label = DOM.submitLabel();
  if (!btn || !label) return;

  btn.disabled = isLoading;
  label.innerHTML = isLoading
    ? `<span class="btn-spinner" aria-hidden="true"></span> Updating…`
    : "Update Password";
};

// -----------------------------------------------------------------
// Password visibility toggle
// -----------------------------------------------------------------
const _makeToggle = (inputId, btnEl) => {
  if (!btnEl) return;

  btnEl.addEventListener("click", () => {
    const input = document.getElementById(inputId);
    if (!input) return;

    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";

    btnEl.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    btnEl.querySelector(".icon-show")?.classList.toggle("hidden", isHidden);
    btnEl.querySelector(".icon-hide")?.classList.toggle("hidden", !isHidden);
  });
};

// -----------------------------------------------------------------
// Submit handler
// -----------------------------------------------------------------
const _handleSubmit = async (e) => {
  e.preventDefault();

  const currentPwd = DOM.currentPwd()?.value ?? "";
  const newPwd     = DOM.newPwd()?.value     ?? "";
  const confirmPwd = DOM.confirmPwd()?.value ?? "";

  const error = _validate(currentPwd, newPwd, confirmPwd);
  if (error) {
    Toast.warning(error);
    return;
  }

  _setLoading(true);

  try {
    // Build payload — only include currentPassword if not forced change
    const payload = _isForced
      ? { newPassword: newPwd }
      : { currentPassword: currentPwd, newPassword: newPwd };

    // POST /api/auth/change-password
    await API.post("/auth/change-password", payload);

    // Clear forcePasswordChange flag from stored user so router
    // no longer blocks them on every page load
    const updatedUser = { ..._user, forcePasswordChange: false };
    Auth.saveSession(Auth.getToken(), updatedUser);

    Toast.success("Password updated successfully.");

    // Redirect to their dashboard — token is still valid
    setTimeout(() => {
      Auth.redirectToHome();
    }, 1000);

  } catch (err) {
    if (err.status === 401) {
      Toast.error("Current password is incorrect.");
    } else if (err.status === 403) {
      Toast.error("Session expired. Please sign in again.");
      Auth.logout();
    } else {
      Toast.error(err.message || "Unable to update password. Please try again.");
    }
  } finally {
    _setLoading(false);
  }
};

// -----------------------------------------------------------------
// Page setup — show/hide fields based on forced vs voluntary
// -----------------------------------------------------------------
const _setupPageMode = () => {
  const title    = DOM.pageTitle();
  const subtitle = DOM.pageSubtitle();
  const row      = DOM.currentPwdRow();

  if (_isForced) {
    // Forced: hide current password field, show onboarding copy
    if (title)    title.textContent    = "Set Your Password";
    if (subtitle) subtitle.textContent = "Your account was created with a temporary password. Please set a permanent one to continue.";
    if (row)      row.style.display    = "none";
  } else {
    // Voluntary: show current password field
    if (title)    title.textContent    = "Change Password";
    if (subtitle) subtitle.textContent = "Update your account password below.";
    if (row)      row.style.display    = "";
  }
};

// -----------------------------------------------------------------
// Init
// -----------------------------------------------------------------
const init = () => {
  _setupPageMode();

  const form = DOM.form();
  if (!form) return;

  form.addEventListener("submit", _handleSubmit);

  // Strength meter on new password input
  DOM.newPwd()?.addEventListener("input", (e) => {
    _updateStrengthUI(e.target.value);
  });

  // Password visibility toggles
  _makeToggle("currentPassword", DOM.toggleNew());
  _makeToggle("newPassword",     DOM.toggleNew());
  _makeToggle("confirmPassword", DOM.toggleConfirm());
};

document.addEventListener("DOMContentLoaded", init);