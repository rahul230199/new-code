/* =============================================================
   AXO NETWORKS — LOGIN PAGE
   pages/auth/login.js

   Flow:
   1. If already authenticated → redirect to role home (guardLoginPage)
   2. User submits form → POST /auth/login
   3a. forcePasswordChange = true  → Auth.redirectAfterLogin() → change-password
   3b. Normal login                → Auth.redirectAfterLogin() → role dashboard

   Dependencies (load order in HTML):
   <script type="module" src="../../js/pages/auth/login.js">
   ============================================================= */

import Router from "../../core/router.js";
import API    from "../../core/api.js";
import Auth   from "../../core/auth.js";
import Toast  from "../../core/toast.js";

// -----------------------------------------------------------------
// Guard — redirect away if already logged in
// -----------------------------------------------------------------
if (!Router.guardLoginPage()) {
  // guardLoginPage() already redirected — stop all execution
  throw new Error("REDIRECT");
}

// -----------------------------------------------------------------
// DOM refs — resolved once on load, used across handlers
// -----------------------------------------------------------------
const DOM = {
  form:        () => document.getElementById("loginForm"),
  email:       () => document.getElementById("email"),
  password:    () => document.getElementById("password"),
  submitBtn:   () => document.getElementById("loginBtn"),
  submitLabel: () => document.getElementById("loginBtnText"),
  togglePwd:   () => document.getElementById("togglePassword"),
};

// -----------------------------------------------------------------
// Validation
// -----------------------------------------------------------------
const Validators = {
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  required: (value) => value.trim().length > 0,
};

const validate = (email, password) => {
  if (!Validators.required(email)) {
    return "Email address is required.";
  }
  if (!Validators.email(email)) {
    return "Please enter a valid email address.";
  }
  if (!Validators.required(password)) {
    return "Password is required.";
  }
  return null; // null = valid
};

// -----------------------------------------------------------------
// UI State — loading
// -----------------------------------------------------------------
const setLoading = (isLoading) => {
  const btn   = DOM.submitBtn();
  const label = DOM.submitLabel();
  if (!btn || !label) return;

  btn.disabled = isLoading;

  label.innerHTML = isLoading
    ? `<span class="btn-spinner" aria-hidden="true"></span> Signing in…`
    : "Sign In";
};

// -----------------------------------------------------------------
// Submit Handler
// -----------------------------------------------------------------
const handleSubmit = async (e) => {
  e.preventDefault();

  const email    = DOM.email()?.value.trim()    ?? "";
  const password = DOM.password()?.value.trim() ?? "";

  // Client-side validation before hitting the network
  const validationError = validate(email, password);
  if (validationError) {
    Toast.warning(validationError);
    return;
  }

  setLoading(true);

  try {
    // POST /api/auth/login
    const response = await API.post("/auth/login", { email, password });

    // Defensive — backend should always return token + user on success
    if (!response?.token || !response?.user) {
      throw new Error("Unexpected server response. Please try again.");
    }

    const { token, user, forcePasswordChange = false } = response;

    // Persist session
    // Store forcePasswordChange on the user object so router.js
    // can enforce it on every subsequent page load
    Auth.saveSession(token, { ...user, forcePasswordChange });

    // Redirect — change-password if forced, else role dashboard
    Auth.redirectAfterLogin(forcePasswordChange, user.role);

  } catch (err) {
    // ApiError from api.js — status is always set
    if (err.status === 401) {
      Toast.error("Invalid email or password.");
    } else if (err.status === 403) {
      Toast.error("Your account has been deactivated. Please contact support.");
    } else {
      Toast.error(err.message || "Unable to sign in. Please try again.");
    }
  } finally {
    setLoading(false);
  }
};

// -----------------------------------------------------------------
// Password Visibility Toggle
// -----------------------------------------------------------------
const handleTogglePassword = () => {
  const pwdInput = DOM.password();
  const toggleBtn = DOM.togglePwd();
  if (!pwdInput || !toggleBtn) return;

  const isHidden = pwdInput.type === "password";
  pwdInput.type  = isHidden ? "text" : "password";

  // Update aria label for screen readers
  toggleBtn.setAttribute(
    "aria-label",
    isHidden ? "Hide password" : "Show password"
  );

  // Swap icon — expects two child elements: .icon-show and .icon-hide
  toggleBtn.querySelector(".icon-show")?.classList.toggle("hidden", isHidden);
  toggleBtn.querySelector(".icon-hide")?.classList.toggle("hidden", !isHidden);
};

// -----------------------------------------------------------------
// Init
// -----------------------------------------------------------------
const init = () => {
  const form      = DOM.form();
  const toggleBtn = DOM.togglePwd();

  if (!form) return;

  form.addEventListener("submit", handleSubmit);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", handleTogglePassword);
  }
};

document.addEventListener("DOMContentLoaded", init);