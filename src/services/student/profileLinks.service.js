/**
 * ============================================================================
 * STUDENT PROFILE LINKS SERVICE — Upsert (Save) + Get
 * ============================================================================
 * Functions:
 *   - saveProfileLinks(studentId, collegeId, data)  — Create or update
 *   - getProfileLinks(studentId, collegeId)          — Get links
 *
 * Uses PostgreSQL INSERT ... ON CONFLICT (student_id) DO UPDATE
 * Same upsert pattern as personal_info and academic_info.
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG, ERROR_MESSAGES } = require('../../config/constants');

// All upsertable columns
const LINK_FIELDS = [
    'personal_portfolio_url', 'resume_url', 'profile_image_url',
    'github_url', 'linkedin_url',
    'leetcode_url', 'codechef_url', 'codeforces_url',
    'hackerrank_url', 'geeksforgeeks_url', 'medium_url',
    'bio', 'area_of_interest',
];

// ============================================================================
// 1. SAVE PROFILE LINKS (Upsert — ON CONFLICT DO UPDATE)
// ============================================================================

async function saveProfileLinks(studentId, collegeId, data) {
    // 1. Verify student exists
    const studentCheck = await query(
        `SELECT student_id FROM students WHERE student_id = $1 AND college_id = $2 LIMIT 1`,
        [studentId, collegeId]
    );

    if (!studentCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    // 2. Build column lists for insert
    const fieldsPresent = LINK_FIELDS.filter(f => data[f] !== undefined);
    const insertColumns = ['student_id', 'college_id', ...fieldsPresent];
    const insertValues = [studentId, collegeId, ...fieldsPresent.map(f => data[f])];
    const placeholders = insertValues.map((_, i) => `$${i + 1}`);

    // 3. Build SET clause for ON CONFLICT — update only provided fields
    const updateSet = fieldsPresent
        .map((field, index) => `${field} = $${index + 3}`)
        .concat(['updated_at = NOW()']);

    const result = await query(
        `INSERT INTO student_profile_links (${insertColumns.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT (student_id)
         DO UPDATE SET ${updateSet.join(', ')}
         RETURNING *,
           (xmax = 0) AS is_new`,
        insertValues
    );

    const isNew = result.rows[0].is_new;
    const record = result.rows[0];

    logger.info(`${LOG.API_END} Profile links ${isNew ? 'created' : 'updated'}`, {
        studentId,
        is_new: isNew,
    });

    return {
        is_new: isNew,
        data: formatProfileLinks(record),
    };
}

// ============================================================================
// 2. GET PROFILE LINKS
// ============================================================================

async function getProfileLinks(studentId, collegeId) {
    const result = await query(
        `SELECT * FROM student_profile_links
         WHERE student_id = $1 AND college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!result.rows.length) {
        return null;
    }

    return formatProfileLinks(result.rows[0]);
}

// ============================================================================
// HELPER — Format response
// ============================================================================

function formatProfileLinks(record) {
    return {
        personal_portfolio_url: record.personal_portfolio_url,
        resume_url: record.resume_url,
        profile_image_url: record.profile_image_url,
        github_url: record.github_url,
        linkedin_url: record.linkedin_url,
        leetcode_url: record.leetcode_url,
        codechef_url: record.codechef_url,
        codeforces_url: record.codeforces_url,
        hackerrank_url: record.hackerrank_url,
        geeksforgeeks_url: record.geeksforgeeks_url,
        medium_url: record.medium_url,
        bio: record.bio,
        area_of_interest: record.area_of_interest,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    saveProfileLinks,
    getProfileLinks,
};
