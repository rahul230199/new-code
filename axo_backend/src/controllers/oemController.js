const pool = require('../config/database');
const fs = require('fs');
const path = require('path');
const { logPOActivity } = require('../services/poActivity.service');
const { createDefaultMilestones } = require('../services/poWorkflow.service');
const { calculateQuoteRecommendations } = require('../services/poRecommendation.service');

// ==================== CONSTANTS ====================
const UPLOADS_BASE = '/home/ec2-user/axo/axo_backend/uploads';
const RFQ_FILES_DIR = 'rfq_files';
const PO_FILES_DIR = 'po_files';


// PRD Status Workflow (Page 6)
const PO_STATUS = {
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

// Document categories (PRD Page 5)
const DOCUMENT_CATEGORIES = {
    PURCHASE_ORDERS: 'Purchase Orders',
    QUOTATIONS: 'Quotations',
    TECHNICAL_DRAWINGS: 'Technical Drawings',
    DESIGN_FILES: 'Design Files',
    QUALITY_DOCUMENTS: 'Quality Documents',
    CERTIFICATIONS: 'Certifications',
    INSPECTION_REPORTS: 'Inspection Reports',
    PRODUCTION_UPDATES: 'Production Updates',
    SHIPPING_DOCUMENTS: 'Shipping Documents',
    INVOICES: 'Invoices',
    COMMUNICATION_HISTORY: 'Communication History'
};
// Add these after your existing constants
const ACTOR_TYPES = {
    OEM: 'OEM',
    SUPPLIER: 'Supplier',
    SYSTEM: 'System'
};

const ACTION_TYPES = {
    QUOTE_ACCEPTED: 'QUOTE_ACCEPTED',
    PO_CREATED: 'PO_CREATED',
    PO_DRAFT_SAVED: 'PO_DRAFT_SAVED',
    PO_SENT: 'PO_SENT',
    PO_ACCEPTED: 'PO_ACCEPTED',
    PO_REJECTED: 'PO_REJECTED',
    PO_REVISION_REQUESTED: 'PO_REVISION_REQUESTED',
    PO_STATUS_CHANGED: 'PO_STATUS_CHANGED',
    PRODUCTION_STARTED: 'PRODUCTION_STARTED',
    PRODUCTION_COMPLETE: 'PRODUCTION_COMPLETE',
    READY_FOR_DISPATCH: 'READY_FOR_DISPATCH',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    CLOSED: 'CLOSED',
    DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
    OEM_SIGNATURE_ADDED: 'OEM_SIGNATURE_ADDED',
    SUPPLIER_SIGNATURE_ADDED: 'SUPPLIER_SIGNATURE_ADDED',
    MESSAGE_SENT: 'MESSAGE_SENT'
};
// ==================== HELPER FUNCTIONS ====================

/**
 * Ensures a directory exists, creates it if necessary
 */
const ensureDirectoryExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

/**
 * Generates a unique number for RFQ or PO
 */
const generateUniqueNumber = (prefix) => {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

/**
 * Creates organized folder structure for PO documents (PRD Page 5)
 */
const createPODocumentFolders = (poNumber) => {
    const poFolderName = `PO_${poNumber}`;
    const poBasePath = path.join(UPLOADS_BASE, PO_FILES_DIR, poFolderName);
    
    // Create main PO folder
    ensureDirectoryExists(poBasePath);
    
    // Create subfolders for each document category (PRD requirement)
    const subfolders = [
        DOCUMENT_CATEGORIES.PURCHASE_ORDERS,
        DOCUMENT_CATEGORIES.QUOTATIONS,
        DOCUMENT_CATEGORIES.TECHNICAL_DRAWINGS,
        DOCUMENT_CATEGORIES.DESIGN_FILES,
        DOCUMENT_CATEGORIES.QUALITY_DOCUMENTS,
        DOCUMENT_CATEGORIES.CERTIFICATIONS,
        DOCUMENT_CATEGORIES.INSPECTION_REPORTS,
        DOCUMENT_CATEGORIES.PRODUCTION_UPDATES,
        DOCUMENT_CATEGORIES.SHIPPING_DOCUMENTS,
        DOCUMENT_CATEGORIES.INVOICES,
        DOCUMENT_CATEGORIES.COMMUNICATION_HISTORY
    ];
    
    subfolders.forEach(folder => {
        ensureDirectoryExists(path.join(poBasePath, folder.replace(/\s/g, '_')));
    });
    
    return poBasePath;
};

/**
 * Saves uploaded files to RFQ folder
 */
const saveFilesToRFQFolder = async (files, rfqNumber, rfqId, userId) => {
    const rfqFolderName = `RFQ_${rfqNumber}`;
    const rfqFolderPath = path.join(UPLOADS_BASE, RFQ_FILES_DIR, rfqFolderName);
    ensureDirectoryExists(rfqFolderPath);
    
    const savedDocs = [];
    
    for (const file of files) {
        const uniqueFilename = `${Date.now()}-${file.originalname}`;
        const filePath = path.join(rfqFolderPath, uniqueFilename);
        fs.renameSync(file.path, filePath);
        
        const result = await pool.query(`
            INSERT INTO documents (
                user_id, rfq_id, file_name, file_path, folder_path, 
                file_size, file_type, category, description, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING id, file_name, file_path
        `, [
            userId, rfqId, file.originalname, filePath, rfqFolderPath, 
            file.size, file.mimetype, 'RFQ Documents', `Uploaded for RFQ: ${rfqNumber}`
        ]);
        
        savedDocs.push(result.rows[0]);
    }
    
    return savedDocs;
};

/**
 * Saves document with version control (PRD Page 5)
 */
const saveDocumentWithVersion = async (file, category, referenceId, referenceType, userId, notes = '') => {
    const uniqueFilename = `${Date.now()}-${file.originalname}`;
    let folderPath;
    
    // Determine folder based on document category
    if (referenceType === 'po') {
        const poFolder = `PO_${referenceId}`;
        const categoryFolder = category.replace(/\s/g, '_');
        folderPath = path.join(UPLOADS_BASE, PO_FILES_DIR, poFolder, categoryFolder);
        ensureDirectoryExists(folderPath);
    } else {
        folderPath = path.join(UPLOADS_BASE, RFQ_FILES_DIR, `RFQ_${referenceId}`);
        ensureDirectoryExists(folderPath);
    }
    
    const filePath = path.join(folderPath, uniqueFilename);
    fs.renameSync(file.path, filePath);
    
    // Get current version number
    const versionQuery = `
        SELECT MAX(version_number) as max_version 
        FROM documents 
        WHERE ${referenceType}_id = $1 AND file_name = $2
    `;
    const versionResult = await pool.query(versionQuery, [referenceId, file.originalname]);
    const newVersion = (versionResult.rows[0]?.max_version || 0) + 1;
    
    const result = await pool.query(`
        INSERT INTO documents (
            user_id, ${referenceType}_id, file_name, file_path, folder_path,
            file_size, file_type, category, description, version_number,
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING id, file_name, file_path, version_number
    `, [
        userId, referenceId, file.originalname, filePath, folderPath,
        file.size, file.mimetype, category, notes, newVersion
    ]);
    
    return result.rows[0];
};

/**
 * Copies files from RFQ folder to PO folder with categorization
 */
/**
 * Copies files from RFQ folder to PO folder with categorization
 */
/**
 * Copies files from RFQ folder to PO folder with categorization
 */
const copyFilesToPOFolder = async (rfqId, poNumber, poId, userId) => {
    try {
        const rfqDocs = await pool.query(`
            SELECT * FROM documents WHERE rfq_id = $1 AND user_id = $2
        `, [rfqId, userId]);
        
        if (rfqDocs.rows.length === 0) {
            console.log('No files to copy from RFQ');
            return [];
        }
        
        // Create organized folder structure
        const poBasePath = createPODocumentFolders(poNumber);
        
        const copiedDocs = [];
        
        for (const doc of rfqDocs.rows) {
            try {
                let category = DOCUMENT_CATEGORIES.PURCHASE_ORDERS;
                if (doc.file_name && doc.file_name.match(/\.(pdf|doc|docx)$/i) && doc.file_name.toLowerCase().includes('quote')) {
                    category = DOCUMENT_CATEGORIES.QUOTATIONS;
                } else if (doc.file_name && doc.file_name.match(/\.(dwg|dxf|step|stp)$/i)) {
                    category = DOCUMENT_CATEGORIES.TECHNICAL_DRAWINGS;
                }
                
                const categoryFolder = category.replace(/\s/g, '_');
                const newFolderPath = path.join(poBasePath, categoryFolder);
                ensureDirectoryExists(newFolderPath);
                
                const uniqueFilename = `${Date.now()}-${doc.file_name}`;
                const newFilePath = path.join(newFolderPath, uniqueFilename);
                
                if (fs.existsSync(doc.file_path)) {
                    fs.copyFileSync(doc.file_path, newFilePath);
                } else {
                    console.warn(`Source file not found: ${doc.file_path}`);
                    continue;
                }
                
                // Insert without foreign key constraints (skip po_id if causing issues)
                const result = await pool.query(`
                    INSERT INTO documents (
                        user_id, rfq_id, file_name, file_path, 
                        folder_path, file_size, file_type, category, description, 
                        created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                    RETURNING id, file_name, file_path
                `, [
                    userId, rfqId, doc.file_name, newFilePath, 
                    newFolderPath, doc.file_size, doc.file_type, category, 
                    `Copied from RFQ to PO ${poNumber}`
                ]);
                
                // Update the document with po_id after insert (if needed)
                if (poId) {
                    await pool.query(`UPDATE documents SET po_id = $1 WHERE id = $2`, [poId, result.rows[0].id]);
                }
                
                copiedDocs.push(result.rows[0]);
            } catch (docError) {
                console.error(`Error copying file ${doc.file_name}:`, docError.message);
            }
        }
        
        console.log(`Copied ${copiedDocs.length} files from RFQ ${rfqId}`);
        return copiedDocs;
        
    } catch (error) {
        console.error('Copy files error:', error);
        return []; // Return empty array instead of failing
    }
};

/**
 * Validates required fields for RFQ creation
 */
const validateRFQInput = (title, quantity) => {
    if (!title) {
        throw new Error('Title is required');
    }
    if (!quantity || quantity <= 0) {
        throw new Error('Valid quantity is required');
    }
};

/**
 * Sends email notification (PRD Page 4, 6-7)
 */
const sendNotification = async (userId, title, message, type, referenceId, sendEmail = true) => {
    // Platform notification
    await pool.query(`
        INSERT INTO notifications (user_id, title, message, type, reference_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
    `, [userId, title, message, type, referenceId]);
    
    // Email notification (PRD requirement)
    if (sendEmail) {
        try {
            const userResult = await pool.query('SELECT email, company_name FROM users WHERE id = $1', [userId]);
            if (userResult.rows[0]?.email) {
                await sendEmailNotification({
                    to: userResult.rows[0].email,
                    subject: title,
                    html: `<p>${message}</p><p>Best regards,<br/>AXO Team</p>`
                });
            }
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
            // Don't fail the main operation if email fails
        }
    }
};

// Initialize directories on startup
const initializeDirectories = () => {
    ensureDirectoryExists(path.join(UPLOADS_BASE, RFQ_FILES_DIR));
    ensureDirectoryExists(path.join(UPLOADS_BASE, PO_FILES_DIR));
};
initializeDirectories();

// ==================== DASHBOARD CONTROLLERS ====================

/**
 * Get dashboard statistics for OEM
 */
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.userId;

        const kpis = await pool.query(`
            SELECT
                COALESCE((SELECT COUNT(*) FROM rfqs WHERE oem_id = $1 AND status = 'open'), 0) AS active_rfqs,
                COALESCE((SELECT COUNT(*) FROM quotes q JOIN rfqs r ON q.rfq_id = r.id WHERE r.oem_id = $1 AND q.status = 'pending'), 0) AS quotes_pending,
                COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE oem_id = $1 AND status IN ('accepted','production_started','production_complete','ready_for_dispatch','shipped')), 0) AS active_orders,
                COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE oem_id = $1 AND status = 'delayed'), 0) AS delayed_orders
        `, [userId]);

        const orderStatus = await pool.query(`
            SELECT status, COUNT(*) AS count
            FROM purchase_orders
            WHERE oem_id = $1
            GROUP BY status
        `, [userId]);

        const monthlyTrend = await pool.query(`
            SELECT TO_CHAR(created_at,'Mon YYYY') AS month,
                   COALESCE(SUM(total_value), 0) AS total_value
            FROM purchase_orders
            WHERE oem_id = $1 AND created_at >= NOW() - INTERVAL '6 months'
            GROUP BY TO_CHAR(created_at,'Mon YYYY'), DATE_TRUNC('month', created_at)
            ORDER BY DATE_TRUNC('month', created_at) DESC
            LIMIT 6
        `, [userId]);

        const bottlenecks = await pool.query(`
            SELECT 'Delayed Milestones' AS name, COUNT(*) AS value, 'high' AS severity
            FROM order_milestones om
            JOIN purchase_orders po ON om.po_id = po.id
            WHERE po.oem_id = $1 AND om.status = 'delayed'
            UNION ALL SELECT 'Raw Material Shortages', 0, 'medium'
            UNION ALL SELECT 'QC Hold', 0, 'low'
            LIMIT 3
        `, [userId]);

        const liveOrders = await pool.query(`
            SELECT po.id, po.po_number, po.part_name, po.quantity,
                   COALESCE(po.status,'pending') AS status,
                   u.company_name AS supplier_name
            FROM purchase_orders po
            JOIN users u ON po.supplier_id = u.id
            WHERE po.oem_id = $1
            ORDER BY po.created_at DESC
            LIMIT 5
        `, [userId]);

        res.json({
            kpis: kpis.rows[0] || { 
                active_rfqs: 0, 
                quotes_pending: 0, 
                active_orders: 0, 
                delayed_orders: 0 
            },
            charts: {
                order_status_distribution: orderStatus.rows || [],
                monthly_volume_trend: monthlyTrend.rows || [],
            },
            heatmap: bottlenecks.rows || [],
            live_orders: liveOrders.rows || [],
        });
        
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch dashboard statistics',
            kpis: { active_rfqs: 0, quotes_pending: 0, active_orders: 0, delayed_orders: 0 } 
        });
    }
};

// ==================== RFQ CONTROLLERS ====================

/**
 * Get all RFQs for the OEM
 */
const getRFQs = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const result = await pool.query(`
            SELECT r.*,
                   COALESCE((SELECT COUNT(*) FROM quotes WHERE rfq_id = r.id), 0) AS quote_count,
                   COALESCE((SELECT COUNT(*) FROM documents WHERE rfq_id = r.id), 0) AS document_count
            FROM rfqs r
            WHERE r.oem_id = $1
            ORDER BY r.created_at DESC
        `, [userId]);
        
        res.json({ rfqs: result.rows });
        
    } catch (error) {
        console.error('Get RFQs error:', error);
        res.status(500).json({ error: 'Failed to fetch RFQs', rfqs: [] });
    }
};

/**
 * Create a new RFQ
 */
const createRFQ = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const userId = req.user.userId;
        const { 
            title, partNumber, partName, quantity, unit, 
            targetPrice, currency, description, ppapLevel 
        } = req.body;

        validateRFQInput(title, quantity);

        const rfqNumber = generateUniqueNumber('RFQ');

        await client.query('BEGIN');

        const result = await client.query(`
            INSERT INTO rfqs (
                rfq_number, oem_id, title, part_number, part_name,
                quantity, unit, target_price, currency, description, 
                ppap_level, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open', NOW())
            RETURNING *
        `, [
            rfqNumber, userId, title,
            partNumber || null, partName || null,
            parseInt(quantity),
            unit || 'units',
            targetPrice || null,
            currency || 'USD',
            description || null,
            ppapLevel || null
        ]);

        const rfq = result.rows[0];

        if (req.files && req.files.length > 0) {
            await saveFilesToRFQFolder(req.files, rfqNumber, rfq.id, userId);
            console.log(`Saved ${req.files.length} files to RFQ folder for ${rfqNumber}`);
        }

        await client.query('COMMIT');
        
        res.json({ success: true, rfq });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create RFQ error:', error);
        res.status(500).json({ error: error.message });
        
    } finally {
        client.release();
    }
};

/**
 * Get quotes for a specific RFQ with recommendations
 */
/**
 * Get quotes for a specific RFQ with recommendations
 */
const getRFQQuotes = async (req, res) => {
    try {
        const rfqId = req.params.id;
        
        // Modified query - removed u.certifications and u.rating if they don't exist
        const quotes = await pool.query(`
            SELECT q.*, u.company_name AS supplier_name
            FROM quotes q
            JOIN users u ON q.supplier_id = u.id
            WHERE q.rfq_id = $1
            ORDER BY q.submitted_at DESC
        `, [rfqId]);
        
        // Add recommendations without certifications field
        const recommendedQuotes = await calculateQuoteRecommendations(quotes.rows, {
            dbClient: pool,
            rfqQuantity: quotes.rows[0]?.quantity
        });
        
        res.json({ quotes: recommendedQuotes });
        
    } catch (error) {
        console.error('Get quotes error:', error);
        res.status(500).json({ error: 'Failed to fetch quotes', quotes: [] });
    }
};

/**
 * Get documents for a specific RFQ
 */
const getRFQDocuments = async (req, res) => {
    try {
        const rfqId = req.params.id;
        
        const result = await pool.query(`
            SELECT d.id, d.file_name, d.file_size, d.file_type, 
                   d.category, d.description, d.version_number, d.created_at
            FROM documents d
            WHERE d.rfq_id = $1
            ORDER BY d.created_at DESC
        `, [rfqId]);
        
        res.json({ documents: result.rows });
        
    } catch (error) {
        console.error('Get RFQ documents error:', error);
        res.status(500).json({ error: 'Failed to fetch documents', documents: [] });
    }
};

// ==================== PO WORKFLOW CONTROLLERS (PRD Pages 2-5) ====================

/**
 * Save PO as draft (PRD Step 3: OEM Review & Edit)
 */
const savePODraft = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const updates = req.body; // delivery_date, payment_terms, special_instructions, etc.
        
        await client.query('BEGIN');
        
        // Update PO with modified fields
        const updateResult = await client.query(`
            UPDATE purchase_orders 
            SET delivery_date = COALESCE($1, delivery_date),
                payment_terms = COALESCE($2, payment_terms),
                special_instructions = COALESCE($3, special_instructions),
                shipping_requirements = COALESCE($4, shipping_requirements),
                updated_at = NOW()
            WHERE id = $5 AND oem_id = $6
            RETURNING *
        `, [
            updates.delivery_date,
            updates.payment_terms,
            updates.special_instructions,
            updates.shipping_requirements,
            poId,
            userId
        ]);
        
        if (!updateResult.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'PO not found' });
        }
        
        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: 'OEM',
            actionType: 'PO_DRAFT_SAVED',
            newValue: updates,
            notes: 'PO draft saved by OEM'
        });
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: 'PO draft saved successfully',
            purchaseOrder: updateResult.rows[0]
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Save PO draft error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Send PO to supplier (PRD Step 4: PO Sent to Supplier)
 */
const sendPOToSupplier = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        
        await client.query('BEGIN');
        
        // Get PO details
        const poResult = await client.query(`
            SELECT po.*, u.email as supplier_email, u.company_name as supplier_name
            FROM purchase_orders po
            JOIN users u ON po.supplier_id = u.id
            WHERE po.id = $1 AND po.oem_id = $2
        `, [poId, userId]);
        
        if (!poResult.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'PO not found' });
        }
        
        const po = poResult.rows[0];
        
        // Update PO status to 'sent'
        await client.query(`
            UPDATE purchase_orders 
            SET status = $1, 
                workflow_status = $2,
                sent_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
        `, [PO_STATUS.SENT, 'sent', poId]);
        
        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: 'OEM',
            actionType: 'PO_SENT',
            newValue: { status: PO_STATUS.SENT },
            notes: `PO sent to supplier: ${po.supplier_name}`
        });
        
        // Send notifications (PRD: Platform + Email)
        await sendNotification(
            po.supplier_id,
            'Purchase Order Received',
            `You have received a Purchase Order ${po.po_number}. Please review and respond.`,
            'po_received',
            poId,
            true // Send email
        );
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: 'PO sent to supplier successfully',
            status: PO_STATUS.SENT
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Send PO error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Accept quote and create PO (Enhanced with PRD workflow)
 */
/**
 * Accept quote and create PO (Enhanced with PRD workflow)
 */
const acceptQuote = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const quoteId = req.params.id;
        const userId = req.user.userId;

        await client.query('BEGIN');

        // Fetch quote with RFQ details
        const quoteResult = await client.query(`
            SELECT q.*, r.oem_id, r.title, r.part_name, r.quantity,
                   u.email as supplier_email, u.company_name as supplier_name
            FROM quotes q
            JOIN rfqs r ON q.rfq_id = r.id
            JOIN users u ON q.supplier_id = u.id
            WHERE q.id = $1 AND r.oem_id = $2
        `, [quoteId, userId]);

        if (!quoteResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        // Update quote status
        await client.query(`
            UPDATE quotes 
            SET status = $1, accepted_at = NOW() 
            WHERE id = $2
        `, ['accepted', quoteId]);

        // Update RFQ status
        await client.query(`
            UPDATE rfqs 
            SET status = $1, awarded_at = NOW() 
            WHERE id = $2
        `, ['awarded', quote.rfq_id]);

        // Generate PO number and create purchase order
        const poNumber = generateUniqueNumber('PO');
        
        // Get OEM company details for PO
        const oemResult = await client.query(`
            SELECT company_name, email, phone, city, country 
            FROM users WHERE id = $1
        `, [userId]);
        
        const poResult = await client.query(`
            INSERT INTO purchase_orders (
                po_number, rfq_id, quote_id, oem_id, supplier_id,
                part_name, quantity, unit_price, total_value, currency,
                payment_terms, delivery_date, status, workflow_status,
                oem_company_name, oem_contact_email, oem_contact_phone,
                supplier_company_name, supplier_contact_email,
                created_at, workflow_updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
            RETURNING *
        `, [
            poNumber, quote.rfq_id, quoteId, quote.oem_id, quote.supplier_id,
            quote.part_name, quote.quantity, quote.price, 
            quote.quantity * quote.price, quote.currency || 'USD',
            quote.payment_terms || 'Net 30',
            null, // delivery_date to be set by OEM
            PO_STATUS.DRAFT, 
            'draft',
            oemResult.rows[0]?.company_name,
            oemResult.rows[0]?.email,
            oemResult.rows[0]?.phone,
            quote.supplier_name,
            quote.supplier_email
        ]);

        const purchaseOrder = poResult.rows[0];

        // Create organized document folders (PRD Page 5)
        // Use a try-catch for folder creation - don't let it fail the transaction
        try {
            createPODocumentFolders(poNumber);
        } catch (folderError) {
            console.warn('Folder creation warning:', folderError.message);
        }

        // Create default milestones (aligned with PRD status workflow)
        await createDefaultMilestones({
            client,
            poId: purchaseOrder.id,
            includeQualityMilestones: true
        });

        // Log PO activity
        await logPOActivity({
            client,
            poId: purchaseOrder.id,
            userId,
            actorType: 'OEM',
            actionType: 'PO_CREATED',
            newValue: {
                workflow_status: 'draft',
                po_number: poNumber
            },
            notes: 'Purchase Order draft created from accepted quote'
        });

        // Create notification for supplier
        await client.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id, created_at)
            VALUES ($1, 'Quote Accepted - PO Created', $2, 'quote_accepted', $3, NOW())
        `, [quote.supplier_id, `Your quote has been accepted. A Purchase Order (${poNumber}) has been created.`, purchaseOrder.id]);

        // COMMIT the transaction FIRST so PO exists
        await client.query('COMMIT');

        // NOW copy files AFTER commit (using a separate connection)
        try {
            await copyFilesToPOFolder(quote.rfq_id, poNumber, purchaseOrder.id, userId);
        } catch (copyError) {
            console.error('File copy error (non-critical):', copyError.message);
            // Don't fail the whole operation for file copy errors
        }

        return res.json({
            success: true,
            message: 'Quote accepted and PO draft created',
            purchaseOrder,
            nextSteps: 'Review and edit PO details, then send to supplier for acceptance'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Accept quote error:', error);
        return res.status(500).json({ error: error.message });
        
    } finally {
        client.release();
    }
};

/**
 * Reject a quote
 */
const rejectQuote = async (req, res) => {
    try {
        await pool.query('UPDATE quotes SET status = $1, rejected_at = NOW() WHERE id = $2', 
            ['rejected', req.params.id]);
        res.json({ success: true, message: 'Quote rejected' });
        
    } catch (error) {
        console.error('Reject quote error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== ORDER CONTROLLERS ====================

/**
 * Get all purchase orders for the OEM
 */
const getOrders = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const result = await pool.query(`
            SELECT po.*, u.company_name AS supplier_name,
                   COALESCE((SELECT COUNT(*) FROM order_milestones WHERE po_id = po.id AND status = 'completed'), 0) as completed_milestones,
                   COALESCE((SELECT COUNT(*) FROM order_milestones WHERE po_id = po.id), 0) as total_milestones
            FROM purchase_orders po
            JOIN users u ON po.supplier_id = u.id
            WHERE po.oem_id = $1
            ORDER BY po.created_at DESC
        `, [userId]);

        const orders = result.rows.map(order => {
            const completed = parseInt(order.completed_milestones) || 0;
            const total = parseInt(order.total_milestones) || 7;
            const progress = Math.round((completed / total) * 100);
            return { ...order, progress };
        });

        res.json({ orders });
        
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to fetch orders', orders: [] });
    }
};

/**
 * Get detailed information for a specific order (PRD Page 5: Order Workspace)
 */
const getOrderDetails = async (req, res) => {
    try {
        const userId = req.user.userId;
        const orderId = req.params.id;

        const orderResult = await pool.query(`
            SELECT po.*, u.company_name AS supplier_name,
                   po.special_instructions, po.shipping_requirements
            FROM purchase_orders po
            JOIN users u ON po.supplier_id = u.id
            WHERE po.id = $1 AND po.oem_id = $2
        `, [orderId, userId]);

        if (!orderResult.rows[0]) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const messages = await pool.query(`
            SELECT om.id, om.sender_name, om.sender_type, om.message,
                   om.is_read, om.created_at
            FROM order_messages om
            WHERE om.po_id = $1
            ORDER BY om.created_at ASC
        `, [orderId]);

        const milestones = await pool.query(`
            SELECT id, milestone_name, milestone_order, status, notes, photo_url, completed_at
            FROM order_milestones
            WHERE po_id = $1
            ORDER BY milestone_order ASC
        `, [orderId]);

        // Get documents by category (PRD Page 5: Organized document structure)
        const documents = await pool.query(`
            SELECT id, file_name, file_type, category, version_number, created_at
            FROM documents
            WHERE po_id = $1
            ORDER BY category, created_at DESC
        `, [orderId]);

        // Group documents by category
        const documentsByCategory = {};
        documents.rows.forEach(doc => {
            if (!documentsByCategory[doc.category]) {
                documentsByCategory[doc.category] = [];
            }
            documentsByCategory[doc.category].push(doc);
        });

        // Get activity timeline (PRD Page 6: Order Timeline)
        const timeline = await pool.query(`
            SELECT action_type, activity_message, created_at, actor_type
            FROM po_activity_logs
            WHERE po_id = $1
            ORDER BY created_at ASC
        `, [orderId]);

        res.json({
            order: orderResult.rows[0],
            communications: messages.rows,
            milestones: milestones.rows,
            documents: documentsByCategory,
            timeline: timeline.rows
        });
        
    } catch (error) {
        console.error('Get order details error:', error);
        res.status(500).json({ error: 'Failed to fetch order details' });
    }
};

/**
 * Upload document to order workspace (PRD Page 5)
 */
const uploadOrderDocument = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const { category, notes } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        if (!category || !Object.values(DOCUMENT_CATEGORIES).includes(category)) {
            return res.status(400).json({ 
                error: 'Valid category required',
                validCategories: Object.values(DOCUMENT_CATEGORIES)
            });
        }
        
        await client.query('BEGIN');
        
        // Verify PO ownership
        const poCheck = await client.query(
            'SELECT id, po_number FROM purchase_orders WHERE id = $1 AND oem_id = $2',
            [poId, userId]
        );
        
        if (!poCheck.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'PO not found' });
        }
        
        // Save document with version control
        const document = await saveDocumentWithVersion(
            req.file,
            category,
            poId,
            'po',
            userId,
            notes
        );
        
        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: 'OEM',
            actionType: 'DOCUMENT_UPLOADED',
            newValue: { document_name: req.file.originalname, category },
            notes: `Document uploaded: ${req.file.originalname} (${category})`
        });
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: 'Document uploaded successfully',
            document
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Upload document error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Get document versions (PRD Page 5: Version History)
 */
const getDocumentVersions = async (req, res) => {
    try {
        const { documentId } = req.params;
        const userId = req.user.userId;
        
        const versions = await pool.query(`
            SELECT id, file_name, version_number, file_size, created_at, user_id
            FROM documents
            WHERE source_rfq_id = $1 OR id = $1
            ORDER BY version_number DESC
        `, [documentId]);
        
        res.json({ versions: versions.rows });
        
    } catch (error) {
        console.error('Get document versions error:', error);
        res.status(500).json({ error: 'Failed to fetch document versions' });
    }
};

/**
 * Replace document version (PRD Page 5: Replace version)
 */
const replaceDocumentVersion = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { documentId } = req.params;
        const userId = req.user.userId;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        await client.query('BEGIN');
        
        // Get original document
        const originalDoc = await client.query(
            'SELECT file_name, category, po_id FROM documents WHERE id = $1',
            [documentId]
        );
        
        if (!originalDoc.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Document not found' });
        }
        
        // Save as new version
        const newVersion = await saveDocumentWithVersion(
            req.file,
            originalDoc.rows[0].category,
            originalDoc.rows[0].po_id,
            'po',
            userId,
            `Version replacement of ${originalDoc.rows[0].file_name}`
        );
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: 'Document version replaced',
            newVersion
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Replace document error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Send a message on an order
 */
const sendOrderMessage = async (req, res) => {
    try {
        const userId = req.user.userId;
        const orderId = req.params.id;
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const orderCheck = await pool.query(
            'SELECT id, supplier_id, po_number FROM purchase_orders WHERE id = $1 AND oem_id = $2',
            [orderId, userId]
        );
        
        if (!orderCheck.rows.length) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const senderResult = await pool.query('SELECT company_name FROM users WHERE id = $1', [userId]);
        const senderName = senderResult.rows[0]?.company_name || 'OEM User';

        const result = await pool.query(`
            INSERT INTO order_messages (po_id, sender_id, sender_name, sender_type, message, created_at)
            VALUES ($1, $2, $3, 'OEM', $4, NOW())
            RETURNING id, sender_name, sender_type, message, created_at
        `, [orderId, userId, senderName, message.trim()]);

        // Send notification (PRD: Platform + Email)
        await sendNotification(
            orderCheck.rows[0].supplier_id,
            `New Message on PO ${orderCheck.rows[0].po_number}`,
            `New message from ${senderName}: ${message.substring(0, 100)}...`,
            'message',
            orderId,
            true
        );

        res.json({ success: true, message: result.rows[0] });
        
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== SUPPLIER CONTROLLERS ====================

/**
 * Get all active suppliers
 */
/**
 * Get all active suppliers
 */
const getSuppliers = async (req, res) => {
    try {
        const suppliers = await pool.query(`
            SELECT
                u.id,
                u.company_name,
                u.email,
                u.city,
                u.country,
                u.phone,
                u.website,
                u.capabilities,
                u.custom_capabilities,
                u.created_at,
                COALESCE((SELECT COUNT(DISTINCT po.id) FROM purchase_orders po WHERE po.supplier_id = u.id AND po.status = 'delivered'), 0) AS completed_orders,
                COALESCE((SELECT COUNT(DISTINCT q.id) FROM quotes q WHERE q.supplier_id = u.id), 0) AS total_quotes
            FROM users u
            WHERE u.role IN ('supplier', 'both') AND (u.status = 'active' OR u.status IS NULL)
            GROUP BY u.id
            ORDER BY u.company_name ASC
        `);
        
        res.json({ suppliers: suppliers.rows });
        
    } catch (error) {
        console.error('Get suppliers error:', error);
        res.status(500).json({ error: 'Failed to fetch suppliers', suppliers: [] });
    }
};

// ==================== PROFILE CONTROLLERS ====================

/**
 * Get OEM profile
 */
const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const result = await pool.query(`
            SELECT id, email, company_name, phone, website, city, country, 
                   billing_address, shipping_address, role, created_at 
            FROM users 
            WHERE id = $1
        `, [userId]);
        
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        res.json({ profile: result.rows[0] });
        
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

/**
 * Update OEM profile
 */
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { phone, website, city, country, billing_address, shipping_address } = req.body;

        await pool.query(`
            UPDATE users 
            SET phone = $1, website = $2, city = $3, country = $4, 
                billing_address = $5, shipping_address = $6,
                updated_at = NOW() 
            WHERE id = $7
        `, [phone || null, website || null, city || null, country || null, 
            billing_address || null, shipping_address || null, userId]);
        
        res.json({ success: true, message: 'Profile updated successfully' });
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== ADD THESE FUNCTIONS TO oemController.js ====================

// ==================== PO STATUS & POLLING ====================

/**
 * Get PO status for polling (PRD Step 4-5: Supplier response tracking)
 * GET /api/oem/purchase-orders/:poId/status
 */
const getPOStatus = async (req, res) => {
    try {
        const { poId } = req.params;
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT 
                po.id, po.po_number, po.status, po.workflow_status,
                po.sent_at, po.accepted_at, po.rejected_at,
                po.supplier_signature, po.oem_signature,
                po.delivery_date, po.payment_terms,
                u.company_name as supplier_name
            FROM purchase_orders po
            JOIN users u ON po.supplier_id = u.id
            WHERE po.id = $1 AND po.oem_id = $2
        `, [poId, userId]);

        if (!result.rows.length) {
            return res.status(404).json({ error: 'PO not found' });
        }

        res.json({ 
            success: true, 
            purchaseOrder: result.rows[0],
            status: result.rows[0].status
        });
    } catch (error) {
        console.error('Get PO status error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== OEM SIGNATURE (PRD Step 6) ====================

/**
 * Add OEM digital signature to PO (PRD Step 6: OEM Final Acknowledgement)
 * POST /api/oem/purchase-orders/:poId/sign
 */
const addOEMSignature = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const { signature } = req.body;

        if (!signature || !signature.name || !signature.designation) {
            return res.status(400).json({ error: 'Signature name and designation are required' });
        }

        await client.query('BEGIN');

        // Verify PO belongs to this OEM and is in accepted state
        const poCheck = await client.query(`
            SELECT id, status, supplier_id, po_number
            FROM purchase_orders
            WHERE id = $1 AND oem_id = $2
        `, [poId, userId]);

        if (!poCheck.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'PO not found' });
        }

        const po = poCheck.rows[0];

        if (po.status !== 'accepted') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'PO must be accepted by supplier before OEM signature' });
        }

        // Add OEM signature
        const signatureData = {
            name: signature.name,
            designation: signature.designation,
            date: signature.date || new Date().toISOString(),
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };

        await client.query(`
            UPDATE purchase_orders 
            SET oem_signature = $1,
                status = $2,
                workflow_status = $3,
                signed_at = NOW(),
                updated_at = NOW()
            WHERE id = $4
        `, [JSON.stringify(signatureData), PO_STATUS.PRODUCTION_STARTED, 'active', poId]);

        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: ACTOR_TYPES.OEM,
            actionType: ACTION_TYPES.OEM_SIGNATURE_ADDED,
            newValue: { signature: signatureData },
            notes: `OEM signature added by ${signature.name} (${signature.designation})`
        });

        // Notify supplier
        await sendNotification(
            po.supplier_id,
            'PO Signed by OEM',
            `The OEM has signed PO ${po.po_number}. Production can now begin.`,
            'po_active',
            poId,
            true
        );

        await client.query('COMMIT');

        const updatedPO = await client.query(
            'SELECT * FROM purchase_orders WHERE id = $1',
            [poId]
        );

        res.json({ 
            success: true, 
            message: 'OEM signature added. PO is now active.',
            purchaseOrder: updatedPO.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Add OEM signature error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

// ==================== REVISION WORKFLOW (PRD Page 5) ====================

/**
 * Accept revision request (apply selected changes)
 * POST /api/oem/purchase-orders/:poId/revision/accept
 */
const acceptRevisionRequest = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const { accepted_fields, notes } = req.body;

        if (!accepted_fields || !accepted_fields.length) {
            return res.status(400).json({ error: 'No fields selected for acceptance' });
        }

        await client.query('BEGIN');

        // Get revision request
        const revisionResult = await client.query(`
            SELECT * FROM po_revision_requests 
            WHERE po_id = $1 AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1
        `, [poId]);

        if (!revisionResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No pending revision request found' });
        }

        const revision = revisionResult.rows[0];
        const changes = revision.changes;

        // Apply accepted changes to PO
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        for (const field of accepted_fields) {
            const change = changes.find(c => c.field === field);
            if (change && change.new_value) {
                updateFields.push(`${field} = $${paramIndex}`);
                updateValues.push(change.new_value);
                paramIndex++;
            }
        }

        if (updateFields.length) {
            updateValues.push(poId);
            await client.query(`
                UPDATE purchase_orders 
                SET ${updateFields.join(', ')}, updated_at = NOW()
                WHERE id = $${paramIndex}
            `, updateValues);
        }

        // Update revision request status
        await client.query(`
            UPDATE po_revision_requests 
            SET status = 'accepted',
                response_notes = $1,
                responded_at = NOW()
            WHERE id = $2
        `, [notes || null, revision.id]);

        // Update PO status back to accepted
        await client.query(`
            UPDATE purchase_orders 
            SET status = $1, workflow_status = $2
            WHERE id = $3
        `, [PO_STATUS.ACCEPTED, 'accepted', poId]);

        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: ACTOR_TYPES.OEM,
            actionType: ACTION_TYPES.PO_REVISION_REQUESTED,
            newValue: { accepted_fields, status: 'accepted' },
            notes: notes || `Accepted ${accepted_fields.length} revision request(s)`
        });

        // Notify supplier
        const poResult = await client.query(
            'SELECT supplier_id, po_number FROM purchase_orders WHERE id = $1',
            [poId]
        );
        
        await sendNotification(
            poResult.rows[0].supplier_id,
            'Revision Request Accepted',
            `Your revision request for PO ${poResult.rows[0].po_number} has been accepted. Changes have been applied.`,
            'revision_accepted',
            poId,
            true
        );

        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: `Accepted ${accepted_fields.length} change(s) and applied to PO`
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Accept revision error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Reject revision request
 * POST /api/oem/purchase-orders/:poId/revision/reject
 */
const rejectRevisionRequest = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const { reason } = req.body;

        await client.query('BEGIN');

        // Get revision request
        const revisionResult = await client.query(`
            SELECT * FROM po_revision_requests 
            WHERE po_id = $1 AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1
        `, [poId]);

        if (!revisionResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No pending revision request found' });
        }

        const revision = revisionResult.rows[0];

        // Update revision request status
        await client.query(`
            UPDATE po_revision_requests 
            SET status = 'rejected',
                response_notes = $1,
                responded_at = NOW()
            WHERE id = $2
        `, [reason || null, revision.id]);

        // Update PO status back to accepted (no changes applied)
        await client.query(`
            UPDATE purchase_orders 
            SET status = $1, workflow_status = $2
            WHERE id = $3
        `, [PO_STATUS.ACCEPTED, 'accepted', poId]);

        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: ACTOR_TYPES.OEM,
            actionType: ACTION_TYPES.PO_REVISION_REQUESTED,
            newValue: { status: 'rejected' },
            notes: reason || 'Revision request rejected'
        });

        // Notify supplier
        const poResult = await client.query(
            'SELECT supplier_id, po_number FROM purchase_orders WHERE id = $1',
            [poId]
        );
        
        await sendNotification(
            poResult.rows[0].supplier_id,
            'Revision Request Rejected',
            `Your revision request for PO ${poResult.rows[0].po_number} has been rejected. Original terms remain.`,
            'revision_rejected',
            poId,
            true
        );

        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'Revision request rejected. Original PO terms remain unchanged.'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Reject revision error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Submit counter proposal to revision request
 * POST /api/oem/purchase-orders/:poId/revision/counter
 */
const counterRevisionRequest = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const { counter_proposal, notes } = req.body;

        if (!counter_proposal || Object.keys(counter_proposal).length === 0) {
            return res.status(400).json({ error: 'Counter proposal details are required' });
        }

        await client.query('BEGIN');

        // Get original revision request
        const revisionResult = await client.query(`
            SELECT * FROM po_revision_requests 
            WHERE po_id = $1 AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1
        `, [poId]);

        if (!revisionResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No pending revision request found' });
        }

        const originalRevision = revisionResult.rows[0];

        // Update original revision status
        await client.query(`
            UPDATE po_revision_requests 
            SET status = 'countered',
                responded_at = NOW()
            WHERE id = $1
        `, [originalRevision.id]);

        // Create counter proposal revision request
        const counterChanges = Object.entries(counter_proposal).map(([field, value]) => ({
            field,
            old_value: originalRevision.changes.find(c => c.field === field)?.old_value || null,
            new_value: value,
            reason: 'Counter proposal from OEM'
        }));

        await client.query(`
            INSERT INTO po_revision_requests (
                po_id, requested_by, requested_by_id, changes, reason, details, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            poId, 'OEM', userId, JSON.stringify(counterChanges),
            'Counter proposal from OEM', notes || null, 'pending'
        ]);

        // Update PO status to revision_requested (waiting for supplier)
        await client.query(`
            UPDATE purchase_orders 
            SET status = $1, workflow_status = $2
            WHERE id = $3
        `, [PO_STATUS.REVISION_REQUESTED, 'revision_requested', poId]);

        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: ACTOR_TYPES.OEM,
            actionType: ACTION_TYPES.PO_REVISION_REQUESTED,
            newValue: { type: 'counter_proposal' },
            notes: notes || 'Counter proposal sent to supplier'
        });

        // Notify supplier
        const poResult = await client.query(
            'SELECT supplier_id, po_number FROM purchase_orders WHERE id = $1',
            [poId]
        );
        
        await sendNotification(
            poResult.rows[0].supplier_id,
            'Counter Proposal Received',
            `The OEM has sent a counter proposal for PO ${poResult.rows[0].po_number}. Please review.`,
            'counter_proposal',
            poId,
            true
        );

        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'Counter proposal sent to supplier'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Counter revision error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

// ==================== ORDER TIMELINE & AUDIT TRAIL (PRD Pages 6-7) ====================

/**
 * Get order activity timeline (immutable)
 * GET /api/oem/orders/:orderId/timeline
 */
const getOrderTimeline = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user.userId;

        // Verify order belongs to this OEM
        const orderCheck = await pool.query(
            'SELECT id FROM purchase_orders WHERE id = $1 AND oem_id = $2',
            [orderId, userId]
        );

        if (!orderCheck.rows.length) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Get activities from po_activity_logs
        const activities = await pool.query(`
            SELECT 
                al.id,
                al.po_id,
                al.user_id,
                al.actor_type,
                al.action_type,
                al.old_value,
                al.new_value,
                al.notes,
                al.activity_message,
                al.ip_address,
                al.created_at,
                u.company_name as user_name,
                u.email as user_email
            FROM po_activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.po_id = $1
            ORDER BY al.created_at DESC
        `, [orderId]);

        // Get order details
        const order = await pool.query(`
            SELECT po_number, status, created_at
            FROM purchase_orders
            WHERE id = $1
        `, [orderId]);

        res.json({
            success: true,
            order: order.rows[0],
            activities: activities.rows
        });

    } catch (error) {
        console.error('Get order timeline error:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Export audit trail as CSV/JSON
 * GET /api/oem/orders/:orderId/audit-trail/export?format=csv
 */
const exportAuditTrail = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user.userId;
        const { format = 'csv' } = req.query;

        // Verify order belongs to this OEM
        const orderCheck = await pool.query(
            'SELECT po_number FROM purchase_orders WHERE id = $1 AND oem_id = $2',
            [orderId, userId]
        );

        if (!orderCheck.rows.length) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Get all activities
        const activities = await pool.query(`
            SELECT 
                al.id,
                al.created_at,
                al.actor_type,
                al.action_type,
                al.activity_message,
                al.notes,
                al.ip_address,
                u.company_name as user_name,
                u.email as user_email
            FROM po_activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.po_id = $1
            ORDER BY al.created_at ASC
        `, [orderId]);

        const poNumber = orderCheck.rows[0].po_number;
        const filename = `audit_trail_${poNumber}_${Date.now()}`;

        if (format === 'csv') {
            // Generate CSV
            const headers = ['ID', 'Timestamp', 'Actor', 'Action Type', 'Message', 'Notes', 'IP Address', 'User'];
            const rows = activities.rows.map(a => [
                a.id,
                a.created_at,
                a.actor_type,
                a.action_type,
                a.activity_message,
                a.notes || '',
                a.ip_address || '',
                a.user_name || a.user_email || 'System'
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            return res.send(csvContent);
        }

        // Default: JSON
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json({
            order_id: orderId,
            po_number: poNumber,
            exported_at: new Date().toISOString(),
            total_activities: activities.rows.length,
            activities: activities.rows
        });

    } catch (error) {
        console.error('Export audit trail error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== RESEND PO NOTIFICATION ====================

/**
 * Resend PO notification to supplier
 * POST /api/oem/purchase-orders/:poId/resend
 */
const resendPONotification = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;

        await client.query('BEGIN');

        const poResult = await client.query(`
            SELECT po.*, u.email as supplier_email, u.company_name as supplier_name
            FROM purchase_orders po
            JOIN users u ON po.supplier_id = u.id
            WHERE po.id = $1 AND po.oem_id = $2
        `, [poId, userId]);

        if (!poResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'PO not found' });
        }

        const po = poResult.rows[0];

        // Update resent timestamp
        await client.query(`
            UPDATE purchase_orders 
            SET resent_at = NOW(),
                resent_count = COALESCE(resent_count, 0) + 1
            WHERE id = $1
        `, [poId]);

        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: ACTOR_TYPES.OEM,
            actionType: ACTION_TYPES.PO_SENT,
            newValue: { resent: true, count: po.resent_count + 1 },
            notes: `PO notification resent to supplier`
        });

        // Resend notification
        await sendNotification(
            po.supplier_id,
            'Purchase Order (Reminder)',
            `Reminder: Purchase Order ${po.po_number} is awaiting your response. Please review and respond.`,
            'po_reminder',
            poId,
            true
        );

        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'PO notification resent to supplier'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Resend PO error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

// ==================== UPDATE EXPORTS ====================
// ==================== EXPORTS ====================
module.exports = {
    // Dashboard
    getDashboardStats,
    
    // RFQ Management
    createRFQ,
    getRFQs,
    getRFQQuotes,
    getRFQDocuments,
    acceptQuote,
    rejectQuote,
    
    // PO Workflow (PRD Pages 2-5)
    savePODraft,
    sendPOToSupplier,
    
    // Order Management
    getOrders,
    getOrderDetails,
    uploadOrderDocument,
    getDocumentVersions,
    replaceDocumentVersion,
    sendOrderMessage,
    
    // Suppliers
    getSuppliers,
    
    // Profile
    getProfile,
    updateProfile,
    
    // ==================== NEW EXPORTS - Add these ====================
    // PO Status & Polling
    getPOStatus,
    
    // OEM Signature (PRD Step 6)
    addOEMSignature,
    
    // Revision Workflow (PRD Page 5)
    acceptRevisionRequest,
    rejectRevisionRequest,
    counterRevisionRequest,
    
    // Order Timeline & Audit (PRD Pages 6-7)
    getOrderTimeline,
    exportAuditTrail,
    
    // Resend PO Notification
    resendPONotification,
};