/* =========================================================
   AXO NETWORKS — CHANGE PASSWORD PAGE
   Enterprise Secure Version
   Fully Aligned With Backend (newPassword)
========================================================= */

import { RouteGuard } from "../guards/routeGuard.js";
import { AuthManager } from "../core/authManager.js";
import { ApiClient } from "../core/apiClient.js";
import { StorageManager } from "../core/storage.js";

/* =========================================================
   INITIALIZE PAGE
========================================================= */
function initializePage() {

  const allowed = RouteGuard.protect({
    requireAuth: true
  });

  if (allowed === false) return;

  const user = AuthManager.getCurrentUser();

  if (!user) {
    window.location.href = "/login";
    return;
  }

  // Block access if password change not required
  if (user.must_change_password !== true) {
    redirectByRole(user.role);
    return;
  }

  bindForm();
}

/* =========================================================
   BIND FORM
========================================================= */
function bindForm() {
  const form = document.getElementById("changePasswordForm");
  if (!form) return;

  form.addEventListener("submit", handleSubmit);
}

/* =========================================================
   HANDLE SUBMIT
========================================================= */
async function handleSubmit(e) {

  e.preventDefault();
  clearMessage();

  const newPassword = getValue("newPassword");
  const confirmPassword = getValue("confirmPassword");

  if (!newPassword || newPassword.length < 8) {
    return showMessage("Password must be at least 8 characters.");
  }

  if (newPassword !== confirmPassword) {
    return showMessage("Passwords do not match.");
  }

  setLoading(true);

  try {

    // ✅ FIXED: Correct field name expected by backend
    const response = await ApiClient.post("/auth/change-password", {
      newPassword: newPassword
    });

    if (!response.success) {
      throw new Error(response.message || "Password update failed.");
    }

    showMessage(
      "Password updated successfully. Please login again.",
      "success"
    );

    // Clear session (old token invalid after password change)
    StorageManager.clearSession();
    sessionStorage.removeItem("force_password_change");

    setTimeout(() => {
      window.location.href = "/login";
    }, 1200);

  } catch (error) {

    console.error("Change Password Error:", error);

    if (error.status === 401) {
      showMessage("Session expired. Please login again.");
    } else if (error.status === 403) {
      showMessage("You are not authorized to perform this action.");
    } else {
      showMessage(error.message || "Unable to update password.");
    }

  } finally {
    setLoading(false);
  }
}

/* =========================================================
   ROLE REDIRECT
========================================================= */
function redirectByRole(role) {

  switch (role) {

    case "admin":
    case "super_admin":
      window.location.href = "/admin-dashboard";
      break;

    case "buyer":
      window.location.href = "/buyer-dashboard";
      break;

    case "supplier":
      window.location.href = "/supplier";
      break;

    default:
      window.location.href = "/login";
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
  const btn = document.getElementById("changeBtn");
  const btnText = document.getElementById("changeBtnText");

  if (!btn || !btnText) return;

  btn.disabled = isLoading;

  btnText.innerHTML = isLoading
    ? `<span class="spinner"></span> Updating...`
    : "Update Password";
}

function getValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

/* =========================================================
   BOOTSTRAP
========================================================= */
document.addEventListener("DOMContentLoaded", initializePage);
