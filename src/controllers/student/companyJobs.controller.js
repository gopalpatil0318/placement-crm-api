/**
 * ============================================================================
 * STUDENT COMPANY JOBS CONTROLLER
 * ============================================================================
 *   GET /api/student/company-jobs/:companyId
 * ============================================================================
 */

const { getCompanyJobs } = require('../../services/student/companyJobs.service');
const { sendSuccess } = require('../../utils/responseHelper');

async function listCompanyJobs(req, res) {
    const { companyId } = req.params;

    const jobs = await getCompanyJobs(
        companyId,
        req.user.college_id,
        req.user.passout_year
    );

    return sendSuccess(res, { jobs }, 'Company jobs retrieved successfully');
}

module.exports = { listCompanyJobs };
