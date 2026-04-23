/**
 * ============================================================================
 * DEPARTMENT CONTROLLER — Route Handlers for Department Management
 * ============================================================================
 *   POST  /api/college/create_department
 *   GET   /api/college/get_all_departments
 *   GET   /api/college/get_department/:deptId
 *   PUT   /api/college/update_department/:deptId
 *   PATCH /api/college/toggle_department_status/:deptId
 * ============================================================================
 */

const departmentService = require('../../services/college/department.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const { SUCCESS_MESSAGES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../../config/constants');

// ============================================================================
// 1. CREATE DEPARTMENT
// ============================================================================

async function createDepartment(req, res) {
    const result = await departmentService.createDepartment(
        req.validated,
        req.user.college_id
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.DEPARTMENT,
        resourceId: result.dept_id,
        summary: `Created department "${result.dept_name}"`,
        newValue: result,
        metadata: { entityName: result.dept_name },
        ipAddress: getClientIp(req),
    });

    return sendCreated(res, result, SUCCESS_MESSAGES.DEPARTMENT_CREATED);
}

// ============================================================================
// 2. GET ALL DEPARTMENTS
// ============================================================================

async function getAllDepartments(req, res) {
    const { departments, total, page, limit } = await departmentService.getAllDepartments(
        req.user.college_id,
        req.validated,
        req.deptScope
    );

    return sendPaginated(res, departments, total, { page, limit }, SUCCESS_MESSAGES.DEPARTMENTS_RETRIEVED);
}

// ============================================================================
// 3. GET DEPARTMENT BY ID
// ============================================================================

async function getDepartment(req, res) {
    const result = await departmentService.getDepartmentById(
        req.params.deptId,
        req.user.college_id,
        req.validated || {},
        req.deptScope
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.DEPARTMENT_RETRIEVED);
}

// ============================================================================
// 4. UPDATE DEPARTMENT
// ============================================================================

async function updateDepartment(req, res) {
    const result = await departmentService.updateDepartment(
        req.params.deptId,
        req.user.college_id,
        req.validated,
        req.deptScope
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.DEPARTMENT,
        resourceId: req.params.deptId,
        summary: `Updated department "${result.dept_name}"`,
        newValue: result,
        metadata: { entityName: result.dept_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.DEPARTMENT_UPDATED);
}

// ============================================================================
// 5. TOGGLE DEPARTMENT STATUS
// ============================================================================

async function toggleDepartmentStatus(req, res) {
    const { is_active } = req.validated;

    const result = await departmentService.toggleDepartmentStatus(
        req.params.deptId,
        req.user.college_id,
        is_active,
        req.deptScope
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.DEPARTMENT,
        resourceId: req.params.deptId,
        summary: `${is_active ? 'Activated' : 'Deactivated'} department "${result.dept_name}"`,
        oldValue: { is_active: result._previousStatus },
        newValue: { is_active },
        metadata: { entityName: result.dept_name },
        ipAddress: getClientIp(req),
    });

    const message = is_active
        ? SUCCESS_MESSAGES.DEPARTMENT_ACTIVATED
        : SUCCESS_MESSAGES.DEPARTMENT_DEACTIVATED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createDepartment,
    getAllDepartments,
    getDepartment,
    updateDepartment,
    toggleDepartmentStatus,
};
