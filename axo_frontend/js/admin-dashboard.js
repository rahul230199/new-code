const API_URL = 'https://axonetworks.com/api';
let currentFilter = 'all';
let currentRequestId = null;
let currentUserEmail = null;
let roleChart = null;
let monthlyChart = null;

// Check authentication
const token = localStorage.getItem('adminToken');
if (!token) {
    window.location.href = '/login.html';
}

// Get admin info
const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
document.getElementById('adminName').textContent = user.company_name || 'Admin';
document.getElementById('adminNameSetting').value = user.company_name || '';
document.getElementById('adminEmailSetting').value = user.email || '';

// Page navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        document.getElementById('dashboardPage').style.display = 'none';
        document.getElementById('requestsPage').style.display = 'none';
        document.getElementById('analyticsPage').style.display = 'none';
        document.getElementById('settingsPage').style.display = 'none';
        
        if (page === 'dashboard') {
            document.getElementById('dashboardPage').style.display = 'block';
            loadDashboard();
        } else if (page === 'requests') {
            document.getElementById('requestsPage').style.display = 'block';
            loadAllRequests();
        } else if (page === 'analytics') {
            document.getElementById('analyticsPage').style.display = 'block';
            loadAnalytics();
        } else if (page === 'settings') {
            document.getElementById('settingsPage').style.display = 'block';
            loadSettings();
        }
    });
});

// Load dashboard data
async function loadDashboard() {
    await loadStats();
    await loadRequests();
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('pendingCount').textContent = data.stats?.pending || 0;
            document.getElementById('approvedCount').textContent = data.stats?.approved || 0;
            document.getElementById('rejectedCount').textContent = data.stats?.rejected || 0;
            document.getElementById('totalUsers').textContent = data.stats?.totalUsers || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load requests for dashboard
async function loadRequests() {
    try {
        const response = await fetch(`${API_URL}/admin/requests/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const recentRequests = (data.requests || []).slice(0, 10);
            renderDashboardRequests(recentRequests);
        }
    } catch (error) {
        console.error('Error loading requests:', error);
    }
}

// Load all requests
async function loadAllRequests() {
    try {
        const url = currentFilter === 'all' 
            ? `${API_URL}/admin/requests/all`
            : `${API_URL}/admin/requests/pending`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderAllRequests(data.requests || []);
        }
    } catch (error) {
        console.error('Error loading all requests:', error);
    }
}

// Render dashboard requests
function renderDashboardRequests(requests) {
    const tbody = document.getElementById('requestsTableBody');
    
    if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No requests found</td></tr>';
        return;
    }
    
    tbody.innerHTML = requests.map(req => `
        <tr>
            <td>${req.id}</td>
            <td><strong>${escapeHtml(req.company_name)}</strong></td>
            <td>${escapeHtml(req.email)}</td>
            <td><span class="status-badge">${req.role_requested?.toUpperCase()}</span></td>
            <td>${escapeHtml(req.city || '-')}</td>
            <td><span class="status-badge status-${req.status}">${req.status?.toUpperCase()}</span></td>
            <td>${new Date(req.created_at).toLocaleDateString()}</td>
            <td>
                ${req.status === 'pending' ? `
                    <button class="btn-approve" onclick="openApproveModal(${req.id}, '${escapeHtml(req.company_name)}', '${escapeHtml(req.email)}')">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn-reject" onclick="openRejectModal(${req.id}, '${escapeHtml(req.company_name)}')">
                        <i class="fas fa-times"></i> Reject
                    </button>
                ` : `<span style="color: var(--gray);">${req.status === 'approved' ? '✓ Approved' : '✗ Rejected'}</span>`}
            </td>
        </tr>
    `).join('');
}

// Render all requests
function renderAllRequests(requests) {
    const tbody = document.getElementById('allRequestsTableBody');
    
    if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No requests found</td></tr>';
        return;
    }
    
    tbody.innerHTML = requests.map(req => `
        <tr>
            <td>${req.id}</td>
            <td><strong>${escapeHtml(req.company_name)}</strong></td>
            <td>${escapeHtml(req.email)}</td>
            <td><span class="status-badge">${req.role_requested?.toUpperCase()}</span></td>
            <td>${escapeHtml(req.city || '-')}</td>
            <td>${escapeHtml(req.capabilities ? req.capabilities.slice(0, 2).join(', ') : '-')}</td>
            <td><span class="status-badge status-${req.status}">${req.status?.toUpperCase()}</span></td>
            <td>${new Date(req.created_at).toLocaleDateString()}</td>
            <td>
                ${req.status === 'pending' ? `
                    <button class="btn-approve" onclick="openApproveModal(${req.id}, '${escapeHtml(req.company_name)}', '${escapeHtml(req.email)}')">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn-reject" onclick="openRejectModal(${req.id}, '${escapeHtml(req.company_name)}')">
                        <i class="fas fa-times"></i> Reject
                    </button>
                ` : `<span style="color: var(--gray);">${req.status === 'approved' ? '✓ Approved' : '✗ Rejected'}</span>`}
            </td>
        </tr>
    `).join('');
}

// Load Analytics
async function loadAnalytics() {
    try {
        const response = await fetch(`${API_URL}/admin/requests/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const requests = data.requests || [];
            
            // Calculate totals
            const totalRegistrations = requests.length;
            const approved = requests.filter(r => r.status === 'approved').length;
            const rejected = requests.filter(r => r.status === 'rejected').length;
            const approvalRate = totalRegistrations > 0 ? ((approved / totalRegistrations) * 100).toFixed(1) : 0;
            
            document.getElementById('totalRegistrations').textContent = totalRegistrations;
            document.getElementById('approvalRate').textContent = `${approvalRate}%`;
            
            // Role distribution
            const oemCount = requests.filter(r => r.role_requested === 'oem').length;
            const supplierCount = requests.filter(r => r.role_requested === 'supplier').length;
            const bothCount = requests.filter(r => r.role_requested === 'both').length;
            
            if (roleChart) roleChart.destroy();
            const roleCtx = document.getElementById('roleChart').getContext('2d');
            roleChart = new Chart(roleCtx, {
                type: 'doughnut',
                data: {
                    labels: ['OEM', 'Supplier', 'Both'],
                    datasets: [{
                        data: [oemCount, supplierCount, bothCount],
                        backgroundColor: ['#4f46e5', '#10b981', '#f59e0b']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
            
            // Monthly trend
            const monthlyData = {};
            requests.forEach(req => {
                const month = new Date(req.created_at).toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlyData[month] = (monthlyData[month] || 0) + 1;
            });
            
            const months = Object.keys(monthlyData).slice(-6);
            const counts = months.map(m => monthlyData[m]);
            
            if (monthlyChart) monthlyChart.destroy();
            const trendCtx = document.getElementById('monthlyTrendChart').getContext('2d');
            monthlyChart = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'New Requests',
                        data: counts,
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        fill: true
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
            
            // Top capabilities
            const capabilitiesMap = {};
            requests.forEach(req => {
                if (req.capabilities) {
                    req.capabilities.forEach(cap => {
                        capabilitiesMap[cap] = (capabilitiesMap[cap] || 0) + 1;
                    });
                }
            });
            
            const topCaps = Object.entries(capabilitiesMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            const capsHtml = topCaps.map(([cap, count]) => `
                <div class="capability-item">
                    <span class="cap-name">${cap.replace(/_/g, ' ').toUpperCase()}</span>
                    <div class="cap-bar"><div class="cap-fill" style="width: ${(count / topCaps[0][1]) * 100}%"></div></div>
                    <span class="cap-count">${count}</span>
                </div>
            `).join('');
            
            document.getElementById('topCapabilities').innerHTML = capsHtml || '<p>No data available</p>';
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

// Load Settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/admin/db-info`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => null);
        
        if (response && response.ok) {
            const data = await response.json();
            document.getElementById('dbSize').textContent = data.size || 'Unknown';
        } else {
            document.getElementById('dbSize').textContent = 'Not available';
        }
    } catch (error) {
        document.getElementById('dbSize').textContent = 'Not available';
    }
}

// Open approve modal
window.openApproveModal = (id, companyName, email) => {
    currentRequestId = id;
    currentUserEmail = email;
    document.getElementById('approveCompanyName').textContent = companyName;
    document.getElementById('approveModal').style.display = 'flex';
};

// Open reject modal
window.openRejectModal = (id, companyName) => {
    currentRequestId = id;
    document.getElementById('rejectCompanyName').textContent = companyName;
    document.getElementById('rejectReason').value = '';
    document.getElementById('rejectModal').style.display = 'flex';
};

// Approve request
async function approveRequest() {
    try {
        const response = await fetch(`${API_URL}/admin/requests/${currentRequestId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Show temp password modal
            document.getElementById('tempCompanyName').textContent = document.getElementById('approveCompanyName').textContent;
            document.getElementById('tempUserEmail').textContent = currentUserEmail;
            document.getElementById('tempPasswordValue').textContent = data.tempPassword;
            document.getElementById('tempPasswordModal').style.display = 'flex';
            
            closeModals();
            loadDashboard();
            loadAllRequests();
        } else {
            showToast(data.error || 'Failed to approve', 'error');
        }
    } catch (error) {
        showToast('Error approving request', 'error');
    }
}

// Copy to clipboard
window.copyToClipboard = () => {
    const password = document.getElementById('tempPasswordValue').textContent;
    navigator.clipboard.writeText(password);
    showToast('Password copied to clipboard!', 'success');
};

// Reject request
async function rejectRequest() {
    const reason = document.getElementById('rejectReason').value;
    
    try {
        const response = await fetch(`${API_URL}/admin/requests/${currentRequestId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
            showToast('Request rejected', 'success');
            closeModals();
            loadDashboard();
            loadAllRequests();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to reject', 'error');
        }
    } catch (error) {
        showToast('Error rejecting request', 'error');
    }
}

// Change password
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword || !newPassword) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        if (response.ok) {
            showToast('Password changed successfully!', 'success');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to change password', 'error');
        }
    } catch (error) {
        showToast('Error changing password', 'error');
    }
}

// Update profile
async function updateProfile() {
    const name = document.getElementById('adminNameSetting').value;
    
    try {
        const response = await fetch(`${API_URL}/admin/update-profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ company_name: name })
        });
        
        if (response.ok) {
            showToast('Profile updated successfully!', 'success');
            document.getElementById('adminName').textContent = name;
        } else {
            showToast('Failed to update profile', 'error');
        }
    } catch (error) {
        showToast('Error updating profile', 'error');
    }
}

// Close modals
function closeModals() {
    document.getElementById('approveModal').style.display = 'none';
    document.getElementById('rejectModal').style.display = 'none';
    currentRequestId = null;
}

// Show toast
function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white; padding: 12px 20px; border-radius: 8px; z-index: 1000; animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        
        const response = await fetch(`${API_URL}/admin/requests/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            let requests = data.requests || [];
            if (currentFilter !== 'all') {
                requests = requests.filter(r => r.status === currentFilter);
            }
            renderDashboardRequests(requests.slice(0, 10));
        }
    });
});

document.querySelectorAll('.filter-btn-all').forEach(btn => {
    btn.addEventListener('click', async () => {
        document.querySelectorAll('.filter-btn-all').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        
        const response = await fetch(`${API_URL}/admin/requests/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            let requests = data.requests || [];
            if (filter !== 'all') {
                requests = requests.filter(r => r.status === filter);
            }
            renderAllRequests(requests);
        }
    });
});

// Event listeners
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/login.html';
});

document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('closeTempModal').addEventListener('click', () => {
    document.getElementById('tempPasswordModal').style.display = 'none';
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', closeModals);
});

document.getElementById('cancelApprove').addEventListener('click', closeModals);
document.getElementById('confirmApprove').addEventListener('click', approveRequest);
document.getElementById('cancelReject').addEventListener('click', closeModals);
document.getElementById('confirmReject').addEventListener('click', rejectRequest);
document.getElementById('changePasswordBtn').addEventListener('click', changePassword);
document.getElementById('updateProfileBtn').addEventListener('click', updateProfile);

// Load dashboard
loadDashboard();
