const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('companyName').textContent = user.company_name || 'Supplier';

let currentRfqId = null;

async function loadRFQs() {
    try {
        console.log('Loading RFQs from API...');
        const response = await fetch(`${API_URL}/supplier/rfqs/open`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const rfqs = data.rfqs || [];
        const container = document.getElementById('rfqList');
        
        console.log('RFQs received:', rfqs.length);
        
        if (rfqs.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No open RFQs available at the moment.</p><p class="text-muted">Check back later for new opportunities.</p></div>';
            return;
        }
        
        container.innerHTML = rfqs.map(rfq => `
            <div class="rfq-card" onclick="openQuoteModal(${rfq.id})">
                <div class="rfq-header">
                    <div>
                        <div class="rfq-title">${escapeHtml(rfq.title)}</div>
                        <div class="rfq-number">${rfq.rfq_number || 'RFQ-' + rfq.id}</div>
                    </div>
                    <span class="rfq-status">OPEN</span>
                </div>
                <div class="rfq-details">
                    <span><i class="fas fa-building"></i> ${escapeHtml(rfq.oem_name)}</span>
                    <span><i class="fas fa-box"></i> Qty: ${rfq.quantity}</span>
                    <span><i class="fas fa-calendar"></i> Posted: ${new Date(rfq.created_at).toLocaleDateString()}</span>
                </div>
                <div class="rfq-description">${escapeHtml(rfq.description || 'No description provided')}</div>
                <div class="rfq-footer">
                    <button class="btn-primary" onclick="event.stopPropagation(); openQuoteModal(${rfq.id})">
                        <i class="fas fa-paper-plane"></i> Submit Quote
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading RFQs:', error);
        const container = document.getElementById('rfqList');
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error loading RFQs. Please refresh.</p></div>';
    }
}

window.openQuoteModal = function(rfqId) {
    currentRfqId = rfqId;
    document.getElementById('quoteRfqId').value = rfqId;
    document.getElementById('quoteForm').reset();
    document.getElementById('quoteModal').style.display = 'flex';
};

function closeQuoteModal() {
    document.getElementById('quoteModal').style.display = 'none';
    currentRfqId = null;
}

// Handle quote form submission
const quoteForm = document.getElementById('quoteForm');
if (quoteForm) {
    quoteForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const price = document.getElementById('quotePrice').value;
        const leadTime = document.getElementById('leadTime').value;
        
        if (!price || !leadTime) {
            alert('Please fill in Price and Lead Time');
            return;
        }
        
        const submitBtn = this.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        
        const formData = {
            rfqId: currentRfqId,
            price: parseFloat(price),
            currency: document.getElementById('currency').value,
            leadTimeDays: parseInt(leadTime),
            paymentTerms: document.getElementById('paymentTerms').value,
            notes: document.getElementById('quoteNotes').value
        };
        
        try {
            const response = await fetch(`${API_URL}/supplier/quotes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('✓ Quote submitted successfully!');
                closeQuoteModal();
                // Redirect to My Quotes page
                window.location.href = '/supplier-quotes.html';
            } else {
                alert(data.error || 'Failed to submit quote');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error submitting quote. Please try again.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
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

// Close modal buttons
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', function() {
        this.closest('.modal').style.display = 'none';
    });
});

// Refresh button
document.getElementById('refreshBtn')?.addEventListener('click', loadRFQs);

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', function() {
    localStorage.clear();
    window.location.href = '/login.html';
});

// Mobile menu
document.getElementById('menuToggle')?.addEventListener('click', function() {
    document.getElementById('sidebar')?.classList.toggle('open');
});

// Load RFQs when page loads
document.addEventListener('DOMContentLoaded', loadRFQs);
