/* =========================================================
   AXO NETWORKS — AUTH CONTROLLER
========================================================= */

const db = require("../../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      role: user.user_role,
      organization_id: user.organization_id
    },
    process.env.JWT_SECRET || 'axo_secret_key',
    {
      expiresIn: '7d',
      issuer: 'axo-networks',
      audience: 'axo-users'
    }
  );
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required"
      });
    }

    const result = await db.query(
      `
      SELECT id, email, password_hash, user_role, is_active,
             must_change_password, organization_id
      FROM users
      WHERE email = $1
      `,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive"
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const accessToken = generateToken(user);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.user_role,
          organization_id: user.organization_id,
          must_change_password: user.must_change_password || false
        }
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userId = req.user.id;
    
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters"
      });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const result = await db.query(
      `UPDATE users 
       SET password_hash = $1, 
           must_change_password = false,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [hashedPassword, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Password changed successfully. Please login again."
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password"
    });
  }
};

// Logout
exports.logout = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully"
  });
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT id, email, user_role, is_active, must_change_password, organization_id
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    const user = result.rows[0];
    
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.user_role,
        is_active: user.is_active,
        must_change_password: user.must_change_password || false,
        organization_id: user.organization_id
      }
    });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user info"
    });
  }
};
