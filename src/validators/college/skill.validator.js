/**
 * ============================================================================
 * COLLEGE SKILL VALIDATORS — Skills Master Management
 * ============================================================================
 * Joi schemas for:
 *   #103 POST   /api/college/create_skill
 *   #104 GET    /api/college/get_all_skills
 *   #106 PUT    /api/college/update_skill/:skillId
 * ============================================================================
 */

const Joi = require('joi');
const { SKILL_CATEGORIES } = require('../../config/constants');

// ============================================================================
// #103 — Create Skill
// ============================================================================

const createSkillSchema = Joi.object({
    skill_name: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Skill name is required',
            'string.max': 'Skill name cannot exceed 100 characters',
            'any.required': 'Skill name is required',
        }),

    skill_category: Joi.string()
        .trim()
        .valid(...SKILL_CATEGORIES)
        .required()
        .messages({
            'any.only': `Category must be one of: ${SKILL_CATEGORIES.join(', ')}`,
            'any.required': 'Skill category is required',
        }),
});

// ============================================================================
// #104 — List Skills (query params)
// ============================================================================

const listSkillsSchema = Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(50),

    search: Joi.string().trim().max(100).allow('').optional(),

    skill_category: Joi.string().trim().valid(...SKILL_CATEGORIES).optional(),

    sort_by: Joi.string()
        .valid('skill_name', 'created_at', 'skill_category')
        .optional()
        .default('skill_name'),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('asc'),
});

// ============================================================================
// #105 — Delete Skill (param)
// ============================================================================

const skillIdParamSchema = Joi.object({
    skillId: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid skill ID format',
            'any.required': 'Skill ID is required',
        }),
});

// ============================================================================
// #106 — Update Skill (partial — at least one field required)
// ============================================================================

const updateSkillSchema = Joi.object({
    skill_name: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .optional()
        .messages({
            'string.empty': 'Skill name cannot be empty',
            'string.max': 'Skill name cannot exceed 100 characters',
        }),

    skill_category: Joi.string()
        .trim()
        .valid(...SKILL_CATEGORIES)
        .optional()
        .messages({
            'any.only': `Category must be one of: ${SKILL_CATEGORIES.join(', ')}`,
        }),
}).min(1).messages({
    'object.min': 'At least one field (skill_name or skill_category) must be provided',
});

module.exports = {
    createSkillSchema,
    listSkillsSchema,
    skillIdParamSchema,
    updateSkillSchema,
};
