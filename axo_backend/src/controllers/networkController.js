const pool = require('../config/database');

const checkEmail = async (req, res) => {
    try {
        const { email } = req.body;
        
        const existingInRequests = await pool.query(
            'SELECT id FROM network_access_requests WHERE email = $1',
            [email.toLowerCase()]
        );
        
        const existingInUsers = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        
        const exists = existingInRequests.rows.length > 0 || existingInUsers.rows.length > 0;
        
        res.json({ exists, message: exists ? 'Email already registered' : 'Email available' });
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const submitRequest = async (req, res) => {
    try {
        const { email, companyName, city, website, role, capabilities, customCapabilities } = req.body;
        
        if (!email || !companyName || !city || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const result = await pool.query(`
            INSERT INTO network_access_requests (
                email, company_name, city, website, role_requested,
                capabilities, custom_capabilities, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
            RETURNING id
        `, [email.toLowerCase(), companyName, city, website, role, capabilities, customCapabilities]);
        
        res.status(201).json({ 
            success: true, 
            message: 'Application submitted successfully',
            requestId: result.rows[0].id
        });
    } catch (error) {
        console.error('Submit request error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { checkEmail, submitRequest };
