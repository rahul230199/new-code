const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');

const { authenticateToken, checkRole } = require('../middleware/auth');
const {
    getDashboardStats,
    createRFQ,
    getRFQs,
    getRFQQuotes,
    getRFQDocuments,
    acceptQuote,
    rejectQuote,
    getOrders,
    getOrderDetails,
    sendOrderMessage,
    getSuppliers,
    getProfile,
    updateProfile,
    savePODraft,
    sendPOToSupplier,
    uploadOrderDocument,
    getDocumentVersions,
    replaceDocumentVersion,
    // NEW IMPORTS - Add these
    getPOStatus,
    addOEMSignature,
    acceptRevisionRequest,
    rejectRevisionRequest,
    counterRevisionRequest,
    getOrderTimeline,
    exportAuditTrail,
    resendPONotification,
} = require('../controllers/oemController');

const JWT_SECRET = process.env.JWT_SECRET || 'axo_secret_key_2024';

function extractUserId(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return decoded.userId;
        } catch (err) {}
    }
    
    if (req.query.token) {
        try {
            const decoded = jwt.verify(req.query.token, JWT_SECRET);
            return decoded.userId;
        } catch (err) {}
    }
    return null;
}

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ==================== DOWNLOAD ROUTE (BEFORE AUTH) ====================
router.get('/documents/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = extractUserId(req);
        
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const result = await pool.query(
            `SELECT * FROM documents WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const doc = result.rows[0];
        
        // Try multiple possible paths
        const possiblePaths = [
            doc.file_path,
            path.join('/home/ec2-user/axo/axo_backend/uploads', path.basename(doc.file_path)),
            path.join('/home/ec2-user/axo/axo_backend/uploads/rfq_files', path.basename(doc.file_path)),
            path.join('/home/ec2-user/axo/axo_backend/uploads/po_files', path.basename(doc.file_path)),
        ];
        
        let actualPath = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                actualPath = testPath;
                break;
            }
        }
        
        if (!actualPath) {
            return res.status(404).json({ error: 'File not found on server' });
        }
        
        // Update database with correct path if different
        if (actualPath !== doc.file_path) {
            await pool.query(`UPDATE documents SET file_path = $1 WHERE id = $2`, [actualPath, id]);
        }
        
        await pool.query(`UPDATE documents SET download_count = download_count + 1 WHERE id = $1`, [id]);
        
        // Set proper headers for browser download
        const fileName = encodeURIComponent(doc.file_name);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`);
        res.setHeader('Content-Type', doc.file_type || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        
        // Send file
        res.sendFile(actualPath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error sending file' });
                }
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== AUTH MIDDLEWARE ====================
router.use(authenticateToken);
router.use(checkRole(['oem', 'both', 'admin']));

// Dashboard
router.get('/dashboard/stats', getDashboardStats);

// RFQ Management
router.get('/rfqs', getRFQs);
router.post('/rfqs', upload.array('documents', 10), createRFQ);
router.get('/rfqs/:id/quotes', getRFQQuotes);
router.get('/rfqs/:id/documents', getRFQDocuments);
router.post('/rfqs/quotes/:id/accept', acceptQuote);
router.post('/rfqs/quotes/:id/reject', rejectQuote);

// Orders
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderDetails);
router.post('/orders/:id/messages', sendOrderMessage);

// Suppliers
router.get('/suppliers', getSuppliers);

// Profile
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
// ==================== ADD THESE ROUTES TO oemRoutes.js ====================

// ==================== PO WORKFLOW ROUTES ====================

// PO Status & Polling
router.get('/purchase-orders/:poId/status', getPOStatus);

// PO Draft (PRD Step 3)
router.post('/purchase-orders/draft', savePODraft);

// Send PO (PRD Step 4)
router.post('/purchase-orders/send/:poId', sendPOToSupplier);
router.post('/purchase-orders/resend/:poId', resendPONotification);

// OEM Signature (PRD Step 6)
router.post('/purchase-orders/:poId/sign', addOEMSignature);

// Revision Workflow (PRD Page 5)
router.post('/purchase-orders/:poId/revision/accept', acceptRevisionRequest);
router.post('/purchase-orders/:poId/revision/reject', rejectRevisionRequest);
router.post('/purchase-orders/:poId/revision/counter', counterRevisionRequest);

// ==================== ORDER TIMELINE & AUDIT ROUTES (PRD Pages 6-7) ====================
router.get('/orders/:orderId/timeline', getOrderTimeline);
router.get('/orders/:orderId/audit-trail/export', exportAuditTrail);

// Document Management
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
        if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({ error: 'Failed to get document' });
    }
});

router.post('/documents/upload', upload.single('document'), async (req, res) => {
    try {
        const userId = req.user.userId;
        const { category, description, rfqId, poId } = req.body;
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const result = await pool.query(`
            INSERT INTO documents (user_id, rfq_id, po_id, file_name, file_path, file_size, file_type, category, description, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING id, file_name, file_size, file_type, category, description, created_at
        `, [userId, rfqId || null, poId || null, req.file.originalname, req.file.path, req.file.size, req.file.mimetype, category || 'RFQ Documents', description || null]);
        
        res.json({ success: true, document: result.rows[0] });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const result = await pool.query(`DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
