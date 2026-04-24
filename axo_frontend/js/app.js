/* =========================================================
   AXO NETWORKS — APPLICATION ENTRY POINT
   Enterprise Bootstrap Layer
========================================================= */

import { AuthManager } from "./core/authManager.js";
import { PermissionManager } from "./core/permissionManager.js";
import { StorageManager } from "./core/storage.js";

/* =======================================================
   APPLICATION BOOTSTRAP
======================================================= */
async function bootstrap() {
  try {

    console.log("🚀 AXO Networks App Booting...");

    const user = AuthManager.getCurrentUser();

    if (user) {
      console.log("Authenticated User:", user.email, "| Role:", user.role);
    } else {
      console.log("No active session");
    }

    // Apply DOM permissions globally (safe to call always)
    PermissionManager.applyPermissionsToDOM();

    console.log("✅ AXO Core Initialized");

  } catch (error) {
    console.error("❌ Bootstrap Error:", error);
  }
}

/* =======================================================
   START APPLICATION
======================================================= */
bootstrap();