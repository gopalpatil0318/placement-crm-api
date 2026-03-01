/**
 * ============================================================================
 * STUDENT PROFILE LINKS VALIDATORS — Joi Schema
 * ============================================================================
 * Schema:
 *   - saveProfileLinksSchema   PUT /api/student/save_profile_links (upsert)
 *
 * ALL fields are optional — student fills what they have.
 * Only professional/technical links — no social media.
 * ============================================================================
 */

const Joi = require('joi');

// URL validation helper — optional, allow null/empty
const optionalUrl = (label) =>
    Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': `${label} must be a valid URL`,
            'string.max': `${label} cannot exceed 500 characters`,
        });

// ============================================================================
// SAVE PROFILE LINKS (upsert — create or update)
// ============================================================================

const saveProfileLinksSchema = Joi.object({
    // ── PORTFOLIO & RESUME ──
    personal_portfolio_url: optionalUrl('Portfolio URL'),
    resume_url: optionalUrl('Resume URL'),
    profile_image_url: optionalUrl('Profile image URL'),

    // ── PROFESSIONAL PLATFORMS ──
    github_url: optionalUrl('GitHub URL'),
    linkedin_url: optionalUrl('LinkedIn URL'),

    // ── COMPETITIVE PROGRAMMING ──
    leetcode_url: optionalUrl('LeetCode URL'),
    codechef_url: optionalUrl('CodeChef URL'),
    codeforces_url: optionalUrl('Codeforces URL'),
    hackerrank_url: optionalUrl('HackerRank URL'),
    geeksforgeeks_url: optionalUrl('GeeksforGeeks URL'),

    // ── BLOG / WRITING ──
    medium_url: optionalUrl('Medium URL'),

    // ── BIO & INTERESTS ──
    bio: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Bio cannot exceed 500 characters',
        }),

    area_of_interest: Joi.array()
        .items(Joi.string().max(50))
        .max(10)
        .optional()
        .allow(null)
        .default([])
        .messages({
            'array.max': 'Cannot list more than 10 areas of interest',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided',
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    saveProfileLinksSchema,
};
