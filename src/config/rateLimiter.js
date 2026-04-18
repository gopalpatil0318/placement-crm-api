/**
 * ============================================================================
 * RATE LIMITER — express-rate-limit v8 Configuration
 * ============================================================================
 *
 * Two limiters:
 *   authLimiter  — 10 attempts per 15 min (login/forgot-password)
 *   apiLimiter   — 200 requests per 1 min (general API, env-configurable)
 *
 * Features:
 *   - Human-friendly retry messages with countdown
 *   - Sysadmin bypass for API limiter
 *   - Security logging on rate limit violations
 *   - Standard rate limit headers (RateLimit-*)
 * ============================================================================
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const logger = require('./logger');
const { RATE_LIMIT, HTTP_STATUS, LOG, ROLES } = require('./constants');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format remaining milliseconds into "X min Y sec" string.
 * @param {number} ms - Milliseconds remaining
 * @returns {string}
 */
function formatRetryTime(ms) {
  if (!ms || ms <= 0) return 'a few seconds';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0 && sec > 0) return `${min} min ${sec} sec`;
  if (min > 0) return `${min} min`;
  return `${sec} sec`;
}

/**
 * Skip rate limiting for sysadmin users.
 */
function skipForSysAdmin(req) {
  return req.user?.role === ROLES.SYSADMIN;
}

// ============================================================================
// AUTH LIMITER (Strict — brute force protection)
// ============================================================================

const authLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS_AUTH,
  max: RATE_LIMIT.MAX_REQUESTS_AUTH,
  keyGenerator: (req) => {
    const email = req.body?.email || req.body?.student_email || 'unknown';
    return `${ipKeyGenerator(req.ip)}-${email}`;
  },
  skip: () => false, // Never skip for auth — even sysadmin
  handler: (req, res) => {
    const resetMs = req.rateLimit?.resetTime
      ? req.rateLimit.resetTime.getTime() - Date.now()
      : RATE_LIMIT.WINDOW_MS_AUTH;
    const retryAfterSec = Math.ceil(resetMs / 1000);

    logger.warn(`${LOG.SECURITY} Rate limit: multiple login attempts`, {
      ip: req.ip,
      email: req.body?.email || req.body?.student_email || 'unknown',
      attempts: req.rateLimit?.current,
    });

    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      message: `Too many login attempts. Please try again in ${formatRetryTime(resetMs)}`,
      retryAfter: retryAfterSec,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// API LIMITER (Moderate — general traffic)
// ============================================================================

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS_API,
  max: RATE_LIMIT.MAX_REQUESTS_API,
  skip: skipForSysAdmin,
  handler: (req, res) => {
    const resetMs = req.rateLimit?.resetTime
      ? req.rateLimit.resetTime.getTime() - Date.now()
      : RATE_LIMIT.WINDOW_MS_API;
    const retryAfterSec = Math.ceil(resetMs / 1000);

    logger.warn(`${LOG.SECURITY} API rate limit exceeded`, {
      ip: req.ip,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });

    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      message: `Too many requests. Please try again in ${formatRetryTime(resetMs)}`,
      retryAfter: retryAfterSec,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// RESOLVE LIMITER (Public endpoint — subdomain college lookup)
// ============================================================================

const resolveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,             // 10 requests per minute per IP
  skip: () => false,   // Never skip — public endpoint
  handler: (req, res) => {
    const resetMs = req.rateLimit?.resetTime
      ? req.rateLimit.resetTime.getTime() - Date.now()
      : 60 * 1000;
    const retryAfterSec = Math.ceil(resetMs / 1000);

    logger.warn(`${LOG.SECURITY} Resolve rate limit exceeded`, {
      ip: req.ip,
      path: req.path,
    });

    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      message: `Too many requests. Please try again in ${formatRetryTime(resetMs)}`,
      retryAfter: retryAfterSec,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// BULK LIMITER (Strict — heavy batch operations)
// ============================================================================

const bulkLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,              // 5 bulk requests per minute per IP
  skip: skipForSysAdmin,
  handler: (req, res) => {
    const resetMs = req.rateLimit?.resetTime
      ? req.rateLimit.resetTime.getTime() - Date.now()
      : 60 * 1000;
    const retryAfterSec = Math.ceil(resetMs / 1000);

    logger.warn(`${LOG.SECURITY} Bulk operation rate limit exceeded`, {
      ip: req.ip,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });

    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      message: `Too many bulk operations. Please try again in ${formatRetryTime(resetMs)}`,
      retryAfter: retryAfterSec,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  authLimiter,
  apiLimiter,
  resolveLimiter,
  bulkLimiter,
};