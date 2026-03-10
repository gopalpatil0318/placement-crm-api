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
const crypto = require('crypto');

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

app.use(cors({
  origin: config.frontendUrl === '*' ? '*' : config.frontendUrl.split(',').map(s => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ============================================================================
// 3. PARSING
// ============================================================================

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// 4. COMPRESSION (gzip responses for faster API)
// ============================================================================

app.use(compression());

// ============================================================================
// 5. REQUEST ID & RESPONSE TIME
// ============================================================================

app.use((req, res, next) => {
  // Unique request ID for log correlation
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
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
