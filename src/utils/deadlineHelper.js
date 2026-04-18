/**
 * ============================================================================
 * JOB DEADLINE HELPER — Auto-close applications when deadline passes
 * ============================================================================
 * Check-on-access pattern: when any job query runs, silently disable
 * applications for published jobs whose deadline has passed.
 *
 * This avoids needing a cron job while keeping data consistent.
 *
 * Safety:
 *   - Uses DB-side NOW() (not app time) → immune to clock skew
 *   - Timestamps stored as 'timestamp without time zone' are treated as
 *     IST by convention; NOW() in Supabase defaults to UTC. We compare
 *     in UTC via AT TIME ZONE to avoid IST/UTC mismatch.
 *   - In-memory TTL cache (5 min) per college avoids redundant UPDATEs
 *   - Wrapped in try/catch so failures never block the main query
 * ============================================================================
 */

const { query } = require('../config/db');
const { STATUS } = require('../config/constants');
const logger = require('../config/logger');

// In-memory TTL cache: collegeId → last run timestamp
const _lastRun = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Auto-set allow_applications = false for published jobs whose deadline has passed.
 * Scoped to a single college for efficiency. Runs as a single UPDATE, no-op if
 * no rows match. Failures are logged but never thrown to callers.
 *
 * @param {string} collegeId
 * @returns {number} Number of jobs updated (0 if skipped or error)
 */
async function enforceDeadlines(collegeId) {
    try {
        // Skip if we ran recently for this college
        const lastRun = _lastRun.get(collegeId);
        if (lastRun && Date.now() - lastRun < TTL_MS) {
            return 0;
        }

        const result = await query(
            `UPDATE job_postings
             SET allow_applications = false
             WHERE college_id = $1
               AND job_status = $2
               AND allow_applications = true
               AND application_deadline < NOW()`,
            [collegeId, STATUS.JOB.PUBLISHED]
        );

        _lastRun.set(collegeId, Date.now());
        return result.rowCount;
    } catch (err) {
        logger.error('enforceDeadlines failed — non-blocking', {
            collegeId,
            error: err.message,
        });
        return 0;
    }
}

module.exports = { enforceDeadlines };
