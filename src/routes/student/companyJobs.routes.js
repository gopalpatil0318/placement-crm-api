/**
 * ============================================================================
 * STUDENT COMPANY JOBS ROUTES — Off-campus jobs at a company
 * ============================================================================
 * Base path: /api/student/company-jobs (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET /:companyId    authenticate + validate(params) + controller
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/companyJobs.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { companyJobsParamSchema } = require('../../validators/student/companyJobs.validator');

router.get(
    '/:companyId',
    authenticate,
    validate(companyJobsParamSchema, 'params'),
    asyncHandler(controller.listCompanyJobs)
);

module.exports = router;
