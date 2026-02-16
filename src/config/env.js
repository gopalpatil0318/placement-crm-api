/**
 * ============================================================================
 * ENV.JS — Environment Configuration with Validation
 * ============================================================================
 * - Validates required environment variables at startup (fail-fast)
 * - Reads DB pool settings from .env
 * - Freezes config to prevent accidental mutation
 * ============================================================================
 */

const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root
dotenv.config({
  path: process.env.NODE_ENV === 'production'
    ? '.env'
    : path.resolve(process.cwd(), '.env')
});

// ============================================================================
// REQUIRED ENV VALIDATION
// ============================================================================

const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET'];

const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n   ${missing.join(', ')}\n`);
  console.error('   Please check your .env file and ensure all required variables are set.\n');
  process.exit(1);
}

// ============================================================================
// PARSE HELPERS
// ============================================================================

function parseIntSafe(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// ============================================================================
// CONFIGURATION OBJECT
// ============================================================================

const config = Object.freeze({
  // Server
  port: parseIntSafe(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // Authentication
  sysadminEmail: process.env.SYSADMIN_EMAIL,
  sysadminPassword: process.env.SYSADMIN_PASSWORD,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // DB Pool
  dbPoolMin: parseIntSafe(process.env.DB_POOL_MIN, 2),
  dbPoolMax: parseIntSafe(process.env.DB_POOL_MAX, 20),
  dbIdleTimeout: parseIntSafe(process.env.DB_IDLE_TIMEOUT, 30000),
  dbConnectionTimeout: parseIntSafe(process.env.DB_CONNECTION_TIMEOUT, 10000),
  dbQueryTimeout: parseIntSafe(process.env.DB_QUERY_TIMEOUT, 30000),

  // Rate Limiting
  rateLimitWindowMs: parseIntSafe(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMax: parseIntSafe(process.env.RATE_LIMIT_MAX, 100),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),

  // CORS
  frontendUrl: process.env.FRONTEND_URL || '*',
});

module.exports = config;