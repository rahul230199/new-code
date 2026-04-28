/* =========================================================
   AXO NETWORKS — STORAGE MANAGER (ENTERPRISE VERSION)
   - Fully aligned with config.js
   - Single source of truth for session storage
   - Safe parsing + cleanup
========================================================= */

import CONFIG from "./config.js";

const { TOKEN, USER } = CONFIG.STORAGE_KEYS;

const StorageManager = {

  // --------------------------------------------------
  // TOKEN
  // --------------------------------------------------
  setToken(token) {
    if (!token || typeof token !== "string") return;
    localStorage.setItem(TOKEN, token);
  },

  getToken() {
    const token = localStorage.getItem(TOKEN);
    return token || null;
  },

  removeToken() {
    localStorage.removeItem(TOKEN);
  },

  // --------------------------------------------------
  // USER
  // --------------------------------------------------
  setUser(user) {
    if (!user || typeof user !== "object") return;
    localStorage.setItem(USER, JSON.stringify(user));
  },

  getUser() {
    const raw = localStorage.getItem(USER);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error("[Storage] Invalid user JSON. Clearing...");
      this.removeUser();
      return null;
    }
  },

  removeUser() {
    localStorage.removeItem(USER);
  },

  // --------------------------------------------------
  // SESSION
  // --------------------------------------------------
  setSession(token, user) {
    this.setToken(token);
    this.setUser(user);
  },

  clearSession() {
    this.removeToken();
    this.removeUser();
  },

  // --------------------------------------------------
  // AUTH CHECK
  // --------------------------------------------------
  isAuthenticated() {
    const token = this.getToken();
    const user  = this.getUser();

    // both must exist
    if (!token || !user) return false;

    return true;
  },

};

export default StorageManager;