/**
 * ============================================================================
 * STUDENT PLACEMENT POLICY CONTROLLER
 * ============================================================================
 *   GET /api/student/get_placement_policies  → getActivePolicies
 * ============================================================================
 */

const policyService = require('../../services/student/placementPolicy.service');
const { sendSuccess } = require('../../utils/responseHelper');

async function getActivePolicies(req, res) {
    const userId = req.user.id;
    const collegeId = req.user.college_id;

    const policies = await policyService.getActivePolicies(userId, collegeId);

    sendSuccess(res, { policies, total: policies.length });
}

module.exports = { getActivePolicies };
