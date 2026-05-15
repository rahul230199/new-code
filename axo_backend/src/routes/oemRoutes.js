const express = require('express');
const router  = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');

const { authenticateToken, checkRole } = require('../middleware/auth');
const {
    getDashboardStats,
    createRFQ, getRFQs, getRFQQuotes, getRFQDocuments,
    acceptQuote, rejectQuote,
    getOrders, getOrderDetails, sendOrderMessage,
    getSuppliers,
    getProfile, updateProfile,
} = require('../controllers/oemController');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// All OEM routes require auth + OEM/both/admin role
router.use(authenticateToken);
router.use(checkRole(['oem', 'both', 'admin']));

// ── Dashboard ──────────────────────────────────────────────────
router.get('/dashboard/stats', getDashboardStats);

// ── RFQ Management ─────────────────────────────────────────────
router.get('/rfqs',                   getRFQs);
router.post('/rfqs',                  upload.array('documents', 10), createRFQ);
router.get('/rfqs/:id/quotes',        getRFQQuotes);
router.get('/rfqs/:id/documents',     getRFQDocuments);
router.post('/rfqs/quotes/:id/accept', acceptQuote);
router.post('/rfqs/quotes/:id/reject', rejectQuote);

// ── Orders ─────────────────────────────────────────────────────
router.get('/orders',                   getOrders);
router.get('/orders/:id',               getOrderDetails);
router.post('/orders/:id/messages',     sendOrderMessage);

// ── Suppliers ──────────────────────────────────────────────────
router.get('/suppliers', getSuppliers);

// ── Profile ────────────────────────────────────────────────────
router.get('/profile',  getProfile);
router.put('/profile',  updateProfile);

// ==================== DOCUMENT MANAGEMENT ROUTES ====================
// Get all documents
router.get('/documents', async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT d.*, r.rfq_number, po.po_number
            FROM documents d
            LEFT JOIN rfqs r ON d.rfq_id = r.id
            LEFT JOIN purchase_orders po ON d.po_id = po.id
            WHERE d.user_id = $1
            ORDER BY d.created_at DESC
        `, [userId]);
        res.json({ documents: result.rows });
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to load documents' });
    }
});

// Get single document
router.get('/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT d.*, r.rfq_number, po.po_number
            FROM documents d
            LEFT JOIN rfqs r ON d.rfq_id = r.id
            LEFT JOIN purchase_orders po ON d.po_id = po.id
            WHERE d.id = $1 AND d.user_id = $2
        `, [id, userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({ error: 'Failed to get document' });
    }
});

// Upload document
router.post('/documents/upload', upload.single('document'), async (req, res) => {
    try {
        const userId = req.user.userId;
        const { category, description, rfqId, poId } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const result = await pool.query(`
            INSERT INTO documents (user_id, rfq_id, po_id, file_name, file_path, file_size, file_type, category, description, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING id, file_name, file_size, file_type, category, description, created_at
        `, [userId, rfqId || null, poId || null, req.file.originalname, req.file.path, req.file.size, req.file.mimetype, category || 'RFQ Documents', description || null]);
        
        res.json({ success: true, document: result.rows[0] });
    } catch (error) {
        console.error('Upload document error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete document
router.delete('/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        
        const result = await pool.query(
            `DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download document
router.get('/documents/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        
        const result = await pool.query(
            `SELECT * FROM documents WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        // Increment download count
        await pool.query(
            `UPDATE documents SET download_count = download_count + 1 WHERE id = $1`,
            [id]
        );
        
        const doc = result.rows[0];
        res.download(doc.file_path, doc.file_name);
    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
