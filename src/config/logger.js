/**
 * ============================================================================
 * LOGGER.JS — Winston Logger with Request Correlation
 * ============================================================================
 *
 * Features:
 * - Structured JSON logging for production
 * - Colorized console output for development
 * - Request correlation ID support (req.id)
 * - File rotation: error.log, combined.log, exceptions.log
 * - Morgan HTTP stream integration
 * - Log level control via LOG_LEVEL env var
 *
 * Log Levels:
 * - error: System errors, DB failures, unhandled exceptions
 * - warn:  Validation failures, rate limits, auth issues
 * - info:  API operations, server lifecycle, DB connections
 * - debug: Detailed flow, query params, pool stats (dev only)
 *
 * ============================================================================
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// ============================================================================
// RESOLVE LOG DIRECTORY (standalone — no imports from other config files)
// ============================================================================

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============================================================================
// LOG LEVEL VALIDATION
// ============================================================================

const VALID_LEVELS = ['error', 'warn', 'info', 'debug'];
const logLevel = VALID_LEVELS.includes(process.env.LOG_LEVEL)
  ? process.env.LOG_LEVEL
  : 'info';

// ============================================================================
// FORMAT: Console (Human-Readable, Colorized)
// ============================================================================

const consoleFormat = format.printf(({ level, message, timestamp, requestId, ...meta }) => {
  const reqId = requestId ? ` [${requestId}]` : '';

  // Build metadata string from remaining keys (exclude 'service', 'environment' defaults)
  const filteredMeta = { ...meta };
  delete filteredMeta.service;
  delete filteredMeta.environment;

  const metaStr = Object.keys(filteredMeta).length > 0
    ? ' ' + Object.entries(filteredMeta)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ')
    : '';

  return `${timestamp} [${level}]${reqId}: ${message}${metaStr}`;
});

// ============================================================================
// FORMAT: JSON (Structured — for production file logging)
// ============================================================================

const jsonFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format.json()
);

// ============================================================================
// TRANSPORTS
// ============================================================================

const consoleTransport = new transports.Console({
  level: logLevel,
  format: format.combine(
    format.colorize(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    consoleFormat
  ),
});

const errorFileTransport = new transports.File({
  filename: path.join(LOG_DIR, 'error.log'),
  level: 'error',
  maxsize: 10 * 1024 * 1024, // 10 MB
  maxFiles: 5,
  format: jsonFormat,
});

const combinedFileTransport = new transports.File({
  filename: path.join(LOG_DIR, 'combined.log'),
  level: logLevel,
  maxsize: 10 * 1024 * 1024,
  maxFiles: 10,
  format: jsonFormat,
});

// ============================================================================
// BUILD TRANSPORTS ARRAY
// ============================================================================

const transportsList = [consoleTransport];

const env = process.env.NODE_ENV || 'development';
if (env === 'production' || env === 'staging') {
  transportsList.push(errorFileTransport, combinedFileTransport);
}

// ============================================================================
// CREATE LOGGER
// ============================================================================

const logger = createLogger({
  level: logLevel,
  defaultMeta: {
    service: 'placement-crm-api',
    environment: env,
  },
  format: jsonFormat,
  transports: transportsList,
  exceptionHandlers: [
    new transports.File({
      filename: path.join(LOG_DIR, 'exceptions.log'),
      format: jsonFormat,
    }),
  ],
  rejectionHandlers: [
    new transports.File({
      filename: path.join(LOG_DIR, 'rejections.log'),
      format: jsonFormat,
    }),
  ],
});

// ============================================================================
// MORGAN STREAM (for HTTP request logging via Morgan → Winston)
// ============================================================================

logger.stream = {
  write: (message) => {
    logger.info(message.trim(), { source: 'http' });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = logger;