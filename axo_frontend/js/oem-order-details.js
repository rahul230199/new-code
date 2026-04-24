const API_URL = 'https://axonetworks.com/api';
const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/login.html';

const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('id');

let currentOrder = null;
let messages = [];
let milestones = [];
let pollInterval = null;
let isPolling = false;

async function loadOrderDetails() {
    const container = document.getElementById('orderDetailsContainer');
    if (!container) return;
    
    if (!orderId) {
        container.innerHTML = '<div class="empty-state">No order ID provided. <a href="/oem-orders.html">Back to Orders</a></div>';
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/oem/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        currentOrder = data.order;
        const newMessages = data.communications || [];
        milestones = data.milestones || [];
        
        // Only update messages if they changed (avoid unnecessary re-renders)
        if (JSON.stringify(messages) !== JSON.stringify(newMessages)) {
            messages = newMessages;
            renderMessages();
        }
        
        if (!currentOrder || Object.keys(currentOrder).length === 0) {
            container.innerHTML = '<div class="empty-state">Order not found. <a href="/oem-orders.html">Back to Orders</a></div>';
            return;
        }
        
        renderOrderDetails();
    } catch (error) {
        console.error('Error loading order:', error);
        container.innerHTML = '<div class="empty-state">Error loading order. Please refresh. <a href="/oem-orders.html">Back to Orders</a></div>';
    }
}

function renderOrderDetails() {
    const container = document.getElementById('orderDetailsContainer');
    if (!container || !currentOrder) return;
    
    const completedCount = milestones.filter(m => m.status === 'completed').length;
    const totalCount = milestones.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    // Check if we need to re-render the whole page or just update parts
    const existingHeader = container.querySelector('.po-header');
    if (!existingHeader) {
        // Full render (first time)
        container.innerHTML = `
            <div class="po-header">
                <div class="po-number">PURCHASE ORDER</div>
                <div class="po-title">${escapeHtml(currentOrder.po_number || 'PO-' + currentOrder.id)}</div>
                <div class="po-stats">
                    <div class="po-stat"><i class="fas fa-building"></i> ${escapeHtml(currentOrder.supplier_name || 'Supplier')}</div>
                    <div class="po-stat"><i class="fas fa-calendar"></i> ${new Date(currentOrder.created_at).toLocaleDateString()}</div>
                    <div class="po-stat"><i class="fas fa-dollar-sign"></i> $${(currentOrder.total_value || 0).toLocaleString()}</div>
                    <div class="po-stat"><i class="fas fa-box"></i> ${currentOrder.quantity || 0} units</div>
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
                <div class="progress-text">Overall Progress: ${progress}% Complete</div>
            </div>
            
            <div class="chat-container">
                <div class="chat-header"><i class="fas fa-comments"></i> Communication with Supplier</div>
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
        // Just update timeline and progress
        const progressFill = container.querySelector('.progress-bar-fill');
        if (progressFill) progressFill.style.width = `${progress}%`;
        const progressText = container.querySelector('.progress-text');
        if (progressText) progressText.textContent = `Overall Progress: ${progress}% Complete`;
        renderTimeline(completedCount);
    }
    
    renderMessages();
}

function renderTimeline(completedCount) {
    const stepsDiv = document.getElementById('timelineSteps');
    if (!stepsDiv) return;
    
    const stepNames = ['Order Confirmed', 'Raw Materials', 'Production', 'Quality Check', 'Ready to Ship', 'Delivered', 'Paid'];
    
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
                    ${m.status === 'completed' ? '<br><small>✓ Completed</small>' : ''}
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
        const isSent = msg.sender_type === 'OEM';
        return `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="message-bubble">
                    <div class="message-sender">
                        <i class="fas ${isSent ? 'fa-building' : 'fa-truck'}"></i>
                        <strong>${escapeHtml(msg.sender_name)}</strong>
                        <span style="font-size: 10px;">(${isSent ? 'You' : 'Supplier'})</span>
                    </div>
                    <div class="message-text">${escapeHtml(msg.message)}</div>
                    <div class="message-time">${formatTime(msg.created_at)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    chatDiv.scrollTop = chatDiv.scrollHeight;
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
        const response = await fetch(`${API_URL}/oem/orders/${orderId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: message })
        });
        
        if (response.ok) {
            input.value = '';
            // Immediately add message to UI without waiting for poll
            const newMessage = {
                sender_type: 'OEM',
                sender_name: 'You',
                message: message,
                created_at: new Date().toISOString()
            };
            messages.push(newMessage);
            renderMessages();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to send message');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error sending message');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalText;
    }
}

function attachEventListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    
    if (sendBtn) {
        // Remove existing listeners to avoid duplicates
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
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
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
