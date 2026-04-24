/* =========================================================
   AXO NETWORKS — LOGIN PAGE CONTROLLER
   Enterprise Secure Version
   History-Safe · No Auto Logout · Clean Redirect
========================================================= */

import { AuthManager } from "../core/authManager.js";
import { StorageManager } from "../core/storage.js";

/* =========================================================
   INITIALIZE LOGIN PAGE
========================================================= */
function initializeLoginPage() {

  // 🔥 DO NOT auto-clear session here
  // If user is already authenticated, redirect immediately

  const existingToken = StorageManager.getToken();
  const existingUser = StorageManager.getUser();

  if (existingToken && existingUser) {
    const redirectUrl = AuthManager.getDefaultRouteByRole(existingUser.role);
    window.location.replace(redirectUrl);
    return;
  }

  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", handleLoginSubmit);
}

/* =========================================================
   LOGIN SUBMIT HANDLER
========================================================= */
async function handleLoginSubmit(event) {

  event.preventDefault();
  clearMessage();

  const email = getValue("email");
  const password = getValue("password");

  if (!validateEmail(email)) {
    return showMessage("Please enter a valid email address.");
  }

  if (!password) {
    return showMessage("Password is required.");
  }

  setLoading(true);

  try {

    const result = await AuthManager.login(email, password);

    const token = StorageManager.getToken();
    const user = StorageManager.getUser();

    if (!token || !user) {
      throw new Error("Authentication failed. Please try again.");
    }

    /* ================================================
       FORCE PASSWORD CHANGE FLOW
    ================================================= */
    if (result.mustChangePassword === true) {

      sessionStorage.setItem("force_password_change", "true");

      window.location.replace("/change-password");
      return;
    }

    // 🔥 CRITICAL FIX — use replace, not href
    window.location.replace(result.redirectUrl);

  } catch (error) {

    console.error("Login Error:", error);

    if (error.status === 401) {
      showMessage("Invalid email or password.");
    } else if (error.status === 403) {
      showMessage("Account access restricted.");
    } else {
      showMessage(error.message || "Unable to sign in.");
    }

  } finally {
    setLoading(false);
  }
}

/* =========================================================
   UI HELPERS
========================================================= */

function showMessage(message, type = "error") {
  const status = document.getElementById("status");
  if (!status) return;

  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = "block";
}

function clearMessage() {
  const status = document.getElementById("status");
  if (!status) return;

  status.textContent = "";
  status.style.display = "none";
}

function setLoading(isLoading) {
  const btn = document.getElementById("loginBtn");
  const btnText = document.getElementById("loginBtnText");

  if (!btn || !btnText) return;

  btn.disabled = isLoading;
  btnText.innerHTML = isLoading
    ? `<span class="spinner"></span> Signing in...`
    : "Sign In";
}

function getValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

document.addEventListener("DOMContentLoaded", initializeLoginPage);