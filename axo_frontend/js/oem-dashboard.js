const API_URL = 'https://axonetworks.com/api';
let orderStatusChart = null;
let monthlyTrendChart = null;

const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'OEM Partner';
document.getElementById('userCompany').textContent = user.company_name || 'OEM Partner';

// Single function to load all dashboard data
async function loadDashboard() {
    try {
        const response = await fetch(`${API_URL}/oem/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load dashboard');
        
        const data = await response.json();
        
        // Update KPIs
        document.getElementById('activeRfqs').textContent = data.kpis?.active_rfqs || 0;
        document.getElementById('quotesPending').textContent = data.kpis?.quotes_pending || 0;
        document.getElementById('activeOrders').textContent = data.kpis?.active_orders || 0;
        document.getElementById('delayedOrders').textContent = data.kpis?.delayed_orders || 0;
        
        // Update Charts
        updateOrderStatusChart(data.charts?.order_status_distribution || []);
        updateMonthlyTrendChart(data.charts?.monthly_volume_trend || []);
        
        // Update Heatmap
        updateHeatmap(data.heatmap || []);
        
        // Update Live Orders
        updateLiveOrders(data.live_orders || []);
        
    } catch (error) {
        console.error('Dashboard error:', error);
        showPlaceholderData();
    }
}

function updateOrderStatusChart(orderStatus) {
    const ctx = document.getElementById('orderStatusChart');
    if (!ctx) return;
    
    const labels = orderStatus.map(item => item.status?.toUpperCase() || 'Unknown');
    const counts = orderStatus.map(item => parseInt(item.count) || 0);
    
    if (orderStatusChart) orderStatusChart.destroy();
    
    orderStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
                data: labels.length ? counts : [1],
                backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }
        }
    });
}

function updateMonthlyTrendChart(monthlyTrend) {
    const ctx = document.getElementById('monthlyTrendChart');
    if (!ctx) return;
    
    const labels = monthlyTrend.map(m => m.month);
    const values = monthlyTrend.map(m => parseFloat(m.total_value) || 0);
    
    if (monthlyTrendChart) monthlyTrendChart.destroy();
    
    monthlyTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length ? labels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Order Value ($)',
                data: labels.length ? values : [0, 0, 0, 0, 0, 0],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.05)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } } }
        }
    });
}

function updateHeatmap(heatmapData) {
    const container = document.getElementById('bottleneckHeatmap');
    if (!container) return;
    
    const defaultData = [
        { name: 'Delayed Milestones', value: 0, severity: 'high' },
        { name: 'Raw Material Shortages', value: 0, severity: 'medium' },
        { name: 'QC Hold', value: 0, severity: 'low' }
    ];
    
    const data = heatmapData.length ? heatmapData : defaultData;
    const maxValue = Math.max(...data.map(d => d.value), 1);
    
    container.innerHTML = data.map(item => `
        <div class="heatmap-item">
            <span>${item.name}</span>
            <div class="heatmap-bar">
                <div class="heatmap-bar-fill ${item.severity}" style="width: ${(item.value / maxValue) * 100}%"></div>
            </div>
            <span class="heatmap-value">${item.value}</span>
        </div>
    `).join('');
}

function updateLiveOrders(orders) {
    const tbody = document.getElementById('liveOrdersList');
    if (!tbody) return;
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No orders found</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr onclick="window.location.href='/oem-order-details.html?id=${order.id}'" style="cursor: pointer;">
            <td><strong>${order.po_number || 'N/A'}</strong></td>
            <td>${escapeHtml(order.part_name || 'N/A')}</td>
            <td>${escapeHtml(order.supplier_name || 'N/A')}</td>
            <td>${order.quantity || 0}</td>
            <td><span class="status-badge status-${order.status}">${(order.status || 'PENDING').toUpperCase()}</span></td>
            <td>On Track</td>
            <td>15 days</td>
        </tr>
    `).join('');
}

function showPlaceholderData() {
    document.getElementById('activeRfqs').textContent = '0';
    document.getElementById('quotesPending').textContent = '0';
    document.getElementById('activeOrders').textContent = '0';
    document.getElementById('delayedOrders').textContent = '0';
    updateHeatmap([]);
    updateLiveOrders([]);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/login.html';
});

document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// Load dashboard immediately
loadDashboard();

// Refresh every 60 seconds instead of 30
setInterval(loadDashboard, 60000);
