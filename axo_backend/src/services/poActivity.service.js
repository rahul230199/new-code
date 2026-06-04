/**
 * Service for logging Purchase Order activities and maintaining audit trails
 * Implements immutable audit logging as required by PRD Section: Audit Trail
 */

// ==================== CONSTANTS ====================

const ACTOR_TYPES = {
    OEM: 'OEM',
    SUPPLIER: 'Supplier',
    SYSTEM: 'System'
};

const ACTION_TYPES = {
    // Quote to PO Actions
    QUOTE_ACCEPTED: 'QUOTE_ACCEPTED',
    PO_CREATED: 'PO_CREATED',
    PO_DRAFT_SAVED: 'PO_DRAFT_SAVED',
    
    // PO Workflow Actions
    PO_SENT: 'PO_SENT',
    PO_REVIEWED: 'PO_REVIEWED',
    PO_ACCEPTED: 'PO_ACCEPTED',
    PO_REJECTED: 'PO_REJECTED',
    PO_REVISION_REQUESTED: 'PO_REVISION_REQUESTED',
    
    // PO Status Updates
    PO_STATUS_CHANGED: 'PO_STATUS_CHANGED',
    PRODUCTION_STARTED: 'PRODUCTION_STARTED',
    PRODUCTION_COMPLETE: 'PRODUCTION_COMPLETE',
    READY_FOR_DISPATCH: 'READY_FOR_DISPATCH',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    CLOSED: 'CLOSED',
    
    // Document Actions
    DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
    DOCUMENT_REPLACED: 'DOCUMENT_REPLACED',
    DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
    
    // Invoice Actions
    INVOICE_UPLOADED: 'INVOICE_UPLOADED',
    INVOICE_PAID: 'INVOICE_PAID',
    
    // Update Actions
    DELIVERY_DATE_CHANGED: 'DELIVERY_DATE_CHANGED',
    PAYMENT_TERMS_CHANGED: 'PAYMENT_TERMS_CHANGED',
    SHIPPING_REQUIREMENTS_UPDATED: 'SHIPPING_REQUIREMENTS_UPDATED',
    SPECIAL_INSTRUCTIONS_ADDED: 'SPECIAL_INSTRUCTIONS_ADDED',
    
    // Signature Actions
    OEM_SIGNATURE_ADDED: 'OEM_SIGNATURE_ADDED',
    SUPPLIER_SIGNATURE_ADDED: 'SUPPLIER_SIGNATURE_ADDED',
    
    // Communication
    MESSAGE_SENT: 'MESSAGE_SENT'
};

const PO_STATUS_FLOW = {
    DRAFT: 'draft',
    SENT: 'sent',
    SUPPLIER_REVIEWING: 'supplier_reviewing',
    ACCEPTED: 'accepted',
    REVISION_REQUESTED: 'revision_requested',
    REJECTED: 'rejected',
    PRODUCTION_STARTED: 'production_started',
    PRODUCTION_COMPLETE: 'production_complete',
    READY_FOR_DISPATCH: 'ready_for_dispatch',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CLOSED: 'closed'
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Validates input parameters for activity logging
 * @throws {Error} If validation fails
 */
const validateLogInput = (poId, actionType, userId) => {
    if (!poId) {
        throw new Error('PO ID is required for activity logging');
    }
    
    if (!actionType) {
        throw new Error('Action type is required for activity logging');
    }
    
    if (!userId) {
        throw new Error('User ID is required for activity logging');
    }
    
    if (typeof poId !== 'number' && !Number.isInteger(parseInt(poId))) {
        throw new Error('PO ID must be a valid number');
    }
};

/**
 * Sanitizes values for database storage (handles objects, nulls)
 */
const sanitizeValue = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    
    return String(value);
};

/**
 * Builds a user-friendly activity message for display in timeline
 * This helps with the Order Timeline feature in PRD
 */
const buildActivityMessage = (actionType, actorType, oldValue, newValue) => {
    const actor = actorType === ACTOR_TYPES.OEM ? 'OEM' : 
                  actorType === ACTOR_TYPES.SUPPLIER ? 'Supplier' : 'System';
    
    const messages = {
        [ACTION_TYPES.QUOTE_ACCEPTED]: `${actor} accepted the quotation`,
        [ACTION_TYPES.PO_CREATED]: `Purchase Order was created`,
        [ACTION_TYPES.PO_SENT]: `Purchase Order was sent to supplier`,
        [ACTION_TYPES.PO_ACCEPTED]: `Supplier accepted the Purchase Order`,
        [ACTION_TYPES.PO_REJECTED]: `Purchase Order was rejected`,
        [ACTION_TYPES.PO_REVISION_REQUESTED]: `Revision requested for Purchase Order`,
        [ACTION_TYPES.PRODUCTION_STARTED]: `Production has started`,
        [ACTION_TYPES.PRODUCTION_COMPLETE]: `Production completed`,
        [ACTION_TYPES.READY_FOR_DISPATCH]: `Order is ready for dispatch`,
        [ACTION_TYPES.SHIPPED]: `Order has been shipped`,
        [ACTION_TYPES.DELIVERED]: `Order has been delivered`,
        [ACTION_TYPES.DOCUMENT_UPLOADED]: `Document uploaded: ${newValue?.document_name || 'Unknown'}`,
        [ACTION_TYPES.INVOICE_UPLOADED]: `Invoice uploaded`,
        [ACTION_TYPES.DELIVERY_DATE_CHANGED]: `Delivery date changed from ${oldValue} to ${newValue}`,
        [ACTION_TYPES.OEM_SIGNATURE_ADDED]: `OEM digital signature added`,
        [ACTION_TYPES.SUPPLIER_SIGNATURE_ADDED]: `Supplier digital signature added`
    };
    
    return messages[actionType] || `${actor} performed ${actionType}`;
};

// ==================== MAIN LOGGING FUNCTION ====================

/**
 * Logs purchase order activity for audit trail
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.client - Database client (pool or transaction client)
 * @param {number|string} params.poId - Purchase order ID
 * @param {number|string} params.userId - User ID performing the action
 * @param {string} params.actorType - Type of actor ('OEM', 'Supplier', 'System')
 * @param {string} params.actionType - Type of action being performed
 * @param {any} [params.oldValue=null] - Previous value (for changes)
 * @param {any} [params.newValue=null] - New value (for changes)
 * @param {string} [params.notes=null] - Additional notes about the action
 * @param {string} [params.ipAddress=null] - IP address of the user (for security audit)
 * @param {string} [params.userAgent=null] - User agent for additional context
 * 
 * @returns {Promise<Object>} The created activity log entry
 * 
 * @throws {Error} If validation fails or database error occurs
 * 
 * @example
 * await logPOActivity({
 *     client: dbClient,
 *     poId: 12345,
 *     userId: 67890,
 *     actorType: 'OEM',
 *     actionType: 'PO_ACCEPTED',
 *     newValue: { status: 'accepted', accepted_at: new Date() },
 *     notes: 'Supplier accepted PO with standard terms'
 * });
 */
const logPOActivity = async ({
    client,
    poId,
    userId,
    actorType = ACTOR_TYPES.OEM,
    actionType,
    oldValue = null,
    newValue = null,
    notes = null,
    ipAddress = null,
    userAgent = null
}) => {
    try {
        // Validate required inputs
        validateLogInput(poId, actionType, userId);
        
        // Validate actor type
        if (!Object.values(ACTOR_TYPES).includes(actorType)) {
            throw new Error(`Invalid actor type: ${actorType}. Must be one of: ${Object.values(ACTOR_TYPES).join(', ')}`);
        }
        
        // Sanitize values for storage
        const sanitizedOldValue = sanitizeValue(oldValue);
        const sanitizedNewValue = sanitizeValue(newValue);
        
        // Build user-friendly message for timeline display
        const activityMessage = buildActivityMessage(actionType, actorType, oldValue, newValue);
        
        // Prepare the full notes with activity message
        const fullNotes = notes 
            ? `${activityMessage}. ${notes}` 
            : activityMessage;
        
        // Insert into database
        const query = `
            INSERT INTO po_activity_logs (
                po_id,
                user_id,
                actor_type,
                action_type,
                old_value,
                new_value,
                notes,
                activity_message,
                ip_address,
                user_agent,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING id, po_id, action_type, activity_message, created_at
        `;
        
        const values = [
            parseInt(poId),
            parseInt(userId),
            actorType,
            actionType,
            sanitizedOldValue,
            sanitizedNewValue,
            fullNotes,
            activityMessage,
            ipAddress,
            userAgent
        ];
        
        const result = await client.query(query, values);
        
        // Log success for debugging (optional, can be removed in production)
        if (process.env.NODE_ENV === 'development') {
            console.log(`📝 Activity logged: ${actionType} for PO ${poId} by ${actorType}`);
        }
        
        return result.rows[0];
        
    } catch (error) {
        // Enhanced error with context
        const enhancedError = new Error(
            `Failed to log PO activity for PO ${poId}, action ${actionType}: ${error.message}`
        );
        enhancedError.originalError = error;
        enhancedError.poId = poId;
        enhancedError.actionType = actionType;
        
        console.error('❌ Activity logging error:', {
            poId,
            actionType,
            userId,
            actorType,
            error: error.message,
            stack: error.stack
        });
        
        throw enhancedError;
    }
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Retrieves activity timeline for a purchase order
 * Implements immutable timeline requirement from PRD
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.client - Database client
 * @param {number} params.poId - Purchase order ID
 * @param {Object} [params.options] - Query options
 * @param {number} [params.options.limit] - Limit number of records
 * @param {number} [params.options.offset] - Offset for pagination
 * @returns {Promise<Array>} Chronological list of activities (oldest first)
 */
const getPOTimeline = async ({ client, poId, options = {} }) => {
    const { limit = 100, offset = 0 } = options;
    
    const query = `
        SELECT 
            id,
            po_id,
            user_id,
            actor_type,
            action_type,
            old_value,
            new_value,
            notes,
            activity_message,
            ip_address,
            created_at
        FROM po_activity_logs
        WHERE po_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
    `;
    
    const result = await client.query(query, [poId, limit, offset]);
    
    // Format for timeline display (as per PRD example)
    return result.rows.map(log => ({
        timestamp: log.created_at,
        action: log.activity_message,
        actor: log.actor_type,
        details: log.notes,
        metadata: {
            actionType: log.action_type,
            oldValue: log.old_value ? JSON.parse(log.old_value) : null,
            newValue: log.new_value ? JSON.parse(log.new_value) : null
        }
    }));
};

/**
 * Gets the complete audit trail for a purchase order
 * Audit trail cannot be edited or deleted as per PRD
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.client - Database client
 * @param {number} params.poId - Purchase order ID
 * @returns {Promise<Array>} Complete audit trail
 */
const getPOAuditTrail = async ({ client, poId }) => {
    const query = `
        SELECT 
            al.id,
            al.po_id,
            u.email as user_email,
            u.company_name as user_company,
            al.actor_type,
            al.action_type,
            al.old_value,
            al.new_value,
            al.notes,
            al.activity_message,
            al.ip_address,
            al.user_agent,
            al.created_at
        FROM po_activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.po_id = $1
        ORDER BY al.created_at DESC
    `;
    
    const result = await client.query(query, [poId]);
    
    // Parse JSON values for easier consumption
    return result.rows.map(log => ({
        ...log,
        old_value: log.old_value ? JSON.parse(log.old_value) : null,
        new_value: log.new_value ? JSON.parse(log.new_value) : null
    }));
};

/**
 * Validates if a status transition is allowed based on workflow
 * Implements Status Workflow from PRD (Section: Status Workflow)
 * 
 * @param {string} currentStatus - Current PO status
 * @param {string} newStatus - Desired new status
 * @returns {boolean} Whether the transition is allowed
 */
const isValidStatusTransition = (currentStatus, newStatus) => {
    const validTransitions = {
        [PO_STATUS_FLOW.DRAFT]: [PO_STATUS_FLOW.SENT, PO_STATUS_FLOW.CLOSED],
        [PO_STATUS_FLOW.SENT]: [PO_STATUS_FLOW.SUPPLIER_REVIEWING, PO_STATUS_FLOW.REVISION_REQUESTED, PO_STATUS_FLOW.REJECTED],
        [PO_STATUS_FLOW.SUPPLIER_REVIEWING]: [PO_STATUS_FLOW.ACCEPTED, PO_STATUS_FLOW.REVISION_REQUESTED, PO_STATUS_FLOW.REJECTED],
        [PO_STATUS_FLOW.ACCEPTED]: [PO_STATUS_FLOW.PRODUCTION_STARTED, PO_STATUS_FLOW.CLOSED],
        [PO_STATUS_FLOW.REVISION_REQUESTED]: [PO_STATUS_FLOW.SENT],
        [PO_STATUS_FLOW.PRODUCTION_STARTED]: [PO_STATUS_FLOW.PRODUCTION_COMPLETE],
        [PO_STATUS_FLOW.PRODUCTION_COMPLETE]: [PO_STATUS_FLOW.READY_FOR_DISPATCH],
        [PO_STATUS_FLOW.READY_FOR_DISPATCH]: [PO_STATUS_FLOW.SHIPPED],
        [PO_STATUS_FLOW.SHIPPED]: [PO_STATUS_FLOW.DELIVERED],
        [PO_STATUS_FLOW.DELIVERED]: [PO_STATUS_FLOW.CLOSED],
        [PO_STATUS_FLOW.REJECTED]: [], // Terminal state
        [PO_STATUS_FLOW.CLOSED]: [] // Terminal state
    };
    
    const allowed = validTransitions[currentStatus] || [];
    return allowed.includes(newStatus);
};

/**
 * Logs a status change with validation
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.client - Database client
 * @param {number} params.poId - Purchase order ID
 * @param {number} params.userId - User ID
 * @param {string} params.actorType - Actor type
 * @param {string} params.oldStatus - Previous status
 * @param {string} params.newStatus - New status
 * @param {string} [params.notes] - Additional notes
 * @returns {Promise<Object>} Logged activity
 */
const logStatusChange = async ({
    client,
    poId,
    userId,
    actorType,
    oldStatus,
    newStatus,
    notes = null
}) => {
    // Validate status transition
    if (!isValidStatusTransition(oldStatus, newStatus)) {
        throw new Error(
            `Invalid status transition from '${oldStatus}' to '${newStatus}'. ` +
            `Allowed transitions: ${isValidStatusTransition(oldStatus, newStatus)}`
        );
    }
    
    // Map status to action type
    const statusToAction = {
        [PO_STATUS_FLOW.SENT]: ACTION_TYPES.PO_SENT,
        [PO_STATUS_FLOW.ACCEPTED]: ACTION_TYPES.PO_ACCEPTED,
        [PO_STATUS_FLOW.REJECTED]: ACTION_TYPES.PO_REJECTED,
        [PO_STATUS_FLOW.REVISION_REQUESTED]: ACTION_TYPES.PO_REVISION_REQUESTED,
        [PO_STATUS_FLOW.PRODUCTION_STARTED]: ACTION_TYPES.PRODUCTION_STARTED,
        [PO_STATUS_FLOW.PRODUCTION_COMPLETE]: ACTION_TYPES.PRODUCTION_COMPLETE,
        [PO_STATUS_FLOW.READY_FOR_DISPATCH]: ACTION_TYPES.READY_FOR_DISPATCH,
        [PO_STATUS_FLOW.SHIPPED]: ACTION_TYPES.SHIPPED,
        [PO_STATUS_FLOW.DELIVERED]: ACTION_TYPES.DELIVERED,
        [PO_STATUS_FLOW.CLOSED]: ACTION_TYPES.CLOSED
    };
    
    const actionType = statusToAction[newStatus] || ACTION_TYPES.PO_STATUS_CHANGED;
    
    return await logPOActivity({
        client,
        poId,
        userId,
        actorType,
        actionType,
        oldValue: { status: oldStatus },
        newValue: { status: newStatus },
        notes: notes || `Status changed from ${oldStatus} to ${newStatus}`
    });
};

// ==================== EXPORTS ====================

module.exports = {
    // Main function
    logPOActivity,
    
    // Utility functions
    getPOTimeline,
    getPOAuditTrail,
    isValidStatusTransition,
    logStatusChange,
    
    // Constants for external use
    ACTOR_TYPES,
    ACTION_TYPES,
    PO_STATUS_FLOW
};