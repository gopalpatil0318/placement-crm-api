/**
 * ============================================================================
 * STUDENT ACHIEVEMENT SERVICE — CRUD with Max 10 Limit
 * ============================================================================
 * Functions:
 *   - addAchievement(studentId, collegeId, data)
 *   - getAllAchievements(studentId, collegeId)
 *   - updateAchievement(achievementId, studentId, collegeId, data)
 *   - deleteAchievement(achievementId, studentId, collegeId)
 *
 * Business Rules:
 *   - Maximum 10 achievements per student
 *   - is_verified is read-only (set by college admin)
 *   - Ownership check on update/delete
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG } = require('../../config/constants');

const MAX_ACHIEVEMENTS = 10;

// All insertable/updatable columns (excludes is_verified — admin only)
const ACHIEVEMENT_FIELDS = [
    'achievement_title', 'achievement_description', 'achievement_type',
    'issuing_organization', 'event_name', 'achievement_level',
    'position_rank', 'participants_count', 'achievement_date',
    'certificate_url', 'proof_url', 'is_featured', 'display_order',
];

// ============================================================================
// 1. ADD ACHIEVEMENT
// ============================================================================

async function addAchievement(studentId, collegeId, data) {
    // 1. Check max limit
    const countResult = await query(
        `SELECT COUNT(*) AS cnt FROM student_achievements
         WHERE student_id = $1 AND college_id = $2`,
        [studentId, collegeId]
    );

    const currentCount = parseInt(countResult.rows[0].cnt);
    if (currentCount >= MAX_ACHIEVEMENTS) {
        throw Object.assign(
            new Error(`Maximum ${MAX_ACHIEVEMENTS} achievements allowed. Please remove an existing one before adding new`),
            { status: 400 }
        );
    }

    // 2. Build insert
    const fieldsToInsert = ACHIEVEMENT_FIELDS.filter(f => data[f] !== undefined);
    const insertColumns = ['student_id', 'college_id', ...fieldsToInsert];
    const insertValues = [studentId, collegeId, ...fieldsToInsert.map(f => data[f])];
    const placeholders = insertValues.map((_, i) => `$${i + 1}`);

    const result = await query(
        `INSERT INTO student_achievements (${insertColumns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        insertValues
    );

    logger.info(`${LOG.API_END} Achievement added`, {
        studentId,
        achievement_id: result.rows[0].achievement_id,
        achievement_count: currentCount + 1,
    });

    return formatAchievement(result.rows[0]);
}

// ============================================================================
// 2. GET ALL ACHIEVEMENTS
// ============================================================================

async function getAllAchievements(studentId, collegeId) {
    const result = await query(
        `SELECT * FROM student_achievements
         WHERE student_id = $1 AND college_id = $2
         ORDER BY display_order ASC NULLS LAST, achievement_date DESC NULLS LAST`,
        [studentId, collegeId]
    );

    return {
        total_achievements: result.rows.length,
        max_achievements: MAX_ACHIEVEMENTS,
        achievements: result.rows.map(formatAchievement),
    };
}

// ============================================================================
// 3. UPDATE ACHIEVEMENT
// ============================================================================

async function updateAchievement(achievementId, studentId, collegeId, data) {
    const fieldsToUpdate = ACHIEVEMENT_FIELDS.filter(f => data[f] !== undefined);

    if (fieldsToUpdate.length === 0) {
        throw Object.assign(new Error('At least one field must be provided to update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 4}`)
        .concat([
            'updated_at = NOW()',
            "verification_status = 'pending'",
            'is_verified = false',
            'verified_by = NULL',
            'verified_at = NULL',
            'rejection_reason = NULL',
            'rejected_at = NULL',
        ]);

    const values = [
        achievementId, studentId, collegeId,
        ...fieldsToUpdate.map(f => data[f]),
    ];

    const result = await query(
        `UPDATE student_achievements
         SET ${setClauses.join(', ')}
         WHERE achievement_id = $1 AND student_id = $2 AND college_id = $3
         RETURNING *`,
        values
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error('Achievement not found or does not belong to you'),
            { status: 404 }
        );
    }

    logger.info(`${LOG.API_END} Achievement updated`, {
        studentId,
        achievement_id: achievementId,
    });

    return formatAchievement(result.rows[0]);
}

// ============================================================================
// 4. DELETE ACHIEVEMENT
// ============================================================================

async function deleteAchievement(achievementId, studentId, collegeId) {
    const result = await query(
        `DELETE FROM student_achievements
         WHERE achievement_id = $1 AND student_id = $2 AND college_id = $3
         RETURNING achievement_id, achievement_title`,
        [achievementId, studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error('Achievement not found or does not belong to you'),
            { status: 404 }
        );
    }

    logger.info(`${LOG.API_END} Achievement deleted`, {
        studentId,
        achievement_id: achievementId,
        title: result.rows[0].achievement_title,
    });

    return result.rows[0];
}

// ============================================================================
// HELPER — Format achievement response
// ============================================================================

function formatAchievement(record) {
    return {
        achievement_id: record.achievement_id,
        achievement_title: record.achievement_title,
        achievement_description: record.achievement_description,
        achievement_type: record.achievement_type,
        issuing_organization: record.issuing_organization,
        event_name: record.event_name,
        achievement_level: record.achievement_level,
        position_rank: record.position_rank,
        participants_count: record.participants_count,
        achievement_date: record.achievement_date,
        certificate_url: record.certificate_url,
        proof_url: record.proof_url,
        is_verified: record.is_verified,
        verification_status: record.verification_status,
        verified_by: record.verified_by,
        verified_at: record.verified_at,
        rejection_reason: record.rejection_reason,
        rejected_at: record.rejected_at,
        is_featured: record.is_featured,
        display_order: record.display_order,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addAchievement,
    getAllAchievements,
    updateAchievement,
    deleteAchievement,
};
