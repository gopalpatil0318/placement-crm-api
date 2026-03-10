/**
 * ============================================================================
 * STUDENT CERTIFICATE CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   POST   /api/student/add_certificate                      — Add certificate
 *   GET    /api/student/get_all_certificates                  — List own certificates
 *   PUT    /api/student/update_certificate/:certificateId     — Update certificate
 *   DELETE /api/student/delete_certificate/:certificateId     — Delete certificate
 * ============================================================================
 */

const certificateService = require('../../services/student/certificate.service');
const { sendSuccess } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. ADD CERTIFICATE
// ============================================================================

async function addCertificate(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/add_certificate`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await certificateService.addCertificate(
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/add_certificate`, {
        student_id: req.user.id,
        certificate_id: result.certificate_id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Certificate added successfully', HTTP_STATUS.CREATED);
}

// ============================================================================
// 2. GET ALL CERTIFICATES
// ============================================================================

async function getAllCertificates(req, res) {
    const result = await certificateService.getAllCertificates(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Certificates retrieved successfully');
}

// ============================================================================
// 3. UPDATE CERTIFICATE
// ============================================================================

async function updateCertificate(req, res) {
    const startTime = Date.now();
    const { certificateId } = req.params;

    logger.info(`${LOG.API_START} PUT /api/student/update_certificate/${certificateId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await certificateService.updateCertificate(
        certificateId,
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PUT /api/student/update_certificate/${certificateId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Certificate updated successfully');
}

// ============================================================================
// 4. DELETE CERTIFICATE
// ============================================================================

async function deleteCertificate(req, res) {
    const startTime = Date.now();
    const { certificateId } = req.params;

    logger.info(`${LOG.API_START} DELETE /api/student/delete_certificate/${certificateId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await certificateService.deleteCertificate(
        certificateId,
        req.user.id,
        req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} DELETE /api/student/delete_certificate/${certificateId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Certificate deleted successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addCertificate,
    getAllCertificates,
    updateCertificate,
    deleteCertificate,
};
