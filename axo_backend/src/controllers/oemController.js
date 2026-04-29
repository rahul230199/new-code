const pool = require('../config/database');

// ==================== DASHBOARD STATS ====================
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.userId;

        const kpis = await pool.query(`
            SELECT
                COALESCE((SELECT COUNT(*) FROM rfqs WHERE oem_id = $1 AND status = 'open'), 0)         AS active_rfqs,
                COALESCE((SELECT COUNT(*) FROM quotes q
                           JOIN rfqs r ON q.rfq_id = r.id
                           WHERE r.oem_id = $1 AND q.status = 'pending'), 0)                          AS quotes_pending,
                COALESCE((SELECT COUNT(*) FROM purchase_orders
                           WHERE oem_id = $1 AND status IN ('accepted','in_progress')), 0)             AS active_orders,
                COALESCE((SELECT COUNT(*) FROM purchase_orders
                           WHERE oem_id = $1 AND status = 'delayed'), 0)                              AS delayed_orders
        `, [userId]);

        const orderStatus = await pool.query(`
            SELECT status, COUNT(*) AS count
            FROM purchase_orders
            WHERE oem_id = $1
            GROUP BY status
        `, [userId]);

        const monthlyTrend = await pool.query(`
            SELECT TO_CHAR(created_at,'Mon YYYY') AS month,
                   COALESCE(SUM(total_value), 0)   AS total_value
            FROM purchase_orders
            WHERE oem_id = $1 AND created_at >= NOW() - INTERVAL '6 months'
            GROUP BY TO_CHAR(created_at,'Mon YYYY'), DATE_TRUNC('month', created_at)
            ORDER BY DATE_TRUNC('month', created_at) DESC
            LIMIT 6
        `, [userId]);

        const bottlenecks = await pool.query(`
            SELECT 'Delayed Milestones'    AS name, COUNT(*) AS value, 'high'   AS severity
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
            kpis: kpis.rows[0] || { active_rfqs: 0, quotes_pending: 0, active_orders: 0, delayed_orders: 0 },
            charts: {
                order_status_distribution: orderStatus.rows || [],
                monthly_volume_trend:      monthlyTrend.rows || [],
            },
            heatmap:     bottlenecks.rows || [],
            live_orders: liveOrders.rows  || [],
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.json({ kpis: { active_rfqs: 0, quotes_pending: 0, active_orders: 0, delayed_orders: 0 } });
    }
};

// ==================== RFQ MANAGEMENT ====================
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
        res.json({ rfqs: [] });
    }
};

const createRFQ = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { title, partNumber, partName, quantity, unit, targetPrice, currency, description } = req.body;

        if (!title)                       return res.status(400).json({ error: 'Title is required' });
        if (!quantity || quantity <= 0)   return res.status(400).json({ error: 'Valid quantity is required' });

        const rfqNumber = `RFQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const result = await pool.query(`
            INSERT INTO rfqs (rfq_number, oem_id, title, part_number, part_name,
                              quantity, unit, target_price, currency, description, status, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',NOW())
            RETURNING *
        `, [
            rfqNumber, userId, title,
            partNumber || null, partName || null,
            parseInt(quantity),
            unit || 'units',
            targetPrice || null,
            currency || 'USD',
            description || null,
        ]);

        res.json({ success: true, rfq: result.rows[0] });
    } catch (error) {
        console.error('Create RFQ error:', error);
        res.status(500).json({ error: error.message });
    }
};

const getRFQQuotes = async (req, res) => {
    try {
        const rfqId  = req.params.id;
        const quotes = await pool.query(`
            SELECT q.*, u.company_name AS supplier_name
            FROM quotes q
            JOIN users u ON q.supplier_id = u.id
            WHERE q.rfq_id = $1
            ORDER BY q.submitted_at DESC
        `, [rfqId]);
        res.json({ quotes: quotes.rows });
    } catch (error) {
        console.error('Get quotes error:', error);
        res.json({ quotes: [] });
    }
};

// Get documents linked to a specific RFQ (so suppliers can see them)
const getRFQDocuments = async (req, res) => {
    try {
        const rfqId  = req.params.id;
        const userId = req.user.userId;

        // OEM sees all docs for this RFQ; suppliers see only public docs if they've quoted
        const isSupplier = req.user.role === 'supplier';

        let query;
        let params;

        if (isSupplier) {
            query = `
                SELECT d.id, d.file_name, d.file_size, d.file_type, d.category, d.description, d.created_at
                FROM documents d
                WHERE d.rfq_id = $1
                  AND d.is_public = TRUE
                  AND EXISTS (
                      SELECT 1 FROM quotes q WHERE q.rfq_id = $1 AND q.supplier_id = $2
                  )
                ORDER BY d.created_at DESC
            `;
            params = [rfqId, userId];
        } else {
            query  = `
                SELECT d.* FROM documents d WHERE d.rfq_id = $1 ORDER BY d.created_at DESC
            `;
            params = [rfqId];
        }

        const result = await pool.query(query, params);
        res.json({ documents: result.rows });
    } catch (error) {
        console.error('Get RFQ documents error:', error);
        res.json({ documents: [] });
    }
};

const acceptQuote = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const quoteId = req.params.id;
        const userId  = req.user.userId;

        const quoteResult = await client.query(`
            SELECT q.*, r.oem_id, r.title, r.part_name, r.quantity
            FROM quotes q
            JOIN rfqs r ON q.rfq_id = r.id
            WHERE q.id = $1 AND r.oem_id = $2
        `, [quoteId, userId]);

        if (!quoteResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        await client.query('UPDATE quotes SET status=$1, accepted_at=NOW() WHERE id=$2', ['accepted', quoteId]);
        await client.query('UPDATE rfqs   SET status=$1, awarded_at=NOW()  WHERE id=$2', ['awarded',  quote.rfq_id]);

        const poNumber = `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const poResult = await client.query(`
            INSERT INTO purchase_orders
                (po_number, rfq_id, quote_id, oem_id, supplier_id,
                 part_name, quantity, unit_price, total_value, status, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'accepted',NOW())
            RETURNING *
        `, [
            poNumber, quote.rfq_id, quoteId, quote.oem_id, quote.supplier_id,
            quote.part_name, quote.quantity,
            quote.price, quote.quantity * quote.price,
        ]);

        const milestones = [
            'Order Confirmed', 'Raw Materials', 'Production Started',
            'Quality Check', 'Ready to Ship', 'Delivered', 'Invoice Paid',
        ];

        for (let i = 0; i < milestones.length; i++) {
            const status = i === 0 ? 'completed' : 'pending';
            await client.query(`
                INSERT INTO order_milestones (po_id, milestone_name, milestone_order, status, completed_at)
                VALUES ($1,$2,$3,$4, CASE WHEN $4='completed' THEN NOW() ELSE NULL END)
            `, [poResult.rows[0].id, milestones[i], i + 1, status]);
        }

        // Notify supplier
        await client.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1,'Quote Accepted','Your quote has been accepted. A Purchase Order has been created.','order',$2)
        `, [quote.supplier_id, poResult.rows[0].id]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Quote accepted and PO created', purchaseOrder: poResult.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Accept quote error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

const rejectQuote = async (req, res) => {
    try {
        await pool.query('UPDATE quotes SET status=$1 WHERE id=$2', ['rejected', req.params.id]);
        res.json({ success: true, message: 'Quote rejected' });
    } catch (error) {
        console.error('Reject quote error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== ORDERS ====================
const getOrders = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT po.*, u.company_name AS supplier_name
            FROM purchase_orders po
            JOIN users u ON po.supplier_id = u.id
            WHERE po.oem_id = $1
            ORDER BY po.created_at DESC
        `, [userId]);
        res.json({ orders: result.rows });
    } catch (error) {
        console.error('Get orders error:', error);
        res.json({ orders: [] });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const userId  = req.user.userId;
        const orderId = req.params.id;

        const orderResult = await pool.query(`
            SELECT po.*, u.company_name AS supplier_name
            FROM purchase_orders po
            JOIN users u ON po.supplier_id = u.id
            WHERE po.id = $1 AND po.oem_id = $2
        `, [orderId, userId]);

        const messages = await pool.query(`
            SELECT om.id, om.sender_name, om.sender_type, om.message,
                   om.is_read, om.created_at
            FROM order_messages om
            WHERE om.po_id = $1
            ORDER BY om.created_at ASC
        `, [orderId]);

        const milestones = await pool.query(`
            SELECT id, milestone_name, milestone_order, status, notes, completed_at
            FROM order_milestones
            WHERE po_id = $1
            ORDER BY milestone_order ASC
        `, [orderId]);

        res.json({
            order:          orderResult.rows[0] || {},
            communications: messages.rows,
            milestones:     milestones.rows,
        });
    } catch (error) {
        console.error('Get order details error:', error);
        res.json({ order: {}, communications: [], milestones: [] });
    }
};

const sendOrderMessage = async (req, res) => {
    try {
        const userId  = req.user.userId;
        const orderId = req.params.id;
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Verify OEM owns this order
        const orderCheck = await pool.query(
            'SELECT id, supplier_id FROM purchase_orders WHERE id=$1 AND oem_id=$2',
            [orderId, userId]
        );
        if (!orderCheck.rows.length) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const senderResult = await pool.query('SELECT company_name FROM users WHERE id=$1', [userId]);
        const senderName   = senderResult.rows[0]?.company_name || 'OEM User';

        const result = await pool.query(`
            INSERT INTO order_messages (po_id, sender_id, sender_name, sender_type, message, created_at)
            VALUES ($1,$2,$3,'OEM',$4,NOW())
            RETURNING id, sender_name, sender_type, message, created_at
        `, [orderId, userId, senderName, message.trim()]);

        // Notify supplier
        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1,'New Message',$2,'message',$3)
        `, [orderCheck.rows[0].supplier_id, `New message from ${senderName} on PO ${orderId}`, orderId]);

        res.json({ success: true, message: result.rows[0] });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== SUPPLIERS (Enhanced) ====================
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
                COALESCE((
                    SELECT COUNT(DISTINCT po.id)
                    FROM purchase_orders po
                    WHERE po.supplier_id = u.id AND po.status = 'completed'
                ), 0) AS completed_orders,
                COALESCE((
                    SELECT COUNT(DISTINCT q.id)
                    FROM quotes q WHERE q.supplier_id = u.id
                ), 0) AS total_quotes
            FROM users u
            WHERE u.role IN ('supplier','both') AND u.status = 'active'
            ORDER BY u.company_name ASC
        `);
        res.json({ suppliers: suppliers.rows });
    } catch (error) {
        console.error('Get suppliers error:', error);
        res.json({ suppliers: [] });
    }
};

// ==================== PROFILE ====================
const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(
            'SELECT id, email, company_name, phone, website, city, country, role, created_at FROM users WHERE id=$1',
            [userId]
        );
        res.json({ profile: result.rows[0] || {} });
    } catch (error) {
        console.error('Get profile error:', error);
        res.json({ profile: {} });
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
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getDashboardStats,
    createRFQ, getRFQs, getRFQQuotes, getRFQDocuments,
    acceptQuote, rejectQuote,
    getOrders, getOrderDetails, sendOrderMessage,
    // updateMilestone intentionally removed — SUPPLIER ONLY
    getSuppliers,
    getProfile, updateProfile,
};