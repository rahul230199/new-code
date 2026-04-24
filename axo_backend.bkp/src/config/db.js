/* =========================================================
   AXO NETWORKS — DATABASE CONFIG (ENTERPRISE GRADE)
========================================================= */

const { Pool } = require("pg");

/* =========================================================
   ENV VALIDATION (Basic Safety)
========================================================= */

if (!process.env.DB_HOST) {
  console.error("❌ DB_HOST not defined in environment.");
  process.exit(1);
}

/* =========================================================
   POOL CONFIGURATION
========================================================= */

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  database: process.env.DB_NAME,

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  query_timeout: 10000,

  ssl: false, // ✅ disable SSL for EC2 local postgres
});

/* =========================================================
   INITIAL CONNECTION CHECK
========================================================= */

(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ Connected to PostgreSQL:", process.env.DB_NAME);
    client.release();
  } catch (err) {
    console.error("❌ DB Connection Failed:", err.message);
    process.exit(1);
  }
})();

/* =========================================================
   POOL ERROR HANDLER (VERY IMPORTANT)
========================================================= */

pool.on("error", (err) => {
  console.error("❌ Unexpected PostgreSQL pool error:", err);
  process.exit(1); // Crash — PM2 should restart
});

/* =========================================================
   GRACEFUL SHUTDOWN SUPPORT
========================================================= */

process.on("SIGINT", async () => {
  console.log("🛑 Closing DB pool...");
  await pool.end();
  process.exit(0);
});

module.exports = pool;
