/**
 * ============================================================================
 * EXTERNAL PLACEMENT CONTROLLER — Route Handler
 * ============================================================================
 *   POST /api/college/record_external_placement
 * ============================================================================
 */

const externalPlacementService = require('../../services/college/externalPlacement.service');
const { sendCreated, sendError } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    HTTP_STATUS,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');

async function recordExternalPlacement(req, res) {
    try {
        const result = await externalPlacementService.recordExternalPlacement(
            req.user.college_id,
            req.user.id,
            req.validated
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.CREATE,
            resourceType: AUDIT_RESOURCE_TYPES.PLACEMENT,
            resourceId: result.placement.placement_id,
            summary: `Recorded external placement for ${result.placement.student_name} at ${result.placement.company_name}`,
            newValue: {
                placement_id: result.placement.placement_id,
                job_id: result.job.job_id,
                student_name: result.placement.student_name,
                company_name: result.placement.company_name,
                drive_type: result.job.drive_type,
            },
            metadata: {
                entityName: result.placement.job_title,
                companyName: result.placement.company_name,
                auto_withdrawal: result.auto_withdrawal,
            },
            ipAddress: getClientIp(req),
        });

        return sendCreated(res, result, 'External placement recorded successfully');
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

module.exports = {
    recordExternalPlacement,
};
