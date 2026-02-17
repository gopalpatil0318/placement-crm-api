/**
 * ============================================================================
 * ERROR HANDLER — Global Express Error Middleware
 * ============================================================================
 *
 * Catches all errors forwarded via next(err) or thrown in async handlers.
 *
 * Handles:
 *   - Joi validation errors        → 422 with field details
 *   - PostgreSQL unique violations  → 409 conflict
 *   - PostgreSQL FK violations      → 400 bad request
 *   - JWT errors                    → 401 unauthorized
 *   - Known operational errors      → err.status
 *   - Unknown errors                → 500 (stack hidden in production)
 *
 * ============================================================================
 */

const logger = require('../config/logger');
const config = require('../config/env');
const {
  HTTP_STATUS,
  ERROR_MESSAGES,
  DB_ERROR_CODES,
  LOG,
} = require('../config/constants');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // ------------------------------------------------------------------
  // 1. Joi / Validation Errors
  // ------------------------------------------------------------------
  if (err.isJoi || err.name === 'ValidationError') {
    const details = err.details
      ? err.details.map((d) => d.message)
      : [err.message];

    logger.warn(`${LOG.API_ERROR} Validation error`, {
      path: req.path,
      method: req.method,
      details,
      requestId: req.id,
    });

    return res.status(HTTP_STATUS.UNPROCESSABLE).json({
      success: false,
      error: ERROR_MESSAGES.VALIDATION_FAILED,
      details,
    });
  }

  // ------------------------------------------------------------------
  // 2. PostgreSQL Error Codes
  // ------------------------------------------------------------------
  if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
    logger.warn(`${LOG.DB_ERROR} Unique constraint violation`, {
      detail: err.detail,
      table: err.table,
      constraint: err.constraint,
      requestId: req.id,
    });

    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      error: ERROR_MESSAGES.DUPLICATE_ENTRY,
    });
  }

  if (err.code === DB_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    logger.warn(`${LOG.DB_ERROR} Foreign key violation`, {
      detail: err.detail,
      table: err.table,
      constraint: err.constraint,
      requestId: req.id,
    });

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: 'Referenced resource does not exist',
    });
  }

  if (err.code === DB_ERROR_CODES.CHECK_VIOLATION) {
    logger.warn(`${LOG.DB_ERROR} Check constraint violation`, {
      detail: err.detail,
      constraint: err.constraint,
      requestId: req.id,
    });

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: ERROR_MESSAGES.INVALID_STATUS,
    });
  }

  // ------------------------------------------------------------------
  // 3. JWT Errors
  // ------------------------------------------------------------------
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: ERROR_MESSAGES.INVALID_TOKEN,
    });
  }

  // ------------------------------------------------------------------
  // 4. SyntaxError (malformed JSON body)
  // ------------------------------------------------------------------
  if (err.type === 'entity.parse.failed') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: 'Invalid JSON in request body',
    });
  }

  // ------------------------------------------------------------------
  // 5. Known Operational Errors (err.status set by controllers)
  // ------------------------------------------------------------------
  const status = err.status || err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const isServerError = status >= 500;

  // Log level based on severity
  if (isServerError) {
    logger.error(`${LOG.API_ERROR} ${err.message}`, {
      path: req.path,
      method: req.method,
      status,
      stack: err.stack,
      userId: req.user?.id,
      requestId: req.id,
    });
  } else {
    logger.warn(`${LOG.API_ERROR} ${err.message}`, {
      path: req.path,
      method: req.method,
      status,
      requestId: req.id,
    });
  }

  // ------------------------------------------------------------------
  // 6. Response (hide internals in production)
  // ------------------------------------------------------------------
  const response = {
    success: false,
    error: isServerError ? ERROR_MESSAGES.SERVER_ERROR : err.message,
  };

  // Show stack trace only in development
  if (config.isDev && isServerError) {
    response.stack = err.stack;
  }

  return res.status(status).json(response);
}

module.exports = errorHandler;