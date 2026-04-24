const pool = require('../config/database');

// ==================== DASHBOARD STATS ====================
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const kpis = await pool.query(`
            SELECT 
                COALESCE((SELECT COUNT(*) FROM rfqs WHERE oem_id = $1 AND status = 'open'), 0) as active_rfqs,
                COALESCE((SELECT COUNT(*) FROM quotes q JOIN rfqs r ON q.rfq_id = r.id WHERE r.oem_id = $1 AND q.status = 'pending'), 0) as quotes_pending,
                COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE oem_id = $1 AND status IN ('accepted', 'in_progress')), 0) as active_orders,
                COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE oem_id = $1 AND status = 'delayed'), 0) as delayed_orders
        `, [userId]);
        
        const orderStatus = await pool.query(`
            SELECT status, COUNT(*) as count FROM purchase_orders WHERE oem_id = $1 GROUP BY status
        `, [userId]);
        
        const monthlyTrend = await pool.query(`
            SELECT TO_CHAR(created_at, 'Mon YYYY') as month, COALESCE(SUM(total_value), 0) as total_value
            FROM purchase_orders WHERE oem_id = $1 AND created_at >= NOW() - INTERVAL '6 months'
            GROUP BY TO_CHAR(created_at, 'Mon YYYY'), DATE_TRUNC('month', created_at)
            ORDER BY DATE_TRUNC('month', created_at) DESC LIMIT 6
        `, [userId]);
        
        const bottlenecks = await pool.query(`
            SELECT 'Delayed Milestones' as name, COUNT(*) as value, 'high' as severity
            FROM order_milestones om JOIN purchase_orders po ON om.po_id = po.id
            WHERE po.oem_id = $1 AND om.status = 'delayed'
            UNION ALL SELECT 'Raw Material Shortages', 0, 'medium'
            UNION ALL SELECT 'QC Hold', 0, 'low' LIMIT 3
        `, [userId]);
        
        const liveOrders = await pool.query(`
            SELECT po.id, po.po_number, po.part_name, po.quantity, COALESCE(po.status, 'pending') as status, 
                   u.company_name as supplier_name
            FROM purchase_orders po JOIN users u ON po.supplier_id = u.id
            WHERE po.oem_id = $1 ORDER BY po.created_at DESC LIMIT 5
        `, [userId]);
        
        res.json({
            kpis: kpis.rows[0] || { active_rfqs: 0, quotes_pending: 0, active_orders: 0, delayed_orders: 0 },
            charts: { order_status_distribution: orderStatus.rows || [], monthly_volume_trend: monthlyTrend.rows || [] },
            heatmap: bottlenecks.rows || [],
            live_orders: liveOrders.rows || []
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
            SELECT r.*, COALESCE((SELECT COUNT(*) FROM quotes WHERE rfq_id = r.id), 0) as quote_count
            FROM rfqs r WHERE r.oem_id = $1 ORDER BY r.created_at DESC
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
        
        if (!title) return res.status(400).json({ error: 'Title is required' });
        if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Valid quantity is required' });
        
        const rfqNumber = `RFQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const result = await pool.query(`
            INSERT INTO rfqs (rfq_number, oem_id, title, part_number, part_name, quantity, unit, 
                target_price, currency, description, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open', NOW())
            RETURNING *
        `, [rfqNumber, userId, title, partNumber || null, partName || null, parseInt(quantity), 
            unit || 'units', targetPrice || null, currency || 'USD', description || null]);
        
        res.json({ success: true, rfq: result.rows[0] });
    } catch (error) {
        console.error('Create RFQ error:', error);
        res.status(500).json({ error: error.message });
    }
};

const getRFQQuotes = async (req, res) => {
    try {
        const rfqId = req.params.id;
        const quotes = await pool.query(`
            SELECT q.*, u.company_name as supplier_name
            FROM quotes q JOIN users u ON q.supplier_id = u.id
            WHERE q.rfq_id = $1 ORDER BY q.submitted_at DESC
        `, [rfqId]);
        res.json({ quotes: quotes.rows });
    } catch (error) {
        console.error('Get quotes error:', error);
        res.json({ quotes: [] });
    }
};

const acceptQuote = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const quoteId = req.params.id;
        const userId = req.user.userId;
        
        const quoteResult = await client.query(`
            SELECT q.*, r.oem_id, r.title, r.part_name, r.quantity
            FROM quotes q JOIN rfqs r ON q.rfq_id = r.id
            WHERE q.id = $1 AND r.oem_id = $2
        `, [quoteId, userId]);
        
        if (quoteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Quote not found' });
        }
        
        const quote = quoteResult.rows[0];
        
        await client.query('UPDATE quotes SET status = $1, accepted_at = NOW() WHERE id = $2', ['accepted', quoteId]);
        await client.query('UPDATE rfqs SET status = $1, awarded_at = NOW() WHERE id = $2', ['awarded', quote.rfq_id]);
        
        const poNumber = `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const poResult = await client.query(`
            INSERT INTO purchase_orders (po_number, rfq_id, quote_id, oem_id, supplier_id, 
                part_name, quantity, unit_price, total_value, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'accepted', NOW())
            RETURNING *
        `, [poNumber, quote.rfq_id, quoteId, quote.oem_id, quote.supplier_id,
            quote.part_name, quote.quantity, quote.price, quote.quantity * quote.price]);
        
        // Create milestones
        // Create milestones (PRODUCTION FIX WITH completed_at)
const milestones = [
    'Order Confirmed',
    'Raw Materials',
    'Production Started',
    'Quality Check',
    'Ready to Ship',
    'Delivered',
    'Invoice Paid'
];

for (let i = 0; i < milestones.length; i++) {
    const status = i === 0 ? 'completed' : 'pending';

    await client.query(`
        INSERT INTO order_milestones (
            po_id,
            milestone_name,
            milestone_order,
            status,
            completed_at
        )
        VALUES (
            $1, $2, $3, $4,
            CASE WHEN $4 = 'completed' THEN NOW() ELSE NULL END
        )
    `, [
        poResult.rows[0].id,
        milestones[i],
        i + 1,
        status
    ]);
}
        
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
        await pool.query('UPDATE quotes SET status = $1 WHERE id = $2', ['rejected', req.params.id]);
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
            SELECT po.*, u.company_name as supplier_name
            FROM purchase_orders po JOIN users u ON po.supplier_id = u.id
            WHERE po.oem_id = $1 ORDER BY po.created_at DESC
        `, [userId]);
        res.json({ orders: result.rows });
    } catch (error) {
        console.error('Get orders error:', error);
        res.json({ orders: [] });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const userId = req.user.userId;
        const orderId = req.params.id;
        
        const orderResult = await pool.query(`
            SELECT po.*, u.company_name as supplier_name
            FROM purchase_orders po JOIN users u ON po.supplier_id = u.id
            WHERE po.id = $1 AND po.oem_id = $2
        `, [orderId, userId]);
        
        const messages = await pool.query(`
            SELECT om.*, u.company_name as sender_name
            FROM order_messages om JOIN users u ON om.sender_id = u.id
            WHERE om.po_id = $1 ORDER BY om.created_at ASC
        `, [orderId]);
        
        const milestones = await pool.query(`
            SELECT * FROM order_milestones WHERE po_id = $1 ORDER BY milestone_order ASC
        `, [orderId]);
        
        res.json({ 
            order: orderResult.rows[0] || {}, 
            communications: messages.rows,
            milestones: milestones.rows 
        });
    } catch (error) {
        console.error('Get order details error:', error);
        res.json({ order: {}, communications: [], milestones: [] });
    }
};

const sendOrderMessage = async (req, res) => {
    try {
        const userId = req.user.userId;
        const orderId = req.params.id;
        const { message } = req.body;
        
        if (!message) return res.status(400).json({ error: 'Message is required' });
        
        const senderResult = await pool.query('SELECT company_name FROM users WHERE id = $1', [userId]);
        const senderName = senderResult.rows[0]?.company_name || 'OEM User';
        
        const result = await pool.query(`
            INSERT INTO order_messages (po_id, sender_id, sender_name, sender_type, message, created_at)
            VALUES ($1, $2, $3, 'OEM', $4, NOW())
            RETURNING *
        `, [orderId, userId, senderName, message]);
        
        res.json({ success: true, message: result.rows[0] });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateMilestone = async (req, res) => {
    try {
        const { orderId, milestoneId } = req.params;
        const { status, notes } = req.body;

        // 🔥 IMPORTANT: force clean values
        const cleanStatus = String(status);
        const cleanNotes = notes ? String(notes) : null;
        const isCompleted = cleanStatus === 'completed';

        // 🔥 NO $1 reuse anywhere → NO postgres confusion
      if (cleanStatus === 'completed') {
    await pool.query(`
        UPDATE order_milestones 
        SET 
            status = $1,
            notes = $2,
            completed_at = NOW()
        WHERE id = $3 AND po_id = $4
    `, [
        cleanStatus,
        cleanNotes,
        Number(milestoneId),
        Number(orderId)
    ]);
} else {
    await pool.query(`
        UPDATE order_milestones 
        SET 
            status = $1,
            notes = $2
        WHERE id = $3 AND po_id = $4
    `, [
        cleanStatus,
        cleanNotes,
        Number(milestoneId),
        Number(orderId)
    ]);
}

        // ✅ progress calc (safe)
        const completedCount = await pool.query(
            'SELECT COUNT(*) FROM order_milestones WHERE po_id = $1 AND status = $2',
            [orderId, 'completed']
        );

        const totalCount = await pool.query(
            'SELECT COUNT(*) FROM order_milestones WHERE po_id = $1',
            [orderId]
        );

        const completed = Number(completedCount.rows[0].count);
        const total = Number(totalCount.rows[0].count);

        const progress = Math.round((completed / total) * 100);

        await pool.query(
            'UPDATE purchase_orders SET progress = $1 WHERE id = $2',
            [progress, orderId]
        );

        res.json({ success: true, progress });

    } catch (error) {
        console.error('Update milestone error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== SUPPLIERS ====================
const getSuppliers = async (req, res) => {
    try {
        const suppliers = await pool.query(`
            SELECT u.id, u.company_name, u.email FROM users u 
            WHERE u.role IN ('supplier', 'both') AND u.status = 'active'
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
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        res.json({ profile: result.rows[0] || {} });
    } catch (error) {
        res.json({ profile: {} });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { phone, website, city, country } = req.body;
        await pool.query('UPDATE users SET phone = $1, website = $2, city = $3, country = $4 WHERE id = $5',
            [phone, website, city, country, userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getDashboardStats, createRFQ, getRFQs, getRFQQuotes, acceptQuote, rejectQuote,
    getOrders, getOrderDetails, sendOrderMessage, updateMilestone,
    getSuppliers, getProfile, updateProfile
};
