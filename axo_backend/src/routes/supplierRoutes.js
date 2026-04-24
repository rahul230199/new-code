const express = require('express');
const router = express.Router();
const { authenticateToken, checkRole } = require('../middleware/auth');
const {
    getDashboardStats,
    getOpenRFQs,
    submitQuote,
    getMyQuotes,
    getMyOrders,
    getOrderDetails,
    sendOrderMessage,
    updateMilestone,
    getProfile,
    updateProfile
} = require('../controllers/supplierController');

// All supplier routes require authentication
router.use(authenticateToken);
router.use(checkRole(['supplier', 'both', 'admin']));

// Dashboard
router.get('/dashboard/stats', getDashboardStats);

// RFQ Inbox
router.get('/rfqs/open', getOpenRFQs);

// Quotes
router.post('/quotes', submitQuote);
router.get('/quotes', getMyQuotes);

// Orders
router.get('/orders', getMyOrders);
router.get('/orders/:id', getOrderDetails);
router.post('/orders/:id/messages', sendOrderMessage);
router.put('/orders/:orderId/milestones/:milestoneId', updateMilestone);

// Profile
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

module.exports = router;
