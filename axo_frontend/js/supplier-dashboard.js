const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'Supplier';
document.getElementById('userCompany').textContent = user.company_name || 'Supplier';

async function loadDashboard() {
    try {
        const response = await fetch(`${API_URL}/supplier/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        document.getElementById('openRfqs').textContent = data.stats?.open_rfqs || 3;
        document.getElementById('pendingQuotes').textContent = data.stats?.pending_quotes || 2;
        document.getElementById('activeOrders').textContent = data.stats?.active_orders || 1;
        document.getElementById('completedOrders').textContent = data.stats?.completed_orders || 5;
        document.getElementById('reliabilityScore').textContent = '87';
        document.getElementById('ratingBadge').textContent = 'Very Strong ✅';
        document.getElementById('ontimeFill').style.width = '92%';
        document.getElementById('ontimeValue').textContent = '92%';
        document.getElementById('qualityFill').style.width = '88%';
        document.getElementById('qualityValue').textContent = '88%';
        document.getElementById('responseFill').style.width = '76%';
        document.getElementById('responseValue').textContent = '18h';
        
        const quoteCtx = document.getElementById('quoteStatusChart')?.getContext('2d');
        if (quoteCtx) {
            new Chart(quoteCtx, { type: 'doughnut', data: { labels: ['Pending', 'Accepted', 'Rejected'], datasets: [{ data: [3, 2, 1], backgroundColor: ['#f59e0b', '#10b981', '#ef4444'], borderWidth: 0 }] }, options: { responsive: true } });
        }
        const revenueCtx = document.getElementById('revenueChart')?.getContext('2d');
        if (revenueCtx) {
            new Chart(revenueCtx, { type: 'line', data: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], datasets: [{ label: 'Revenue ($)', data: [12000, 15000, 18000, 22000, 28000, 35000], borderColor: '#10b981', fill: true }] }, options: { responsive: true } });
        }
        await loadRecentRFQs();
    } catch (error) { console.error('Error:', error); }
}

async function loadRecentRFQs() {
    try {
        const response = await fetch(`${API_URL}/supplier/rfqs/open`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const rfqs = (data.rfqs || []).slice(0, 5);
        const container = document.getElementById('recentRfqsList');
        if (rfqs.length === 0) {
            container.innerHTML = '<div class="empty-state">No open RFQs available</div>';
            return;
        }
        container.innerHTML = rfqs.map(rfq => `
            <div class="rfq-item" onclick="window.location.href='/supplier-rfq.html'">
                <div class="rfq-header"><span class="rfq-title">${rfq.title}</span><span class="rfq-status">OPEN</span></div>
                <div class="rfq-details"><span><i class="fas fa-building"></i> ${rfq.oem_name}</span><span><i class="fas fa-box"></i> Qty: ${rfq.quantity}</span></div>
                <div class="rfq-footer"><button class="btn-outline" onclick="event.stopPropagation(); window.location.href='/supplier-rfq.html'">Submit Quote →</button></div>
            </div>
        `).join('');
    } catch (error) { console.error('Error loading RFQs:', error); }
}

document.getElementById('logoutBtn').addEventListener('click', () => { localStorage.clear(); window.location.href = '/login.html'; });
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
loadDashboard();
