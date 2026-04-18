/**
 * ============================================================================
 * DEPARTMENT ROUTES — Department Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN)
 *
 *   POST   /create_department                 create + validate
 *   GET    /get_all_departments               list + validate(query)
 *   GET    /get_department/:deptId            get single
 *   PUT    /update_department/:deptId         update + validate
 *   PATCH  /toggle_department_status/:deptId  toggle + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/department.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    createDepartmentSchema,
    updateDepartmentSchema,
    listDepartmentsSchema,
    toggleDepartmentSchema,
    deptIdParamSchema,
    deptDetailQuerySchema,
} = require('../../validators/college/department.validator');

// All department routes require COLLEGEADMIN
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/create_department',
    validate(createDepartmentSchema),
    asyncHandler(controller.createDepartment)
);

router.get(
    '/get_all_departments',
    validate(listDepartmentsSchema, 'query'),
    asyncHandler(controller.getAllDepartments)
);

router.get(
    '/get_department/:deptId',
    validate(deptIdParamSchema, 'params'),
    validate(deptDetailQuerySchema, 'query'),
    asyncHandler(controller.getDepartment)
);

router.put(
    '/update_department/:deptId',
    validate(deptIdParamSchema, 'params'),
    validate(updateDepartmentSchema),
    asyncHandler(controller.updateDepartment)
);

router.patch(
    '/toggle_department_status/:deptId',
    validate(deptIdParamSchema, 'params'),
    validate(toggleDepartmentSchema),
    asyncHandler(controller.toggleDepartmentStatus)
);

module.exports = router;
