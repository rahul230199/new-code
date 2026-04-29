const pool = require('../config/database');
const fs   = require('fs');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

// Ensure upload directory exists at startup
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ==================== GET ALL DOCUMENTS ====================
// OEM  → all their own documents (grouped with RFQ name)
// Supplier → public docs from RFQs they've quoted on
const getDocuments = async (req, res) => {
    try {
        const userId   = req.user.userId;
        const userRole = req.user.role;

        let query, params = [userId];

        if (userRole === 'oem' || userRole === 'both' || userRole === 'admin') {
            query = `
                SELECT d.id, d.rfq_id, d.file_name, d.file_size, d.file_type,
                       d.category, d.description, d.is_public, d.download_count, d.created_at,
                       r.title  AS rfq_title,
                       r.rfq_number
                FROM documents d
                LEFT JOIN rfqs r ON d.rfq_id = r.id
                WHERE d.user_id = $1
                ORDER BY d.created_at DESC
            `;
        } else if (userRole === 'supplier') {
            query = `
                SELECT DISTINCT
                    d.id, d.rfq_id, d.file_name, d.file_size, d.file_type,
                    d.category, d.description, d.created_at,
                    r.title AS rfq_title,
                    r.rfq_number
                FROM documents d
                JOIN rfqs r ON d.rfq_id = r.id
                JOIN quotes q ON q.rfq_id = r.id
                WHERE q.supplier_id = $1 AND d.is_public = TRUE
                ORDER BY d.created_at DESC
            `;
        } else {
            query  = `SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC`;
        }

        const result = await pool.query(query, params);
        res.json({ documents: result.rows });
    } catch (error) {
        console.error('Get documents error:', error);
        res.json({ documents: [] });
    }
};

// ==================== GET SINGLE DOCUMENT ====================
const getDocument = async (req, res) => {
    try {
        const userId   = req.user.userId;
        const userRole = req.user.role;
        const docId    = req.params.id;

        const docResult = await pool.query(`
            SELECT d.*, r.title AS rfq_title, r.rfq_number
            FROM documents d
            LEFT JOIN rfqs r ON d.rfq_id = r.id
            WHERE d.id = $1
        `, [docId]);

        if (!docResult.rows.length) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const document = docResult.rows[0];
        let hasAccess  = false;
        let canDownload = false;

        if (userRole === 'admin') {
            hasAccess   = true;
            canDownload = true;
        } else if (userRole === 'oem' || userRole === 'both') {
            hasAccess   = document.user_id === userId;
            canDownload = hasAccess;
        } else if (userRole === 'supplier') {
            const quoteCheck = await pool.query(
                'SELECT 1 FROM quotes WHERE rfq_id=$1 AND supplier_id=$2',
                [document.rfq_id, userId]
            );
            hasAccess   = quoteCheck.rows.length > 0 && document.is_public;
            canDownload = false; // suppliers view only
        }

        if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

        // Strip file_path for suppliers
        if (userRole === 'supplier') {
            const { file_path, ...safeDoc } = document;
            return res.json({ document: { ...safeDoc, can_download: false } });
        }

        res.json({ document: { ...document, can_download: canDownload } });
    } catch (error) {
        console.error('Get document error:', error);
       res.status(500).json({
    message: "Something went wrong. Please try again."
});
    }
};

// ==================== DOWNLOAD DOCUMENT ====================
const downloadDocument = async (req, res) => {
    try {
        const userId   = req.user.userId;
        const userRole = req.user.role;
        const docId    = req.params.id;

        if (userRole === 'supplier') {
            return res.status(403).json({ error: 'Download access denied for suppliers' });
        }

        const clause = userRole === 'admin'
            ? 'WHERE id=$1'
            : 'WHERE id=$1 AND user_id=$2';
        const params = userRole === 'admin' ? [docId] : [docId, userId];

        const docResult = await pool.query(`SELECT * FROM documents ${clause}`, params);

        if (!docResult.rows.length) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const document = docResult.rows[0];

        await pool.query(
            'UPDATE documents SET download_count = download_count + 1 WHERE id=$1',
            [docId]
        );

        if (fs.existsSync(document.file_path)) {
            return res.download(document.file_path, document.file_name);
        }
        res.status(404).json({ error: 'File not found on disk' });
    } catch (error) {
        console.error('Download document error:', error);
       res.status(500).json({
    message: "Something went wrong. Please try again."
});
    }
};

// ==================== UPLOAD DOCUMENT ====================
const uploadDocument = async (req, res) => {
    try {
        const userId   = req.user.userId;
        const userRole = req.user.role;

        if (userRole === 'supplier') {
            return res.status(403).json({ error: 'Upload access denied for suppliers' });
        }

        const { rfqId, category, description } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        // Build a unique file name and move to permanent location
        const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
        const filePath   = path.join(UPLOAD_DIR, uniqueName);
   if (file.path !== filePath) {
    fs.renameSync(file.path, filePath);
}

        // Validate rfqId belongs to this user
        let verifiedRfqId = null;
        if (rfqId) {
            const rfqCheck = await pool.query(
                'SELECT id FROM rfqs WHERE id=$1 AND oem_id=$2',
                [rfqId, userId]
            );
            if (rfqCheck.rows.length) verifiedRfqId = rfqId;
        }

        const result = await pool.query(`
            INSERT INTO documents
                (user_id, rfq_id, file_name, file_path, file_size, file_type,
                 category, description, is_public, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,NOW())
            RETURNING *
        `, [
            userId,
            verifiedRfqId || null,
            file.originalname,
            filePath,
            file.size,
            file.mimetype,
            category    || 'RFQ Documents',
            description || '',
        ]);

        // Fetch with rfq_title for the response
        const fullDoc = await pool.query(`
            SELECT d.*, r.title AS rfq_title, r.rfq_number
            FROM documents d
            LEFT JOIN rfqs r ON d.rfq_id = r.id
            WHERE d.id = $1
        `, [result.rows[0].id]);

        res.json({ success: true, document: fullDoc.rows[0] });
    } catch (error) {
        console.error('Upload document error:', error);
       res.status(500).json({
    message: "Something went wrong. Please try again."
});
    }
};

// ==================== DELETE DOCUMENT ====================
const deleteDocument = async (req, res) => {
    try {
        const userId   = req.user.userId;
        const userRole = req.user.role;
        const docId    = req.params.id;

        if (userRole === 'supplier') {
            return res.status(403).json({ error: 'Delete access denied for suppliers' });
        }

        const clause = userRole === 'admin'
            ? 'WHERE id=$1'
            : 'WHERE id=$1 AND user_id=$2';
        const params = userRole === 'admin' ? [docId] : [docId, userId];

        const docResult = await pool.query(`SELECT * FROM documents ${clause}`, params);

        if (!docResult.rows.length) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const document = docResult.rows[0];

        // Remove physical file
        if (document.file_path && fs.existsSync(document.file_path)) {
            fs.unlinkSync(document.file_path);
        }

        await pool.query('DELETE FROM documents WHERE id=$1', [docId]);
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('Delete document error:', error);
       res.status(500).json({
    message: "Something went wrong. Please try again."
});
    }
};

module.exports = {
    getDocuments,
    getDocument,
    downloadDocument,
    uploadDocument,
    deleteDocument,
};