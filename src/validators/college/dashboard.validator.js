/**
 * ============================================================================
 * COLLEGE DASHBOARD VALIDATORS — Dashboard & Statistics Query Schemas
 * ============================================================================
 *   #105  passoutYearSchema       → overview, placement_stats, funnel, diversity, training, readiness
 *   #106  departmentWiseSchema    → department_wise (optional dept_id)
 *   #107  companyWiseSchema       → company_wise (optional company_id)
 *   #108  yearComparisonSchema    → year_comparison (comma-separated years)
 * ============================================================================
 */

const Joi = require('joi');

// Shared: passout_year only (used by 5 endpoints)
const passoutYearSchema = Joi.object({
    passout_year: Joi.number().integer().min(2000).max(2100).required(),
});

// #106 — Department-wise stats (optional dept_id for detail view)
const departmentWiseSchema = Joi.object({
    passout_year: Joi.number().integer().min(2000).max(2100).required(),
    dept_id: Joi.string().uuid().optional(),
});

// #107 — Company-wise stats (optional company_id for detail view)
const companyWiseSchema = Joi.object({
    passout_year: Joi.number().integer().min(2000).max(2100).required(),
    company_id: Joi.string().uuid().optional(),
});

// #108 — Year comparison (2-5 comma-separated years)
const yearComparisonSchema = Joi.object({
    passout_years: Joi.string()
        .trim()
        .required()
        .pattern(/^\d{4}(,\d{4}){1,4}$/)
        .messages({
            'string.pattern.base':
                'passout_years must be 2-5 comma-separated years (e.g., 2024,2023,2022)',
        }),
});

module.exports = {
    passoutYearSchema,
    departmentWiseSchema,
    companyWiseSchema,
    yearComparisonSchema,
};
