const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = '/home/ec2-user/axo/uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Get documents for user (Buyer sees all, Supplier sees only RFQ documents they quoted on)
const getDocuments = async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;
        
        let query;
        let params = [userId];
        
        if (userRole === 'oem' || userRole === 'both') {
            // OEM sees all their documents
            query = `
                SELECT d.*, r.title as rfq_title
                FROM documents d
                LEFT JOIN rfqs r ON d.rfq_id = r.id
                WHERE d.user_id = $1
                ORDER BY d.created_at DESC
            `;
        } else if (userRole === 'supplier') {
            // Supplier sees documents from RFQs they have quoted on
            query = `
                SELECT DISTINCT d.id, d.file_name, d.file_size, d.file_type, d.category, d.description, 
                       d.created_at, r.title as rfq_title, r.id as rfq_id
                FROM documents d
                JOIN rfqs r ON d.rfq_id = r.id
                JOIN quotes q ON q.rfq_id = r.id
                WHERE q.supplier_id = $1 AND d.is_public = true
                ORDER BY d.created_at DESC
            `;
        } else {
            query = `SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC`;
        }
        
        const result = await pool.query(query, params);
        res.json({ documents: result.rows });
    } catch (error) {
        console.error('Get documents error:', error);
        res.json({ documents: [] });
    }
};

// Get single document (view only for suppliers, download for owners)
const getDocument = async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;
        const docId = req.params.id;
        
        const docResult = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
        
        if (docResult.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const document = docResult.rows[0];
        let hasAccess = false;
        let canDownload = false;
        
        if (userRole === 'oem' || userRole === 'both') {
            // Owner has full access
            hasAccess = document.user_id === userId;
            canDownload = true;
        } else if (userRole === 'supplier') {
            // Supplier can view if they have quoted on the RFQ
            const quoteCheck = await pool.query(`
                SELECT 1 FROM quotes q
                WHERE q.rfq_id = $1 AND q.supplier_id = $2
            `, [document.rfq_id, userId]);
            hasAccess = quoteCheck.rows.length > 0 && document.is_public === true;
            canDownload = false; // Suppliers cannot download
        }
        
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // For suppliers, return only metadata (no file path)
        if (userRole === 'supplier') {
            return res.json({
                document: {
                    id: document.id,
                    file_name: document.file_name,
                    file_size: document.file_size,
                    file_type: document.file_type,
                    category: document.category,
                    description: document.description,
                    rfq_title: document.rfq_title,
                    created_at: document.created_at,
                    can_download: false
                }
            });
        }
        
        // For owner, return full info including file path for download
        res.json({ 
            document: {
                ...document,
                can_download: true
            }
        });
    } catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Download document (only for owner)
const downloadDocument = async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;
        const docId = req.params.id;
        
        // Only OEM/Both can download
        if (userRole !== 'oem' && userRole !== 'both') {
            return res.status(403).json({ error: 'Download access denied' });
        }
        
        const docResult = await pool.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [docId, userId]);
        
        if (docResult.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const document = docResult.rows[0];
        
        // Update download count
        await pool.query('UPDATE documents SET download_count = download_count + 1 WHERE id = $1', [docId]);
        
        if (fs.existsSync(document.file_path)) {
            res.download(document.file_path, document.file_name);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Upload document (only for OEM)
const uploadDocument = async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;
        
        // Only OEM/Both can upload
        if (userRole !== 'oem' && userRole !== 'both') {
            return res.status(403).json({ error: 'Upload access denied' });
        }
        
        const { rfqId, category, description } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const uniqueFileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
        const filePath = path.join(UPLOAD_DIR, uniqueFileName);
        
        // Move file
        fs.renameSync(file.path, filePath);
        
        const result = await pool.query(`
            INSERT INTO documents (user_id, rfq_id, file_name, file_path, file_size, file_type, category, description, is_public, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
            RETURNING *
        `, [userId, rfqId || null, file.originalname, filePath, file.size, file.mimetype, category || 'RFQ Documents', description || '']);
        
        res.json({ success: true, document: result.rows[0] });
    } catch (error) {
        console.error('Upload document error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete document (only for owner)
const deleteDocument = async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;
        const docId = req.params.id;
        
        // Only OEM/Both can delete
        if (userRole !== 'oem' && userRole !== 'both') {
            return res.status(403).json({ error: 'Delete access denied' });
        }
        
        const docResult = await pool.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [docId, userId]);
        
        if (docResult.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const document = docResult.rows[0];
        
        if (fs.existsSync(document.file_path)) {
            fs.unlinkSync(document.file_path);
        }
        
        await pool.query('DELETE FROM documents WHERE id = $1', [docId]);
        
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getDocuments,
    getDocument,
    downloadDocument,
    uploadDocument,
    deleteDocument
};
