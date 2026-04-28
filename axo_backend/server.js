const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
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
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    // Relax CSP for local dev so fonts / CDN scripts load fine
    contentSecurityPolicy: false,
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
// Must be registered BEFORE the static-file middleware
// so /api/* never falls through to the HTML files
app.use('/api/auth',     authRoutes);
app.use('/api/network',  networkRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/oem',      oemRoutes);
app.use('/api/supplier', supplierRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!', timestamp: new Date().toISOString() });
});

// ==================== STATIC FRONTEND ====================
// Serve axo_frontend from the same Express server.
// Adjust the path below to match your actual folder layout:
//   If server.js is inside  axo_backend/  → use '../axo_frontend'
//   If server.js is at root level         → use './axo_frontend'
const FRONTEND_DIR = path.resolve(__dirname, '../axo_frontend');

app.use(express.static(FRONTEND_DIR, {
    // Tell browser to revalidate HTML every time (no stale pages during dev)
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// ==================== SPA FALLBACK ====================
// Any unmatched GET (that isn't /api/*) returns the login page
// so direct-URL navigation to e.g. /oem-dashboard.html still works
app.get('*', (req, res) => {
    // Don't intercept API 404s — those come from the 404 handler below
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
    }
    // For HTML page requests return login (guard will redirect to right dashboard)
    res.sendFile(path.join(FRONTEND_DIR, 'login.html'));
});

// 404 handler for API routes
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
    console.log(`🌐 Frontend:    http://localhost:${PORT}/login.html`);
    console.log(`📍 API:         http://localhost:${PORT}/api`);
    console.log(`✅ Health:      http://localhost:${PORT}/health`);
});

module.exports = app;