const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const {
    uploadDocument,
    getDocuments,
    getDocument,
    downloadDocument,
    deleteDocument
} = require('../controllers/documentController');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '/home/ec2-user/axo/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticateToken);

router.get('/', getDocuments);
router.get('/:id', getDocument);
router.post('/upload', upload.single('document'), uploadDocument);
router.get('/:id/download', downloadDocument);
router.delete('/:id', deleteDocument);

module.exports = router;
