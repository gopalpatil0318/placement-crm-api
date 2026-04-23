/**
 * ============================================================================
 * STUDENT COMPANY SEARCH ROUTES — Lightweight Company Lookup
 * ============================================================================
 * Base path: /api/student/companies (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET /search?q=atlass&limit=10    authenticate + apiLimiter + validate(query)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/companySearch.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { searchCompaniesSchema } = require('../../validators/student/companySearch.validator');

router.get(
    '/search',
    authenticate,
    apiLimiter,
    validate(searchCompaniesSchema, 'query'),
    asyncHandler(controller.search)
);

module.exports = router;
