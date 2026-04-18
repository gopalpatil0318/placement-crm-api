/**
 * ============================================================================
 * AUDIT LOG CONTROLLER — College-Side Audit Trail Handlers (B23)
 * ============================================================================
 *   GET   /api/college/audit_logs            List audit entries (no JSONB diff)
 *   GET   /api/college/audit_logs/:auditId   Single entry with full diff
 * ============================================================================
 */

const auditService = require('../../services/college/audit.service');
const { sendSuccess, sendPaginated, sendError } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
    LOG,
} = require('../../config/constants');

async function getAuditLogs(req, res) {
    try {
        const filters = {
            page: req.validated.page,
            limit: req.validated.limit,
            dateFrom: req.validated.date_from,
            dateTo: req.validated.date_to,
            userId: req.validated.user_id,
            action: req.validated.action,
            resourceType: req.validated.resource_type,
            resourceId: req.validated.resource_id,
            search: req.validated.search,
        };

        const { logs, total, page, limit } = await auditService.getAuditLogs(
            req.user.college_id,
            filters
        );

        return sendPaginated(
            res,
            { logs },
            total,
            { page, limit },
            SUCCESS_MESSAGES.AUDIT_LOGS_RETRIEVED
        );
    } catch (err) {
        logger.error(`${LOG.AUTH} Failed to fetch audit logs`, { error: err.message });
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

async function getAuditLogDetail(req, res) {
    try {
        const log = await auditService.getAuditLogDetail(
            req.params.auditId,
            req.user.college_id
        );

        if (!log) {
            return sendError(res, 'Audit log entry not found', HTTP_STATUS.NOT_FOUND);
        }

        return sendSuccess(res, log, SUCCESS_MESSAGES.AUDIT_LOGS_RETRIEVED);
    } catch (err) {
        logger.error(`${LOG.AUTH} Failed to fetch audit log detail`, { error: err.message });
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

module.exports = {
    getAuditLogs,
    getAuditLogDetail,
};
