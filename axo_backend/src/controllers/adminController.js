const pool = require('../config/database');

const generateTempPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password + '@123';
};

const getPendingRequests = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM network_access_requests 
            WHERE status = 'pending' 
            ORDER BY created_at DESC
        `);
        res.json({ requests: result.rows });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const getAllRequests = async (req, res) => {
    try {
        const { status, role } = req.query;
        let query = 'SELECT * FROM network_access_requests WHERE 1=1';
        let params = [];
        
        if (status && status !== 'all') {
            query += ` AND status = $${params.length + 1}`;
            params.push(status);
        }
        
        if (role && role !== 'all') {
            query += ` AND role_requested = $${params.length + 1}`;
            params.push(role);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await pool.query(query, params);
        res.json({ requests: result.rows });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 10;

/**
 * =====================================================
 * ✅ APPROVE REQUEST (PRODUCTION READY)
 * =====================================================
 * Flow:
 * 1. Admin approves request
 * 2. System creates user
 * 3. Temporary password generated
 * 4. Password is HASHED (security)
 * 5. User must change password on first login
 */
const approveRequest = async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        const adminId = req.user.userId;

        // 1️⃣ Fetch request
        const requestResult = await client.query(
            'SELECT * FROM network_access_requests WHERE id = $1',
            [id]
        );
        
        if (requestResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Request not found' });
        }

        const request = requestResult.rows[0];

        // 2️⃣ Generate temporary password (only visible once)
        const tempPassword = generateTempPassword();

        // 3️⃣ Hash password (NEVER store plain text)
        const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS);

        // 4️⃣ Create user
        await client.query(`
            INSERT INTO users (
                email,
                company_name,
                role,
                status,
                password,
                is_temp_password,
                city,
                website,
                capabilities,
                custom_capabilities,
                approved_at,
                approved_by,
                created_at
            ) VALUES (
                $1, $2, $3, 'active',
                $4, TRUE,
                $5, $6, $7, $8,
                NOW(), $9,
                NOW()
            )
        `, [
            request.email,
            request.company_name,
            request.role_requested,
            hashedPassword,              
            request.city,
            request.website,
            request.capabilities,
            request.custom_capabilities,
            adminId
        ]);

        // 5️⃣ Mark request as approved
        await client.query(`
            UPDATE network_access_requests
            SET status = 'approved',
                reviewed_by = $1,
                reviewed_at = NOW()
            WHERE id = $2
        `, [adminId, id]);

        await client.query('COMMIT');

        // 6️⃣ Return temp password (send via email in production)
        res.json({
            success: true,
            message: 'User approved successfully',
            tempPassword: tempPassword
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Approve error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

const rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.userId;
        
        await pool.query(`
            UPDATE network_access_requests 
            SET status = 'rejected', rejection_reason = $1, 
                reviewed_by = $2, reviewed_at = NOW()
            WHERE id = $3
        `, [reason, adminId, id]);
        
        res.json({ success: true, message: 'Request rejected' });
    } catch (error) {
        console.error('Reject error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getPendingRequests, getAllRequests, approveRequest, rejectRequest };

// Get stats for admin dashboard
const getStats = async (req, res) => {
    try {
        const pendingResult = await pool.query(
            "SELECT COUNT(*) FROM network_access_requests WHERE status = 'pending'"
        );
        
        const approvedResult = await pool.query(
            "SELECT COUNT(*) FROM network_access_requests WHERE status = 'approved'"
        );
        
        const rejectedResult = await pool.query(
            "SELECT COUNT(*) FROM network_access_requests WHERE status = 'rejected'"
        );
        
        const usersResult = await pool.query(
            "SELECT COUNT(*) FROM users WHERE role != 'admin'"
        );
        
        res.json({
            stats: {
                pending: parseInt(pendingResult.rows[0].count),
                approved: parseInt(approvedResult.rows[0].count),
                rejected: parseInt(rejectedResult.rows[0].count),
                totalUsers: parseInt(usersResult.rows[0].count)
            }
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getPendingRequests, getAllRequests, approveRequest, rejectRequest, getStats };
