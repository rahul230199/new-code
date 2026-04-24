/* ============================================
   AXO NETWORKS - API CLIENT (FIXED)
============================================ */

import { StorageManager } from './storage.js';
import { showToast } from './toast.js';

export class ApiClient {
    constructor() {
        this.storage = new StorageManager();
        this.baseURL = 'https://axonetworks.com/api';
    }

    getHeaders() {
        const token = this.storage.get('accessToken');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    }

    async request(endpoint, method = 'GET', data = null) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            const options = {
                method,
                headers: this.getHeaders()
            };
            
            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(data);
            }
            
            const response = await fetch(url, options);
            const result = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.storage.remove('accessToken');
                    this.storage.remove('currentUser');
                    window.location.href = '/login.html';
                    throw new Error('Session expired. Please login again.');
                }
                throw new Error(result.message || 'Request failed');
            }
            
            return result;
        } catch (error) {
            console.error('API Error:', error);
            showToast(error.message, 'error');
            throw error;
        }
    }

    get(endpoint) {
        return this.request(endpoint, 'GET');
    }

    post(endpoint, data) {
        return this.request(endpoint, 'POST', data);
    }

    put(endpoint, data) {
        return this.request(endpoint, 'PUT', data);
    }

    delete(endpoint) {
        return this.request(endpoint, 'DELETE');
    }
}
