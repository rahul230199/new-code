const express = require('express');
const router = express.Router();

// ==================== MIDDLEWARE ====================
// Authentication & Role-based Access Control
const { authenticateToken, checkRole } = require('../middleware/auth');

// ==================== CONTROLLERS ====================
const { 
    getPendingRequests, 
    getAllRequests, 
    approveRequest, 
    rejectRequest,
    getStats 
} = require('../controllers/adminController');


// =====================================================
// 🔐 GLOBAL SECURITY LAYER
// =====================================================
// All admin routes require:
// 1. Valid JWT token
// 2. User role = admin

router.use(authenticateToken);
router.use(checkRole(['admin']));


// =====================================================
// 📊 ADMIN DASHBOARD
// =====================================================

/**
 * GET /api/admin/stats
 * Get dashboard statistics (pending, approved, rejected, users count)
 */
router.get('/stats', getStats);


// =====================================================
// 📥 ACCESS REQUEST MANAGEMENT
// =====================================================

/**
 * GET /api/admin/requests/pending
 * Get all pending access requests (OEM / Supplier)
 */
router.get('/requests/pending', getPendingRequests);

/**
 * GET /api/admin/requests/all
 * Get all requests with optional filters (status, role)
 */
router.get('/requests/all', getAllRequests);

/**
 * POST /api/admin/requests/:id/approve
 * Approve a network access request
 * - Creates a new user
 * - Generates temporary password
 * - Marks request as approved
 */
router.post('/requests/:id/approve', approveRequest);

/**
 * POST /api/admin/requests/:id/reject
 * Reject a request with optional reason
 */
router.post('/requests/:id/reject', rejectRequest);


module.exports = router;