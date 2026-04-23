/**
 * ============================================================================
 * COMPANY VALIDATORS — Joi Schemas for Company Management
 * ============================================================================
 *   - createCompanySchema            POST  /create_company
 *   - listCompaniesSchema            GET   /get_all_companies (query)
 *   - updateCompanySchema            PUT   /update_company/:companyId
 *   - toggleCompanyStatusSchema      PATCH /toggle_company_status/:companyId
 * ============================================================================
 */

const Joi = require('joi');
const { STATUS } = require('../../config/constants');

// ============================================================================
// CREATE COMPANY
// ============================================================================

const createCompanySchema = Joi.object({
    company_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Company name is required',
            'string.min': 'Company name must be at least 2 characters',
            'string.max': 'Company name cannot exceed 200 characters',
            'any.required': 'Company name is required',
        }),

    company_description: Joi.string()
        .max(3000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Company description cannot exceed 3000 characters',
        }),

    company_website: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Please provide a valid website URL (e.g. https://example.com)',
            'string.max': 'Website URL cannot exceed 500 characters',
        }),

    industry: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Industry cannot exceed 100 characters',
        }),

    company_logo: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Logo path cannot exceed 500 characters',
        }),
});

// ============================================================================
// LIST COMPANIES (query params)
// ============================================================================

const listCompaniesSchema = Joi.object({
    company_status: Joi.string()
        .valid(STATUS.COMPANY.ACTIVE, STATUS.COMPANY.INACTIVE)
        .optional()
        .messages({
            'any.only': `Status must be one of: ${Object.values(STATUS.COMPANY).join(', ')}`,
        }),

    industry: Joi.string()
        .max(100)
        .optional(),

    search: Joi.string()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Search query cannot exceed 100 characters',
        }),

    sort_by: Joi.string()
        .valid('company_name', 'created_at', 'updated_at', 'industry')
        .optional()
        .default('created_at')
        .messages({
            'any.only': 'Sort must be by: company_name, created_at, updated_at, or industry',
        }),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc')
        .messages({
            'any.only': 'Sort order must be asc or desc',
        }),

    page: Joi.number()
        .positive()
        .optional()
        .default(1),

    limit: Joi.number()
        .positive()
        .max(100)
        .optional()
        .default(20),
});

// ============================================================================
// UPDATE COMPANY
// ============================================================================

const updateCompanySchema = Joi.object({
    company_name: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Company name must be at least 2 characters',
            'string.max': 'Company name cannot exceed 200 characters',
        }),

    company_description: Joi.string()
        .max(3000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Company description cannot exceed 3000 characters',
        }),

    company_website: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Please provide a valid website URL',
            'string.max': 'Website URL cannot exceed 500 characters',
        }),

    industry: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Industry cannot exceed 100 characters',
        }),

    company_logo: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Logo path cannot exceed 500 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// TOGGLE COMPANY STATUS
// ============================================================================

const toggleCompanyStatusSchema = Joi.object({
    company_status: Joi.string()
        .valid(STATUS.COMPANY.ACTIVE, STATUS.COMPANY.INACTIVE)
        .required()
        .messages({
            'any.only': `Status must be one of: ${Object.values(STATUS.COMPANY).join(', ')}`,
            'any.required': 'Company status is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS — UUID validation for route parameters
// ============================================================================

const companyIdParamSchema = Joi.object({
    companyId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid company ID format',
        'any.required': 'Company ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createCompanySchema,
    listCompaniesSchema,
    updateCompanySchema,
    toggleCompanyStatusSchema,
    companyIdParamSchema,
};
