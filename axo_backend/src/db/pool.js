const { Pool } = require('pg');
const logger = require('../utils/logger');

class DatabasePool {
  constructor() {
    this.pool = null;
  }

  async initialize() {
    try {
      this.pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
      });

      // Test connection
      await this.pool.query('SELECT NOW()');
      logger.info('PostgreSQL database connected successfully');

      // Handle pool errors
      this.pool.on('error', (err) => {
        logger.error('Unexpected database pool error:', err);
      });

      return this.pool;
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      if (duration > 100) {
        logger.warn(`Slow query (${duration}ms):`, { text, params });
      }
      
      return result;
    } catch (error) {
      logger.error('Database query error:', { text, params, error: error.message });
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async disconnect() {
    await this.pool.end();
    logger.info('Database disconnected');
  }

  getPool() {
    if (!this.pool) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.pool;
  }
}

module.exports = new DatabasePool();
