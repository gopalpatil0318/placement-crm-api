/**
 * ============================================================================
 * STUDENT COMPANY SEARCH CONTROLLER
 * ============================================================================
 *   GET /api/student/companies/search
 * ============================================================================
 */

const { searchCompanies } = require('../../services/student/companySearch.service');
const { sendSuccess } = require('../../utils/responseHelper');

async function search(req, res) {
    const { q, limit } = req.validated;

    const companies = await searchCompanies(req.user.college_id, q, limit);

    return sendSuccess(res, { companies }, 'Companies retrieved successfully');
}

module.exports = { search };
