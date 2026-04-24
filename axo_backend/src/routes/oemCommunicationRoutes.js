const express = require('express');
const router = express.Router();
const { authenticateToken, checkRole } = require('../middleware/auth');
const {
    getOrderMessages,
    sendOrderMessage,
    markMessageAsRead,
    getUnreadCount
} = require('../controllers/oemCommunicationController');

router.use(authenticateToken);
router.use(checkRole(['oem', 'both', 'admin']));

// Get all messages for an order
router.get('/orders/:id/messages', getOrderMessages);

// Send a message to an order
router.post('/orders/:id/messages', sendOrderMessage);

// Mark a message as read
router.put('/messages/:id/read', markMessageAsRead);

// Get unread message count
router.get('/messages/unread/count', getUnreadCount);

module.exports = router;
