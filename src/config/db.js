/**
 * ============================================================================
 * DB.JS — Database Pool & Query Helpers
 * ============================================================================
 * Single-database architecture (Supabase PostgreSQL via pooler)
 *
 * Exports:
 *   getMainPool()      – raw pg Pool reference
 *   query(sql, params) – convenience wrapper with slow-query logging
 *   getClient()        – get a client for transactions (auto-release safe)
 *   closeAllPools()    – graceful shutdown
 *   getPoolStats()     – pool monitoring
 *   testConnectivity() – startup health check with latency + PG version
 * ============================================================================
 */

const { Pool } = require('pg');
const config = require('./env');
const logger = require('./logger');
const { LOG } = require('./constants');

// ============================================================================
// MAIN CONNECTION POOL
// ============================================================================

const mainPool = new Pool({
  connectionString: config.databaseUrl,
  min: config.dbPoolMin,
  max: config.dbPoolMax,
  idleTimeoutMillis: config.dbIdleTimeout,
  connectionTimeoutMillis: config.dbConnectionTimeout,
  statement_timeout: config.dbQueryTimeout,
  // Disable prepared statements — required for Supabase transaction-mode pooler (PgBouncer)
  // Transaction mode rotates server connections per query, so named statements would fail
  allowExitOnIdle: true,
});

// Pool lifecycle logging
mainPool.on('error', (err) => {
  logger.error(`${LOG.DB_ERROR} Unexpected pool error`, {
    error: err.message,
    code: err.code,
  });
});

mainPool.on('connect', () => {
  logger.debug(`${LOG.DB_QUERY} New connection established`);
});

mainPool.on('remove', () => {
  logger.debug(`${LOG.DB_QUERY} Connection removed from pool`);
});

// ============================================================================
// POOL STATS MONITORING — Log every 60s as early warning for exhaustion
// ============================================================================

const POOL_STATS_INTERVAL_MS = 60_000;

const poolStatsInterval = setInterval(() => {
  const stats = {
    total: mainPool.totalCount || 0,
    idle: mainPool.idleCount || 0,
    waiting: mainPool.waitingCount || 0,
  };
  const level = stats.waiting > 0 ? 'warn' : 'debug';
  logger[level](`${LOG.DB_QUERY} Pool stats`, stats);
}, POOL_STATS_INTERVAL_MS);

// Don't let the interval prevent Node.js from exiting
poolStatsInterval.unref();

// ============================================================================
// SLOW QUERY THRESHOLD (ms)
// ============================================================================

const SLOW_QUERY_THRESHOLD = 500;

/**
 * Detect pool/connection exhaustion errors from pg or PgBouncer.
 */
function isPoolExhaustedError(err) {
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('max client') ||
    msg.includes('connection timeout') ||
    msg.includes('too many connections') ||
    msg.includes('remaining connection slots are reserved') ||
    err.code === '53300' // PostgreSQL: too_many_connections
  );
}

// ============================================================================
// query() — Convenience wrapper with slow-query logging
// ============================================================================

/**
 * Execute a parameterized SQL query against the main pool.
 * Logs a warning if the query takes longer than SLOW_QUERY_THRESHOLD ms.
 *
 * @param {string} text - SQL query with $1, $2, ... placeholders
 * @param {Array}  params - Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await mainPool.query(text, params);
    const duration = Date.now() - start;

    if (duration > SLOW_QUERY_THRESHOLD) {
      logger.warn(`${LOG.DB_SLOW} Query took ${duration}ms`, {
        query: text.substring(0, 200),
        duration,
      });
    } else {
      logger.debug(`${LOG.DB_QUERY} ${duration}ms | rows=${result.rowCount}`, {
        query: text.substring(0, 120),
      });
    }

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    logger.error(`${LOG.DB_ERROR} Query failed after ${duration}ms`, {
      query: text.substring(0, 200),
      error: err.message,
      code: err.code,
    });

    // Pool exhaustion → 503 Service Unavailable instead of generic 500
    if (isPoolExhaustedError(err)) {
      const poolErr = new Error('Server is busy. Please try again shortly.');
      poolErr.status = 503;
      throw poolErr;
    }

    throw err;
  }
}

// ============================================================================
// getMainPool() — Raw pool reference
// ============================================================================

function getMainPool() {
  if (!mainPool) {
    const error = new Error('Main database pool is not initialized');
    logger.error(`${LOG.DB_ERROR} Critical: pool not initialized`);
    throw error;
  }
  return mainPool;
}

// ============================================================================
// getClient() — For transactions (auto-release safety)
// ============================================================================

/**
 * Get a dedicated client from the pool for use in transactions.
 * Always call client.release() in a finally block.
 *
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  try {
    const client = await mainPool.connect();
    return client;
  } catch (err) {
    if (isPoolExhaustedError(err)) {
      const poolErr = new Error('Server is busy. Please try again shortly.');
      poolErr.status = 503;
      throw poolErr;
    }
    throw err;
  }
}

// ============================================================================
// closeAllPools() — Graceful shutdown
// ============================================================================

async function closeAllPools() {
  logger.info(`${LOG.SHUTDOWN} Closing database connection pool...`);
  clearInterval(poolStatsInterval);
  try {
    await mainPool.end();
    logger.info(`${LOG.SHUTDOWN} Database pool closed successfully`);
  } catch (err) {
    logger.error(`${LOG.SHUTDOWN} Error closing pool`, { error: err.message });
    throw err;
  }
}

// ============================================================================
// getPoolStats() — Monitoring
// ============================================================================

function getPoolStats() {
  return {
    total: mainPool.totalCount || 0,
    idle: mainPool.idleCount || 0,
    waiting: mainPool.waitingCount || 0,
  };
}

// ============================================================================
// testConnectivity() — Startup health check
// ============================================================================

/**
 * Tests DB connectivity and returns latency + server version.
 *
 * @returns {Promise<{ connected: boolean, latency: number, version: string }>}
 */
async function testConnectivity() {
  const start = Date.now();
  try {
    const client = await mainPool.connect();
    const res = await client.query('SELECT version()');
    client.release();

    const latency = Date.now() - start;
    const version = res.rows[0]?.version?.split(' ').slice(0, 2).join(' ') || 'unknown';

    logger.info(`${LOG.STARTUP} ✅ Database connected`, { latency: `${latency}ms`, version });

    return { connected: true, latency, version };
  } catch (err) {
    const latency = Date.now() - start;
    logger.error(`${LOG.STARTUP} ❌ Database connection failed`, {
      error: err.message,
      latency: `${latency}ms`,
    });

    return { connected: false, latency, version: null };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getMainPool,
  query,
  getClient,
  closeAllPools,
  getPoolStats,
  testConnectivity,
};