/**
 * ============================================================================
 * SYSADMIN CONTROLLER — Route Handlers for Sysadmin APIs
 * ============================================================================
 * 8 endpoints — all behind authenticate + requireRole(SYSADMIN)
 *
 * 1  POST   /api/sysadmin/login                           (public)
 * 2  POST   /api/sysadmin/create_new_college               (auth)
 * 3  GET    /api/sysadmin/get_all_colleges                  (auth)
 * 4  GET    /api/sysadmin/get_college/:collegeId            (auth)
 * 5  PUT    /api/sysadmin/update_college/:collegeId         (auth)
 * 6  PATCH  /api/sysadmin/toggle_college_status/:collegeId  (auth)
 * 7  PATCH  /api/sysadmin/update_college_features/:collegeId(auth)
 * 8  PATCH  /api/sysadmin/update_academic_year/:collegeId   (auth)
 * ============================================================================
 */

const sysadminService = require('../../services/sysadmin/sysadmin.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { getPagination } = require('../../utils/pagination');
const { SUCCESS_MESSAGES } = require('../../config/constants');
const logger = require('../../config/logger');
const { LOG } = require('../../config/constants');
const { CLEAR_COOKIE_OPTIONS, CLEAR_REFRESH_COOKIE_OPTIONS } = require('../../config/cookie');
const { issueTokenPair } = require('../auth.controller');
const { hashRefreshToken, findRefreshToken, revokeRefreshToken } = require('../../utils/jwtHelper');

// ============================================================================
// 1. POST /api/sysadmin/login
// ============================================================================

async function login(req, res) {
    const { email, password } = req.validated;

    const result = await sysadminService.loginSysadmin(email, password);

    // B21: Issue access + refresh token pair
    await issueTokenPair(
        res,
        { id: 'sysadmin', role: result.role, email: result.email },
        'sysadmin',
        'sysadmin'
    );

    return sendSuccess(res, {
        role: result.role,
        email: result.email,
        type: 'sysadmin',
    }, SUCCESS_MESSAGES.LOGIN_SUCCESSFUL);
}

// ============================================================================
// 2. POST /api/sysadmin/logout
// ============================================================================

async function logout(req, res) {
    // B21: Revoke refresh token if present
    const rawRefreshToken = req.cookies?.refresh_token;
    if (rawRefreshToken) {
        const tokenHash = hashRefreshToken(rawRefreshToken);
        const stored = await findRefreshToken(tokenHash);
        if (stored) {
            await revokeRefreshToken(stored.token_id);
        }
    }

    res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
    res.clearCookie('refresh_token', CLEAR_REFRESH_COOKIE_OPTIONS);

    logger.info(`${LOG.AUTH} Sysadmin logged out`);

    return sendSuccess(res, null, SUCCESS_MESSAGES.LOGOUT_SUCCESSFUL);
}

// ============================================================================
// 3. POST /api/sysadmin/create_new_college
// ============================================================================

async function createNewCollege(req, res) {
    const result = await sysadminService.createCollege(req.validated);

    return sendCreated(res, result, SUCCESS_MESSAGES.COLLEGE_CREATED);
}

// ============================================================================
// 3. GET /api/sysadmin/get_all_colleges
// ============================================================================

async function getAllColleges(req, res) {
    const { page, limit, offset } = getPagination(req.query);
    const { status, type, search } = req.validated;

    const { colleges, total } = await sysadminService.getAllColleges({
        page, limit, offset, status, type, search,
    });

    return sendPaginated(res, colleges, total, { page, limit }, SUCCESS_MESSAGES.FETCHED_SUCCESSFULLY);
}

// ============================================================================
// 4. GET /api/sysadmin/get_college/:collegeId
// ============================================================================

async function getCollege(req, res) {
    const college = await sysadminService.getCollegeById(req.params.collegeId);

    return sendSuccess(res, college, SUCCESS_MESSAGES.FETCHED_SUCCESSFULLY);
}

// ============================================================================
// 5. PUT /api/sysadmin/update_college/:collegeId
// ============================================================================

async function updateCollege(req, res) {
    const updated = await sysadminService.updateCollege(req.params.collegeId, req.validated);

    return sendSuccess(res, updated, SUCCESS_MESSAGES.COLLEGE_UPDATED);
}

// ============================================================================
// 6. PATCH /api/sysadmin/toggle_college_status/:collegeId
// ============================================================================

async function toggleCollegeStatus(req, res) {
    const { college_status } = req.validated;

    const updated = await sysadminService.toggleCollegeStatus(req.params.collegeId, college_status);

    const message = college_status === 'active'
        ? SUCCESS_MESSAGES.COLLEGE_ACTIVATED
        : SUCCESS_MESSAGES.COLLEGE_DEACTIVATED;

    return sendSuccess(res, updated, message);
}

// ============================================================================
// 7. PATCH /api/sysadmin/update_college_features/:collegeId
// ============================================================================

async function updateCollegeFeatures(req, res) {
    const { enabled_features } = req.validated;

    const updated = await sysadminService.updateCollegeFeatures(req.params.collegeId, enabled_features);

    return sendSuccess(res, updated, SUCCESS_MESSAGES.COLLEGE_FEATURES_UPDATED);
}

// ============================================================================
// 8. PATCH /api/sysadmin/update_academic_year/:collegeId
// ============================================================================

async function updateAcademicYear(req, res) {
    const { default_academic_year } = req.validated;

    const updated = await sysadminService.updateAcademicYear(req.params.collegeId, default_academic_year);

    return sendSuccess(res, updated, SUCCESS_MESSAGES.ACADEMIC_YEAR_UPDATED);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    login,
    logout,
    createNewCollege,
    getAllColleges,
    getCollege,
    updateCollege,
    toggleCollegeStatus,
    updateCollegeFeatures,
    updateAcademicYear,
};
