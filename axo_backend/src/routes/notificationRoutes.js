const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    getNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
    deleteNotification
} = require('../controllers/notificationController');

// All notification routes require authentication
router.use(authenticateToken);

// Get all notifications for logged-in user
router.get('/', getNotifications);

// Get unread count
router.get('/unread/count', getUnreadCount);

// Mark a specific notification as read
router.put('/:id/read', markAsRead);

// Mark all notifications as read
router.put('/read-all', markAllAsRead);

// Delete a notification
router.delete('/:id', deleteNotification);

module.exports = router;
