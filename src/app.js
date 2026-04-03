/**
 * ============================================================================
 * APP.JS — Express Application Setup
 * ============================================================================
 * Placement CRM API — Single Database Architecture
 *
 * Middleware chain:
 *   1. Security (helmet, CORS)
 *   2. Parsing (JSON, URL-encoded, cookies)
 *   3. Compression (gzip)
 *   4. Request ID & response time
 *   5. HTTP logging (Morgan → Winston)
 *   6. Rate limiting (API routes only)
 *   7. Routes
 *   8. Error handler (last)
 * ============================================================================
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const crypto = require('node:crypto');

const config = require('./config/env');
const logger = require('./config/logger');
const { getPoolStats } = require('./config/db');
const { APP } = require('./config/constants');
const requestLogger = require('./middleware/requestLogger');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ============================================================================
// 1. SECURITY HEADERS
// ============================================================================

app.set('trust proxy', 1);
app.use(helmet());

// ============================================================================
// 2. CORS
// ============================================================================

/**
 * Build the CORS origin option.
 * - Production: accepts any *.placenex.in subdomain + explicit FRONTEND_URL list.
 * - Development: additionally allows any *.lvh.me subdomain and localhost
 *   so local multi-tenant testing works out of the box.
 *
 * Always returns a callback function for consistent typing.
 */

/** Matches any subdomain (or bare) placenex.in origin */
const PLACENEX_ORIGIN_RE = /^https?:\/\/([\w-]+\.)?placenex\.in$/;
/** Matches any *.lvh.me origin (with optional port) */
const LVH_ORIGIN_RE = /^https?:\/\/[\w-]+\.lvh\.me(:\d+)?$/;
/** Matches http(s)://localhost with optional port */
const LOCALHOST_ORIGIN_RE = /^https?:\/\/localhost(:\d+)?$/;

function buildCorsOrigin() {
  const isWildcard = config.frontendUrl === '*';

  // Never allow wildcard CORS in production — must set FRONTEND_URL
  if (isWildcard && config.isProd) {
    logger.warn('CORS: FRONTEND_URL=* is not safe for production. Falling back to placenex.in only.');
  }

  const origins = isWildcard ? [] : config.frontendUrl.split(',').map(s => s.trim());

  return function corsOriginCheck(origin, callback) {
    // Allow non-browser (server-to-server, curl) requests
    if (!origin) return callback(null, true);
    // Wildcard — allow everything (development only)
    if (isWildcard && config.isDev) return callback(null, true);
    // Explicit whitelist from FRONTEND_URL env
    if (origins.includes(origin)) return callback(null, true);
    // Production + Dev: accept any *.placenex.in subdomain
    if (PLACENEX_ORIGIN_RE.test(origin)) return callback(null, true);
    // Dev-only: accept any *.lvh.me or localhost origin
    if (config.isDev && LVH_ORIGIN_RE.test(origin)) return callback(null, true);
    if (config.isDev && LOCALHOST_ORIGIN_RE.test(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  };
}

app.use(cors({
  origin: buildCorsOrigin(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ============================================================================
// 3. PARSING
// ============================================================================

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// 4. COMPRESSION (gzip responses for faster API)
// ============================================================================

app.use(compression());

// ============================================================================
// 5. REQUEST ID & RESPONSE TIME
// ============================================================================

app.use((req, res, next) => {
  // Always generate a fresh request ID — never trust client headers
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  // Track response time — set header BEFORE response is sent
  const start = process.hrtime.bigint();
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode, ...args) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
    return originalWriteHead(statusCode, ...args);
  };

  next();
});

// ============================================================================
// 6. HTTP LOGGING (Morgan → Winston)
// ============================================================================

const morganFormat = config.isDev
  ? ':method :url :status :response-time ms'
  : ':remote-addr :method :url :status :response-time ms';

app.use(morgan(morganFormat, { stream: logger.stream }));
app.use(requestLogger);

// ============================================================================
// 7. HEALTH CHECK (before rate limiter — always accessible)
// ============================================================================

app.get('/', (req, res) => {
  const pool = getPoolStats();
  res.json({
    success: true,
    message: `${APP.NAME} v${APP.VERSION}`,
    data: {
      status: 'healthy',
      uptime: Math.floor(process.uptime()),
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
      pool: {
        total: pool.total,
        idle: pool.idle,
        waiting: pool.waiting,
      },
    },
  });
});

// ============================================================================
// 8. API ROUTES
// ============================================================================

app.use('/api', routes);

// ============================================================================
// 10. 404 HANDLER
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ============================================================================
// 11. ERROR HANDLER (must be last)
// ============================================================================

app.use(errorHandler);

module.exports = app;
