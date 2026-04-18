/**
 * ============================================================================
 * AUDIT HELPER — Append-only audit trail for NAAC compliance (B23)
 * ============================================================================
 * Usage:
 *   const { logAudit, computeAuditDiff, getClientIp } = require('./auditHelper');
 *
 *   // Inside a transaction:
 *   await logAudit(client, { collegeId, userId, userName, userRole, action, ... });
 *
 *   // Standalone (no transaction):
 *   await logAudit(query, { ... });
 *
 * Design:
 *   - Non-blocking: audit failure never blocks business operations
 *   - Diff-only: stores only changed fields in old_value/new_value
 *   - Sanitized: strips passwords, tokens, secrets from JSONB
 *   - Validated: action + resourceType must match allowed enums
 * ============================================================================
 */

const logger = require('../config/logger');
const { LOG, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../config/constants');

const VALID_ACTIONS = new Set(Object.values(AUDIT_ACTIONS));
const VALID_RESOURCE_TYPES = new Set(Object.values(AUDIT_RESOURCE_TYPES));

/**
 * Fields that must NEVER appear in audit JSONB values.
 */
const SENSITIVE_KEYS = new Set([
    'password', 'user_password', 'new_password', 'current_password', 'confirm_password',
    'token', 'token_hash', 'refresh_token', 'jwt_secret', 'secret',
    'aadhaar_number',
]);

// ============================================================================
// SANITIZE — strip sensitive fields from an object before persisting
// ============================================================================

const MAX_SANITIZE_DEPTH = 5;

function sanitize(obj, depth = 0) {
    if (!obj || typeof obj !== 'object') return obj;
    if (depth >= MAX_SANITIZE_DEPTH) return '[nested]';

    if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item, depth + 1));
    }

    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(key)) continue;
        clean[key] = (value && typeof value === 'object')
            ? sanitize(value, depth + 1)
            : value;
    }
    return clean;
}

// ============================================================================
// DIFF — compute changed-fields-only diff between two objects
// ============================================================================

/**
 * Compare oldObj and newObj, returning only the fields that differ.
 * @param {Object|null} oldObj - Previous state (or null for creates)
 * @param {Object|null} newObj - New state (or null for deletes)
 * @returns {{ old: Object|null, new: Object|null }}
 */
function computeAuditDiff(oldObj, newObj) {
    if (!oldObj && !newObj) return { old: null, new: null };
    if (!oldObj) return { old: null, new: sanitize(newObj) };
    if (!newObj) return { old: sanitize(oldObj), new: null };

    const oldDiff = {};
    const newDiff = {};

    // Collect all keys from both objects
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
        if (SENSITIVE_KEYS.has(key)) continue;

        const oldVal = oldObj[key];
        const newVal = newObj[key];

        // Compare with JSON.stringify to handle nested objects/arrays
        // Wrap in try/catch to guard against circular references
        let changed;
        try {
            changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
        } catch {
            // Circular reference or non-serializable — fall back to reference equality
            changed = oldVal !== newVal;
            logger.warn(`${LOG.AUTH} Circular reference detected in audit diff for key: ${key}`);
        }

        if (changed) {
            oldDiff[key] = oldVal ?? null;
            newDiff[key] = newVal ?? null;
        }
    }

    // If nothing changed, return nulls
    if (Object.keys(oldDiff).length === 0) return { old: null, new: null };

    return { old: oldDiff, new: newDiff };
}

// ============================================================================
// IP EXTRACTION — X-Forwarded-For aware
// ============================================================================

/**
 * Extract client IP from request, respecting reverse proxy headers.
 * @param {Object} req - Express request
 * @returns {string|null}
 */
function getClientIp(req) {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
        // X-Forwarded-For can be comma-separated; take the first (client) IP
        return forwarded.split(',')[0].trim();
    }
    return req.ip || null;
}

// ============================================================================
// LOG AUDIT — insert a single audit row (non-blocking)
// ============================================================================

/**
 * Insert an audit log entry. Non-blocking: errors are logged but never thrown.
 *
 * @param {Function} queryFn - Either a transaction `client` (with .query) or standalone `query` function
 * @param {Object} params
 * @param {string} params.collegeId
 * @param {string} params.userId
 * @param {string} params.userName
 * @param {string} params.userRole
 * @param {string} params.action       - One of AUDIT_ACTIONS values
 * @param {string} params.resourceType - One of AUDIT_RESOURCE_TYPES values
 * @param {string} [params.resourceId]
 * @param {string} [params.summary]    - Human-readable description
 * @param {Object} [params.oldValue]   - Previous state (changed fields only)
 * @param {Object} [params.newValue]   - New state (changed fields only)
 * @param {Object} [params.metadata]   - Extra context (bulk counts, references)
 * @param {string} [params.ipAddress]
 */
async function logAudit(queryFn, {
    collegeId, userId, userName, userRole,
    action, resourceType, resourceId,
    summary, oldValue, newValue,
    metadata, ipAddress,
}) {
    try {
        // Validate enums
        if (!VALID_ACTIONS.has(action)) {
            logger.warn(`${LOG.AUTH} Invalid audit action: ${action}`);
            return;
        }
        if (!VALID_RESOURCE_TYPES.has(resourceType)) {
            logger.warn(`${LOG.AUTH} Invalid audit resource type: ${resourceType}`);
            return;
        }

        // Sanitize JSONB values
        const safeOld = oldValue ? sanitize(oldValue) : null;
        const safeNew = newValue ? sanitize(newValue) : null;
        const safeMeta = metadata ? sanitize(metadata) : null;

        // Determine if queryFn is a client (has .query method) or a standalone function
        const exec = typeof queryFn.query === 'function' ? queryFn.query.bind(queryFn) : queryFn;

        await exec(
            `INSERT INTO audit_log
               (college_id, user_id, user_name, user_role, action, resource_type,
                resource_id, summary, old_value, new_value, metadata, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                collegeId,
                userId,
                userName || 'Unknown',
                userRole || 'unknown',
                action,
                resourceType,
                resourceId || null,
                summary || null,
                safeOld ? JSON.stringify(safeOld) : null,
                safeNew ? JSON.stringify(safeNew) : null,
                safeMeta ? JSON.stringify(safeMeta) : null,
                ipAddress || null,
            ]
        );
    } catch (err) {
        // Non-blocking: audit failure must never break business logic
        logger.error(`${LOG.AUTH} Audit log insert failed`, {
            error: err.message,
            action,
            resourceType,
            resourceId,
            collegeId,
        });
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    logAudit,
    computeAuditDiff,
    getClientIp,
};
