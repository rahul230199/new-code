const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'axo_secret_key_2024';
const SALT_ROUNDS = 10;


// =====================================================
// 🔐 GENERATE JWT TOKEN
// =====================================================
const generateToken = (user) => {
    return jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};


// =====================================================
// 🔐 LOGIN (PRODUCTION READY)
// =====================================================
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1️⃣ Get user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 2️⃣ Compare hashed password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 3️⃣ Update last login
        await pool.query(
            'UPDATE users SET last_login_at = NOW() WHERE id = $1',
            [user.id]
        );

        // 4️⃣ Generate token
        const token = generateToken(user);

        // 5️⃣ Role-based redirect
        let redirectUrl = '/dashboard.html';
        if (user.role === 'admin') redirectUrl = '/admin-dashboard.html';
        else if (user.role === 'oem') redirectUrl = '/oem-dashboard.html';
        else if (user.role === 'supplier') redirectUrl = '/supplier-dashboard.html';

        // 6️⃣ Force password change if temp password
        if (user.is_temp_password) {
            return res.json({
                success: true,
                token,
                forcePasswordChange: true, // 🔥 frontend must handle this
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role
                }
            });
        }

        // 7️⃣ Normal login
        res.json({
            success: true,
            token,
            redirectUrl,
            user: {
                id: user.id,
                email: user.email,
                company_name: user.company_name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


// =====================================================
// 🔐 CHANGE PASSWORD (FIRST LOGIN + NORMAL)
// =====================================================
const changePassword = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;

        // 1️⃣ Validate input
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters'
            });
        }

        // 2️⃣ Get user
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 3️⃣ If NOT temp password → validate current password
        if (!user.is_temp_password) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);

            if (!isMatch) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
        }

        // 4️⃣ Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // 5️⃣ Update user
        await pool.query(`
            UPDATE users
            SET password = $1,
                is_temp_password = FALSE,
                password_changed_at = NOW(),
                updated_at = NOW()
            WHERE id = $2
        `, [hashedPassword, userId]);

        res.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: error.message });
    }
};


// =====================================================
// 👤 GET CURRENT USER
// =====================================================
const getMe = async (req, res) => {
    try {
        res.json({ user: req.user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


module.exports = { login, changePassword, getMe };