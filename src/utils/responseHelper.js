/**
 * ============================================================================
 * RESPONSE HELPER — Standardized API Response Format
 * ============================================================================
 *
 * Every API returns one of these shapes:
 *
 *   Success:    { success: true,  data: {...}, message: "..." }
 *   Error:      { success: false, error: "...", details?: [...] }
 *   Paginated:  { success: true,  data: [...], message: "...", pagination: {...} }
 *
 * ============================================================================
 */

const { HTTP_STATUS } = require('../config/constants');

/**
 * Send a success response.
 *
 * @param {Object}  res     - Express response object
 * @param {*}       data    - Response payload
 * @param {string}  message - Success message
 * @param {number}  status  - HTTP status code (default: 200)
 */
function sendSuccess(res, data = {}, message = 'OK', status = HTTP_STATUS.OK) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

/**
 * Send a created (201) response.
 *
 * @param {Object}  res     - Express response object
 * @param {*}       data    - Created resource data
 * @param {string}  message - Success message
 */
function sendCreated(res, data = {}, message = 'Created successfully') {
  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message,
    data,
  });
}

/**
 * Send an error response.
 *
 * @param {Object}       res     - Express response object
 * @param {string}       message - Error message (user-facing)
 * @param {number}       status  - HTTP status code (default: 400)
 * @param {Array|Object} details - Validation errors or extra info (optional)
 */
function sendError(res, message = 'Something went wrong', status = HTTP_STATUS.BAD_REQUEST, details = null) {
  const payload = {
    success: false,
    error: message,
  };

  if (details) {
    payload.details = details;
  }

  return res.status(status).json(payload);
}

/**
 * Send a paginated list response.
 *
 * @param {Object} res        - Express response object
 * @param {Array}  data       - Array of records
 * @param {number} total      - Total record count (before pagination)
 * @param {Object} pagination - { page, limit }
 * @param {string} message    - Success message
 */
function sendPaginated(res, data, total, { page, limit }, message = 'Data retrieved successfully') {
  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

module.exports = { sendSuccess, sendCreated, sendError, sendPaginated };