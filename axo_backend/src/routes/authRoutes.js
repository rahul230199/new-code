const express = require('express');
const router = express.Router();
const { login, changePassword, getMe } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Public routes
router.post('/login', login);

// Protected routes (require authentication)
router.post('/change-password', authenticateToken, changePassword);
router.get('/me', authenticateToken, getMe);

module.exports = router;
