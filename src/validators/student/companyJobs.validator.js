/**
 * ============================================================================
 * STUDENT COMPANY JOBS VALIDATOR
 * ============================================================================
 *   GET /api/student/company-jobs/:companyId
 * ============================================================================
 */

const Joi = require('joi');

const companyJobsParamSchema = Joi.object({
    companyId: Joi.string().uuid().required().messages({
        'string.guid': 'Company ID must be a valid UUID',
        'any.required': 'Company ID is required',
    }),
});

module.exports = { companyJobsParamSchema };
