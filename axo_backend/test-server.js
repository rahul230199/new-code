const express = require('express');
const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running!' });
});

app.post('/api/network/access/submit', (req, res) => {
    console.log('Received submission:', req.body);
    res.json({ 
        success: true, 
        message: 'Application submitted successfully',
        data: req.body
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    res.json({
        success: true,
        token: 'test-token-123',
        user: { email, role: 'admin' }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Test server running on port ${PORT}`);
});

module.exports = app;
