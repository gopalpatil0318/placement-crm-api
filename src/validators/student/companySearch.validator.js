/**
 * ============================================================================
 * STUDENT COMPANY SEARCH VALIDATOR — Joi Schema
 * ============================================================================
 *   GET /api/student/companies/search?q=...&limit=10
 * ============================================================================
 */

const Joi = require('joi');

const searchCompaniesSchema = Joi.object({
    q: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Search query is required',
            'string.min': 'Search query must be at least 2 characters',
            'any.required': 'Search query is required',
        }),
    limit: Joi.number().integer().min(1).max(10).optional().default(10),
});

module.exports = { searchCompaniesSchema };
