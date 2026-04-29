const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');

const {
    uploadDocument,
    getDocuments,
    getDocument,
    downloadDocument,
    deleteDocument
} = require('../controllers/documentController');

// ✅ FIXED STORAGE PATH
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../../uploads'));
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(authenticateToken);

// ROUTES
router.get('/', getDocuments);

// ✅ FIXED ORDER
router.get('/:id/download', downloadDocument);
router.get('/:id', getDocument);

router.post('/upload', upload.single('document'), uploadDocument);

router.delete('/:id', deleteDocument);

module.exports = router;