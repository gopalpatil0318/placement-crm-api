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
// SLOW QUERY THRESHOLD (ms)
// ============================================================================

const SLOW_QUERY_THRESHOLD = 500;

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
  const client = await mainPool.connect();
  return client;
}

// ============================================================================
// closeAllPools() — Graceful shutdown
// ============================================================================

async function closeAllPools() {
  logger.info(`${LOG.SHUTDOWN} Closing database connection pool...`);
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