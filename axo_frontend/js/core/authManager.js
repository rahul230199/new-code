/* ============================================
   AXO NETWORKS - AUTH MANAGER (FIXED)
============================================ */

import { StorageManager } from './storage.js';
import { ApiClient } from './apiClient.js';

export class AuthManager {
    constructor() {
        this.storage = new StorageManager();
        this.apiClient = new ApiClient();
    }

    isAuthenticated() {
        const token = this.storage.get('accessToken');
        if (!token) return false;
        
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp > Date.now() / 1000;
        } catch {
            return false;
        }
    }

    getCurrentUser() {
        return this.storage.get('currentUser');
    }

    async login(email, password) {
        try {
            const response = await this.apiClient.post('/auth/login', { email, password });
            
            if (response.success && response.data) {
                this.storage.set('accessToken', response.data.token);
                this.storage.set('currentUser', response.data.user);
                
                if (response.data.user.must_change_password) {
                    window.location.href = '/change-password.html';
                } else {
                    this.redirectBasedOnRole(response.data.user.role);
                }
                
                return { success: true, data: response.data };
            }
            
            return { success: false, error: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    redirectBasedOnRole(role) {
        const roleMap = {
            'oem': '/buyer-dashboard-fixed.html',
            'buyer': '/buyer-dashboard-fixed.html',
            'supplier': '/supplier-dashboard.html',
            'admin': '/admin-dashboard.html'
        };
        
        const redirectUrl = roleMap[role.toLowerCase()] || '/login.html';
        window.location.href = redirectUrl;
    }

    logout() {
        this.storage.remove('accessToken');
        this.storage.remove('currentUser');
        window.location.href = '/login.html';
    }
}
