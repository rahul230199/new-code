/**
 * Service for managing Purchase Order workflow milestones
 * Aligned with PRD Section: Status Workflow & Order Workspace
 */

// ==================== CONSTANTS ====================

// Aligned with PRD Status Workflow
const DEFAULT_MILESTONES = [
    { name: 'PO Accepted', order: 1, isInitialComplete: true, prdStatus: 'accepted' },
    { name: 'Production Started', order: 2, isInitialComplete: false, prdStatus: 'production_started' },
    { name: 'Production Complete', order: 3, isInitialComplete: false, prdStatus: 'production_complete' },
    { name: 'Ready for Dispatch', order: 4, isInitialComplete: false, prdStatus: 'ready_for_dispatch' },
    { name: 'Shipped', order: 5, isInitialComplete: false, prdStatus: 'shipped' },
    { name: 'Delivered', order: 6, isInitialComplete: false, prdStatus: 'delivered' },
    { name: 'Closed', order: 7, isInitialComplete: false, prdStatus: 'closed' }
];

// Optional Quality Milestones (can be sub-milestones under Production Complete)
const QUALITY_MILESTONES = [
    { name: 'Quality Inspection', order: 1, parentMilestone: 'Production Complete' },
    { name: 'Packaging Completed', order: 2, parentMilestone: 'Production Complete' }
];

const MILESTONE_STATUS = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    DELAYED: 'delayed',
    SKIPPED: 'skipped'  // For optional milestones
};

// Map milestone to PRD status
const MILESTONE_TO_PRD_STATUS = {
    'PO Accepted': 'accepted',
    'Production Started': 'production_started',
    'Production Complete': 'production_complete',
    'Ready for Dispatch': 'ready_for_dispatch',
    'Shipped': 'shipped',
    'Delivered': 'delivered',
    'Closed': 'closed'
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Validates the input parameters for milestone creation
 * @throws {Error} If validation fails
 */
const validateMilestoneInput = (client, poId) => {
    if (!client) {
        throw new Error('Database client is required for milestone creation');
    }
    
    if (!poId) {
        throw new Error('PO ID is required for milestone creation');
    }
    
    if (typeof poId !== 'number' && !Number.isInteger(parseInt(poId))) {
        throw new Error('PO ID must be a valid number');
    }
};

/**
 * Determines the initial status for a milestone based on its order
 * Aligned with PRD: First milestone (PO Accepted) should be completed
 * @param {number} milestoneOrder - The order position of the milestone
 * @param {boolean} isInitialComplete - Whether this milestone should be initially complete
 * @returns {string} The milestone status
 */
const getInitialMilestoneStatus = (milestoneOrder, isInitialComplete) => {
    if (isInitialComplete) {
        return MILESTONE_STATUS.COMPLETED;
    }
    
    // First incomplete milestone becomes 'pending' (not started)
    // PRD: Supplier needs to accept first, then production starts
    return MILESTONE_STATUS.PENDING;
};

/**
 * Builds the SQL query for inserting a milestone
 * @returns {string} SQL query string
 */
const buildMilestoneInsertQuery = () => {
    return `
        INSERT INTO order_milestones (
            po_id,
            milestone_name,
            milestone_order,
            status,
            prd_status_mapping,
            completed_at,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, milestone_name, milestone_order, status
    `;
};

/**
 * Calculates the completed_at timestamp based on status
 * @param {string} status - The milestone status
 * @returns {Date|null} Current date if completed, null otherwise
 */
const getCompletedTimestamp = (status) => {
    return status === MILESTONE_STATUS.COMPLETED ? new Date() : null;
};

// ==================== MAIN SERVICE FUNCTION ====================

/**
 * Creates default milestones for a new purchase order
 * Aligned with PRD Section: Status Workflow
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.client - Database client (pool or transaction client)
 * @param {number|string} params.poId - Purchase order ID
 * @param {boolean} [params.includeQualityMilestones=false] - Whether to include quality sub-milestones
 * @returns {Promise<Array>} Array of created milestone objects
 * 
 * @throws {Error} If validation fails or database error occurs
 * 
 * @example
 * await createDefaultMilestones({
 *     client: dbClient,
 *     poId: 12345,
 *     includeQualityMilestones: true  // For manufacturing orders
 * });
 */
const createDefaultMilestones = async ({ client, poId, includeQualityMilestones = false }) => {
    let createdMilestones = [];
    
    try {
        // Validate inputs
        validateMilestoneInput(client, poId);
        
        // Convert poId to integer if needed
        const normalizedPoId = parseInt(poId);
        
        // Prepare query
        const insertQuery = buildMilestoneInsertQuery();
        
        // Insert main workflow milestones (aligned with PRD)
        for (const milestone of DEFAULT_MILESTONES) {
            const status = getInitialMilestoneStatus(milestone.order, milestone.isInitialComplete);
            const completedAt = getCompletedTimestamp(status);
            
            const values = [
                normalizedPoId,
                milestone.name,
                milestone.order,
                status,
                milestone.prdStatus,
                completedAt
            ];
            
            const result = await client.query(insertQuery, values);
            
            if (result.rows && result.rows[0]) {
                createdMilestones.push({
                    ...result.rows[0],
                    prdStatus: milestone.prdStatus
                });
            }
        }
        
        // Optional: Insert quality sub-milestones (for manufacturing orders)
        if (includeQualityMilestones) {
            for (const qualityMilestone of QUALITY_MILESTONES) {
                // Quality milestones start as pending, completed when parent is done
                const values = [
                    normalizedPoId,
                    qualityMilestone.name,
                    DEFAULT_MILESTONES.length + qualityMilestone.order,
                    MILESTONE_STATUS.PENDING,
                    qualityMilestone.parentMilestone,
                    null
                ];
                
                const result = await client.query(insertQuery, values);
                
                if (result.rows && result.rows[0]) {
                    createdMilestones.push({
                        ...result.rows[0],
                        isQualityMilestone: true,
                        parentMilestone: qualityMilestone.parentMilestone
                    });
                }
            }
        }
        
        // Log success for debugging
        console.log(`✅ Created ${createdMilestones.length} default milestones for PO ${normalizedPoId} (PRD aligned)`);
        
        return createdMilestones;
        
    } catch (error) {
        // Enhanced error with context
        const enhancedError = new Error(
            `Failed to create default milestones for PO ${poId}: ${error.message}`
        );
        enhancedError.originalError = error;
        enhancedError.poId = poId;
        
        console.error('❌ Milestone creation error:', {
            poId,
            error: error.message,
            stack: error.stack
        });
        
        throw enhancedError;
    }
};

/**
 * Updates milestone and optionally triggers PO status change
 * Aligned with PRD status workflow
 * 
 * @param {Object} params - Function parameters
 * @param {Object} params.client - Database client
 * @param {number} params.milestoneId - Milestone ID
 * @param {string} params.status - New status
 * @param {Function} params.onPOStatusUpdate - Callback to update PO status
 * @returns {Promise<Object>} Updated milestone
 */
const updateMilestoneStatus = async ({ client, milestoneId, status, onPOStatusUpdate = null }) => {
    if (!Object.values(MILESTONE_STATUS).includes(status)) {
        throw new Error(`Invalid milestone status: ${status}`);
    }
    
    // Fetch milestone details first
    const milestoneQuery = `
        SELECT id, po_id, milestone_name, prd_status_mapping, status as current_status
        FROM order_milestones
        WHERE id = $1
    `;
    const milestoneResult = await client.query(milestoneQuery, [milestoneId]);
    
    if (!milestoneResult.rows[0]) {
        throw new Error(`Milestone ${milestoneId} not found`);
    }
    
    const milestone = milestoneResult.rows[0];
    
    // Update milestone status
    const updateQuery = `
        UPDATE order_milestones 
        SET status = $1,
            completed_at = CASE 
                WHEN $1 = 'completed' THEN NOW() 
                ELSE NULL 
            END,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
    `;
    
    const result = await client.query(updateQuery, [status, milestoneId]);
    const updatedMilestone = result.rows[0];
    
    // Trigger PO status update if milestone completed and callback provided
    if (status === MILESTONE_STATUS.COMPLETED && onPOStatusUpdate) {
        const prdStatus = milestone.prd_status_mapping;
        if (prdStatus && MILESTONE_TO_PRD_STATUS[milestone.milestone_name]) {
            await onPOStatusUpdate(milestone.po_id, prdStatus);
        }
    }
    
    return updatedMilestone;
};

// ==================== OTHER UTILITY FUNCTIONS ====================

/**
 * Gets all milestones for a specific PO
 * @param {Object} params - Function parameters
 * @param {Object} params.client - Database client
 * @param {number} params.poId - Purchase order ID
 * @returns {Promise<Array>} List of milestones
 */
const getMilestonesByPOId = async ({ client, poId }) => {
    const query = `
        SELECT id, po_id, milestone_name, milestone_order, status, 
               notes, photo_url, completed_at, created_at, updated_at,
               prd_status_mapping
        FROM order_milestones
        WHERE po_id = $1
        ORDER BY milestone_order ASC
    `;
    
    const result = await client.query(query, [poId]);
    return result.rows;
};

/**
 * Calculates overall progress percentage for a PO
 * @param {Object} params - Function parameters
 * @param {Object} params.client - Database client
 * @param {number} params.poId - Purchase order ID
 * @returns {Promise<Object>} Progress information
 */
const getPOProgress = async ({ client, poId }) => {
    const milestones = await getMilestonesByPOId({ client, poId });
    
    if (milestones.length === 0) {
        return { percentage: 0, completed: 0, total: 0 };
    }
    
    const completed = milestones.filter(m => m.status === MILESTONE_STATUS.COMPLETED).length;
    const inProgress = milestones.filter(m => m.status === MILESTONE_STATUS.IN_PROGRESS).length;
    const total = milestones.length;
    const percentage = Math.round((completed / total) * 100);
    
    // Get current PRD status
    const currentMilestone = milestones.find(m => m.status === MILESTONE_STATUS.IN_PROGRESS) ||
                            milestones.find(m => m.status === MILESTONE_STATUS.PENDING);
    
    return {
        percentage,
        completed,
        inProgress,
        total,
        milestones,
        currentPRDStatus: currentMilestone?.prd_status_mapping || 'draft'
    };
};

// ==================== EXPORTS ====================

module.exports = {
    // Main function
    createDefaultMilestones,
    
    // Utility functions
    updateMilestoneStatus,
    getMilestonesByPOId,
    getPOProgress,
    
    // Constants for external use
    MILESTONE_STATUS,
    DEFAULT_MILESTONES,
    MILESTONE_TO_PRD_STATUS
};