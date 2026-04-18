/**
 * ============================================================================
 * ASYNC HANDLER — Catches async errors in Express route handlers
 * ============================================================================
 *
 * Wraps an async controller function so that any thrown error
 * is automatically forwarded to Express's error handler via next().
 *
 * Includes a configurable request timeout (default 30s) to prevent
 * hung requests from consuming resources indefinitely at scale.
 *
 * Usage:
 *   const asyncHandler = require('../utils/asyncHandler');
 *
 *   router.get('/students', asyncHandler(async (req, res) => {
 *     const students = await studentService.getAll(req.user.college_id);
 *     sendSuccess(res, students);
 *   }));
 *
 *   // Custom timeout for heavy operations (e.g. bulk import):
 *   router.post('/bulk', asyncHandler(async (req, res) => { ... }, 60000));
 *
 * ============================================================================
 */

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * @param {Function} fn - Async route handler (req, res, next) => Promise
 * @param {number} [timeoutMs] - Request timeout in ms (default: 30s)
 * @returns {Function} Express middleware
 */
const asyncHandler = (fn, timeoutMs = DEFAULT_TIMEOUT_MS) => (req, res, next) => {
    let timedOut = false;

    const timer = setTimeout(() => {
        timedOut = true;
        const err = new Error('Request timeout — operation took too long');
        err.status = 408;
        next(err);
    }, timeoutMs);

    Promise.resolve(fn(req, res, next))
        .catch((err) => {
            if (!timedOut) next(err);
        })
        .finally(() => clearTimeout(timer));
};

module.exports = asyncHandler;
