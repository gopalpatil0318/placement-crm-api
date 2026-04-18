/**
 * ============================================================================
 * STUDENT SKILL VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - addSkillSchema       POST /api/student/add_skill (master table)
 *   - syncMySkillsSchema   PUT  /api/student/sync_my_skills
 * ============================================================================
 */

const Joi = require('joi');
const { SKILL_CATEGORIES } = require('../../config/constants');

const VALID_PROFICIENCY = ['beginner', 'intermediate', 'advanced', 'expert'];

// ============================================================================
// ADD SKILL (to master skills table)
// ============================================================================

const addSkillSchema = Joi.object({
    skill_name: Joi.string()
        .min(1)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Skill name is required',
            'string.max': 'Skill name cannot exceed 100 characters',
            'any.required': 'Skill name is required',
        }),

    skill_category: Joi.string()
        .valid(...SKILL_CATEGORIES)
        .required()
        .messages({
            'any.only': `Category must be one of: ${SKILL_CATEGORIES.join(', ')}`,
            'any.required': 'Skill category is required',
        }),
});

// ============================================================================
// SYNC MY SKILLS (smart array sync — add/remove/update proficiency)
// ============================================================================

const syncMySkillsSchema = Joi.object({
    skills: Joi.array()
        .items(
            Joi.object({
                skill_id: Joi.string()
                    .uuid()
                    .required()
                    .messages({
                        'string.guid': 'Invalid skill ID format',
                        'any.required': 'skill_id is required for each skill',
                    }),
                proficiency_level: Joi.string()
                    .valid(...VALID_PROFICIENCY)
                    .required()
                    .messages({
                        'any.only': `Proficiency must be one of: ${VALID_PROFICIENCY.join(', ')}`,
                        'any.required': 'proficiency_level is required for each skill',
                    }),
            })
        )
        .min(0)
        .required()
        .messages({
            'array.base': 'Skills must be an array',
            'any.required': 'Skills array is required',
        }),
});

// ============================================================================
// PARAM SCHEMAS (URL params — UUID validation)
// ============================================================================

const skillIdParamSchema = Joi.object({
    skillId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid skill ID format',
        'any.required': 'Skill ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addSkillSchema,
    syncMySkillsSchema,
    skillIdParamSchema,
};
