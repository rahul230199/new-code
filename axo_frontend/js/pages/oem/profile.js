/* =============================================================
   AXO NETWORKS — OEM PROFILE
   pages/oem/profile.js

   Features:
   - View profile (company name, email, phone, website, city, country)
   - Edit profile (inline form — view/edit mode toggle)
   - Change password (separate section)

   Backend endpoints used:
     GET /api/oem/profile
       → { profile: { id, email, company_name, phone, website, city, country } }
     PUT /api/oem/profile
       → { success }
       Accepted fields: phone, website, city, country

   Note: company_name and email are set at account creation and
   cannot be changed via this endpoint. They are displayed read-only.
   ============================================================= */

import Router  from "../../core/router.js";
import API     from "../../core/api.js";
import Auth    from "../../core/auth.js";
import Toast   from "../../core/toast.js";
import {
  sanitizeHTML,
  getInitials,
} from "../../core/utils.js";

// -----------------------------------------------------------------
// Guard
// -----------------------------------------------------------------
if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

// =================================================================
// STATE
// =================================================================
const State = {
  profile: null,    // raw profile object from API
  mode:    "view",  // "view" | "edit"
};

// =================================================================
// DOM HELPERS
// =================================================================
const el      = (id)       => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setVal  = (id, val)  => { const n = el(id); if (n) n.value       = val ?? ""; };

// Toggle view / edit panels via CSS class on wrapper
const _setMode = (mode) => {
  State.mode = mode;
  el("profileWrapper")?.setAttribute("data-mode", mode);
};

// =================================================================
// RENDER — VIEW MODE
// =================================================================
const renderView = (profile) => {
  const initials = getInitials(profile.company_name);

  // Avatar
  setText("avatarInitials", initials);

  // Header
  setText("profileCompanyName", profile.company_name || "—");
  setText("profileRole",        "OEM Partner");

  // Info fields — read only
  setText("viewEmail",   profile.email    || "—");
  setText("viewPhone",   profile.phone    || "Not provided");
  setText("viewWebsite", profile.website  || "Not provided");
  setText("viewCity",    profile.city     || "Not provided");
  setText("viewCountry", profile.country  || "Not provided");
};

// =================================================================
// RENDER — EDIT FORM (populate fields only — HTML is in .html file)
// =================================================================
const populateEditForm = (profile) => {
  // Read-only fields — shown for context but not editable
  setText("editEmailDisplay", profile.email        || "—");
  setText("editCompanyDisplay", profile.company_name || "—");

  // Editable fields — must match backend updateProfile accepted fields
  setVal("editPhone",   profile.phone);
  setVal("editWebsite", profile.website);
  setVal("editCity",    profile.city);
  setVal("editCountry", profile.country);
};

// =================================================================
// LOAD PROFILE
// =================================================================
const loadProfile = async () => {
  el("profileWrapper")?.classList.add("loading");

  try {
    const { profile } = await API.get("/oem/profile");
    State.profile = profile || {};

    renderView(State.profile);

  } catch (err) {
    Toast.error(err.message || "Failed to load profile.");
  } finally {
    el("profileWrapper")?.classList.remove("loading");
  }
};

// =================================================================
// SAVE PROFILE
// =================================================================
const saveProfile = async (e) => {
  e.preventDefault();

  // Only send fields backend actually accepts
  const payload = {
    phone:   el("editPhone")?.value.trim()   || null,
    website: el("editWebsite")?.value.trim() || null,
    city:    el("editCity")?.value.trim()    || null,
    country: el("editCountry")?.value.trim() || null,
  };

  const submitBtn = el("saveProfileBtn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }

  try {
    await API.put("/oem/profile", payload);

    // Merge saved values into local state
    State.profile = { ...State.profile, ...payload };

    renderView(State.profile);
    _setMode("view");
    Toast.success("Profile updated successfully.");

  } catch (err) {
    Toast.error(err.message || "Failed to update profile.");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Save Changes"; }
  }
};

// =================================================================
// CHANGE PASSWORD (inline section — not a separate page)
// =================================================================
const handleChangePassword = async (e) => {
  e.preventDefault();

  const currentPwd = el("currentPassword")?.value ?? "";
  const newPwd     = el("newPassword")?.value     ?? "";
  const confirmPwd = el("confirmPassword")?.value ?? "";

  if (!currentPwd) {
    Toast.warning("Current password is required.");
    return;
  }
  if (!newPwd || newPwd.length < 8) {
    Toast.warning("New password must be at least 8 characters.");
    return;
  }
  if (newPwd !== confirmPwd) {
    Toast.warning("Passwords do not match.");
    return;
  }
  if (newPwd === currentPwd) {
    Toast.warning("New password must differ from current password.");
    return;
  }

  const submitBtn = el("savePasswordBtn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Updating…"; }

  try {
    await API.post("/auth/change-password", {
      currentPassword: currentPwd,
      newPassword:     newPwd,
    });

    Toast.success("Password updated successfully.");
    el("passwordForm")?.reset();

  } catch (err) {
    if (err.status === 401) {
      Toast.error("Current password is incorrect.");
    } else {
      Toast.error(err.message || "Failed to update password.");
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Update Password"; }
  }
};

// =================================================================
// EVENT BINDING
// =================================================================
const bindEvents = () => {

  // ── Edit mode toggle ──────────────────────────────────────────
  el("editProfileBtn")?.addEventListener("click", () => {
    if (!State.profile) return;
    populateEditForm(State.profile);
    _setMode("edit");
  });

  el("cancelEditBtn")?.addEventListener("click", () => {
    _setMode("view");
  });

  // ── Profile form submit ───────────────────────────────────────
  el("profileForm")?.addEventListener("submit", saveProfile);

  // ── Password form submit ──────────────────────────────────────
  el("passwordForm")?.addEventListener("submit", handleChangePassword);

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
  loadProfile();
};

document.addEventListener("DOMContentLoaded", init);