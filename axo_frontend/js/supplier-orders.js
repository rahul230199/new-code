const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'Supplier';

async function loadOrders() {
    try {
        console.log('Loading supplier orders...');
        const response = await fetch(`${API_URL}/supplier/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const orders = data.orders || [];
        const container = document.getElementById('ordersList');
        
        console.log('Orders received:', orders.length);
        
        if (orders.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No orders yet.</p><p>When your quotes are accepted, they will appear here.</p></div>';
            return;
        }
        
        container.innerHTML = orders.map(order => `
            <div class="order-card" onclick="window.location.href='/supplier-order-details.html?id=${order.id}'">
                <div class="order-header">
                    <div>
                        <div class="order-po">${order.po_number || 'PO-' + order.id}</div>
                        <div class="order-oem">${escapeHtml(order.oem_name)}</div>
                    </div>
                    <span class="order-status status-${order.status}">${(order.status || 'PENDING').toUpperCase()}</span>
                </div>
                <div class="order-details">
                    <span><i class="fas fa-cog"></i> Part: ${escapeHtml(order.part_name || 'N/A')}</span>
                    <span><i class="fas fa-box"></i> Qty: ${order.quantity || 0}</span>
                    <span><i class="fas fa-dollar-sign"></i> Value: $${(order.total_value || 0).toLocaleString()}</span>
                </div>
                <div class="order-milestone">
                    <div class="milestone-bar">
                        <span>Progress:</span>
                        <div class="milestone-progress">
                            <div class="milestone-progress-fill" style="width: ${order.progress || 0}%"></div>
                        </div>
                        <span>${order.progress || 0}%</span>
                    </div>
                </div>
                <div class="order-footer">
                    <span><i class="fas fa-calendar"></i> Ordered: ${new Date(order.created_at).toLocaleDateString()}</span>
                    <button class="btn-outline" onclick="event.stopPropagation(); window.location.href='/supplier-order-details.html?id=${order.id}'">View Details →</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading orders:', error);
        const container = document.getElementById('ordersList');
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error loading orders. Please refresh.</p></div>';
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

// Filter orders by status
const statusFilter = document.getElementById('statusFilter');
if (statusFilter) {
    statusFilter.addEventListener('change', loadOrders);
}

// Search orders
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const cards = document.querySelectorAll('.order-card');
        cards.forEach(card => {
            const text = card.innerText.toLowerCase();
            if (text.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', function() {
    localStorage.clear();
    window.location.href = '/login.html';
});

// Mobile menu
document.getElementById('menuToggle')?.addEventListener('click', function() {
    document.getElementById('sidebar')?.classList.toggle('open');
});

// Load orders when page loads
document.addEventListener('DOMContentLoaded', loadOrders);
