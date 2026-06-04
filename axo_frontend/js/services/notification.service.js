/**
 * Notification Service - Email + Platform Notifications
 * AXO Networks
 * 
 * PRD Alignment: Pages 4, 6-7 (Notifications - Platform + Email)
 * 
 * Features:
 * - Platform notifications (in-app)
 * - Email notifications via SMTP
 * - Notification templates for different events
 * - Batch notification sending
 * - Retry logic for failed emails
 * - Notification preferences per user
 * 
 * Backend integration points:
 * - Called from controllers when events occur
 * - Integrates with notificationRoutes.js endpoints
 */

const nodemailer = require('nodemailer');
const pool = require('../config/database');
const { logPOActivity } = require('./poActivity.service');

// ==================== CONSTANTS ====================

// Notification Types
const NOTIFICATION_TYPES = {
    // Quote/PO Flow
    QUOTE_RECEIVED: 'quote_received',
    QUOTE_ACCEPTED: 'quote_accepted',
    PO_CREATED: 'po_created',
    PO_SENT: 'po_sent',
    PO_RECEIVED: 'po_received',
    
    // PO Response Flow
    PO_ACCEPTED: 'po_accepted',
    PO_REJECTED: 'po_rejected',
    PO_REVISION_REQUESTED: 'po_revision_requested',
    
    // Production Flow
    PRODUCTION_STARTED: 'production_started',
    PRODUCTION_UPDATED: 'production_updated',
    MILESTONE_COMPLETED: 'milestone_completed',
    
    // Document Flow
    DOCUMENT_UPLOADED: 'document_uploaded',
    DOCUMENT_REPLACED: 'document_replaced',
    
    // Communication
    MESSAGE_RECEIVED: 'message_received',
    
    // Order Status
    ORDER_SHIPPED: 'order_shipped',
    ORDER_DELIVERED: 'order_delivered',
    ORDER_COMPLETED: 'order_completed',
    
    // System
    SYSTEM_ALERT: 'system_alert',
    REMINDER: 'reminder'
};

// Notification Priorities
const NOTIFICATION_PRIORITY = {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent'
};

// Email Templates (HTML)
const EMAIL_TEMPLATES = {
    [NOTIFICATION_TYPES.PO_RECEIVED]: {
        subject: 'New Purchase Order Received - {{po_number}}',
        template: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0;">📦 New Purchase Order</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Hello {{supplier_name}},</h2>
                    <p style="color: #475569; line-height: 1.6;">You have received a new Purchase Order from <strong>{{oem_name}}</strong>.</p>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 8px 0; color: #64748b;">PO Number:</td><td style="padding: 8px 0; font-weight: 600;">{{po_number}}</td></tr>
                            <tr><td style="padding: 8px 0; color: #64748b;">Part Name:</td><td style="padding: 8px 0;">{{part_name}}</td></tr>
                            <tr><td style="padding: 8px 0; color: #64748b;">Quantity:</td><td style="padding: 8px 0;">{{quantity}} units</td></tr>
                            <tr><td style="padding: 8px 0; color: #64748b;">Total Value:</td><td style="padding: 8px 0; font-weight: 600;">{{total_value}}</td></tr>
                            <tr><td style="padding: 8px 0; color: #64748b;">Delivery Date:</td><td style="padding: 8px 0;">{{delivery_date}}</td></tr>
                        </table>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{{action_url}}" style="background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">Review & Respond →</a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        AXO Networks - Supply Chain Management Platform
                    </p>
                </div>
            </div>
        `
    },
    
    [NOTIFICATION_TYPES.PO_ACCEPTED]: {
        subject: 'Supplier Accepted Purchase Order - {{po_number}}',
        template: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0;">✅ PO Accepted</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Great News, {{oem_name}}!</h2>
                    <p style="color: #475569; line-height: 1.6;"><strong>{{supplier_name}}</strong> has accepted your Purchase Order <strong>{{po_number}}</strong>.</p>
                    
                    <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                        <p style="margin: 0; color: #065f46;">✓ Supplier has added their digital signature</p>
                        <p style="margin: 10px 0 0 0; color: #065f46;">✓ Awaiting your signature to finalize</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{{action_url}}" style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">Add Your Signature →</a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        AXO Networks - Supply Chain Management Platform
                    </p>
                </div>
            </div>
        `
    },
    
    [NOTIFICATION_TYPES.PO_REJECTED]: {
        subject: 'Purchase Order Rejected - {{po_number}}',
        template: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0;">⚠️ PO Rejected</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Hello {{oem_name}},</h2>
                    <p style="color: #475569; line-height: 1.6;"><strong>{{supplier_name}}</strong> has rejected Purchase Order <strong>{{po_number}}</strong>.</p>
                    
                    <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
                        <p style="margin: 0; color: #991b1b;"><strong>Reason given:</strong></p>
                        <p style="margin: 8px 0 0 0; color: #991b1b;">{{rejection_reason}}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{{action_url}}" style="background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">Review & Take Action →</a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        AXO Networks - Supply Chain Management Platform
                    </p>
                </div>
            </div>
        `
    },
    
    [NOTIFICATION_TYPES.QUOTE_RECEIVED]: {
        subject: 'New Quote Received - {{rfq_title}}',
        template: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0;">💬 New Quote Received</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Hello {{oem_name}},</h2>
                    <p style="color: #475569; line-height: 1.6;"><strong>{{supplier_name}}</strong> has submitted a quote for <strong>{{rfq_title}}</strong>.</p>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 8px 0; color: #64748b;">Price:</td><td style="padding: 8px 0; font-weight: 600;">{{price}}</td></tr>
                            <tr><td style="padding: 8px 0; color: #64748b;">Lead Time:</td><td style="padding: 8px 0;">{{lead_time}} days</td></tr>
                            <tr><td style="padding: 8px 0; color: #64748b;">Payment Terms:</td><td style="padding: 8px 0;">{{payment_terms}}</td></tr>
                        </table>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{{action_url}}" style="background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">Review Quote →</a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        AXO Networks - Supply Chain Management Platform
                    </p>
                </div>
            </div>
        `
    },
    
    [NOTIFICATION_TYPES.MILESTONE_COMPLETED]: {
        subject: 'Production Update - {{po_number}}',
        template: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0;">🏭 Production Update</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Hello {{recipient_name}},</h2>
                    <p style="color: #475569; line-height: 1.6;"><strong>{{supplier_name}}</strong> has updated the production status for PO <strong>{{po_number}}</strong>.</p>
                    
                    <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 18px; font-weight: 600; color: #065f46;">✓ {{milestone_name}} is now {{milestone_status}}</p>
                        {{milestone_notes ? `<p style="margin: 10px 0 0 0; color: #475569;">Notes: {{milestone_notes}}</p>` : ''}}
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{{action_url}}" style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">Track Progress →</a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        AXO Networks - Supply Chain Management Platform
                    </p>
                </div>
            </div>
        `
    },
    
    [NOTIFICATION_TYPES.REMINDER]: {
        subject: 'Reminder: Action Required - {{po_number}}',
        template: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0;">⏰ Action Required</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Hello {{recipient_name}},</h2>
                    <p style="color: #475569; line-height: 1.6;">This is a reminder regarding Purchase Order <strong>{{po_number}}</strong>.</p>
                    
                    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                        <p style="margin: 0; color: #92400e;"><strong>{{reminder_message}}</strong></p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{{action_url}}" style="background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">Take Action →</a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        AXO Networks - Supply Chain Management Platform
                    </p>
                </div>
            </div>
        `
    },
    
    [NOTIFICATION_TYPES.MESSAGE_RECEIVED]: {
        subject: 'New Message on {{po_number}}',
        template: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0;">💬 New Message</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                    <h2 style="color: #1e293b; margin-top: 0;">Hello {{recipient_name}},</h2>
                    <p style="color: #475569; line-height: 1.6;">You have a new message from <strong>{{sender_name}}</strong> regarding PO <strong>{{po_number}}</strong>.</p>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5;">
                        <p style="margin: 0; font-style: italic; color: #475569;">"{{message_preview}}"</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{{action_url}}" style="background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">View & Reply →</a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        AXO Networks - Supply Chain Management Platform
                    </p>
                </div>
            </div>
        `
    }
};

// ==================== EMAIL CONFIGURATION ====================

// Email transport configuration (load from environment variables)
const getEmailTransporter = () => {
    // Check if email is enabled
    if (process.env.EMAIL_ENABLED !== 'true') {
        return null;
    }
    
    // For production: Use SMTP
    if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }
    
    // For development: Use ethereal.email (fake SMTP for testing)
    if (process.env.NODE_ENV === 'development') {
        return nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: process.env.ETHEREAL_USER || 'test@ethereal.email',
                pass: process.env.ETHEREAL_PASS || 'test123'
            }
        });
    }
    
    return null;
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Parse template with variables
 */
const parseTemplate = (template, variables) => {
    let parsed = template;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        parsed = parsed.replace(regex, value || '—');
    }
    return parsed;
};

/**
 * Get frontend URL for action buttons
 */
const getActionUrl = (type, referenceId) => {
    const baseUrl = process.env.FRONTEND_URL || 'https://axonetworks.com';
    
    const urls = {
        [NOTIFICATION_TYPES.PO_RECEIVED]: `${baseUrl}/supplier-po-response.html?id=${referenceId}`,
        [NOTIFICATION_TYPES.PO_ACCEPTED]: `${baseUrl}/oem-po-send.html?id=${referenceId}`,
        [NOTIFICATION_TYPES.PO_REJECTED]: `${baseUrl}/oem-po-send.html?id=${referenceId}`,
        [NOTIFICATION_TYPES.QUOTE_RECEIVED]: `${baseUrl}/oem-rfq.html?quote=${referenceId}`,
        [NOTIFICATION_TYPES.MILESTONE_COMPLETED]: `${baseUrl}/oem-production-milestones.html?id=${referenceId}`,
        [NOTIFICATION_TYPES.REMINDER]: `${baseUrl}/oem-po-send.html?id=${referenceId}`,
        [NOTIFICATION_TYPES.MESSAGE_RECEIVED]: `${baseUrl}/oem-order-details.html?id=${referenceId}`
    };
    
    return urls[type] || `${baseUrl}/dashboard.html`;
};

/**
 * Get user email and preferences
 */
const getUserEmail = async (userId) => {
    try {
        const result = await pool.query(
            'SELECT email, company_name, notification_preferences FROM users WHERE id = $1',
            [userId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting user email:', error);
        return null;
    }
};

/**
 * Create platform notification
 */
const createPlatformNotification = async (userId, title, message, type, referenceId, priority = NOTIFICATION_PRIORITY.NORMAL) => {
    try {
        const result = await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id, priority, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id
        `, [userId, title, message, type, referenceId, priority]);
        
        return result.rows[0];
    } catch (error) {
        console.error('Error creating platform notification:', error);
        return null;
    }
};

/**
 * Send email notification
 */
const sendEmail = async (to, subject, html, from = null) => {
    const transporter = getEmailTransporter();
    
    if (!transporter) {
        console.log('Email disabled or not configured. Would send:', { to, subject });
        return { success: false, message: 'Email not configured' };
    }
    
    try {
        const fromEmail = from || process.env.EMAIL_FROM || 'noreply@axonetworks.com';
        
        const info = await transporter.sendMail({
            from: `"AXO Networks" <${fromEmail}>`,
            to,
            subject,
            html
        });
        
        console.log(`Email sent: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
        
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
};

// ==================== MAIN NOTIFICATION FUNCTIONS ====================

/**
 * Send notification (both platform and email)
 * 
 * @param {Object} params
 * @param {number} params.userId - Recipient user ID
 * @param {string} params.type - Notification type from NOTIFICATION_TYPES
 * @param {number} params.referenceId - Reference ID (PO ID, RFQ ID, etc.)
 * @param {Object} params.data - Additional data for template
 * @param {boolean} params.sendEmail - Whether to send email (default true)
 * @param {string} params.priority - Priority level
 * @returns {Promise<Object>}
 */
const sendNotification = async ({
    userId,
    type,
    referenceId,
    data = {},
    sendEmail = true,
    priority = NOTIFICATION_PRIORITY.NORMAL
}) => {
    try {
        // Get user info
        const user = await getUserEmail(userId);
        if (!user) {
            console.error(`User ${userId} not found`);
            return { success: false, error: 'User not found' };
        }
        
        // Get template
        const template = EMAIL_TEMPLATES[type];
        if (!template) {
            console.error(`No template found for type: ${type}`);
            return { success: false, error: 'Template not found' };
        }
        
        // Prepare variables for template
        const variables = {
            ...data,
            recipient_name: user.company_name || 'User',
            action_url: getActionUrl(type, referenceId),
            timestamp: new Date().toLocaleString()
        };
        
        // Create platform notification
        const platformNotification = await createPlatformNotification(
            userId,
            parseTemplate(template.subject, variables),
            parseTemplate(template.template.replace(/<[^>]*>/g, '').substring(0, 200), variables),
            type,
            referenceId,
            priority
        );
        
        let emailResult = { success: false };
        
        // Send email if enabled
        if (sendEmail && process.env.EMAIL_ENABLED === 'true') {
            const emailSubject = parseTemplate(template.subject, variables);
            const emailHtml = parseTemplate(template.template, variables);
            
            emailResult = await sendEmail(user.email, emailSubject, emailHtml);
            
            // Update notification with email sent status
            if (emailResult.success && platformNotification) {
                await pool.query(`
                    UPDATE notifications 
                    SET email_sent = TRUE, email_sent_at = NOW()
                    WHERE id = $1
                `, [platformNotification.id]);
            }
        }
        
        return {
            success: true,
            platform: platformNotification,
            email: emailResult
        };
        
    } catch (error) {
        console.error('Error sending notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send bulk notifications to multiple users
 */
const sendBulkNotification = async ({
    userIds,
    type,
    referenceId,
    data = {},
    sendEmail = true,
    priority = NOTIFICATION_PRIORITY.NORMAL
}) => {
    const results = [];
    
    for (const userId of userIds) {
        const result = await sendNotification({
            userId,
            type,
            referenceId,
            data,
            sendEmail,
            priority
        });
        results.push({ userId, ...result });
    }
    
    return results;
};

/**
 * Send notification to all stakeholders of an order
 */
const sendOrderNotification = async ({
    orderId,
    type,
    data = {},
    sendEmail = true,
    priority = NOTIFICATION_PRIORITY.NORMAL
}) => {
    try {
        // Get order stakeholders
        const orderResult = await pool.query(`
            SELECT oem_id, supplier_id FROM purchase_orders WHERE id = $1
        `, [orderId]);
        
        if (!orderResult.rows.length) {
            return { success: false, error: 'Order not found' };
        }
        
        const { oem_id, supplier_id } = orderResult.rows[0];
        
        const results = await sendBulkNotification({
            userIds: [oem_id, supplier_id],
            type,
            referenceId: orderId,
            data,
            sendEmail,
            priority
        });
        
        return { success: true, results };
        
    } catch (error) {
        console.error('Error sending order notification:', error);
        return { success: false, error: error.message };
    }
};

// ==================== SPECIFIC NOTIFICATION HELPERS ====================

/**
 * Notify OEM about new quote
 */
const notifyQuoteReceived = async (oemId, rfqId, supplierName, quoteData) => {
    return sendNotification({
        userId: oemId,
        type: NOTIFICATION_TYPES.QUOTE_RECEIVED,
        referenceId: rfqId,
        data: {
            rfq_title: quoteData.rfq_title,
            supplier_name: supplierName,
            price: quoteData.price,
            lead_time: quoteData.lead_time_days,
            payment_terms: quoteData.payment_terms
        },
        priority: NOTIFICATION_PRIORITY.HIGH
    });
};

/**
 * Notify supplier about new PO
 */
const notifyPOCreated = async (supplierId, poId, poData) => {
    return sendNotification({
        userId: supplierId,
        type: NOTIFICATION_TYPES.PO_RECEIVED,
        referenceId: poId,
        data: {
            po_number: poData.po_number,
            oem_name: poData.oem_name,
            part_name: poData.part_name,
            quantity: poData.quantity,
            total_value: poData.total_value,
            delivery_date: poData.delivery_date
        },
        priority: NOTIFICATION_PRIORITY.HIGH
    });
};

/**
 * Notify OEM about PO acceptance
 */
const notifyPOAccepted = async (oemId, poId, poData, supplierName) => {
    return sendNotification({
        userId: oemId,
        type: NOTIFICATION_TYPES.PO_ACCEPTED,
        referenceId: poId,
        data: {
            po_number: poData.po_number,
            supplier_name: supplierName,
            oem_name: poData.oem_name
        },
        priority: NOTIFICATION_PRIORITY.HIGH
    });
};

/**
 * Notify OEM about PO rejection
 */
const notifyPORejected = async (oemId, poId, poData, supplierName, reason) => {
    return sendNotification({
        userId: oemId,
        type: NOTIFICATION_TYPES.PO_REJECTED,
        referenceId: poId,
        data: {
            po_number: poData.po_number,
            supplier_name: supplierName,
            rejection_reason: reason
        },
        priority: NOTIFICATION_PRIORITY.HIGH
    });
};

/**
 * Notify about milestone completion
 */
const notifyMilestoneCompleted = async (orderId, milestoneName, status, notes, userIds) => {
    const orderResult = await pool.query(`
        SELECT po_number, supplier_name FROM purchase_orders WHERE id = $1
    `, [orderId]);
    
    const orderData = orderResult.rows[0] || {};
    
    return sendBulkNotification({
        userIds,
        type: NOTIFICATION_TYPES.MILESTONE_COMPLETED,
        referenceId: orderId,
        data: {
            po_number: orderData.po_number,
            milestone_name: milestoneName,
            milestone_status: status,
            milestone_notes: notes,
            supplier_name: orderData.supplier_name
        },
        priority: NOTIFICATION_PRIORITY.NORMAL
    });
};

/**
 * Send reminder notification
 */
const sendReminder = async (userId, poId, poNumber, message) => {
    return sendNotification({
        userId,
        type: NOTIFICATION_TYPES.REMINDER,
        referenceId: poId,
        data: {
            po_number: poNumber,
            reminder_message: message
        },
        priority: NOTIFICATION_PRIORITY.NORMAL
    });
};

/**
 * Notify about new message
 */
const notifyNewMessage = async (recipientId, poId, poNumber, senderName, messagePreview) => {
    return sendNotification({
        userId: recipientId,
        type: NOTIFICATION_TYPES.MESSAGE_RECEIVED,
        referenceId: poId,
        data: {
            po_number: poNumber,
            sender_name: senderName,
            message_preview: messagePreview.substring(0, 100)
        },
        priority: NOTIFICATION_PRIORITY.NORMAL
    });
};

// ==================== EXPORTS ====================

module.exports = {
    // Main function
    sendNotification,
    sendBulkNotification,
    sendOrderNotification,
    
    // Specific helpers
    notifyQuoteReceived,
    notifyPOCreated,
    notifyPOAccepted,
    notifyPORejected,
    notifyMilestoneCompleted,
    sendReminder,
    notifyNewMessage,
    
    // Constants
    NOTIFICATION_TYPES,
    NOTIFICATION_PRIORITY,
    
    // Email utilities (for testing)
    getEmailTransporter,
    sendEmail
};