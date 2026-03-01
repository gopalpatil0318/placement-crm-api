/**
 * ============================================================================
 * STUDENT ACHIEVEMENT VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - addAchievementSchema      POST /api/student/add_achievement
 *   - updateAchievementSchema   PUT  /api/student/update_achievement/:achievementId
 * ============================================================================
 */

const Joi = require('joi');

// Enum values matching schema CHECK constraints
const VALID_ACHIEVEMENT_TYPES = ['competition', 'hackathon', 'award', 'certification', 'publication', 'research', 'sports', 'cultural'];
const VALID_ACHIEVEMENT_LEVELS = ['international', 'national', 'state', 'university', 'college', 'departmental'];

// ============================================================================
// ADD ACHIEVEMENT
// ============================================================================

const addAchievementSchema = Joi.object({
    achievement_title: Joi.string()
        .min(2)
        .max(300)
        .required()
        .messages({
            'string.empty': 'Achievement title is required',
            'string.min': 'Title must be at least 2 characters',
            'string.max': 'Title cannot exceed 300 characters',
            'any.required': 'Achievement title is required',
        }),

    achievement_description: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Description cannot exceed 2000 characters',
        }),

    achievement_type: Joi.string()
        .valid(...VALID_ACHIEVEMENT_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Achievement type must be one of: ${VALID_ACHIEVEMENT_TYPES.join(', ')}`,
        }),

    issuing_organization: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Organization name cannot exceed 200 characters',
        }),

    event_name: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Event name cannot exceed 200 characters',
        }),

    achievement_level: Joi.string()
        .valid(...VALID_ACHIEVEMENT_LEVELS)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Level must be one of: ${VALID_ACHIEVEMENT_LEVELS.join(', ')}`,
        }),

    position_rank: Joi.string()
        .max(50)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Position/rank cannot exceed 50 characters',
        }),

    participants_count: Joi.number()
        .integer()
        .min(1)
        .max(1000000)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Participants count must be at least 1',
            'number.max': 'Participants count is too large',
            'number.integer': 'Participants count must be a whole number',
        }),

    achievement_date: Joi.date()
        .iso()
        .max('now')
        .optional()
        .allow(null)
        .messages({
            'date.max': 'Achievement date cannot be in the future',
            'date.format': 'Date must be in YYYY-MM-DD format',
        }),

    certificate_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Certificate URL must be a valid URL',
        }),

    proof_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Proof URL must be a valid URL',
        }),

    is_featured: Joi.boolean()
        .optional()
        .default(false)
        .messages({
            'boolean.base': 'is_featured must be true or false',
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
});

// ============================================================================
// UPDATE ACHIEVEMENT (all fields optional, at least 1 required)
// ============================================================================

const updateAchievementSchema = Joi.object({
    achievement_title: Joi.string()
        .min(2)
        .max(300)
        .optional()
        .messages({
            'string.min': 'Title must be at least 2 characters',
            'string.max': 'Title cannot exceed 300 characters',
        }),

    achievement_description: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Description cannot exceed 2000 characters',
        }),

    achievement_type: Joi.string()
        .valid(...VALID_ACHIEVEMENT_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Achievement type must be one of: ${VALID_ACHIEVEMENT_TYPES.join(', ')}`,
        }),

    issuing_organization: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Organization name cannot exceed 200 characters',
        }),

    event_name: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Event name cannot exceed 200 characters',
        }),

    achievement_level: Joi.string()
        .valid(...VALID_ACHIEVEMENT_LEVELS)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Level must be one of: ${VALID_ACHIEVEMENT_LEVELS.join(', ')}`,
        }),

    position_rank: Joi.string()
        .max(50)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Position/rank cannot exceed 50 characters',
        }),

    participants_count: Joi.number()
        .integer()
        .min(1)
        .max(1000000)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Participants count must be at least 1',
        }),

    achievement_date: Joi.date()
        .iso()
        .max('now')
        .optional()
        .allow(null)
        .messages({
            'date.max': 'Achievement date cannot be in the future',
        }),

    certificate_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Certificate URL must be a valid URL',
        }),

    proof_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Proof URL must be a valid URL',
        }),

    is_featured: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_featured must be true or false',
        }),

    display_order: Joi.number()
        .integer()
        .min(1)
        .max(10)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Display order must be at least 1',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addAchievementSchema,
    updateAchievementSchema,
};
