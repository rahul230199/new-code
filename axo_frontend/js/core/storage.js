/* =========================================================
   AXO NETWORKS — STORAGE MANAGER (FIXED)
========================================================= */

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const StorageManager = {
  setToken(token) {
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token);
  },

  getToken() {
    // Try both keys for compatibility
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('auth_token');
  },

  removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('auth_token');
  },

  setUser(user) {
    if (!user) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  getUser() {
    const user = localStorage.getItem(USER_KEY);
    if (user) {
      try {
        return JSON.parse(user);
      } catch(e) {
        console.error('Error parsing user:', e);
        return null;
      }
    }
    return null;
  },

  removeUser() {
    localStorage.removeItem(USER_KEY);
  },

  clearSession() {
    this.removeToken();
    this.removeUser();
  },

  isAuthenticated() {
    return !!this.getToken();
  }
};

export default StorageManager;
