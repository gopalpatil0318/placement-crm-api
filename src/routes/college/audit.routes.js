/**
 * ============================================================================
 * AUDIT LOG ROUTES — College-Side Audit Trail Endpoints (B23)
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN)
 *
 *   GET   /audit_logs            List audit entries (filtered, paginated)
 *   GET   /audit_logs/:auditId   Single entry with full diff data
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/audit.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    getAuditLogsSchema,
    auditIdParamSchema,
} = require('../../validators/college/audit.validator');

// ============================================================================
// AUTH MIDDLEWARE — Requires audit.view permission
// ============================================================================
router.use(authenticate, requirePermission(PERMISSIONS.AUDIT_VIEW));

// ============================================================================
// ROUTES
// ============================================================================

router.get(
    '/audit_logs',
    apiLimiter,
    validate(getAuditLogsSchema, 'query'),
    asyncHandler(controller.getAuditLogs)
);

router.get(
    '/audit_logs/:auditId',
    apiLimiter,
    validate(auditIdParamSchema, 'params'),
    asyncHandler(controller.getAuditLogDetail)
);

module.exports = router;
