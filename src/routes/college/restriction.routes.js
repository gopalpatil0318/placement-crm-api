/**
 * ============================================================================
 * RESTRICTION ROUTES — Student Restriction Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /add_student_restriction/:studentId     Add restriction + validate
 *   GET   /get_all_restrictions                    List all + validate(query)
 *   GET   /get_student_restrictions/:studentId     Get for student + validate(query)
 *   PATCH /update_restriction/:restrictionId       Update/resolve + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/restriction.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    addRestrictionSchema,
    listRestrictionsSchema,
    listStudentRestrictionsSchema,
    updateRestrictionSchema,
    studentIdParamSchema,
    restrictionIdParamSchema,
} = require('../../validators/college/restriction.validator');

// All restriction routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/add_student_restriction/:studentId',
    validate(studentIdParamSchema, 'params'),
    validate(addRestrictionSchema),
    asyncHandler(controller.addRestriction)
);

router.get(
    '/get_all_restrictions',
    validate(listRestrictionsSchema, 'query'),
    asyncHandler(controller.getAllRestrictions)
);

router.get(
    '/get_student_restrictions/:studentId',
    validate(studentIdParamSchema, 'params'),
    validate(listStudentRestrictionsSchema, 'query'),
    asyncHandler(controller.getStudentRestrictions)
);

router.patch(
    '/update_restriction/:restrictionId',
    validate(restrictionIdParamSchema, 'params'),
    validate(updateRestrictionSchema),
    asyncHandler(controller.updateRestriction)
);

module.exports = router;
