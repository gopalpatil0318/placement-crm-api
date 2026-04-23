/**
 * ============================================================================
 * SUBMISSIONS CONTROLLER — Route Handlers for Demo & Contact APIs
 * ============================================================================
 * Public endpoints:
 *   POST /api/public/demo-request
 *   POST /api/public/contact-inquiry
 *
 * Sysadmin endpoints:
 *   GET    /api/sysadmin/demo-requests
 *   GET    /api/sysadmin/demo-requests/:id
 *   PATCH  /api/sysadmin/demo-requests/:id/status
 *   POST   /api/sysadmin/demo-requests/:id/notes
 *   GET    /api/sysadmin/contact-inquiries
 *   GET    /api/sysadmin/contact-inquiries/:id
 *   PATCH  /api/sysadmin/contact-inquiries/:id/status
 *   POST   /api/sysadmin/contact-inquiries/:id/notes
 *   GET    /api/sysadmin/submissions/stats
 * ============================================================================
 */

const submissionsService = require('../../services/public/submissions.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { getPagination } = require('../../utils/pagination');
const { SUCCESS_MESSAGES } = require('../../config/constants');
const { getClientIp } = require('../../utils/auditHelper');

// ============================================================================
// PUBLIC — Submit Demo Request
// ============================================================================

async function submitDemoRequest(req, res) {
    const data = req.validated;

    // Honeypot: silently succeed without saving
    if (data.website && data.website.length > 0) {
        return sendCreated(res, {}, SUCCESS_MESSAGES.DEMO_REQUEST_SUBMITTED);
    }

    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    const result = await submissionsService.submitDemoRequest(data, ipAddress, userAgent);

    return sendCreated(res, { id: result.id }, SUCCESS_MESSAGES.DEMO_REQUEST_SUBMITTED);
}

// ============================================================================
// PUBLIC — Submit Contact Inquiry
// ============================================================================

async function submitContactInquiry(req, res) {
    const data = req.validated;

    // Honeypot: silently succeed without saving
    if (data.website && data.website.length > 0) {
        return sendCreated(res, {}, SUCCESS_MESSAGES.CONTACT_INQUIRY_SUBMITTED);
    }

    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    const result = await submissionsService.submitContactInquiry(data, ipAddress, userAgent);

    return sendCreated(res, { id: result.id }, SUCCESS_MESSAGES.CONTACT_INQUIRY_SUBMITTED);
}

// ============================================================================
// SYSADMIN — List Demo Requests
// ============================================================================

async function listDemoRequests(req, res) {
    const { page, limit, offset } = getPagination(req.validated);
    const { status, college_type, search, date_from, date_to } = req.validated;

    const { rows, total } = await submissionsService.listDemoRequests({
        page, limit, offset, status, college_type, search, date_from, date_to,
    });

    return sendPaginated(res, rows, total, { page, limit }, SUCCESS_MESSAGES.DEMO_REQUESTS_RETRIEVED);
}

// ============================================================================
// SYSADMIN — Get Demo Request Detail
// ============================================================================

async function getDemoRequest(req, res) {
    const { id } = req.params;
    const result = await submissionsService.getDemoRequestById(id);
    return sendSuccess(res, result, SUCCESS_MESSAGES.DEMO_REQUEST_RETRIEVED);
}

// ============================================================================
// SYSADMIN — Update Demo Request Status
// ============================================================================

async function updateDemoRequestStatus(req, res) {
    const { id } = req.params;
    const data = req.validated;
    const result = await submissionsService.updateDemoRequestStatus(id, data);
    return sendSuccess(res, result, SUCCESS_MESSAGES.DEMO_REQUEST_STATUS_UPDATED);
}

// ============================================================================
// SYSADMIN — Add Demo Request Note
// ============================================================================

async function addDemoRequestNote(req, res) {
    const { id } = req.params;
    const { note } = req.validated;
    const createdBy = req.user?.email || 'sysadmin';
    const result = await submissionsService.addNote('demo_request', id, note, createdBy);
    return sendCreated(res, result, SUCCESS_MESSAGES.DEMO_REQUEST_NOTE_ADDED);
}

// ============================================================================
// SYSADMIN — List Contact Inquiries
// ============================================================================

async function listContactInquiries(req, res) {
    const { page, limit, offset } = getPagination(req.validated);
    const { status, search, date_from, date_to } = req.validated;

    const { rows, total } = await submissionsService.listContactInquiries({
        page, limit, offset, status, search, date_from, date_to,
    });

    return sendPaginated(res, rows, total, { page, limit }, SUCCESS_MESSAGES.CONTACT_INQUIRIES_RETRIEVED);
}

// ============================================================================
// SYSADMIN — Get Contact Inquiry Detail
// ============================================================================

async function getContactInquiry(req, res) {
    const { id } = req.params;
    const result = await submissionsService.getContactInquiryById(id);
    return sendSuccess(res, result, SUCCESS_MESSAGES.CONTACT_INQUIRY_RETRIEVED);
}

// ============================================================================
// SYSADMIN — Update Contact Inquiry Status
// ============================================================================

async function updateContactInquiryStatus(req, res) {
    const { id } = req.params;
    const data = req.validated;
    const result = await submissionsService.updateContactInquiryStatus(id, data);
    return sendSuccess(res, result, SUCCESS_MESSAGES.CONTACT_INQUIRY_STATUS_UPDATED);
}

// ============================================================================
// SYSADMIN — Add Contact Inquiry Note
// ============================================================================

async function addContactInquiryNote(req, res) {
    const { id } = req.params;
    const { note } = req.validated;
    const createdBy = req.user?.email || 'sysadmin';
    const result = await submissionsService.addNote('contact_inquiry', id, note, createdBy);
    return sendCreated(res, result, SUCCESS_MESSAGES.CONTACT_INQUIRY_NOTE_ADDED);
}

// ============================================================================
// SYSADMIN — Submission Stats
// ============================================================================

async function getSubmissionStats(req, res) {
    const stats = await submissionsService.getSubmissionStats();
    return sendSuccess(res, stats, SUCCESS_MESSAGES.SUBMISSION_STATS_RETRIEVED);
}

module.exports = {
    submitDemoRequest,
    submitContactInquiry,
    listDemoRequests,
    getDemoRequest,
    updateDemoRequestStatus,
    addDemoRequestNote,
    listContactInquiries,
    getContactInquiry,
    updateContactInquiryStatus,
    addContactInquiryNote,
    getSubmissionStats,
};
