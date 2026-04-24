const express = require('express');
const router = express.Router();
const buyerController = require('./buyer.controller');

// Simple auth middleware
router.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'axo_secret_key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
});

// Routes
router.get('/dashboard/stats', buyerController.getDashboardStats);
router.get('/financial/metrics', buyerController.getFinancialMetrics);
router.get('/notifications', buyerController.getNotifications);
router.get('/orders/recent', buyerController.getRecentOrders);
router.get('/orders', buyerController.getOrders);
router.get('/rfqs/recent', buyerController.getRecentRfqs);
router.get('/rfqs', buyerController.getRfqs);

module.exports = router;
