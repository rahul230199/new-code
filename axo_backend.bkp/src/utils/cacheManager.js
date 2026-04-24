/* =========================================================
   AXO NETWORKS — CACHE LAYER (AUTO FALLBACK SAFE MODE)
========================================================= */

let redis = null;

try {
  const Redis = require("ioredis");

  redis = new Redis({
    host: "127.0.0.1",
    port: 6379,
    maxRetriesPerRequest: null,
    retryStrategy: () => null, // stop retry loop completely
    enableReadyCheck: false,
    lazyConnect: true
  });

  redis.on("error", () => {
    console.warn("⚠ Redis unavailable. Falling back to memory cache.");
  });

  redis.connect().catch(() => {
    console.warn("⚠ Redis connection failed. Using memory cache.");
  });

} catch (err) {
  console.warn("⚠ Redis module not found. Using memory cache.");
}

/* =========================================================
   MEMORY FALLBACK (NON-PERSISTENT DEV CACHE)
========================================================= */

const memoryStore = new Map();

const cache = {
  async get(key) {
    if (redis && redis.status === "ready") {
      return redis.get(key);
    }
    return memoryStore.get(key) || null;
  },

  async set(key, value, ttlSeconds) {
    if (redis && redis.status === "ready") {
      if (ttlSeconds) {
        return redis.set(key, value, "EX", ttlSeconds);
      }
      return redis.set(key, value);
    }

    memoryStore.set(key, value);

    if (ttlSeconds) {
      setTimeout(() => memoryStore.delete(key), ttlSeconds * 1000);
    }

    return true;
  },

  async del(key) {
    if (redis && redis.status === "ready") {
      return redis.del(key);
    }
    memoryStore.delete(key);
    return true;
  }
};

module.exports = cache;