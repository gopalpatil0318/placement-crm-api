/**
 * ============================================================================
 * COLLEGE SKILL VALIDATORS — Skills Master Management
 * ============================================================================
 * Joi schemas for:
 *   #103 POST /api/college/create_skill
 *   #104 GET  /api/college/get_all_skills
 * ============================================================================
 */

const Joi = require('joi');

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
        .max(100)
        .allow(null, '')
        .optional()
        .messages({
            'string.max': 'Skill category cannot exceed 100 characters',
        }),
});

// ============================================================================
// #104 — List Skills (query params)
// ============================================================================

const listSkillsSchema = Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(50),

    search: Joi.string().trim().max(100).allow('').optional(),

    skill_category: Joi.string().trim().max(100).optional(),

    sort_by: Joi.string()
        .valid('skill_name', 'created_at', 'skill_category')
        .optional()
        .default('skill_name'),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('asc'),
});

module.exports = {
    createSkillSchema,
    listSkillsSchema,
};
