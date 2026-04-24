const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'OEM';

async function loadOrders() {
    try {
        const response = await fetch(`${API_URL}/oem/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const orders = data.orders || [];
        const container = document.getElementById('ordersList');
        
        if (orders.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No orders found</p></div>';
            return;
        }
        
        container.innerHTML = orders.map(order => `
            <div class="order-card" onclick="window.location.href='/oem-order-details.html?id=${order.id}'">
                <div class="order-header">
                    <div>
                        <div class="order-po">${order.po_number}</div>
                        <div class="order-supplier">${escapeHtml(order.supplier_name)}</div>
                    </div>
                    <span class="order-status status-${order.status}">${(order.status || 'PENDING').toUpperCase()}</span>
                </div>
                <div class="order-details">
                    <span><i class="fas fa-cog"></i> Part: ${escapeHtml(order.part_name || 'N/A')}</span>
                    <span><i class="fas fa-box"></i> Qty: ${order.quantity}</span>
                    <span><i class="fas fa-dollar-sign"></i> Value: $${order.total_value || 0}</span>
                </div>
                <div class="order-footer">
                    <span><i class="fas fa-calendar"></i> Ordered: ${new Date(order.order_date).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading orders:', error);
        document.getElementById('ordersList').innerHTML = '<div class="empty-state">Error loading orders</div>';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

document.getElementById('logoutBtn').addEventListener('click', function() {
    localStorage.clear();
    window.location.href = '/login.html';
});

document.getElementById('menuToggle').addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('statusFilter').addEventListener('change', loadOrders);
document.getElementById('searchInput').addEventListener('input', function() {
    loadOrders();
});

loadOrders();
