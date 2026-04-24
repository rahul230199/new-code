const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'OEM';

async function loadRFQs() {
    try {
        const response = await fetch(`${API_URL}/oem/rfqs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const rfqs = data.rfqs || [];
        const container = document.getElementById('rfqList');
        
        if (rfqs.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-file-alt"></i><p>No RFQs found</p><button class="btn-primary" onclick="openCreateModal()">Create your first RFQ</button></div>';
            return;
        }
        
        container.innerHTML = rfqs.map(rfq => `
            <div class="rfq-card">
                <div class="rfq-header">
                    <div>
                        <div class="rfq-title">${escapeHtml(rfq.title)}</div>
                        <div class="rfq-number">${rfq.rfq_number || 'RFQ-' + rfq.id}</div>
                    </div>
                    <span class="rfq-status status-${rfq.status}">${(rfq.status || 'DRAFT').toUpperCase()}</span>
                </div>
                <div class="rfq-details">
                    <span><i class="fas fa-cog"></i> Part: ${escapeHtml(rfq.part_name || rfq.part_number || 'N/A')}</span>
                    <span><i class="fas fa-box"></i> Qty: ${rfq.quantity}</span>
                    <span><i class="fas fa-calendar"></i> Created: ${new Date(rfq.created_at).toLocaleDateString()}</span>
                </div>
                <div class="rfq-footer">
                    <div class="quote-count"><i class="fas fa-comment-dollar"></i> ${rfq.quote_count || 0} quotes</div>
                    <button class="btn-outline" onclick="viewQuotes(${rfq.id})">View Quotes</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('rfqList').innerHTML = '<div class="empty-state">Error loading RFQs</div>';
    }
}

window.viewQuotes = async (rfqId) => {
    try {
        const response = await fetch(`${API_URL}/oem/rfqs/${rfqId}/quotes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const quotes = data.quotes || [];
        const container = document.getElementById('quotesList');
        
        if (quotes.length === 0) {
            container.innerHTML = '<div class="empty-state">No quotes received yet</div>';
            document.getElementById('quotesModal').style.display = 'flex';
            return;
        }
        
        container.innerHTML = quotes.map(q => {
            // Check if quote is already accepted or rejected
            const isAccepted = q.status === 'accepted';
            const isRejected = q.status === 'rejected';
            const isAwarded = q.status === 'awarded';
            
            return `
                <div class="quote-card">
                    <div class="quote-header">
                        <div>
                            <div class="quote-supplier"><i class="fas fa-building"></i> ${escapeHtml(q.supplier_name)}</div>
                        </div>
                        <div class="quote-price">${q.currency || 'USD'} ${q.price}</div>
                    </div>
                    <div class="quote-details">
                        <span><i class="fas fa-clock"></i> Lead Time: ${q.lead_time_days} days</span>
                        <span><i class="fas fa-file-invoice"></i> Payment: ${q.payment_terms || 'Net 30'}</span>
                        <span><i class="fas fa-tag"></i> Status: <strong class="status-${q.status}">${q.status.toUpperCase()}</strong></span>
                    </div>
                    <div class="quote-notes">${escapeHtml(q.notes || '')}</div>
                    <div class="quote-actions">
                        ${!isAccepted && !isRejected && !isAwarded ? `
                            <button class="btn-accept" onclick="acceptQuote(${q.id})"><i class="fas fa-check"></i> Accept Quote</button>
                            <button class="btn-reject" onclick="rejectQuote(${q.id})"><i class="fas fa-times"></i> Reject</button>
                        ` : isAccepted || isAwarded ? `
                            <span class="accepted-badge"><i class="fas fa-check-circle"></i> Quote Accepted - PO Created</span>
                        ` : `
                            <span class="rejected-badge"><i class="fas fa-times-circle"></i> Quote Rejected</span>
                        `}
                    </div>
                </div>
            `;
        }).join();
        
        document.getElementById('quotesModal').style.display = 'flex';
    } catch (error) {
        console.error('Error loading quotes:', error);
        alert('Error loading quotes');
    }
};

window.acceptQuote = async (quoteId) => {
    if (!confirm('Accept this quote? A Purchase Order will be created.')) return;
    
    try {
        const response = await fetch(`${API_URL}/oem/rfqs/quotes/${quoteId}/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('✓ Quote accepted! Purchase Order created.');
            document.getElementById('quotesModal').style.display = 'none';
            loadRFQs();
        } else {
            alert(data.error || 'Failed to accept quote');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error accepting quote');
    }
};

window.rejectQuote = async (quoteId) => {
    if (!confirm('Reject this quote?')) return;
    
    try {
        const response = await fetch(`${API_URL}/oem/rfqs/quotes/${quoteId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            alert('Quote rejected');
            document.getElementById('quotesModal').style.display = 'none';
            loadRFQs();
        } else {
            alert('Failed to reject quote');
        }
    } catch (error) {
        alert('Error rejecting quote');
    }
};

window.openCreateModal = function() {
    document.getElementById('createRfqForm').reset();
    document.getElementById('createRfqModal').style.display = 'flex';
};

document.getElementById('createRfqBtn')?.addEventListener('click', openCreateModal);

document.getElementById('createRfqForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('rfqTitle').value;
    const quantity = document.getElementById('quantity').value;
    
    if (!title) {
        alert('Please enter a title');
        return;
    }
    if (!quantity || quantity <= 0) {
        alert('Please enter a valid quantity');
        return;
    }
    
    const formData = {
        title: title,
        partNumber: document.getElementById('partNumber').value || '',
        partName: document.getElementById('partName').value || '',
        quantity: parseInt(quantity),
        unit: document.getElementById('unit').value || 'units',
        targetPrice: parseFloat(document.getElementById('targetPrice').value) || null,
        currency: document.getElementById('currency').value || 'USD',
        description: document.getElementById('description').value || ''
    };
    
    const submitBtn = document.querySelector('#createRfqForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';
    
    try {
        const response = await fetch(`${API_URL}/oem/rfqs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            alert('✓ RFQ published successfully!');
            document.getElementById('createRfqModal').style.display = 'none';
            loadRFQs();
        } else {
            const data = await response.json();
            alert('Failed to create RFQ: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error creating RFQ');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish RFQ';
    }
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', function() {
        this.closest('.modal').style.display = 'none';
    });
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/login.html';
});

document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

loadRFQs();
