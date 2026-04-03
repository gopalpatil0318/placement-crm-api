/**
 * ============================================================================
 * VERIFICATION SERVICE — Verification/Approval of Student Data
 * ============================================================================
 *   - getPendingVerificationCounts(collegeId)
 *   - getPendingProfiles(collegeId, filters)
 *   - getPendingExperiences(collegeId, filters)
 *   - getPendingAchievements(collegeId, filters)
 *   - getPendingCertificates(collegeId, filters)
 *   - verifyStudentProfile(studentId, collegeId, userId, action, rejectionReason)
 *   - verifyExperience(experienceId, collegeId, userId, action, rejectionReason)
 *   - verifyAchievement(achievementId, collegeId, userId, action, rejectionReason)
 *   - verifyCertificate(certificateId, collegeId, userId, action, rejectionReason)
 *   - bulkVerifyProfiles(ids, collegeId, userId, action, rejectionReason)
 *   - bulkVerifyExperiences(ids, collegeId, userId, action, rejectionReason)
 *   - bulkVerifyAchievements(ids, collegeId, userId, action, rejectionReason)
 *   - bulkVerifyCertificates(ids, collegeId, userId, action, rejectionReason)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const studentService = require('./student.service');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// Sort columns that live on the students (s) table — others use the item table alias
const STUDENT_SORT_COLUMNS = Object.freeze({
    first_name: 's',
    last_name: 's',
});

// Safeguard: only these columns/orders can be interpolated into SQL
const VALID_SORT_COLUMNS = new Set(['created_at', 'updated_at', 'first_name', 'last_name']);
const VALID_SORT_ORDERS = new Set(['ASC', 'DESC']);

// ============================================================================
// 1. GET PENDING VERIFICATION COUNTS (Dashboard)
// ============================================================================

async function getPendingVerificationCounts(collegeId) {
    // Single query with subqueries — 1 round-trip instead of 4
    const result = await query(
        `SELECT
           (SELECT COUNT(*) FROM students
            WHERE college_id = $1 AND profile_complete = true AND profile_approval_status = $2) AS profiles,
           (SELECT COUNT(*) FROM student_experience e
            JOIN students s ON e.student_id = s.student_id
            WHERE e.college_id = $1 AND e.verification_status = $2
              AND s.profile_approval_status = $3) AS experiences,
           (SELECT COUNT(*) FROM student_achievements a
            JOIN students s ON a.student_id = s.student_id
            WHERE a.college_id = $1 AND a.verification_status = $2
              AND s.profile_approval_status = $3) AS achievements,
           (SELECT COUNT(*) FROM student_certificates c
            JOIN students s ON c.student_id = s.student_id
            WHERE c.college_id = $1 AND c.verification_status = $2
              AND s.profile_approval_status = $3) AS certificates`,
        [collegeId, STATUS.VERIFICATION.PENDING, STATUS.VERIFICATION.APPROVED]
    );

    const row = result.rows[0];
    const profiles = Number.parseInt(row.profiles ?? '0', 10);
    const experiences = Number.parseInt(row.experiences ?? '0', 10);
    const achievements = Number.parseInt(row.achievements ?? '0', 10);
    const certificates = Number.parseInt(row.certificates ?? '0', 10);

    return {
        profiles,
        experiences,
        achievements,
        certificates,
        total: profiles + experiences + achievements + certificates,
    };
}

// ============================================================================
// HELPER — Build WHERE + params for pending list filters
// ============================================================================

function buildStudentFilters(collegeId, filters, tableAlias = 's') {
    const conditions = [`${tableAlias}.college_id = $1`];
    const params = [collegeId];
    let paramIndex = 2;

    if (filters.dept_id) {
        conditions.push(`${tableAlias}.dept_id = $${paramIndex}`);
        params.push(filters.dept_id);
        paramIndex++;
    }

    if (filters.student_passout_year) {
        conditions.push(`${tableAlias}.student_passout_year = $${paramIndex}`);
        params.push(filters.student_passout_year);
        paramIndex++;
    }

    if (filters.search) {
        conditions.push(
            `(${tableAlias}.first_name ILIKE $${paramIndex} OR ${tableAlias}.last_name ILIKE $${paramIndex} OR ${tableAlias}.student_email ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    return { conditions, params, paramIndex };
}

// ============================================================================
// 2. GET PENDING PROFILES
// ============================================================================

async function getPendingProfiles(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);
    const { conditions, params, paramIndex } = buildStudentFilters(collegeId, filters);

    conditions.push(`s.profile_complete = true`, `s.profile_approval_status = $${paramIndex}`);
    params.push(STATUS.VERIFICATION.PENDING);
    const profileParamIndex = paramIndex + 1;

    const whereClause = conditions.join(' AND ');
    const sortCol = VALID_SORT_COLUMNS.has(filters.sort_by) ? filters.sort_by : 'created_at';
    const sortOrder = VALID_SORT_ORDERS.has((filters.sort_order || '').toUpperCase()) ? filters.sort_order.toUpperCase() : 'DESC';

    const [countResult, dataResult] = await Promise.all([
        query(`SELECT COUNT(*) AS total FROM students s WHERE ${whereClause}`, params),
        query(
            `SELECT s.student_id, s.first_name, s.middle_name, s.last_name,
                    s.student_email, s.dept_id, s.student_passout_year,
                    s.profile_complete, s.profile_is_approved, s.profile_approval_status,
                    s.profile_rejection_reason, s.rejected_at,
                    s.created_at, s.updated_at,
                    d.dept_name
             FROM students s
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY s.${sortCol} ${sortOrder}
             LIMIT $${profileParamIndex} OFFSET $${profileParamIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    return {
        students: dataResult.rows,
        total: Number.parseInt(countResult.rows[0]?.total ?? '0', 10),
        page,
        limit,
    };
}

// ============================================================================
// 3. GET PENDING EXPERIENCES
// ============================================================================

async function getPendingExperiences(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);
    const { conditions, params, paramIndex } = buildStudentFilters(collegeId, filters);

    conditions.push(`e.verification_status = $${paramIndex}`);
    params.push(STATUS.VERIFICATION.PENDING);
    conditions.push(`s.profile_approval_status = $${paramIndex + 1}`);
    params.push(STATUS.VERIFICATION.APPROVED);
    const expParamIndex = paramIndex + 2;

    const whereClause = conditions.join(' AND ');
    const sortCol = VALID_SORT_COLUMNS.has(filters.sort_by) ? filters.sort_by : 'created_at';
    const sortAlias = STUDENT_SORT_COLUMNS[sortCol] || 'e';
    const sortOrder = VALID_SORT_ORDERS.has((filters.sort_order || '').toUpperCase()) ? filters.sort_order.toUpperCase() : 'DESC';

    const [countResult, dataResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM student_experience e
             JOIN students s ON e.student_id = s.student_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT e.experience_id, e.student_id, e.college_id,
                    e.company_name, e.company_website, e.position_title,
                    e.employment_type, e.job_description, e.responsibilities,
                    e.technologies_used, e.work_location, e.work_mode,
                    e.start_date, e.end_date, e.is_current, e.duration_months,
                    e.offer_letter_url, e.completion_certificate_url,
                    e.is_verified, e.verification_status,
                    e.verified_by, e.verified_at,
                    e.rejection_reason, e.rejected_at,
                    e.created_at, e.updated_at,
                    s.first_name, s.middle_name, s.last_name,
                    s.student_email, s.student_passout_year,
                    d.dept_name
             FROM student_experience e
             JOIN students s ON e.student_id = s.student_id
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY ${sortAlias}.${sortCol} ${sortOrder}
             LIMIT $${expParamIndex} OFFSET $${expParamIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    return {
        experiences: dataResult.rows,
        total: Number.parseInt(countResult.rows[0]?.total ?? '0', 10),
        page,
        limit,
    };
}

// ============================================================================
// 4. GET PENDING ACHIEVEMENTS
// ============================================================================

async function getPendingAchievements(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);
    const { conditions, params, paramIndex } = buildStudentFilters(collegeId, filters);

    conditions.push(`a.verification_status = $${paramIndex}`);
    params.push(STATUS.VERIFICATION.PENDING);
    conditions.push(`s.profile_approval_status = $${paramIndex + 1}`);
    params.push(STATUS.VERIFICATION.APPROVED);
    const achParamIndex = paramIndex + 2;

    const whereClause = conditions.join(' AND ');
    const sortCol = VALID_SORT_COLUMNS.has(filters.sort_by) ? filters.sort_by : 'created_at';
    const sortAlias = STUDENT_SORT_COLUMNS[sortCol] || 'a';
    const sortOrder = VALID_SORT_ORDERS.has((filters.sort_order || '').toUpperCase()) ? filters.sort_order.toUpperCase() : 'DESC';

    const [countResult, dataResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM student_achievements a
             JOIN students s ON a.student_id = s.student_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT a.achievement_id, a.student_id, a.college_id,
                    a.achievement_title, a.achievement_description,
                    a.achievement_type, a.issuing_organization,
                    a.event_name, a.achievement_level,
                    a.position_rank, a.participants_count,
                    a.achievement_date, a.certificate_url, a.proof_url,
                    a.is_verified, a.verification_status,
                    a.verified_by, a.verified_at,
                    a.rejection_reason, a.rejected_at,
                    a.is_featured, a.display_order,
                    a.created_at, a.updated_at,
                    s.first_name, s.middle_name, s.last_name,
                    s.student_email, s.student_passout_year,
                    d.dept_name
             FROM student_achievements a
             JOIN students s ON a.student_id = s.student_id
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY ${sortAlias}.${sortCol} ${sortOrder}
             LIMIT $${achParamIndex} OFFSET $${achParamIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    return {
        achievements: dataResult.rows,
        total: Number.parseInt(countResult.rows[0]?.total ?? '0', 10),
        page,
        limit,
    };
}

// ============================================================================
// 5. GET PENDING CERTIFICATES
// ============================================================================

async function getPendingCertificates(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);
    const { conditions, params, paramIndex } = buildStudentFilters(collegeId, filters);

    conditions.push(`c.verification_status = $${paramIndex}`);
    params.push(STATUS.VERIFICATION.PENDING);
    conditions.push(`s.profile_approval_status = $${paramIndex + 1}`);
    params.push(STATUS.VERIFICATION.APPROVED);
    const certParamIndex = paramIndex + 2;

    const whereClause = conditions.join(' AND ');
    const sortCol = VALID_SORT_COLUMNS.has(filters.sort_by) ? filters.sort_by : 'created_at';
    const sortAlias = STUDENT_SORT_COLUMNS[sortCol] || 'c';
    const sortOrder = VALID_SORT_ORDERS.has((filters.sort_order || '').toUpperCase()) ? filters.sort_order.toUpperCase() : 'DESC';

    const [countResult, dataResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM student_certificates c
             JOIN students s ON c.student_id = s.student_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT c.certificate_id, c.student_id, c.college_id,
                    c.certificate_name, c.certificate_description,
                    c.certificate_type, c.issuing_organization,
                    c.issuing_platform, c.credential_id, c.credential_url,
                    c.issue_date, c.expiry_date, c.does_not_expire,
                    c.skills_covered, c.certificate_url,
                    c.is_verified, c.verification_status,
                    c.verified_by, c.verified_at,
                    c.rejection_reason, c.rejected_at,
                    c.created_at, c.updated_at,
                    s.first_name, s.middle_name, s.last_name,
                    s.student_email, s.student_passout_year,
                    d.dept_name
             FROM student_certificates c
             JOIN students s ON c.student_id = s.student_id
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY ${sortAlias}.${sortCol} ${sortOrder}
             LIMIT $${certParamIndex} OFFSET $${certParamIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    return {
        certificates: dataResult.rows,
        total: Number.parseInt(countResult.rows[0]?.total ?? '0', 10),
        page,
        limit,
    };
}

// ============================================================================
// 6. VERIFY STUDENT PROFILE (single)
// ============================================================================

async function verifyStudentProfile(studentId, collegeId, userId, action, rejectionReason) {
    // Delegate to student.service to avoid duplicate logic
    return studentService.approveStudentProfile(studentId, collegeId, userId, action, rejectionReason);
}

// ============================================================================
// 7. VERIFY EXPERIENCE (single)
// ============================================================================

async function verifyExperience(experienceId, collegeId, userId, action, rejectionReason) {
    const isVerified = action === STATUS.VERIFICATION.APPROVED;

    const result = await query(
        `UPDATE student_experience
         SET verification_status = $1,
             is_verified = $2,
             verified_by = $3,
             verified_at = CASE WHEN $1 = $7 THEN NOW() ELSE verified_at END,
             rejection_reason = CASE WHEN $1 = $8 THEN $4 ELSE NULL END,
             rejected_at = CASE WHEN $1 = $8 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE experience_id = $5 AND college_id = $6
         RETURNING experience_id, student_id, college_id,
                   company_name, company_website, position_title,
                   employment_type, job_description, responsibilities,
                   technologies_used, work_location, work_mode,
                   start_date, end_date, is_current, duration_months,
                   offer_letter_url, completion_certificate_url,
                   is_verified, verification_status,
                   verified_by, verified_at,
                   rejection_reason, rejected_at,
                   created_at, updated_at`,
        [action, isVerified, userId, rejectionReason || null, experienceId, collegeId,
         STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.REJECTED]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.EXPERIENCE_NOT_FOUND), { status: 404 });
    }

    logger.info(`${LOG.API_END} Experience ${action}`, { experienceId, collegeId, userId });

    return result.rows[0];
}

// ============================================================================
// 8. VERIFY ACHIEVEMENT (single)
// ============================================================================

async function verifyAchievement(achievementId, collegeId, userId, action, rejectionReason) {
    const isVerified = action === STATUS.VERIFICATION.APPROVED;

    const result = await query(
        `UPDATE student_achievements
         SET verification_status = $1,
             is_verified = $2,
             verified_by = $3,
             verified_at = CASE WHEN $1 = $7 THEN NOW() ELSE verified_at END,
             rejection_reason = CASE WHEN $1 = $8 THEN $4 ELSE NULL END,
             rejected_at = CASE WHEN $1 = $8 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE achievement_id = $5 AND college_id = $6
         RETURNING achievement_id, student_id, college_id,
                   achievement_title, achievement_description,
                   achievement_type, issuing_organization,
                   event_name, achievement_level,
                   position_rank, participants_count,
                   achievement_date, certificate_url, proof_url,
                   is_verified, verification_status,
                   verified_by, verified_at,
                   rejection_reason, rejected_at,
                   is_featured, display_order,
                   created_at, updated_at`,
        [action, isVerified, userId, rejectionReason || null, achievementId, collegeId,
         STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.REJECTED]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.ACHIEVEMENT_NOT_FOUND), { status: 404 });
    }

    logger.info(`${LOG.API_END} Achievement ${action}`, { achievementId, collegeId, userId });

    return result.rows[0];
}

// ============================================================================
// 9. VERIFY CERTIFICATE (single)
// ============================================================================

async function verifyCertificate(certificateId, collegeId, userId, action, rejectionReason) {
    const isVerified = action === STATUS.VERIFICATION.APPROVED;

    const result = await query(
        `UPDATE student_certificates
         SET verification_status = $1,
             is_verified = $2,
             verified_by = $3,
             verified_at = CASE WHEN $1 = $7 THEN NOW() ELSE verified_at END,
             rejection_reason = CASE WHEN $1 = $8 THEN $4 ELSE NULL END,
             rejected_at = CASE WHEN $1 = $8 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE certificate_id = $5 AND college_id = $6
         RETURNING certificate_id, student_id, college_id,
                   certificate_name, certificate_description,
                   certificate_type, issuing_organization,
                   issuing_platform, credential_id, credential_url,
                   issue_date, expiry_date, does_not_expire,
                   skills_covered, certificate_url,
                   is_verified, verification_status,
                   verified_by, verified_at,
                   rejection_reason, rejected_at,
                   created_at, updated_at`,
        [action, isVerified, userId, rejectionReason || null, certificateId, collegeId,
         STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.REJECTED]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.CERTIFICATE_NOT_FOUND), { status: 404 });
    }

    logger.info(`${LOG.API_END} Certificate ${action}`, { certificateId, collegeId, userId });

    return result.rows[0];
}

// ============================================================================
// 10. BULK VERIFY PROFILES
// ============================================================================

async function bulkVerifyProfiles(ids, collegeId, userId, action, rejectionReason) {
    // Approval path — use transaction to auto-approve pending items
    if (action === STATUS.VERIFICATION.APPROVED) {
        const client = await getClient();
        try {
            await client.query('BEGIN');

            const profileResult = await client.query(
                `UPDATE students
                 SET profile_approval_status = $4,
                     profile_is_approved = true,
                     approved_by = $1,
                     approved_at = NOW(),
                     profile_rejection_reason = NULL,
                     rejected_at = NULL,
                     updated_at = NOW()
                 WHERE student_id = ANY($2::uuid[]) AND college_id = $3
                   AND profile_complete = true
                 RETURNING student_id`,
                [userId, ids, collegeId, STATUS.VERIFICATION.APPROVED]
            );

            const approvedIds = profileResult.rows.map(r => r.student_id);
            let autoApproved = { experiences: 0, achievements: 0, certificates: 0 };

            if (approvedIds.length > 0) {
                const autoResult = await client.query(
                    `WITH exp AS (
                        UPDATE student_experience
                        SET verification_status = $4, is_verified = true,
                            verified_by = $1, verified_at = NOW(),
                            rejection_reason = NULL, rejected_at = NULL
                        WHERE student_id = ANY($2::uuid[]) AND college_id = $3
                          AND verification_status = $5
                        RETURNING 1
                    ), ach AS (
                        UPDATE student_achievements
                        SET verification_status = $4, is_verified = true,
                            verified_by = $1, verified_at = NOW(),
                            rejection_reason = NULL, rejected_at = NULL
                        WHERE student_id = ANY($2::uuid[]) AND college_id = $3
                          AND verification_status = $5
                        RETURNING 1
                    ), cert AS (
                        UPDATE student_certificates
                        SET verification_status = $4, is_verified = true,
                            verified_by = $1, verified_at = NOW(),
                            rejection_reason = NULL, rejected_at = NULL
                        WHERE student_id = ANY($2::uuid[]) AND college_id = $3
                          AND verification_status = $5
                        RETURNING 1
                    )
                    SELECT
                        (SELECT COUNT(*)::int FROM exp) AS experiences,
                        (SELECT COUNT(*)::int FROM ach) AS achievements,
                        (SELECT COUNT(*)::int FROM cert) AS certificates`,
                    [userId, approvedIds, collegeId, STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.PENDING]
                );
                autoApproved = autoResult.rows[0];
            }

            await client.query('COMMIT');

            logger.info(`${LOG.API_END} Bulk profile approval with auto-approve`, {
                requested: ids.length, updated: approvedIds.length,
                collegeId, userId, autoApproved,
            });

            return {
                requested: ids.length,
                updated: approvedIds.length,
                updated_ids: approvedIds,
                auto_approved: autoApproved,
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Rejection path — simple update, no transaction needed
    const result = await query(
        `UPDATE students
         SET profile_approval_status = $1,
             profile_is_approved = false,
             approved_by = $2,
             profile_rejection_reason = $3,
             rejected_at = NOW(),
             approved_at = NULL,
             updated_at = NOW()
         WHERE student_id = ANY($4::uuid[]) AND college_id = $5
         RETURNING student_id`,
        [action, userId, rejectionReason || null, ids, collegeId]
    );

    logger.info(`${LOG.API_END} Bulk profile rejection`, {
        action, requested: ids.length, updated: result.rows.length, collegeId, userId,
    });

    return {
        requested: ids.length,
        updated: result.rows.length,
        updated_ids: result.rows.map(r => r.student_id),
    };
}

// ============================================================================
// 11. BULK VERIFY EXPERIENCES
// ============================================================================

async function bulkVerifyExperiences(ids, collegeId, userId, action, rejectionReason) {
    const isVerified = action === STATUS.VERIFICATION.APPROVED;

    const result = await query(
        `UPDATE student_experience
         SET verification_status = $1,
             is_verified = $2,
             verified_by = $3,
             verified_at = CASE WHEN $1 = $7 THEN NOW() ELSE verified_at END,
             rejection_reason = CASE WHEN $1 = $8 THEN $4 ELSE NULL END,
             rejected_at = CASE WHEN $1 = $8 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE experience_id = ANY($5::uuid[]) AND college_id = $6
         RETURNING experience_id`,
        [action, isVerified, userId, rejectionReason || null, ids, collegeId,
         STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.REJECTED]
    );

    logger.info(`${LOG.API_END} Bulk experience verification`, {
        action,
        requested: ids.length,
        updated: result.rows.length,
        collegeId,
        userId,
    });

    return {
        requested: ids.length,
        updated: result.rows.length,
        updated_ids: result.rows.map(r => r.experience_id),
    };
}

// ============================================================================
// 12. BULK VERIFY ACHIEVEMENTS
// ============================================================================

async function bulkVerifyAchievements(ids, collegeId, userId, action, rejectionReason) {
    const isVerified = action === STATUS.VERIFICATION.APPROVED;

    const result = await query(
        `UPDATE student_achievements
         SET verification_status = $1,
             is_verified = $2,
             verified_by = $3,
             verified_at = CASE WHEN $1 = $7 THEN NOW() ELSE verified_at END,
             rejection_reason = CASE WHEN $1 = $8 THEN $4 ELSE NULL END,
             rejected_at = CASE WHEN $1 = $8 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE achievement_id = ANY($5::uuid[]) AND college_id = $6
         RETURNING achievement_id`,
        [action, isVerified, userId, rejectionReason || null, ids, collegeId,
         STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.REJECTED]
    );

    logger.info(`${LOG.API_END} Bulk achievement verification`, {
        action,
        requested: ids.length,
        updated: result.rows.length,
        collegeId,
        userId,
    });

    return {
        requested: ids.length,
        updated: result.rows.length,
        updated_ids: result.rows.map(r => r.achievement_id),
    };
}

// ============================================================================
// 13. BULK VERIFY CERTIFICATES
// ============================================================================

async function bulkVerifyCertificates(ids, collegeId, userId, action, rejectionReason) {
    const isVerified = action === STATUS.VERIFICATION.APPROVED;

    const result = await query(
        `UPDATE student_certificates
         SET verification_status = $1,
             is_verified = $2,
             verified_by = $3,
             verified_at = CASE WHEN $1 = $7 THEN NOW() ELSE verified_at END,
             rejection_reason = CASE WHEN $1 = $8 THEN $4 ELSE NULL END,
             rejected_at = CASE WHEN $1 = $8 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE certificate_id = ANY($5::uuid[]) AND college_id = $6
         RETURNING certificate_id`,
        [action, isVerified, userId, rejectionReason || null, ids, collegeId,
         STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.REJECTED]
    );

    logger.info(`${LOG.API_END} Bulk certificate verification`, {
        action,
        requested: ids.length,
        updated: result.rows.length,
        collegeId,
        userId,
    });

    return {
        requested: ids.length,
        updated: result.rows.length,
        updated_ids: result.rows.map(r => r.certificate_id),
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getPendingVerificationCounts,
    getPendingProfiles,
    getPendingExperiences,
    getPendingAchievements,
    getPendingCertificates,
    verifyStudentProfile,
    verifyExperience,
    verifyAchievement,
    verifyCertificate,
    bulkVerifyProfiles,
    bulkVerifyExperiences,
    bulkVerifyAchievements,
    bulkVerifyCertificates,
};
