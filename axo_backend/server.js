const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');
const networkRoutes = require('./src/routes/networkRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const oemRoutes = require('./src/routes/oemRoutes');
const supplierRoutes = require('./src/routes/supplierRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// ==================== API ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/oem', oemRoutes);
app.use('/api/supplier', supplierRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API available at: http://localhost:${PORT}/api`);
    console.log(`✅ Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
