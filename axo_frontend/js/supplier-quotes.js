const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'Supplier';

async function loadQuotes() {
    try {
        console.log('Loading quotes from API...');
        const response = await fetch(`${API_URL}/supplier/quotes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const quotes = data.quotes || [];
        const container = document.getElementById('quotesList');
        
        console.log('Quotes received:', quotes.length);
        
        if (quotes.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-comment-dollar"></i><p>No quotes submitted yet.</p><a href="/supplier-rfq.html" class="btn-primary">Browse RFQs</a></div>';
            return;
        }
        
        container.innerHTML = quotes.map(q => {
            let statusClass = '';
            let statusText = q.status.toUpperCase();
            if (q.status === 'pending') statusClass = 'status-pending';
            else if (q.status === 'accepted') statusClass = 'status-accepted';
            else if (q.status === 'rejected') statusClass = 'status-rejected';
            
            return `
                <div class="quote-card">
                    <div class="quote-header">
                        <div>
                            <div class="quote-title">${escapeHtml(q.title)}</div>
                            <div class="quote-oem">${escapeHtml(q.oem_name)}</div>
                        </div>
                        <div class="quote-price">${q.currency || 'USD'} ${q.price}</div>
                    </div>
                    <div class="quote-details">
                        <span><i class="fas fa-clock"></i> Lead Time: ${q.lead_time_days} days</span>
                        <span><i class="fas fa-file-invoice"></i> Payment: ${q.payment_terms || 'Net 30'}</span>
                        <span><i class="fas fa-calendar"></i> Submitted: ${new Date(q.submitted_at).toLocaleDateString()}</span>
                    </div>
                    <div class="quote-status-badge ${statusClass}">${statusText}</div>
                    ${q.notes ? `<div class="quote-notes">${escapeHtml(q.notes)}</div>` : ''}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading quotes:', error);
        const container = document.getElementById('quotesList');
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error loading quotes. Please refresh.</p></div>';
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

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', function() {
    localStorage.clear();
    window.location.href = '/login.html';
});

// Mobile menu
document.getElementById('menuToggle')?.addEventListener('click', function() {
    document.getElementById('sidebar')?.classList.toggle('open');
});

// Load quotes when page loads
document.addEventListener('DOMContentLoaded', loadQuotes);
