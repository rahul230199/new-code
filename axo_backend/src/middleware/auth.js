const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'axo_secret_key_2024';


// =====================================================
// 🔐 AUTHENTICATE TOKEN (PRODUCTION READY)
// =====================================================
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];

        // 1️⃣ Check header exists
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header missing' });
        }

        // 2️⃣ Validate Bearer format
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ error: 'Invalid token format' });
        }

        const token = parts[1];

        // 3️⃣ Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            return res.status(403).json({ error: 'Invalid token' });
        }

        // 4️⃣ Fetch user from DB (IMPORTANT SECURITY STEP)
        const result = await pool.query(
            'SELECT id, email, role, status FROM users WHERE id = $1',
            [decoded.userId]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // 5️⃣ Check user status
        if (user.status !== 'active') {
            return res.status(403).json({ error: 'User account is inactive' });
        }

        // 6️⃣ Attach user to request
        req.user = {
            userId: user.id,
            email: user.email,
            role: user.role
        };

        next();

    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};


// =====================================================
// 🔐 ROLE-BASED ACCESS CONTROL
// =====================================================
const checkRole = (roles) => {
    return (req, res, next) => {
        try {
            // 1️⃣ Ensure user exists
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // 2️⃣ Normalize roles (string or array)
            const allowedRoles = Array.isArray(roles) ? roles : [roles];

            // 3️⃣ Check role
            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({
                    error: 'Access denied',
                    required: allowedRoles,
                    current: req.user.role
                });
            }

            next();

        } catch (error) {
            console.error('Role check error:', error);
            res.status(500).json({ error: 'Authorization failed' });
        }
    };
};


module.exports = { authenticateToken, checkRole };