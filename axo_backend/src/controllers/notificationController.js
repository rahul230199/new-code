const pool = require('../config/database');

// Get all notifications for logged-in user
const getNotifications = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { limit = 50, offset = 0 } = req.query;
        
        const result = await pool.query(`
            SELECT id, title, message, type, reference_id, is_read, 
                   to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
                   CASE 
                       WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < 60 THEN 'Just now'
                       WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < 3600 THEN floor(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) || ' min ago'
                       WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < 86400 THEN floor(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600) || ' hours ago'
                       ELSE to_char(created_at, 'MMM DD, YYYY')
                   END as time_ago
            FROM notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [userId, parseInt(limit), parseInt(offset)]);
        
        // Get total count
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
            [userId]
        );
        
        res.json({
            success: true,
            notifications: result.rows,
            total: parseInt(countResult.rows[0].count),
            unread_count: result.rows.filter(n => !n.is_read).length
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get unread count only
const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(
            'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
            [userId]
        );
        res.json({ unread_count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.json({ unread_count: 0 });
    }
};

// Mark a notification as read
const markAsRead = async (req, res) => {
    try {
        const userId = req.user.userId;
        const notificationId = req.params.id;
        
        await pool.query(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        await pool.query(
            'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
            [userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete a notification
const deleteNotification = async (req, res) => {
    try {
        const userId = req.user.userId;
        const notificationId = req.params.id;
        
        await pool.query(
            'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Create notification (helper function for other controllers)
const createNotification = async (userId, title, message, type, referenceId = null) => {
    try {
        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, reference_id, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [userId, title, message, type, referenceId]);
        return true;
    } catch (error) {
        console.error('Create notification error:', error);
        return false;
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
    deleteNotification,
    createNotification
};
