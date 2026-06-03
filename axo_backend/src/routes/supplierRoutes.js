/**
 * =====================================================
 * SUPPLIER ROUTES
 * axo_backend/src/routes/supplierRoutes.js
 * =====================================================
 */

const express = require('express');
const multer  = require('multer');
const os      = require('os');
const router  = express.Router();

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
    uploadMilestonePhoto,
    getProfile,
    updateProfile,
    acceptPurchaseOrder,
    rejectPurchaseOrder,
    requestRevisionOnPO,
    getPurchaseOrderDetails
} = require('../controllers/supplierController');

// ─── multer — milestone photos (temp → controller moves to final dir) ───
const milestoneUpload = multer({
    dest: os.tmpdir(),                // temp dir; controller moves file
    limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB max
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, WEBP and GIF images are allowed'));
        }
    },
});

// ─── Global auth + role guard ─────────────────────────────────────
router.use(authenticateToken);
router.use(checkRole(['supplier', 'both', 'admin']));


// ─── Dashboard ────────────────────────────────────────────────────
router.get('/dashboard/stats', getDashboardStats);

// ─── RFQ Inbox ────────────────────────────────────────────────────
router.get('/rfqs/open', getOpenRFQs);

// ─── Quotes ───────────────────────────────────────────────────────
router.post('/quotes',  submitQuote);
router.get('/quotes',   getMyQuotes);

// ─── Orders ───────────────────────────────────────────────────────
router.get('/orders',      getMyOrders);
router.get('/orders/:id',  getOrderDetails);

// ─── Messages ─────────────────────────────────────────────────────
router.post('/orders/:id/messages', sendOrderMessage);

// ─── Milestones ───────────────────────────────────────────────────
router.put(
    '/orders/:orderId/milestones/:milestoneId',
    updateMilestone
);

router.post(
    '/orders/:orderId/milestones/:milestoneId/photo',
    milestoneUpload.single('photo'),
    uploadMilestonePhoto
);

// ─── Profile ──────────────────────────────────────────────────────
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// ==================== ADD THESE ROUTES TO supplierRoutes.js ====================

// ==================== PO RESPONSE ROUTES (PRD Pages 4-5) ====================

// Get PO details
router.get('/purchase-orders/:poId', getPurchaseOrderDetails);

// Accept PO with signature (PRD Step 5)
router.post('/purchase-orders/:poId/accept', acceptPurchaseOrder);

// Reject PO (PRD Step 5)
router.post('/purchase-orders/:poId/reject', rejectPurchaseOrder);

// Request revision (PRD Step 5)
router.post('/purchase-orders/:poId/revision', requestRevisionOnPO);

module.exports = router;
