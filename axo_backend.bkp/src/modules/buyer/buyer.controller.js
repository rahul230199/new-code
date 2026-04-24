/* ============================================
   AXO NETWORKS - BUYER CONTROLLER
============================================ */

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        total_orders: 24,
        total_spend: 45890,
        active_suppliers: 12,
        total_rfqs: 8
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get recent orders
exports.getRecentOrders = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: [
        { id: 1, order_number: "ORD-001", supplier_name: "Tech Supplies Inc", amount: 12500, status: "completed", created_at: "2026-04-01" },
        { id: 2, order_number: "ORD-002", supplier_name: "Global Parts Ltd", amount: 8900, status: "processing", created_at: "2026-04-03" },
        { id: 3, order_number: "ORD-003", supplier_name: "Quality Components", amount: 3400, status: "shipped", created_at: "2026-04-05" }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all orders
exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const mockOrders = [
      { id: 1, order_number: "ORD-001", supplier_name: "Tech Supplies Inc", amount: 12500, status: "completed", created_at: "2026-04-01" },
      { id: 2, order_number: "ORD-002", supplier_name: "Global Parts Ltd", amount: 8900, status: "processing", created_at: "2026-04-03" },
      { id: 3, order_number: "ORD-003", supplier_name: "Quality Components", amount: 3400, status: "shipped", created_at: "2026-04-05" }
    ];
    res.status(200).json({
      success: true,
      data: mockOrders,
      pagination: { page, limit, total: mockOrders.length, totalPages: 1 }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get recent RFQs
exports.getRecentRfqs = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: [
        { id: 1, rfq_number: "RFQ-001", product_name: "Electronic Components", budget: 25000, status: "open", responses_count: 3, deadline: "2026-04-20", created_at: "2026-04-01" },
        { id: 2, rfq_number: "RFQ-002", product_name: "Raw Materials", budget: 15000, status: "open", responses_count: 2, deadline: "2026-04-25", created_at: "2026-04-02" }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all RFQs
exports.getRfqs = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: [
        { id: 1, rfq_number: "RFQ-001", product_name: "Electronic Components", budget: 25000, description: "Need components", status: "open", responses_count: 3, deadline: "2026-04-20", created_at: "2026-04-01" },
        { id: 2, rfq_number: "RFQ-002", product_name: "Raw Materials", budget: 15000, description: "Need materials", status: "open", responses_count: 2, deadline: "2026-04-25", created_at: "2026-04-02" }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get financial metrics
exports.getFinancialMetrics = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        default_probability: 15,
        risk_adjusted_return: 12.5,
        credit_utilization: 45,
        payment_history: 92
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get notifications
exports.getNotifications = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: []
    });
  } catch (error) {
    res.status(200).json({ success: true, data: [] });
  }
};
