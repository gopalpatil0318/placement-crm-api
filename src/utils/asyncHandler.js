/**
 * ============================================================================
 * ASYNC HANDLER — Catches async errors in Express route handlers
 * ============================================================================
 *
 * Wraps an async controller function so that any thrown error
 * is automatically forwarded to Express's error handler via next().
 *
 * Usage:
 *   const asyncHandler = require('../utils/asyncHandler');
 *
 *   router.get('/students', asyncHandler(async (req, res) => {
 *     const students = await studentService.getAll(req.user.college_id);
 *     sendSuccess(res, students);
 *   }));
 *
 * ============================================================================
 */

/**
 * @param {Function} fn - Async route handler (req, res, next) => Promise
 * @returns {Function} Express middleware
 */
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
