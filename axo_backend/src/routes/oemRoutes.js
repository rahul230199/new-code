const express = require('express');
const router  = express.Router();

const { authenticateToken, checkRole } = require('../middleware/auth');
const {
    getDashboardStats,
    createRFQ, getRFQs, getRFQQuotes, getRFQDocuments,
    acceptQuote, rejectQuote,
    getOrders, getOrderDetails, sendOrderMessage,
    getSuppliers,
    getProfile, updateProfile,
} = require('../controllers/oemController');

// All OEM routes require auth + OEM/both/admin role
router.use(authenticateToken);
router.use(checkRole(['oem', 'both', 'admin']));

// ── Dashboard ──────────────────────────────────────────────────
router.get('/dashboard/stats', getDashboardStats);

// ── RFQ Management ─────────────────────────────────────────────
router.get('/rfqs',                   getRFQs);
router.post('/rfqs',                  createRFQ);
router.get('/rfqs/:id/quotes',        getRFQQuotes);
router.get('/rfqs/:id/documents',     getRFQDocuments);   // ← NEW: docs per RFQ
router.post('/rfqs/quotes/:id/accept', acceptQuote);
router.post('/rfqs/quotes/:id/reject', rejectQuote);

// ── Orders ─────────────────────────────────────────────────────
router.get('/orders',                   getOrders);
router.get('/orders/:id',               getOrderDetails);
router.post('/orders/:id/messages',     sendOrderMessage);
// NOTE: milestone updates are SUPPLIER-ONLY — not registered here

// ── Suppliers ──────────────────────────────────────────────────
router.get('/suppliers', getSuppliers);

// ── Profile ────────────────────────────────────────────────────
router.get('/profile',  getProfile);
router.put('/profile',  updateProfile);

module.exports = router;