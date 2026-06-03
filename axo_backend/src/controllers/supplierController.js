/**
 * =====================================================
 * SUPPLIER CONTROLLER
 * axo_backend/src/controllers/supplierController.js
 * =====================================================
 * All routes require authenticateToken + checkRole(['supplier','both','admin'])
 */

const pool = require('../config/database');
const fs   = require('fs');
const path = require('path');

const MILESTONE_UPLOAD_DIR = '/home/ec2-user/axo/uploads/milestones';

// Ensure upload dir exists at module load
if (!fs.existsSync(MILESTONE_UPLOAD_DIR)) {
    fs.mkdirSync(MILESTONE_UPLOAD_DIR, { recursive: true });
}

// ─── helpers ──────────────────────────────────────────────────────
const VALID_MILESTONE_STATUSES = ['pending', 'in_progress', 'completed', 'delayed'];

// =====================================================
// DASHBOARD STATS
// =====================================================
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.userId;

        const [openRfqs, pendingQuotes, activeOrders, completedOrders] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM rfqs WHERE status='open'"),
            pool.query("SELECT COUNT(*) FROM quotes WHERE supplier_id=$1 AND status='pending'",       [userId]),
            pool.query("SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=$1 AND status IN ('accepted','in_progress')", [userId]),
            pool.query("SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=$1 AND status='completed'", [userId]),
        ]);

        return res.json({
            stats: {
                open_rfqs:        parseInt(openRfqs.rows[0]?.count        || 0),
                pending_quotes:   parseInt(pendingQuotes.rows[0]?.count   || 0),
                active_orders:    parseInt(activeOrders.rows[0]?.count    || 0),
                completed_orders: parseInt(completedOrders.rows[0]?.count || 0),
            },
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        return res.json({ stats: { open_rfqs: 0, pending_quotes: 0, active_orders: 0, completed_orders: 0 } });
    }
};

// =====================================================
// RFQ INBOX — all open RFQs (this supplier hasn't quoted yet shown first)
// =====================================================
const getOpenRFQs = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT
                r.id,
                r.rfq_number,
                r.title,
                r.part_name,
                r.quantity,
                r.unit,
                r.description,
                r.target_price,
                r.currency,
                r.created_at,
                u.company_name                                                           AS oem_name,
                COALESCE((SELECT COUNT(*) FROM documents d WHERE d.rfq_id = r.id AND d.is_public = TRUE), 0) AS document_count,
                EXISTS (SELECT 1 FROM quotes q WHERE q.rfq_id = r.id AND q.supplier_id = $1) AS already_quoted
            FROM rfqs r
            JOIN users u ON r.oem_id = u.id
            WHERE r.status = 'open'
            ORDER BY already_quoted ASC, r.created_at DESC
        `, [userId]);

        return res.json({ rfqs: result.rows });
    } catch (error) {
        console.error('Get open RFQs error:', error);
        return res.json({ rfqs: [] });
    }
};

// =====================================================
// SUBMIT QUOTE
// =====================================================
const submitQuote = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { rfqId, price, currency, leadTimeDays, paymentTerms, notes } = req.body;

        if (!rfqId || !price || !leadTimeDays) {
            return res.status(400).json({ error: 'rfqId, price and leadTimeDays are required' });
        }
        if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
            return res.status(400).json({ error: 'Price must be a positive number' });
        }
        if (isNaN(parseInt(leadTimeDays)) || parseInt(leadTimeDays) < 1) {
            return res.status(400).json({ error: 'Lead time must be at least 1 day' });
        }

        // RFQ must still be open
        const rfqCheck = await pool.query(
            "SELECT id, oem_id, title FROM rfqs WHERE id = $1 AND status = 'open'",
            [rfqId]
        );
        if (!rfqCheck.rows.length) {
            return res.status(400).json({ error: 'RFQ is no longer open for quotes' });
        }

        // One quote per supplier per RFQ
        const existing = await pool.query(
            'SELECT id FROM quotes WHERE rfq_id = $1 AND supplier_id = $2',
            [rfqId, userId]
        );
        if (existing.rows.length) {
            return res.status(400).json({ error: 'You have already submitted a quote for this RFQ' });
        }

        const quoteNumber = `QT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const result = await pool.query(`
            INSERT INTO quotes (quote_number, rfq_id, supplier_id, price, currency,
                                lead_time_days, payment_terms, notes, status, submitted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
            RETURNING id, quote_number, price, status
        `, [
            quoteNumber, rfqId, userId,
            parseFloat(price),
            currency || 'USD',
            parseInt(leadTimeDays),
            paymentTerms || 'Net 30',
            notes || null,
        ]);

        // Notify OEM
        const supplierResult = await pool.query('SELECT company_name FROM users WHERE id = $1', [userId]);
        const supplierName   = supplierResult.rows[0]?.company_name || 'A supplier';

        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1, 'New Quote Received', $2, 'quote', $3)
        `, [
            rfqCheck.rows[0].oem_id,
            `${supplierName} submitted a quote for "${rfqCheck.rows[0].title}"`,
            rfqId,
        ]);

        return res.json({ success: true, quote: result.rows[0] });
    } catch (error) {
        console.error('Submit quote error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// =====================================================
// MY QUOTES
// =====================================================
/**
 * Get my quotes (Supplier)
 */
const getMyQuotes = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT
                q.id, q.quote_number, q.price, q.currency,
                q.lead_time_days, q.payment_terms, q.notes,
                q.status, q.submitted_at,
                r.id AS rfq_id, r.rfq_number, r.title, r.part_name, r.quantity,
                u.company_name AS oem_name
            FROM quotes q
            JOIN rfqs r ON q.rfq_id = r.id
            JOIN users u ON r.oem_id = u.id
            WHERE q.supplier_id = $1
            ORDER BY q.submitted_at DESC
        `, [userId]);

        return res.json({ quotes: result.rows });
    } catch (error) {
        console.error('Get my quotes error:', error);
        return res.json({ quotes: [] });
    }
};

// =====================================================
// MY ORDERS
// =====================================================
const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT
                po.id, po.po_number, po.part_name, po.quantity,
                po.total_value, po.currency, po.unit_price,
                po.status, po.created_at,
                COALESCE(po.progress, 0) AS progress,
                u.company_name AS oem_name
            FROM purchase_orders po
            JOIN users u ON po.oem_id = u.id
            WHERE po.supplier_id = $1
            ORDER BY po.created_at DESC
        `, [userId]);

        return res.json({ orders: result.rows });
    } catch (error) {
        console.error('Get my orders error:', error);
        return res.json({ orders: [] });
    }
};

// =====================================================
// ORDER DETAILS  (scoped to this supplier)
// =====================================================
const getOrderDetails = async (req, res) => {
    try {
        const userId  = req.user.userId;
        const orderId = parseInt(req.params.id);

        if (isNaN(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID' });
        }

        const orderResult = await pool.query(`
            SELECT
                po.*,
                u.company_name AS oem_name,
                u.email        AS oem_email
            FROM purchase_orders po
            JOIN users u ON po.oem_id = u.id
            WHERE po.id = $1 AND po.supplier_id = $2
        `, [orderId, userId]);

        if (!orderResult.rows.length) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const [messages, milestones] = await Promise.all([
            pool.query(`
                SELECT id, sender_name, sender_type, message, created_at
                FROM order_messages
                WHERE po_id = $1
                ORDER BY created_at ASC
            `, [orderId]),
            pool.query(`
                SELECT id, milestone_name, milestone_order, status, notes, photo_url, completed_at
                FROM order_milestones
                WHERE po_id = $1
                ORDER BY milestone_order ASC
            `, [orderId]),
        ]);

        return res.json({
            order:          orderResult.rows[0],
            communications: messages.rows,
            milestones:     milestones.rows,
        });
    } catch (error) {
        console.error('Get order details error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// =====================================================
// SEND ORDER MESSAGE  (supplier → OEM)
// =====================================================
const sendOrderMessage = async (req, res) => {
    try {
        const userId  = req.user.userId;
        const orderId = parseInt(req.params.id);
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        // Security: must be this supplier's order
        const orderCheck = await pool.query(
            'SELECT id, oem_id FROM purchase_orders WHERE id = $1 AND supplier_id = $2',
            [orderId, userId]
        );
        if (!orderCheck.rows.length) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const senderResult = await pool.query('SELECT company_name FROM users WHERE id = $1', [userId]);
        const senderName   = senderResult.rows[0]?.company_name || 'Supplier';

        const result = await pool.query(`
            INSERT INTO order_messages (po_id, sender_id, sender_name, sender_type, message, created_at)
            VALUES ($1, $2, $3, 'Supplier', $4, NOW())
            RETURNING id, sender_name, sender_type, message, created_at
        `, [orderId, userId, senderName, message.trim()]);

        // Notify OEM
        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1, 'New Message', $2, 'message', $3)
        `, [
            orderCheck.rows[0].oem_id,
            `New message from ${senderName} on PO ${orderId}`,
            orderId,
        ]);

        return res.json({ success: true, message: result.rows[0] });
    } catch (error) {
        console.error('Send message error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// =====================================================
// UPDATE MILESTONE  (status + notes)
// PUT /supplier/orders/:orderId/milestones/:milestoneId
// =====================================================
const updateMilestone = async (req, res) => {
    try {
        const userId      = req.user.userId;
        const orderId     = parseInt(req.params.orderId);
        const milestoneId = parseInt(req.params.milestoneId);
        const { status, notes } = req.body;

        if (isNaN(orderId) || isNaN(milestoneId)) {
            return res.status(400).json({ error: 'Invalid order or milestone ID' });
        }
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        if (!VALID_MILESTONE_STATUSES.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Allowed: ${VALID_MILESTONE_STATUSES.join(', ')}`,
            });
        }

        // Security: must be this supplier's order
        const orderCheck = await pool.query(
            'SELECT id, oem_id FROM purchase_orders WHERE id = $1 AND supplier_id = $2',
            [orderId, userId]
        );
        if (!orderCheck.rows.length) {
            return res.status(403).json({ error: 'Access denied: order not found or not yours' });
        }

        if (status === 'completed') {
            await pool.query(`
                UPDATE order_milestones
                SET status = $1, notes = $2, completed_at = NOW()
                WHERE id = $3 AND po_id = $4
            `, [status, notes || null, milestoneId, orderId]);
        } else {
            await pool.query(`
                UPDATE order_milestones
                SET status = $1, notes = $2
                WHERE id = $3 AND po_id = $4
            `, [status, notes || null, milestoneId, orderId]);
        }

        // Recalculate and persist progress
        const progress = await _recalcProgress(orderId);

        // Notify OEM
        const [milestoneRow, supplierRow] = await Promise.all([
            pool.query('SELECT milestone_name FROM order_milestones WHERE id = $1', [milestoneId]),
            pool.query('SELECT company_name FROM users WHERE id = $1', [userId]),
        ]);
        const milestoneName = milestoneRow.rows[0]?.milestone_name || 'Milestone';
        const supplierName  = supplierRow.rows[0]?.company_name    || 'Supplier';

        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1, 'Milestone Updated', $2, 'order', $3)
        `, [
            orderCheck.rows[0].oem_id,
            `${supplierName} marked "${milestoneName}" as ${status} on PO-${orderId}`,
            orderId,
        ]);

        return res.json({ success: true, progress });
    } catch (error) {
        console.error('Update milestone error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// =====================================================
// UPLOAD MILESTONE PHOTO
// POST /supplier/orders/:orderId/milestones/:milestoneId/photo
// multer handles file → req.file
// =====================================================
const uploadMilestonePhoto = async (req, res) => {
    try {
        const userId      = req.user.userId;
        const orderId     = parseInt(req.params.orderId);
        const milestoneId = parseInt(req.params.milestoneId);

        if (isNaN(orderId) || isNaN(milestoneId)) {
            return res.status(400).json({ error: 'Invalid order or milestone ID' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        // Security: must be this supplier's order
        const orderCheck = await pool.query(
            'SELECT id FROM purchase_orders WHERE id = $1 AND supplier_id = $2',
            [orderId, userId]
        );
        if (!orderCheck.rows.length) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Build stored path
        const ext      = path.extname(req.file.originalname) || '.jpg';
        const fileName = `milestone_${milestoneId}_${Date.now()}${ext}`;
        const destPath = path.join(MILESTONE_UPLOAD_DIR, fileName);

        fs.renameSync(req.file.path, destPath);

        // Relative URL served by nginx / static
        const photoUrl = `/uploads/milestones/${fileName}`;

        await pool.query(
            'UPDATE order_milestones SET photo_url = $1 WHERE id = $2 AND po_id = $3',
            [photoUrl, milestoneId, orderId]
        );

        return res.json({ success: true, photo_url: photoUrl });
    } catch (error) {
        console.error('Upload milestone photo error:', error);
        // Clean up temp file if something went wrong
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(500).json({ error: error.message });
    }
};

// =====================================================
// PROFILE
// =====================================================
const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT id, email, company_name, phone, website, city, country,
                   role, capabilities, custom_capabilities, created_at
            FROM users
            WHERE id = $1
        `, [userId]);

        return res.json({ profile: result.rows[0] || {} });
    } catch (error) {
        console.error('Get profile error:', error);
        return res.json({ profile: {} });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { phone, website, city, country } = req.body;

        await pool.query(`
            UPDATE users
            SET phone = $1, website = $2, city = $3, country = $4, updated_at = NOW()
            WHERE id = $5
        `, [phone || null, website || null, city || null, country || null, userId]);

        return res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// ─── Private helpers ──────────────────────────────────────────────
async function _recalcProgress(orderId) {
    const [completedResult, totalResult] = await Promise.all([
        pool.query("SELECT COUNT(*) FROM order_milestones WHERE po_id = $1 AND status = 'completed'", [orderId]),
        pool.query('SELECT COUNT(*) FROM order_milestones WHERE po_id = $1', [orderId]),
    ]);
    const completed = parseInt(completedResult.rows[0].count);
    const total     = parseInt(totalResult.rows[0].count);
    const progress  = total > 0 ? Math.round((completed / total) * 100) : 0;

    await pool.query(
        'UPDATE purchase_orders SET progress = $1, updated_at = NOW() WHERE id = $2',
        [progress, orderId]
    );
    return progress;
}
// ==================== ADD THESE FUNCTIONS TO supplierController.js ====================

// ==================== PO RESPONSE WORKFLOW (PRD Pages 4-5) ====================

/**
 * Supplier accepts PO with digital signature (PRD Step 5)
 * POST /api/supplier/purchase-orders/:poId/accept
 */
const acceptPurchaseOrder = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const { signature, notes } = req.body;

        if (!signature || !signature.name || !signature.designation) {
            return res.status(400).json({ error: 'Signature name and designation are required' });
        }

        await client.query('BEGIN');

        // Verify PO belongs to this supplier and is in correct state
        const poCheck = await client.query(`
            SELECT id, status, oem_id, po_number
            FROM purchase_orders
            WHERE id = $1 AND supplier_id = $2
        `, [poId, userId]);

        if (!poCheck.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'PO not found' });
        }

        const po = poCheck.rows[0];

        if (po.status !== 'sent' && po.status !== 'supplier_reviewing') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'PO is not in a state that can be accepted' });
        }

        // Add supplier signature
        const signatureData = {
            name: signature.name,
            designation: signature.designation,
            date: signature.date || new Date().toISOString(),
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };

        await client.query(`
            UPDATE purchase_orders 
            SET supplier_signature = $1,
                status = $2,
                workflow_status = $3,
                accepted_at = NOW(),
                supplier_notes = $4,
                updated_at = NOW()
            WHERE id = $5
        `, [JSON.stringify(signatureData), 'accepted', 'accepted', notes || null, poId]);

        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: ACTOR_TYPES.SUPPLIER,
            actionType: ACTION_TYPES.PO_ACCEPTED,
            newValue: { signature: signatureData, status: 'accepted' },
            notes: notes || `PO accepted by ${signature.name} (${signature.designation})`
        });

        // Notify OEM
        await sendNotification(
            po.oem_id,
            'Purchase Order Accepted',
            `${signature.name} has accepted PO ${po.po_number}. Please add your signature to finalize.`,
            'po_accepted',
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
            message: 'PO accepted successfully. Awaiting OEM signature.',
            purchaseOrder: updatedPO.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Accept PO error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Supplier rejects PO (PRD Step 5)
 * POST /api/supplier/purchase-orders/:poId/reject
 */
const rejectPurchaseOrder = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ error: 'Rejection reason is required' });
        }

        await client.query('BEGIN');

        // Verify PO belongs to this supplier
        const poCheck = await client.query(`
            SELECT id, status, oem_id, po_number
            FROM purchase_orders
            WHERE id = $1 AND supplier_id = $2
        `, [poId, userId]);

        if (!poCheck.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'PO not found' });
        }

        const po = poCheck.rows[0];

        if (po.status !== 'sent' && po.status !== 'supplier_reviewing') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'PO is not in a state that can be rejected' });
        }

        await client.query(`
            UPDATE purchase_orders 
            SET status = $1,
                workflow_status = $2,
                rejected_at = NOW(),
                rejection_reason = $3,
                updated_at = NOW()
            WHERE id = $4
        `, ['rejected', 'rejected', reason.trim(), poId]);

        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: ACTOR_TYPES.SUPPLIER,
            actionType: ACTION_TYPES.PO_REJECTED,
            newValue: { status: 'rejected', reason: reason },
            notes: `PO rejected: ${reason}`
        });

        // Notify OEM
        await sendNotification(
            po.oem_id,
            'Purchase Order Rejected',
            `PO ${po.po_number} has been rejected. Reason: ${reason}`,
            'po_rejected',
            poId,
            true
        );

        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'PO rejected successfully'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Reject PO error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Supplier requests revision on PO (PRD Step 5)
 * POST /api/supplier/purchase-orders/:poId/revision
 */
const requestRevisionOnPO = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { poId } = req.params;
        const userId = req.user.userId;
        const { reason, details, changes } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ error: 'Revision reason is required' });
        }

        await client.query('BEGIN');

        // Verify PO belongs to this supplier
        const poCheck = await client.query(`
            SELECT po.*, u.company_name as supplier_name
            FROM purchase_orders po
            WHERE po.id = $1 AND po.supplier_id = $2
        `, [poId, userId]);

        if (!poCheck.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'PO not found' });
        }

        const po = poCheck.rows[0];

        if (po.status !== 'sent' && po.status !== 'supplier_reviewing') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'PO is not in a state that can be revised' });
        }

        // Build changes array from current PO values
        const requestedChanges = changes || [];
        
        // If changes not provided, create from common fields
        if (requestedChanges.length === 0) {
            if (details) {
                requestedChanges.push({
                    field: 'special_instructions',
                    old_value: po.special_instructions,
                    new_value: null,
                    reason: details
                });
            }
        }

        // Create revision request record
        await client.query(`
            INSERT INTO po_revision_requests (
                po_id, requested_by, requested_by_id, changes, reason, details, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            poId, 'Supplier', userId, JSON.stringify(requestedChanges),
            reason.trim(), details || null, 'pending'
        ]);

        // Update PO status to revision_requested
        await client.query(`
            UPDATE purchase_orders 
            SET status = $1,
                workflow_status = $2,
                revision_requested_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
        `, ['revision_requested', 'revision_requested', poId]);

        // Log activity
        await logPOActivity({
            client,
            poId,
            userId,
            actorType: ACTOR_TYPES.SUPPLIER,
            actionType: ACTION_TYPES.PO_REVISION_REQUESTED,
            newValue: { status: 'revision_requested', reason: reason },
            notes: details || `Revision requested: ${reason}`
        });

        // Notify OEM
        await sendNotification(
            po.oem_id,
            'Revision Requested on PO',
            `${po.supplier_name} has requested revisions on PO ${po.po_number}. Reason: ${reason}`,
            'revision_requested',
            poId,
            true
        );

        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'Revision request sent to OEM'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Request revision error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * Get PO details for supplier response page
 * GET /api/supplier/purchase-orders/:poId
 */
const getPurchaseOrderDetails = async (req, res) => {
    try {
        const { poId } = req.params;
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT 
                po.*,
                u.company_name as oem_company_name,
                u.email as oem_contact_email,
                u.phone as oem_contact_phone,
                u.billing_address as oem_billing_address,
                u.shipping_address as oem_shipping_address
            FROM purchase_orders po
            JOIN users u ON po.oem_id = u.id
            WHERE po.id = $1 AND po.supplier_id = $2
        `, [poId, userId]);

        if (!result.rows.length) {
            return res.status(404).json({ error: 'PO not found' });
        }

        // Get any pending revision request
        const revisionRequest = await pool.query(`
            SELECT * FROM po_revision_requests 
            WHERE po_id = $1 AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1
        `, [poId]);

        res.json({
            success: true,
            purchaseOrder: result.rows[0],
            pendingRevision: revisionRequest.rows[0] || null
        });

    } catch (error) {
        console.error('Get PO details error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== UPDATE EXPORTS ====================

module.exports = {
    // Existing exports...
    getDashboardStats,
    getOpenRFQs,
    submitQuote,
    getMyQuotes,
    getMyOrders,
    getOrderDetails,
    sendOrderMessage,
    updateMilestone,
    uploadMilestonePhoto,
    getProfile,
    updateProfile,
    
    // NEW EXPORTS - Add these
    acceptPurchaseOrder,
    rejectPurchaseOrder,
    requestRevisionOnPO,
    getPurchaseOrderDetails
};