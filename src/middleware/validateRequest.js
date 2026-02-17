/**
 * ============================================================================
 * VALIDATE REQUEST — Joi Schema Validation Middleware
 * ============================================================================
 *
 * Usage:
 *   const { loginSchema } = require('../validators/authValidator');
 *
 *   router.post('/login',
 *     validate(loginSchema),           // validates req.body (default)
 *     authController.login
 *   );
 *
 *   router.get('/students',
 *     validate(listQuerySchema, 'query'),  // validates req.query
 *     studentController.list
 *   );
 *
 * On success: attaches validated data to req.validated
 * On failure: returns 422 with human-readable field errors
 * ============================================================================
 */

const logger = require('../config/logger');
const { HTTP_STATUS, ERROR_MESSAGES, LOG } = require('../config/constants');

/**
 * Validation middleware factory.
 *
 * @param {import('joi').Schema} schema - Joi validation schema
 * @param {'body'|'query'|'params'} source - Which part of req to validate
 * @returns {Function} Express middleware
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];

    const { error, value } = schema.validate(data, {
      abortEarly: false,   // collect all errors, not just the first
      stripUnknown: true,  // remove unknown fields
      errors: {
        wrap: { label: false }, // remove quotes around field names
      },
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.context?.key || d.path.join('.'),
        message: d.message,
      }));

      logger.warn(`${LOG.API_ERROR} Validation failed on ${source}`, {
        path: req.path,
        method: req.method,
        errors: details,
        requestId: req.id,
      });

      return res.status(HTTP_STATUS.UNPROCESSABLE).json({
        success: false,
        error: ERROR_MESSAGES.VALIDATION_FAILED,
        details,
      });
    }

    // Attach validated & sanitized data
    req.validated = value;
    next();
  };
}

module.exports = validate;