const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'production'}` });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Import routes
const authRoutes = require('./modules/auth/auth.routes');
const networkRoutes = require('./modules/network/network.routes');
const buyerRoutes = require('./modules/buyer/buyer.routes');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/buyer', buyerRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'production'} mode`);
});

module.exports = app;
