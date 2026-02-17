/**
 * ============================================================================
 * REQUEST LOGGER MIDDLEWARE — Per-Request Lifecycle Logging
 * ============================================================================
 *
 * NOTE: Basic HTTP logging (method, URL, status, response-time) is handled
 * by Morgan in app.js. This middleware provides RICHER per-request context:
 *
 *   - Logs request start with body summary (safe — no passwords)
 *   - Logs request completion with duration and status
 *   - Attaches requestId for log correlation
 *
 * ============================================================================
 */

const logger = require('../config/logger');
const { LOG } = require('../config/constants');

/**
 * Fields to exclude from request body logs (security).
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'new_password',
  'old_password',
  'confirm_password',
  'currentPassword',
  'newPassword',
  'token',
  'jwt_secret',
]);

/**
 * Create a safe copy of an object with sensitive fields redacted.
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return {};

  const safe = {};
  for (const [key, value] of Object.entries(body)) {
    safe[key] = SENSITIVE_FIELDS.has(key) ? '***' : value;
  }
  return safe;
}

/**
 * Request lifecycle logger middleware.
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  // Log request start (debug level — only in dev)
  logger.debug(`${LOG.API_START} ${req.method} ${req.originalUrl}`, {
    requestId: req.id,
    ip: req.ip,
    body: sanitizeBody(req.body),
    query: req.query,
  });

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${LOG.API_END} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
      requestId: req.id,
      status: res.statusCode,
      duration,
      userId: req.user?.id,
    });
  });

  next();
}

module.exports = requestLogger;