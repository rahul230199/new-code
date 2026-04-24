/* =========================================================
   AXO NETWORKS — NETWORK CONTROLLER (FULL)
========================================================= */

const db = require("../../config/db");
const bcrypt = require("bcrypt");

// Check if email already exists
exports.checkEmailExists = async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log("Checking email:", email);

    const query = 'SELECT id, email, status FROM network_access_requests WHERE email = $1';
    const result = await db.query(query, [email]);

    if (result && result.rows && result.rows.length > 0) {
      return res.status(200).json({
        success: true,
        exists: true,
        message: "This email is already registered. Please use a different email or login."
      });
    }

    return res.status(200).json({
      success: true,
      exists: false,
      message: "Email is available"
    });
  } catch (error) {
    console.error("Error checking email:", error);
    res.status(500).json({
      success: false,
      exists: false,
      message: "Error checking email. Please try again."
    });
  }
};

// Submit network access application
exports.submitNetworkAccess = async (req, res) => {
  try {
    const {
      email,
      companyName,
      city,
      website,
      role,
      capabilities,
      customCapabilities
    } = req.body;

    console.log("Submitting application for:", email);

    const checkQuery = 'SELECT id FROM network_access_requests WHERE email = $1';
    const existing = await db.query(checkQuery, [email]);

    if (existing && existing.rows && existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This email is already registered in our system."
      });
    }

    const capabilitiesStr = Array.isArray(capabilities) ? capabilities.join(", ") : "";
    const customCapabilitiesStr = Array.isArray(customCapabilities) ? customCapabilities.join(", ") : "";
    const fullCapabilities = capabilitiesStr + (customCapabilitiesStr ? ", " + customCapabilitiesStr : "");

    let roleRequested = '';
    if (role === 'oem') roleRequested = 'OEMs';
    else if (role === 'supplier') roleRequested = 'Supplier';
    else if (role === 'both') roleRequested = 'Both';

    const insertQuery = `
      INSERT INTO network_access_requests (
        email, 
        company_name, 
        city_state,
        contact_name,
        what_you_do,
        role_requested,
        status, 
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      RETURNING id
    `;

    const whatYouDo = {
      capabilities: capabilities,
      customCapabilities: customCapabilities,
      primary_product: fullCapabilities
    };

    const result = await db.query(insertQuery, [
      email,
      companyName,
      city,
      website || "Not provided",
      whatYouDo,
      roleRequested
    ]);

    console.log("Application submitted successfully, ID:", result.rows[0].id);

    res.status(201).json({
      success: true,
      message: "Network access application submitted successfully",
      requestId: result.rows[0].id
    });
  } catch (error) {
    console.error("Error submitting network access:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application. Please try again."
    });
  }
};

// Get all applications for admin
exports.getAdminApplicationsList = async (req, res) => {
  try {
    let query = `
      SELECT id, company_name, email, city_state, role_requested, 
             what_you_do, status, created_at, user_created,
             website, phone
      FROM network_access_requests
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query);
    
    res.status(200).json({
      success: true,
      data: {
        requests: result.rows,
        total_records: result.rows.length,
        total_pages: 1,
        current_page: 1
      }
    });
  } catch (error) {
    console.error("Error fetching admin applications:", error);
    res.status(500).json({ success: false, message: "Failed to fetch applications" });
  }
};

// Approve network request - creates company and user account with must_change_password = true
exports.approveNetworkRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const adminId = req.user?.id || 1;
    
    console.log("Approving application ID:", id);
    
    const appQuery = `SELECT * FROM network_access_requests WHERE id = $1`;
    const appResult = await db.query(appQuery, [id]);
    
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }
    
    const application = appResult.rows[0];
    console.log("Application found:", application.email);
    
    // Check if company already exists
    let companyId;
    const companyCheck = await db.query(`SELECT id FROM companies WHERE email = $1`, [application.email]);
    
    if (companyCheck.rows.length === 0) {
      const createCompanyQuery = `
        INSERT INTO companies (
          company_name, 
          email, 
          city, 
          website,
          status,
          network_request_id,
          created_at
        ) VALUES ($1, $2, $3, $4, 'verified', $5, NOW())
        RETURNING id
      `;
      
      const companyResult = await db.query(createCompanyQuery, [
        application.company_name,
        application.email,
        application.city_state,
        application.website || null,
        id
      ]);
      
      companyId = companyResult.rows[0].id;
      console.log("Company created with ID:", companyId);
    } else {
      companyId = companyCheck.rows[0].id;
      console.log("Company already exists with ID:", companyId);
    }
    
    // Check if user already exists
    const userCheck = await db.query(`SELECT id FROM users WHERE email = $1`, [application.email]);
    
    let userId;
    let tempPassword = null;
    
    if (userCheck.rows.length === 0) {
      // Generate temporary password
      tempPassword = Math.random().toString(36).slice(-8) + "Axo@2024";
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      let userRole = 'user';
      const roleReq = application.role_requested?.toLowerCase() || '';
      if (roleReq === 'oems' || roleReq === 'oem') userRole = 'oem';
      else if (roleReq === 'supplier') userRole = 'supplier';
      else if (roleReq === 'both') userRole = 'both';
      
      console.log("Creating user with role:", userRole);
      
      // ✅ IMPORTANT: Set must_change_password = true for ALL new users
      const createUserQuery = `
        INSERT INTO users (
          email, 
          password_hash, 
          user_role, 
          is_active, 
          must_change_password,
          organization_id,
          company_name,
          city,
          username,
          created_at
        ) VALUES ($1, $2, $3, true, true, $4, $5, $6, $7, NOW())
        RETURNING id
      `;
      
      const userResult = await db.query(createUserQuery, [
        application.email,
        hashedPassword,
        userRole,
        companyId,
        application.company_name || '',
        application.city_state || '',
        application.email.split('@')[0]
      ]);
      
      userId = userResult.rows[0].id;
      console.log("User created with ID:", userId, "must_change_password: true");
    } else {
      userId = userCheck.rows[0].id;
      // ✅ Also update existing users to force password change
      await db.query(
        `UPDATE users SET must_change_password = true WHERE id = $1`,
        [userId]
      );
      console.log("User already exists, forced password change for ID:", userId);
    }
    
    // Update application status
    const updateQuery = `
      UPDATE network_access_requests 
      SET status = 'approved', 
          approved_by = $1, 
          approved_at = NOW(),
          user_created = TRUE,
          user_id = $2,
          verification_notes = $3
      WHERE id = $4
      RETURNING id
    `;
    
    await db.query(updateQuery, [adminId, userId, comment || 'Approved by admin', id]);
    
    console.log(`✅ Application ${id} approved. User: ${application.email}, Temp Password: ${tempPassword}`);
    
    res.status(200).json({
      success: true,
      message: "Application approved successfully. User must change password on first login.",
      data: {
        organization_id: companyId,
        user_id: userId,
        temporary_password: tempPassword,
        email: application.email,
        must_change_password: true
      }
    });
  } catch (error) {
    console.error("Error approving application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to approve application: " + error.message 
    });
  }
};

// Reject network request
exports.rejectNetworkRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const adminId = req.user?.id || 1;
    
    const updateQuery = `
      UPDATE network_access_requests 
      SET status = 'rejected', 
          approved_by = $1, 
          approved_at = NOW(),
          verification_notes = $2
      WHERE id = $3
      RETURNING id
    `;
    
    await db.query(updateQuery, [adminId, comment || 'Rejected by admin', id]);
    
    console.log(`❌ Application ${id} rejected`);
    
    res.status(200).json({
      success: true,
      message: "Application rejected successfully"
    });
  } catch (error) {
    console.error("Error rejecting application:", error);
    res.status(500).json({ success: false, message: "Failed to reject application" });
  }
};

// Original submit request
exports.submitRequest = async (req, res) => {
  try {
    const {
      company_name,
      city_state,
      contact_name,
      email,
      phone,
      primary_product,
      key_components,
      manufacturing_locations,
      monthly_capacity,
      role_in_ev,
      why_join_axo
    } = req.body;

    const query = `
      INSERT INTO network_access_requests (
        company_name, city_state, contact_name, email, phone,
        what_you_do, role_requested, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
      RETURNING id
    `;

    const whatYouDo = {
      primary_product: primary_product,
      key_components: key_components,
      manufacturing_locations: manufacturing_locations,
      monthly_capacity: monthly_capacity,
      why_join_axo: why_join_axo
    };

    const result = await db.query(query, [
      company_name, city_state, contact_name, email, phone,
      whatYouDo, role_in_ev
    ]);

    res.status(201).json({
      success: true,
      message: "Network access request submitted successfully",
      requestId: result.rows[0].id
    });
  } catch (error) {
    console.error("Error submitting network request:", error);
    res.status(500).json({ success: false, message: "Failed to submit request" });
  }
};

// Get network suppliers
exports.getNetworkSuppliers = async (req, res) => {
  try {
    const query = `
      SELECT id, company_name, city_state, what_you_do, status
      FROM network_access_requests
      WHERE status = 'approved'
      ORDER BY created_at DESC
    `;
    const result = await db.query(query);
    res.status(200).json({ success: true, suppliers: result.rows || [] });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ success: false, message: "Failed to fetch suppliers" });
  }
};

// Get supplier by ID
exports.getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = `SELECT * FROM network_access_requests WHERE id = $1 AND status = 'approved'`;
    const result = await db.query(query, [id]);
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }
    res.status(200).json({ success: true, supplier: result.rows[0] });
  } catch (error) {
    console.error("Error fetching supplier:", error);
    res.status(500).json({ success: false, message: "Failed to fetch supplier" });
  }
};
