const express = require('express');
const router = express.Router();
const { authenticateToken, checkRole } = require('../middleware/auth');
const {
    getDashboardStats, createRFQ, getRFQs, getRFQQuotes, acceptQuote, rejectQuote,
    getOrders, getOrderDetails, sendOrderMessage, updateMilestone,
    getSuppliers, getProfile, updateProfile
} = require('../controllers/oemController');

router.use(authenticateToken);
router.use(checkRole(['oem', 'both', 'admin']));

router.get('/dashboard/stats', getDashboardStats);
router.post('/rfqs', createRFQ);
router.get('/rfqs', getRFQs);
router.get('/rfqs/:id/quotes', getRFQQuotes);
router.post('/rfqs/quotes/:id/accept', acceptQuote);
router.post('/rfqs/quotes/:id/reject', rejectQuote);
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderDetails);
router.post('/orders/:id/messages', sendOrderMessage);
router.put('/orders/:orderId/milestones/:milestoneId', updateMilestone);
router.get('/suppliers', getSuppliers);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

module.exports = router;
