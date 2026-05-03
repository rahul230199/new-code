/* =============================================================
   AXO NETWORKS — OEM ORDER DETAILS
   Show Milestone Status (No Pending)
   ============================================================= */

import Router from "../../core/router.js";
import Auth from "../../core/auth.js";
import Toast from "../../core/toast.js";
import { formatDate, formatCurrency } from "../../core/utils.js";

if (!Router.guardPage(["oem", "both", "admin"])) throw new Error("REDIRECT");

let currentOrderId = null;

const el = (id) => document.getElementById(id);
const setText = (id, text) => { const n = el(id); if (n) n.textContent = text; };
const setHTML = (id, html) => { const n = el(id); if (n) n.innerHTML = html; };

function getMilestoneStatusClass(status) {
    const classMap = {
        in_progress: 'info',
        completed: 'success',
        delayed: 'danger'
    };
    return classMap[status] || 'neutral';
}

function formatMilestoneStatus(status) {
    if (status === 'in_progress') return 'In Progress';
    if (status === 'completed') return 'Completed';
    if (status === 'delayed') return 'Delayed';
    return status;
}

function renderMilestones(milestones, progress) {
    const container = el("timelineSteps");
    if (!container) return;
    
    if (!milestones || milestones.length === 0) {
        container.innerHTML = '<div class="empty-state">No milestones defined</div>';
        return;
    }
    
    let html = '';
    milestones.forEach((milestone, index) => {
        const statusClass = getMilestoneStatusClass(milestone.status);
        const statusText = formatMilestoneStatus(milestone.status);
        const isCompleted = milestone.status === 'completed';
        const isActive = milestone.status === 'in_progress';
        
        html += `
            <div class="milestone-step">
                <div class="milestone-step__indicator">
                    <div class="milestone-step__dot ${isCompleted ? 'completed' : isActive ? 'active' : ''}">
                        ${isCompleted ? '<i class="fas fa-check"></i>' : ''}
                    </div>
                    ${index < milestones.length - 1 ? '<div class="milestone-step__connector"></div>' : ''}
                </div>
                <div class="milestone-step__content">
                    <div class="milestone-step__header">
                        <span class="milestone-step__name">${escapeHtml(milestone.milestone_name)}</span>
                        <span class="badge badge--${statusClass}">${statusText}</span>
                    </div>
                    ${milestone.completed_at ? `<div class="milestone-step__date">Completed: ${formatDate(milestone.completed_at)}</div>` : ''}
                    ${milestone.notes ? `<div class="milestone-step__note"><i class="fas fa-sticky-note"></i> ${escapeHtml(milestone.notes)}</div>` : ''}
                    ${milestone.photo_url ? `<div class="milestone-step__photo"><img src="${milestone.photo_url}" alt="Milestone evidence" onclick="window.open(this.src)"></div>` : ''}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    const progressBar = el("progressBarFill");
    const progressText = el("progressText");
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (progressText) progressText.textContent = `${progress}% Complete`;
}

function renderMessages(messages) {
    const container = el("chatMessages");
    if (!container) return;
    
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="chat-empty"><i class="fas fa-comments"></i><p>No messages yet.</p></div>';
        return;
    }
    
    let html = '';
    messages.forEach(msg => {
        const isOEM = msg.sender_type === 'OEM';
        html += `
            <div class="chat-msg ${isOEM ? 'chat-msg--sent' : 'chat-msg--received'}">
                <div class="chat-msg__bubble">
                    <div class="chat-msg__meta">
                        <strong>${escapeHtml(msg.sender_name)}</strong>
                        <span class="chat-msg__role">${msg.sender_type}</span>
                    </div>
                    <div class="chat-msg__text">${escapeHtml(msg.message)}</div>
                    <div class="chat-msg__time">${formatDate(msg.created_at)}</div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const messageInput = el("messageInput");
    const sendBtn = el("sendBtn");
    const message = messageInput?.value.trim();
    
    if (!message) {
        Toast.warning("Please enter a message");
        return;
    }
    
    if (!currentOrderId) return;
    
    try {
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        }
        
        const token = Auth.getToken();
        const response = await fetch(`/api/oem/orders/${currentOrderId}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message })
        });
        
        if (response.status === 401) {
            Auth.logout();
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            if (messageInput) messageInput.value = "";
            // Reload to show new message
            loadOrderDetails();
            Toast.success("Message sent");
        } else {
            Toast.error(data.error || "Failed to send message");
        }
        
    } catch (error) {
        console.error("Send message error:", error);
        Toast.error("Failed to send message");
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
        }
    }
}

async function loadOrderDetails() {
    const container = el("orderDetailsContainer");
    if (!container) return;
    
    container.classList.add("loading");
    
    try {
        const token = Auth.getToken();
        const response = await fetch(`/api/oem/orders/${currentOrderId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            Auth.logout();
            return;
        }
        
        if (response.status === 404) {
            setHTML("orderDetailsContainer", '<div class="empty-state">Order not found</div>');
            return;
        }
        
        const data = await response.json();
        const order = data.order;
        const communications = data.communications || [];
        const milestones = data.milestones || [];
        
        setText("poNumber", order.po_number || `PO-${order.id}`);
        setText("supplierName", order.supplier_name || "N/A");
        setText("orderDate", formatDate(order.created_at));
        setText("orderValue", formatCurrency(order.total_value, order.currency || "USD"));
        setText("orderQuantity", `${order.quantity || 0} units`);
        setText("partName", order.part_name || "N/A");
        setText("paymentTerms", order.payment_terms || "Net 30");
        
        const statusEl = el("orderStatus");
        if (statusEl) {
            // Get current milestone name for status
            const currentMilestone = milestones.find(m => m.status === 'in_progress') || milestones.filter(m => m.status === 'completed').pop();
            const displayStatus = currentMilestone?.milestone_name || order.status || "Order Confirmed";
            statusEl.textContent = displayStatus;
            statusEl.className = `badge badge--primary`;
        }
        
        const completed = milestones.filter(m => m.status === 'completed').length;
        const progress = milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;
        
        renderMilestones(milestones, progress);
        renderMessages(communications);
        
    } catch (error) {
        console.error("Error loading order details:", error);
        setHTML("orderDetailsContainer", '<div class="empty-state">Error loading order details</div>');
        Toast.error("Failed to load order details");
    } finally {
        container.classList.remove("loading");
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

function bindEvents() {
    el("backBtn")?.addEventListener("click", () => {
        window.location.href = "/oem-orders.html";
    });
    
    el("sendBtn")?.addEventListener("click", sendMessage);
    
    el("messageInput")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    el("logoutBtn")?.addEventListener("click", () => Auth.logout());
    el("menuToggle")?.addEventListener("click", () => el("sidebar")?.classList.toggle("open"));
}

function init() {
    const urlParams = new URLSearchParams(window.location.search);
    currentOrderId = urlParams.get("id");
    
    if (!currentOrderId) {
        setHTML("orderDetailsContainer", '<div class="empty-state">No order ID specified</div>');
        return;
    }
    
    const user = Auth.getCurrentUser();
    setText("companyName", user?.company_name || "OEM");
    bindEvents();
    loadOrderDetails();
}

document.addEventListener("DOMContentLoaded", init);
