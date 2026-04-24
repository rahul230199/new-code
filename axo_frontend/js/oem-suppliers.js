const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'OEM';

async function loadSuppliers() {
    try {
        const response = await fetch(`${API_URL}/oem/suppliers`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        const suppliers = data.suppliers || [];
        const container = document.getElementById('suppliersGrid');
        
        if (suppliers.length === 0) { container.innerHTML = '<div class="empty-state">No suppliers found</div>'; return; }
        
        container.innerHTML = suppliers.map(s => `
            <div class="supplier-card"><div class="supplier-header"><div class="supplier-name">${s.company_name}</div><div class="reliability-score">${s.reliability_score || 0}%</div></div>
            <div class="supplier-details"><div><i class="fas fa-envelope"></i> ${s.email}</div><div><i class="fas fa-phone"></i> ${s.phone || 'N/A'}</div></div>
            <div class="supplier-stats"><div class="stat"><div class="stat-value">${s.total_orders || 0}</div><div class="stat-label">Orders</div></div><div class="stat"><div class="stat-value">$${s.total_spent || 0}</div><div class="stat-label">Spent</div></div></div></div>
        `).join('');
    } catch (error) { console.error('Error:', error); }
}

document.getElementById('refreshBtn').addEventListener('click', loadSuppliers);
document.getElementById('logoutBtn').addEventListener('click', () => { localStorage.clear(); window.location.href = '/login.html'; });
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

loadSuppliers();
