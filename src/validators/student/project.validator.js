/**
 * ============================================================================
 * STUDENT PROJECT VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - addProjectSchema      POST /api/student/add_project
 *   - updateProjectSchema   PUT  /api/student/update_project/:projectId
 * ============================================================================
 */

const Joi = require('joi');

// Enum values matching schema CHECK constraint
const VALID_PROJECT_TYPES = ['academic', 'personal', 'internship', 'freelance', 'research', 'open_source'];

// ============================================================================
// ADD PROJECT
// ============================================================================

const addProjectSchema = Joi.object({
    project_title: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Project title is required',
            'string.min': 'Project title must be at least 2 characters',
            'string.max': 'Project title cannot exceed 200 characters',
            'any.required': 'Project title is required',
        }),

    project_description: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Description cannot exceed 2000 characters',
        }),

    project_type: Joi.string()
        .valid(...VALID_PROJECT_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Project type must be one of: ${VALID_PROJECT_TYPES.join(', ')}`,
        }),

    project_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Project URL must be a valid URL',
            'string.max': 'URL cannot exceed 500 characters',
        }),

    github_link: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'GitHub link must be a valid URL',
            'string.max': 'URL cannot exceed 500 characters',
        }),

    demo_link: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Demo link must be a valid URL',
            'string.max': 'URL cannot exceed 500 characters',
        }),

    technologies_used: Joi.array()
        .items(Joi.string().max(50))
        .max(20)
        .optional()
        .allow(null)
        .default([])
        .messages({
            'array.max': 'Cannot list more than 20 technologies',
        }),

    start_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Start date must be in YYYY-MM-DD format',
        }),

    end_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'End date must be in YYYY-MM-DD format',
        }),

    is_ongoing: Joi.boolean()
        .optional()
        .default(false)
        .messages({
            'boolean.base': 'is_ongoing must be true or false',
        }),

    team_size: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Team size must be at least 1',
            'number.max': 'Team size cannot exceed 100',
            'number.integer': 'Team size must be a whole number',
        }),

    role_in_project: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Role cannot exceed 100 characters',
        }),

    display_order: Joi.number()
        .integer()
        .min(1)
        .max(10)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Display order must be at least 1',
            'number.max': 'Display order cannot exceed 10',
        }),

    is_featured: Joi.boolean()
        .optional()
        .default(false)
        .messages({
            'boolean.base': 'is_featured must be true or false',
        }),
});

// ============================================================================
// UPDATE PROJECT (all fields optional, at least 1 required)
// ============================================================================

const updateProjectSchema = Joi.object({
    project_title: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Project title must be at least 2 characters',
            'string.max': 'Project title cannot exceed 200 characters',
        }),

    project_description: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Description cannot exceed 2000 characters',
        }),

    project_type: Joi.string()
        .valid(...VALID_PROJECT_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Project type must be one of: ${VALID_PROJECT_TYPES.join(', ')}`,
        }),

    project_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Project URL must be a valid URL',
        }),

    github_link: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'GitHub link must be a valid URL',
        }),

    demo_link: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Demo link must be a valid URL',
        }),

    technologies_used: Joi.array()
        .items(Joi.string().max(50))
        .max(20)
        .optional()
        .allow(null)
        .messages({
            'array.max': 'Cannot list more than 20 technologies',
        }),

    start_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Start date must be in YYYY-MM-DD format',
        }),

    end_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'End date must be in YYYY-MM-DD format',
        }),

    is_ongoing: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_ongoing must be true or false',
        }),

    team_size: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Team size must be at least 1',
            'number.max': 'Team size cannot exceed 100',
        }),

    role_in_project: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Role cannot exceed 100 characters',
        }),

    display_order: Joi.number()
        .integer()
        .min(1)
        .max(10)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Display order must be at least 1',
            'number.max': 'Display order cannot exceed 10',
        }),

    is_featured: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_featured must be true or false',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addProjectSchema,
    updateProjectSchema,
};
