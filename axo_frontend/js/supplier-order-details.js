const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('id');

let currentOrder = null;
let messages = [];
let milestones = [];
let pollInterval = null;

async function loadOrderDetails() {
    const container = document.getElementById('orderDetailsContainer');
    if (!container) return;
    
    if (!orderId) {
        container.innerHTML = '<div class="empty-state">No order ID provided. <a href="/supplier-orders.html">Back to Orders</a></div>';
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/supplier/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        currentOrder = data.order;
        const newMessages = data.communications || [];
        milestones = data.milestones || [];
        
        // Only update if changed
        if (JSON.stringify(messages) !== JSON.stringify(newMessages)) {
            messages = newMessages;
        }
        
        if (!currentOrder || Object.keys(currentOrder).length === 0) {
            container.innerHTML = '<div class="empty-state">Order not found. <a href="/supplier-orders.html">Back to Orders</a></div>';
            return;
        }
        
        renderOrderDetails();
    } catch (error) {
        console.error('Error loading order:', error);
        container.innerHTML = '<div class="empty-state">Error loading order. Please refresh. <a href="/supplier-orders.html">Back to Orders</a></div>';
    }
}

function renderOrderDetails() {
    const container = document.getElementById('orderDetailsContainer');
    if (!container || !currentOrder) return;
    
    const completedCount = milestones.filter(m => m.status === 'completed').length;
    const totalCount = milestones.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const pendingMilestones = milestones.filter(m => m.status !== 'completed');
    
    const existingHeader = container.querySelector('.po-header');
    if (!existingHeader) {
        container.innerHTML = `
            <div class="po-header">
                <div class="po-number">PURCHASE ORDER</div>
                <div class="po-title">${escapeHtml(currentOrder.po_number || 'PO-' + currentOrder.id)}</div>
                <div class="po-stats">
                    <div class="po-stat"><i class="fas fa-building"></i> ${escapeHtml(currentOrder.oem_name)}</div>
                    <div class="po-stat"><i class="fas fa-calendar"></i> ${new Date(currentOrder.created_at).toLocaleDateString()}</div>
                    <div class="po-stat"><i class="fas fa-dollar-sign"></i> $${(currentOrder.total_value || 0).toLocaleString()}</div>
                    <div class="po-stat"><i class="fas fa-box"></i> ${currentOrder.quantity || 0} units</div>
                    <div class="po-stat"><i class="fas fa-chart-line"></i> Progress: ${progress}%</div>
                </div>
            </div>
            
            <div class="info-grid">
                <div class="info-card"><h3>Part Information</h3><div class="value">${escapeHtml(currentOrder.part_name || 'N/A')}</div></div>
                <div class="info-card"><h3>Payment Terms</h3><div class="value">${currentOrder.payment_terms || 'Net 30'}</div></div>
                <div class="info-card"><h3>Status</h3><div class="value"><span class="status-badge status-${currentOrder.status}">${(currentOrder.status || 'PENDING').toUpperCase()}</span></div></div>
            </div>
            
            <div class="timeline-container">
                <h3><i class="fas fa-chart-line"></i> Production Timeline</h3>
                <div class="timeline-steps" id="timelineSteps"></div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${progress}%"></div>
                </div>
                
                ${pendingMilestones.length > 0 ? `
                    <div class="milestone-update-section">
                        <h4><i class="fas fa-upload"></i> Update Milestone</h4>
                        <div class="milestone-select-row">
                            <select id="milestoneSelect" class="form-control">
                                <option value="">-- Select milestone --</option>
                                ${pendingMilestones.map(m => `<option value="${m.id}">${m.milestone_name}</option>`).join('')}
                            </select>
                            <select id="milestoneStatus" class="form-control">
                                <option value="completed">✓ Complete</option>
                                <option value="in_progress">⏳ In Progress</option>
                            </select>
                            <button class="btn-primary" id="updateMilestoneBtn">Update Milestone</button>
                        </div>
                        <div id="updateMessage" style="margin-top: 10px; display: none;"></div>
                    </div>
                ` : `
                    <div class="milestone-update-section" style="background: #d1fae5; text-align: center;">
                        <h4><i class="fas fa-check-circle"></i> All Milestones Completed!</h4>
                    </div>
                `}
            </div>
            
            <div class="chat-container">
                <div class="chat-header"><i class="fas fa-comments"></i> Communication with Buyer</div>
                <div class="chat-messages" id="chatMessages"></div>
                <div class="chat-input">
                    <textarea id="messageInput" placeholder="Type your message... Press Enter to send" rows="2"></textarea>
                    <button id="sendBtn"><i class="fas fa-paper-plane"></i> Send</button>
                </div>
            </div>
        `;
        renderTimeline(completedCount);
        attachEventListeners();
    } else {
        // Update progress and timeline
        const progressFill = container.querySelector('.progress-bar-fill');
        if (progressFill) progressFill.style.width = `${progress}%`;
        renderTimeline(completedCount);
    }
    
    renderMessages();
}

function renderTimeline(completedCount) {
    const stepsDiv = document.getElementById('timelineSteps');
    if (!stepsDiv) return;
    
    stepsDiv.innerHTML = milestones.map((m, index) => {
        let statusClass = '';
        let icon = 'fa-clock';
        
        if (m.status === 'completed') {
            statusClass = 'completed';
            icon = 'fa-check';
        } else if (index === completedCount) {
            statusClass = 'active';
            icon = 'fa-spinner fa-pulse';
        }
        
        return `
            <div class="timeline-step">
                <div class="step-icon ${statusClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="step-label ${statusClass}">
                    ${m.milestone_name}
                    ${m.status === 'completed' ? '<br><small>✓ Done</small>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderMessages() {
    const chatDiv = document.getElementById('chatMessages');
    if (!chatDiv) return;
    
    if (!messages || messages.length === 0) {
        chatDiv.innerHTML = '<div class="empty-chat"><i class="fas fa-comment-dots fa-2x"></i><p>No messages yet. Start a conversation!</p></div>';
        return;
    }
    
    chatDiv.innerHTML = messages.map(msg => {
        const isSent = msg.sender_type === 'Supplier';
        return `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="message-bubble">
                    <div class="message-sender">
                        <i class="fas ${isSent ? 'fa-truck' : 'fa-building'}"></i>
                        <strong>${escapeHtml(msg.sender_name)}</strong>
                        <span style="font-size: 10px;">(${isSent ? 'You' : 'Buyer'})</span>
                    </div>
                    <div class="message-text">${escapeHtml(msg.message)}</div>
                    <div class="message-time">${formatTime(msg.created_at)}</div>
                </div>
            </div>
        `;
    }).join('');
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

async function updateMilestone() {
    const milestoneSelect = document.getElementById('milestoneSelect');
    const milestoneStatus = document.getElementById('milestoneStatus');
    const milestoneId = milestoneSelect ? milestoneSelect.value : null;
    const status = milestoneStatus ? milestoneStatus.value : 'completed';
    
    if (!milestoneId) {
        showUpdateMessage('Please select a milestone to update', 'error');
        return;
    }
    
    const milestone = milestones.find(m => m.id == milestoneId);
    if (!milestone) return;
    
    const updateBtn = document.getElementById('updateMilestoneBtn');
    const originalText = updateBtn.innerHTML;
    updateBtn.disabled = true;
    updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    
    try {
        const response = await fetch(`${API_URL}/supplier/orders/${orderId}/milestones/${milestoneId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: status, notes: '' })
        });
        
        if (response.ok) {
            showUpdateMessage(`✓ Milestone "${milestone.milestone_name}" updated!`, 'success');
            // Update local milestone status
            const milestoneIndex = milestones.findIndex(m => m.id == milestoneId);
            if (milestoneIndex !== -1) {
                milestones[milestoneIndex].status = status;
            }
            // Re-render timeline
            const completedCount = milestones.filter(m => m.status === 'completed').length;
            renderTimeline(completedCount);
            // Update progress
            const totalCount = milestones.length;
            const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const progressFill = document.querySelector('.progress-bar-fill');
            if (progressFill) progressFill.style.width = `${progress}%`;
        } else {
            showUpdateMessage('Failed to update milestone', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showUpdateMessage('Error updating milestone', 'error');
    } finally {
        updateBtn.disabled = false;
        updateBtn.innerHTML = originalText;
        setTimeout(() => {
            const msgDiv = document.getElementById('updateMessage');
            if (msgDiv) msgDiv.style.display = 'none';
        }, 2000);
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (!message) {
        alert('Please enter a message');
        return;
    }
    
    const sendBtn = document.getElementById('sendBtn');
    const originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    try {
        const response = await fetch(`${API_URL}/supplier/orders/${orderId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: message })
        });
        
        if (response.ok) {
            input.value = '';
            // Add message immediately
            const newMessage = {
                sender_type: 'Supplier',
                sender_name: 'You',
                message: message,
                created_at: new Date().toISOString()
            };
            messages.push(newMessage);
            renderMessages();
        } else {
            alert('Failed to send message');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error sending message');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalText;
    }
}

function showUpdateMessage(message, type) {
    const msgDiv = document.getElementById('updateMessage');
    if (!msgDiv) return;
    
    msgDiv.style.display = 'block';
    msgDiv.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
    msgDiv.style.background = type === 'success' ? '#d1fae5' : '#fee2e2';
    msgDiv.style.color = type === 'success' ? '#065f46' : '#dc2626';
    msgDiv.style.padding = '10px';
    msgDiv.style.borderRadius = '8px';
    msgDiv.style.marginTop = '10px';
}

function attachEventListeners() {
    const updateBtn = document.getElementById('updateMilestoneBtn');
    if (updateBtn) {
        const newUpdateBtn = updateBtn.cloneNode(true);
        updateBtn.parentNode.replaceChild(newUpdateBtn, updateBtn);
        newUpdateBtn.addEventListener('click', updateMilestone);
    }
    
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    
    if (sendBtn) {
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        newSendBtn.addEventListener('click', sendMessage);
    }
    
    if (messageInput) {
        const newInput = messageInput.cloneNode(true);
        messageInput.parentNode.replaceChild(newInput, messageInput);
        newInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

function formatTime(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    const diffHours = Math.floor((now - date) / 3600000);
    const diffDays = Math.floor((now - date) / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        await loadOrderDetails();
    }, 5000);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
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

window.addEventListener('beforeunload', function() {
    stopPolling();
});

document.getElementById('logoutBtn')?.addEventListener('click', function() {
    localStorage.clear();
    window.location.href = '/login.html';
});

document.getElementById('menuToggle')?.addEventListener('click', function() {
    document.getElementById('sidebar')?.classList.toggle('open');
});

loadOrderDetails();
startPolling();
