/**
 * ============================================================================
 * STUDENT PROJECT CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   POST   /api/student/add_project                — Add project
 *   GET    /api/student/get_all_projects            — List own projects
 *   PUT    /api/student/update_project/:projectId   — Update project
 *   DELETE /api/student/delete_project/:projectId   — Delete project
 * ============================================================================
 */

const projectService = require('../../services/student/project.service');
const { sendSuccess } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. ADD PROJECT
// ============================================================================

async function addProject(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/add_project`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await projectService.addProject(
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/add_project`, {
        student_id: req.user.id,
        project_id: result.project_id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Project added successfully', HTTP_STATUS.CREATED);
}

// ============================================================================
// 2. GET ALL PROJECTS
// ============================================================================

async function getAllProjects(req, res) {
    const result = await projectService.getAllProjects(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Projects retrieved successfully');
}

// ============================================================================
// 3. UPDATE PROJECT
// ============================================================================

async function updateProject(req, res) {
    const startTime = Date.now();
    const { projectId } = req.params;

    logger.info(`${LOG.API_START} PUT /api/student/update_project/${projectId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await projectService.updateProject(
        projectId,
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PUT /api/student/update_project/${projectId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Project updated successfully');
}

// ============================================================================
// 4. DELETE PROJECT
// ============================================================================

async function deleteProject(req, res) {
    const startTime = Date.now();
    const { projectId } = req.params;

    logger.info(`${LOG.API_START} DELETE /api/student/delete_project/${projectId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await projectService.deleteProject(
        projectId,
        req.user.id,
        req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} DELETE /api/student/delete_project/${projectId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Project deleted successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addProject,
    getAllProjects,
    updateProject,
    deleteProject,
};
