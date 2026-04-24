/* =========================================================
   AXO NETWORKS — BACKEND SERVER (ENTERPRISE HARDENED)
========================================================= */

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const setupSwagger = require("./src/config/swagger");
const http = require("http");
const { Server } = require("socket.io");

/* =========================================================
   LOAD ENV BASED ON NODE_ENV
========================================================= */

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.local";

require("dotenv").config({
  path: path.resolve(__dirname, envFile),
});

console.log("🌍 Environment:", process.env.NODE_ENV || "local");
console.log("📄 Using ENV file:", envFile);


/* =========================================================
   IMPORT DATABASE
========================================================= */

const pool = require("./src/config/db");

/* =========================================================
   IMPORT ROUTES
========================================================= */

const authRoutes = require("./src/modules/auth/auth.routes");
const networkRoutes = require("./src/modules/network/network.routes");
const adminRoutes = require("./src/modules/admin/admin.routes");
const buyerRoutes = require("./src/modules/buyer/buyer.routes");
const supplierRoutes = require("./src/modules/supplier/supplier.routes");
const poThreadRoutes = require("./src/modules/poThread/poThread.routes");
const riskRoutes = require("./src/modules/risk/risk.routes");
const analyticsRoutes = require("./src/modules/analytics/analytics.routes");
const capacityRoutes = require("./src/modules/capacity/capacity.routes");
const exportRoutes = require("./src/modules/export/export.routes");


const {
  globalLimiter,
} = require("./src/middlewares/rateLimit.middleware");

/* =========================================================
   IMPORT GLOBAL ERROR MIDDLEWARE
========================================================= */

const errorMiddleware = require("./src/middlewares/error.middleware");

/* =========================================================
   APP INITIALIZATION
========================================================= */

const app = express();
const PORT = process.env.PORT || 5000;

/* =========================================================
   TRUST PROXY (FOR NGINX / LOAD BALANCER)
========================================================= */

app.set("trust proxy", 1);

/* =========================================================
   GLOBAL SECURITY MIDDLEWARE
========================================================= */

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: false, // allow frontend modules
  })
);

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGIN
        : "*",
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   STATIC FRONTEND (MUST COME BEFORE API & FALLBACK)
========================================================= */

const frontendPath = path.join(__dirname, "../axo_frontend");

app.use(
  express.static(frontendPath, {
    extensions: ["html"],
  })
);

/* =========================================================
   FRONTEND CLEAN ROUTES
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(frontendPath, "login.html"));
});

app.get("/change-password", (req, res) => {
  res.sendFile(path.join(frontendPath, "change-password.html"));
});

app.get("/admin-dashboard", (req, res) => {
  res.sendFile(path.join(frontendPath, "admin-dashboard.html"));
});

app.get("/buyer-dashboard", (req, res) => {
  res.sendFile(path.join(frontendPath, "buyer-dashboard.html"));
});

app.get("/supplier-dashboard", (req, res) => {
  res.sendFile(path.join(frontendPath, "supplier-dashboard.html"));
});

/* =========================================================
   API ROUTES
========================================================= */

app.use("/api", globalLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/network", networkRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/buyer", buyerRoutes);
app.use("/api/supplier", supplierRoutes);
app.use("/api/po-thread", poThreadRoutes);
app.use("/api/risk", riskRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/capacity", capacityRoutes);
app.use("/api/export", exportRoutes);

/* =========================================================
   SWAGGER DOCUMENTATION (DEV ONLY)
========================================================= */

if (process.env.NODE_ENV !== "production") {
  setupSwagger(app);
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      success: true,
      environment: process.env.NODE_ENV || "local",
      database: process.env.DB_NAME,
      serverTime: result.rows[0].now,
    });
  } catch (err) {
    console.error("Health check error:", err.message);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

/* =========================================================
   API 404 HANDLER
========================================================= */

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

/* =========================================================
   SAFE SPA FALLBACK (FINAL CORRECT VERSION)
========================================================= */

app.use((req, res, next) => {

  // Allow API
  if (req.path.startsWith("/api")) {
    return next();
  }

  // Allow ALL static files first
  if (req.path.includes(".")) {
    return next();
  }

  // Buyer SPA routes ONLY (real pages)
  if (req.path.startsWith("/buyer")) {
    return res.sendFile(
      path.join(frontendPath, "buyer-dashboard.html")
    );
  }

  // Admin SPA
  if (req.path.startsWith("/admin")) {
    return res.sendFile(
      path.join(frontendPath, "admin-dashboard.html")
    );
  }

  // Supplier SPA
  if (req.path.startsWith("/supplier")) {
    return res.sendFile(
      path.join(frontendPath, "supplier-dashboard.html")
    );
  }

  // Default
  return res.sendFile(
    path.join(frontendPath, "login.html")
  );
});
/* =========================================================
   GLOBAL ERROR HANDLER (MUST BE LAST)
========================================================= */

app.use(errorMiddleware);


const cron = require("node-cron");
const { recalculateAllSupplierReliability } =
  require("./src/modules/reliability/reliability.cron");

cron.schedule("0 2 * * *", async () => {
  await recalculateAllSupplierReliability();
});



/* =========================================================
   CREATE HTTP SERVER FOR SOCKET.IO
========================================================= */

const server = http.createServer(app);

/* =========================================================
   SOCKET.IO INITIALIZATION
========================================================= */

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

global.io = io;

io.on("connection", (socket) => {

  console.log("🔌 User connected:", socket.id);

  /* =========================================
     JOIN PO ROOM
  ========================================= */

  socket.on("join_po_room", (poId) => {

    if (!poId) return;

    const room = `po_${poId}`;

    socket.join(room);

    console.log(`📡 Socket joined room: ${room}`);
  });

  /* =========================================
   TYPING INDICATOR RELAY
========================================= */

socket.on("typing", (data) => {

  if (!data?.po_id) return;

  const room = `po_${data.po_id}`;

  socket.to(room).emit("typing", {
    po_id: data.po_id,
    role: data.role || "user"
  });

});

  /* =========================================
     DISCONNECT
  ========================================= */

  socket.on("disconnect", () => {
    console.log("🔌 User disconnected:", socket.id);
  });

});

/* =========================================================
   START SERVER
========================================================= */

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("💤 Process terminated safely.");
    process.exit(0);
  });
});

process.on("uncaughtException", (err) => {
  console.error("❌ UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ UNHANDLED REJECTION:", err);
  server.close(() => {
    process.exit(1);
  });
});