const pool = require('../config/database');

// ==================== GET ORDER MESSAGES ====================
const getOrderMessages = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user.userId;
        
        // Verify order belongs to this OEM
        const orderCheck = await pool.query(
            'SELECT id FROM purchase_orders WHERE id = $1 AND oem_id = $2',
            [orderId, userId]
        );
        
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const messages = await pool.query(`
            SELECT 
                om.id,
                om.po_id,
                om.sender_id,
                om.sender_name,
                om.sender_type,
                om.message,
                om.is_read,
                om.created_at,
                to_char(om.created_at, 'YYYY-MM-DD HH24:MI:SS') as formatted_date
            FROM order_messages om
            WHERE om.po_id = $1
            ORDER BY om.created_at ASC
        `, [orderId]);
        
        res.json({ success: true, messages: messages.rows });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== SEND ORDER MESSAGE ====================
const sendOrderMessage = async (req, res) => {
    try {
        const userId = req.user.userId;
        const orderId = req.params.id;
        const { message } = req.body;
        
        console.log(`Sending message to order ${orderId}: ${message}`);
        
        if (!message || message.trim() === '') {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Verify order exists and belongs to this OEM
        const orderCheck = await pool.query(
            'SELECT po.id, po.oem_id, po.supplier_id, u.company_name as supplier_name FROM purchase_orders po JOIN users u ON po.supplier_id = u.id WHERE po.id = $1 AND po.oem_id = $2',
            [orderId, userId]
        );
        
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const order = orderCheck.rows[0];
        
        // Get sender's company name
        const senderResult = await pool.query(
            'SELECT company_name, role FROM users WHERE id = $1',
            [userId]
        );
        const senderName = senderResult.rows[0]?.company_name || 'OEM User';
        const senderRole = senderResult.rows[0]?.role || 'oem';
        
        // Insert message
        const result = await pool.query(`
            INSERT INTO order_messages (po_id, sender_id, sender_name, sender_type, message, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING *
        `, [orderId, userId, senderName, senderRole === 'oem' ? 'OEM' : 'Supplier', message.trim()]);
        
        console.log('Message sent successfully');
        
        // Create notification for supplier
        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id)
            VALUES ($1, 'New Message', $2, 'message', $3)
        `, [order.supplier_id, `New message from ${senderName} on PO ${orderId}`, orderId]);
        
        res.json({ 
            success: true, 
            message: {
                id: result.rows[0].id,
                sender_name: result.rows[0].sender_name,
                sender_type: result.rows[0].sender_type,
                message: result.rows[0].message,
                created_at: result.rows[0].created_at
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== MARK MESSAGE AS READ ====================
const markMessageAsRead = async (req, res) => {
    try {
        const messageId = req.params.id;
        const userId = req.user.userId;
        
        await pool.query(`
            UPDATE order_messages 
            SET is_read = TRUE, read_at = NOW()
            WHERE id = $1 AND sender_id != $2
        `, [messageId, userId]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark message error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== GET UNREAD COUNT ====================
const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const result = await pool.query(`
            SELECT COUNT(*) as count
            FROM order_messages om
            JOIN purchase_orders po ON om.po_id = po.id
            WHERE (po.oem_id = $1 OR po.supplier_id = $1)
            AND om.sender_id != $1
            AND om.is_read = FALSE
        `, [userId]);
        
        res.json({ unread_count: parseInt(result.rows[0]?.count || 0) });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.json({ unread_count: 0 });
    }
};

module.exports = {
    getOrderMessages,
    sendOrderMessage,
    markMessageAsRead,
    getUnreadCount
};
