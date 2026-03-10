/**
 * ============================================================================
 * SYSADMIN ROUTES — Express Router for Sysadmin APIs
 * ============================================================================
 * Base path: /api/sysadmin
 *
 * #   Method   Endpoint                                Middleware
 * 1   POST     /login                                  authLimiter + validate
 * 2   POST     /create_new_college                     auth + role + validate
 * 3   GET      /get_all_colleges                       auth + role + validate(query)
 * 4   GET      /get_college/:collegeId                 auth + role
 * 5   PUT      /update_college/:collegeId              auth + role + validate
 * 6   PATCH    /toggle_college_status/:collegeId       auth + role + validate
 * 7   PATCH    /update_college_features/:collegeId     auth + role + validate
 * 8   PATCH    /update_academic_year/:collegeId        auth + role + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/sysadmin/sysadmin.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { authLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    sysadminLoginSchema,
    createCollegeSchema,
    updateCollegeSchema,
    toggleCollegeStatusSchema,
    updateCollegeFeaturesSchema,
    updateAcademicYearSchema,
    listCollegesQuerySchema,
    collegeIdParamSchema,
} = require('../../validators/sysadmin/sysadmin.validator');

// Shorthand: sysadmin-only middleware chain
const sysadminAuth = [authenticate, requireRole(ROLES.SYSADMIN)];

// ============================================================================
// 1. LOGIN — No auth required (public)
// ============================================================================
router.post(
    '/login',
    authLimiter,
    validate(sysadminLoginSchema),
    asyncHandler(controller.login)
);

// ============================================================================
// 2. LOGOUT — Clears auth cookie
// ============================================================================
router.post(
    '/logout',
    authenticate,
    asyncHandler(controller.logout)
);

// ============================================================================
// 3. CREATE NEW COLLEGE
// ============================================================================
router.post(
    '/create_new_college',
    ...sysadminAuth,
    validate(createCollegeSchema),
    asyncHandler(controller.createNewCollege)
);

// ============================================================================
// 3. GET ALL COLLEGES (with filters)
// ============================================================================
router.get(
    '/get_all_colleges',
    ...sysadminAuth,
    validate(listCollegesQuerySchema, 'query'),
    asyncHandler(controller.getAllColleges)
);

// ============================================================================
// 4. GET SINGLE COLLEGE
// ============================================================================
router.get(
    '/get_college/:collegeId',
    ...sysadminAuth,
    validate(collegeIdParamSchema, 'params'),
    asyncHandler(controller.getCollege)
);

// ============================================================================
// 5. UPDATE COLLEGE INFO
// ============================================================================
router.put(
    '/update_college/:collegeId',
    ...sysadminAuth,
    validate(collegeIdParamSchema, 'params'),
    validate(updateCollegeSchema),
    asyncHandler(controller.updateCollege)
);

// ============================================================================
// 6. TOGGLE COLLEGE STATUS
// ============================================================================
router.patch(
    '/toggle_college_status/:collegeId',
    ...sysadminAuth,
    validate(collegeIdParamSchema, 'params'),
    validate(toggleCollegeStatusSchema),
    asyncHandler(controller.toggleCollegeStatus)
);

// ============================================================================
// 7. UPDATE COLLEGE FEATURES
// ============================================================================
router.patch(
    '/update_college_features/:collegeId',
    ...sysadminAuth,
    validate(collegeIdParamSchema, 'params'),
    validate(updateCollegeFeaturesSchema),
    asyncHandler(controller.updateCollegeFeatures)
);

// ============================================================================
// 8. UPDATE ACADEMIC YEAR
// ============================================================================
router.patch(
    '/update_academic_year/:collegeId',
    ...sysadminAuth,
    validate(collegeIdParamSchema, 'params'),
    validate(updateAcademicYearSchema),
    asyncHandler(controller.updateAcademicYear)
);

module.exports = router;
