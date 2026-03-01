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

const VALID_PROFICIENCY = ['beginner', 'intermediate', 'advanced', 'expert'];
const VALID_SKILL_CATEGORIES = [
    'programming_language', 'framework', 'database', 'devops',
    'cloud', 'design', 'testing', 'soft_skill', 'tool', 'other',
];

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
        .valid(...VALID_SKILL_CATEGORIES)
        .optional()
        .allow(null, '')
        .messages({
            'any.only': `Category must be one of: ${VALID_SKILL_CATEGORIES.join(', ')}`,
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
// EXPORTS
// ============================================================================

module.exports = {
    addSkillSchema,
    syncMySkillsSchema,
};
