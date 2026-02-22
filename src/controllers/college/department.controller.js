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
const { SUCCESS_MESSAGES } = require('../../config/constants');

// ============================================================================
// 1. CREATE DEPARTMENT
// ============================================================================

async function createDepartment(req, res) {
    const result = await departmentService.createDepartment(
        req.validated,
        req.user.college_id
    );

    return sendCreated(res, result, SUCCESS_MESSAGES.DEPARTMENT_CREATED);
}

// ============================================================================
// 2. GET ALL DEPARTMENTS
// ============================================================================

async function getAllDepartments(req, res) {
    const { departments, total, page, limit } = await departmentService.getAllDepartments(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, departments, total, { page, limit }, 'Departments retrieved successfully');
}

// ============================================================================
// 3. GET DEPARTMENT BY ID
// ============================================================================

async function getDepartment(req, res) {
    const result = await departmentService.getDepartmentById(
        req.params.deptId,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Department retrieved successfully');
}

// ============================================================================
// 4. UPDATE DEPARTMENT
// ============================================================================

async function updateDepartment(req, res) {
    const result = await departmentService.updateDepartment(
        req.params.deptId,
        req.user.college_id,
        req.validated
    );

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
        is_active
    );

    const message = is_active
        ? 'Department activated successfully'
        : 'Department deactivated successfully';

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
