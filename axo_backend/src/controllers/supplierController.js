const pool = require('../config/database');

// ==================== DASHBOARD STATS ====================
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.userId;

        const openRfqs       = await pool.query("SELECT COUNT(*) FROM rfqs WHERE status='open'");
        const pendingQuotes  = await pool.query("SELECT COUNT(*) FROM quotes WHERE supplier_id=$1 AND status='pending'", [userId]);
        const activeOrders   = await pool.query("SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=$1 AND status IN('accepted','in_progress')", [userId]);
        const completedOrders = await pool.query("SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=$1 AND status='completed'", [userId]);

        return res.json({
            stats: {
                open_rfqs:        parseInt(openRfqs.rows[0]?.count    || 0),
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

// ==================== RFQ INBOX ====================
const getOpenRFQs = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.id, r.rfq_number, r.title, r.part_name, r.quantity,
                   r.description, r.target_price, r.currency, r.unit, r.created_at,
                   u.company_name AS oem_name,
                   COALESCE((SELECT COUNT(*) FROM documents d WHERE d.rfq_id = r.id AND d.is_public=TRUE), 0) AS document_count
            FROM rfqs r
            JOIN users u ON r.oem_id = u.id
            WHERE r.status = 'open'
            ORDER BY r.created_at DESC
        `);
        return res.json({ rfqs: result.rows });
    } catch (error) {
        console.error('Get open RFQs error:', error);
        return res.json({ rfqs: [] });
    }
};

// ==================== SUBMIT QUOTE ====================
const submitQuote = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { rfqId, price, currency, leadTimeDays, paymentTerms, notes } = req.body;

        if (!rfqId || !price || !leadTimeDays) {
            return res.status(400).json({ error: 'rfqId, price and leadTimeDays are required' });
        }

        // Check RFQ is still open
        const rfqCheck = await pool.query("SELECT id, oem_id, title FROM rfqs WHERE id=$1 AND status='open'", [rfqId]);
        if (!rfqCheck.rows.length) {
            return res.status(400).json({ error: 'RFQ is not open for quotes' });
        }

        const existing = await pool.query(
            'SELECT id FROM quotes WHERE rfq_id=$1 AND supplier_id=$2',
            [rfqId, userId]
        );
        if (existing.rows.length) {
            return res.status(400).json({ error: 'You have already submitted a quote for this RFQ' });
        }

        const quoteNumber = `QT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const result = await pool.query(`
            INSERT INTO quotes (quote_number, rfq_id, supplier_id, price, currency,
                                lead_time_days, payment_terms, notes, status, submitted_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',NOW())
            RETURNING id, quote_number, price, status
        `, [quoteNumber, rfqId, userId, price, currency || 'USD', leadTimeDays, paymentTerms || 'Net 30', notes || null]);

        // Notify OEM
        const supplierResult = await pool.query('SELECT company_name FROM users WHERE id=$1', [userId]);
        const supplierName   = supplierResult.rows[0]?.company_name || 'A supplier';

        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1,'New Quote Received',$2,'quote',$3)
        `, [rfqCheck.rows[0].oem_id,
            `${supplierName} submitted a quote for "${rfqCheck.rows[0].title}"`,
            rfqId]);

        return res.json({ success: true, quote: result.rows[0] });
    } catch (error) {
        console.error('Submit quote error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// ==================== MY QUOTES ====================
const getMyQuotes = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT q.id, q.price, q.currency, q.lead_time_days, q.payment_terms,
                   q.notes, q.status, q.submitted_at,
                   r.title, r.part_name, r.quantity, r.rfq_number,
                   u.company_name AS oem_name
            FROM quotes q
            JOIN rfqs r  ON q.rfq_id  = r.id
            JOIN users u ON r.oem_id  = u.id
            WHERE q.supplier_id = $1
            ORDER BY q.submitted_at DESC
        `, [userId]);
        return res.json({ quotes: result.rows });
    } catch (error) {
        console.error('Get my quotes error:', error);
        return res.json({ quotes: [] });
    }
};

// ==================== MY ORDERS ====================
const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT po.id, po.po_number, po.part_name, po.quantity,
                   po.total_value, po.currency, po.status, po.created_at,
                   COALESCE(po.progress,0) AS progress,
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

// ==================== ORDER DETAILS ====================
const getOrderDetails = async (req, res) => {
    try {
        const userId  = req.user.userId;
        const orderId = parseInt(req.params.id);

        if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

        const orderResult = await pool.query(`
            SELECT po.*, u.company_name AS oem_name
            FROM purchase_orders po
            JOIN users u ON po.oem_id = u.id
            WHERE po.id=$1 AND po.supplier_id=$2
        `, [orderId, userId]);

        const messages = await pool.query(`
            SELECT om.id, om.sender_name, om.sender_type, om.message, om.created_at
            FROM order_messages om
            WHERE om.po_id=$1
            ORDER BY om.created_at ASC
        `, [orderId]);

        const milestones = await pool.query(`
            SELECT id, milestone_name, milestone_order, status, notes, completed_at
            FROM order_milestones
            WHERE po_id=$1
            ORDER BY milestone_order ASC
        `, [orderId]);

        return res.json({
            order:          orderResult.rows[0] || {},
            communications: messages.rows,
            milestones:     milestones.rows,
        });
    } catch (error) {
        console.error('Get order details error:', error);
        return res.json({ order: {}, communications: [], milestones: [] });
    }
};

// ==================== SEND ORDER MESSAGE ====================
const sendOrderMessage = async (req, res) => {
    try {
        const userId  = req.user.userId;
        const orderId = parseInt(req.params.id);
        const { message } = req.body;

        if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

        // Verify supplier owns this order
        const orderCheck = await pool.query(
            'SELECT id, oem_id FROM purchase_orders WHERE id=$1 AND supplier_id=$2',
            [orderId, userId]
        );
        if (!orderCheck.rows.length) return res.status(404).json({ error: 'Order not found' });

        const senderResult = await pool.query('SELECT company_name FROM users WHERE id=$1', [userId]);
        const senderName   = senderResult.rows[0]?.company_name || 'Supplier';

        const result = await pool.query(`
            INSERT INTO order_messages (po_id, sender_id, sender_name, sender_type, message, created_at)
            VALUES ($1,$2,$3,'Supplier',$4,NOW())
            RETURNING id, sender_name, sender_type, message, created_at
        `, [orderId, userId, senderName, message.trim()]);

        // Notify OEM
        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1,'New Message',$2,'message',$3)
        `, [orderCheck.rows[0].oem_id, `New message from ${senderName} on PO ${orderId}`, orderId]);

        return res.json({ success: true, message: result.rows[0] });
    } catch (error) {
        console.error('Send message error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// ==================== UPDATE MILESTONE (SUPPLIER ONLY) ====================
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

        const validStatuses = ['pending', 'in_progress', 'completed', 'delayed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        // Security: verify this order belongs to this supplier
        const orderCheck = await pool.query(
            'SELECT id, oem_id FROM purchase_orders WHERE id=$1 AND supplier_id=$2',
            [orderId, userId]
        );
        if (!orderCheck.rows.length) {
            return res.status(403).json({ error: 'Access denied: order not found or not your order' });
        }

        // Update milestone
        if (status === 'completed') {
            await pool.query(`
                UPDATE order_milestones
                SET status=$1, notes=$2, completed_at=NOW()
                WHERE id=$3 AND po_id=$4
            `, [status, notes || null, milestoneId, orderId]);
        } else {
            await pool.query(`
                UPDATE order_milestones
                SET status=$1, notes=$2
                WHERE id=$3 AND po_id=$4
            `, [status, notes || null, milestoneId, orderId]);
        }

        // Recalculate progress
        const completedResult = await pool.query(
            "SELECT COUNT(*) FROM order_milestones WHERE po_id=$1 AND status='completed'",
            [orderId]
        );
        const totalResult = await pool.query(
            'SELECT COUNT(*) FROM order_milestones WHERE po_id=$1',
            [orderId]
        );

        const completed = parseInt(completedResult.rows[0].count);
        const total     = parseInt(totalResult.rows[0].count);
        const progress  = total > 0 ? Math.round((completed / total) * 100) : 0;

        await pool.query(
            'UPDATE purchase_orders SET progress=$1, updated_at=NOW() WHERE id=$2',
            [progress, orderId]
        );

        // Notify OEM about milestone update
        const milestoneResult = await pool.query(
            'SELECT milestone_name FROM order_milestones WHERE id=$1',
            [milestoneId]
        );
        const milestoneName = milestoneResult.rows[0]?.milestone_name || 'Milestone';
        const supplierResult = await pool.query('SELECT company_name FROM users WHERE id=$1', [userId]);
        const supplierName   = supplierResult.rows[0]?.company_name || 'Supplier';

        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1,'Milestone Updated',$2,'order',$3)
        `, [
            orderCheck.rows[0].oem_id,
            `${supplierName} marked "${milestoneName}" as ${status} (PO ${orderId})`,
            orderId,
        ]);

        return res.json({ success: true, progress });
    } catch (error) {
        console.error('Update milestone error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// ==================== PROFILE ====================
const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(
            'SELECT id, email, company_name, phone, website, city, country, role, capabilities, created_at FROM users WHERE id=$1',
            [userId]
        );
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

        await pool.query(
            'UPDATE users SET phone=$1, website=$2, city=$3, country=$4, updated_at=NOW() WHERE id=$5',
            [phone || null, website || null, city || null, country || null, userId]
        );
        return res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getDashboardStats,
    getOpenRFQs,
    submitQuote,
    getMyQuotes,
    getMyOrders,
    getOrderDetails,
    sendOrderMessage,
    updateMilestone,   // ← ONLY exported here, not in oemController
    getProfile,
    updateProfile,
};