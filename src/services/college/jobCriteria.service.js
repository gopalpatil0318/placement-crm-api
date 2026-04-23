/**
 * ============================================================================
 * JOB CRITERIA SERVICE — Eligibility Criteria Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - setCriteria(jobId, collegeId, data)
 *   - updateCriteria(jobId, collegeId, data)
 *   - getEligibleStudents(jobId, collegeId, filters)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const { logAudit, computeAuditDiff } = require('../../utils/auditHelper');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');

// All criteria columns (on job_eligibility_criteria table)
const CRITERIA_FIELDS = [
    'min_overall_cgpa', 'max_live_kts',
    'min_tenth_percentage', 'min_twelfth_percentage', 'min_diploma_percentage',
    'allowed_genders', 'allowed_departments', 'allowed_gap_statuses',
    'min_existing_package', 'max_existing_package', 'min_skill_match_percentage',
    'exclude_already_placed',
];

// Columns returned by INSERT/UPDATE on job_eligibility_criteria
const CRITERIA_RETURNING_COLUMNS = [
    'criteria_id', 'job_id', 'passout_years',
    'min_overall_cgpa', 'max_live_kts',
    'min_tenth_percentage', 'min_twelfth_percentage', 'min_diploma_percentage',
    'allowed_genders', 'allowed_departments', 'allowed_gap_statuses',
    'min_existing_package', 'max_existing_package', 'min_skill_match_percentage',
    'exclude_already_placed', 'created_at',
].join(', ');

// ============================================================================
// HELPER — Verify job exists and belongs to college
// ============================================================================

async function verifyJob(jobId, collegeId) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.job_status, j.passout_years,
                c.company_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         WHERE j.job_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [jobId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// PostgreSQL error code for FK constraint violation
const PG_FK_VIOLATION = '23503';

/**
 * Insert required skills for a job within a transaction client.
 * Deduplicates skill_ids and uses ON CONFLICT DO NOTHING.
 * @returns {Array} Array of { skill_id, skill_name, skill_category }
 */
async function insertAndFetchSkills(client, jobId, requiredSkills) {
    if (!requiredSkills || requiredSkills.length === 0) return [];

    const skillIds = [...new Set(requiredSkills.map(s => s.skill_id))];
    await client.query(
        `INSERT INTO job_required_skills (job_id, skill_id)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT (job_id, skill_id) DO NOTHING`,
        [jobId, skillIds]
    );

    const fetchResult = await client.query(
        `SELECT jrs.skill_id, sk.skill_name, sk.skill_category
         FROM job_required_skills jrs
         JOIN skills sk ON jrs.skill_id = sk.skill_id
         WHERE jrs.job_id = $1 ORDER BY sk.skill_name ASC`,
        [jobId]
    );
    return fetchResult.rows;
}

/**
 * Fetches current required skills for a job.
 */
async function fetchJobSkills(queryFn, jobId) {
    const result = await queryFn(
        `SELECT jrs.skill_id, sk.skill_name, sk.skill_category
         FROM job_required_skills jrs
         JOIN skills sk ON jrs.skill_id = sk.skill_id
         WHERE jrs.job_id = $1 ORDER BY sk.skill_name ASC`,
        [jobId]
    );
    return result.rows;
}

/**
 * Rethrows FK violations on skills as a 400 with a friendly message.
 */
function handleSkillFkError(err) {
    if (err.code === PG_FK_VIOLATION && err.constraint?.includes('skill')) {
        throw Object.assign(
            new Error('One or more skill IDs do not exist in the skills catalog'),
            { status: 400 }
        );
    }
    throw err;
}

// ============================================================================
// 1. SET CRITERIA
// ============================================================================

/**
 * Set eligibility criteria for a job (one-time). Uses the job's passout_year.
 * Only one criteria record per job (UNIQUE constraint).
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Created criteria
 */
async function setCriteria(jobId, collegeId, data, auditCtx) {
    // 1. Verify job exists
    const job = await verifyJob(jobId, collegeId);

    // 2. Check if criteria already exists
    const existingCheck = await query(
        `SELECT criteria_id FROM job_eligibility_criteria
         WHERE job_id = $1 LIMIT 1`,
        [jobId]
    );

    if (existingCheck.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CRITERIA_ALREADY_EXISTS),
            { status: 409 }
        );
    }

    // 3. Build dynamic INSERT
    const fieldsToInsert = CRITERIA_FIELDS.filter(f => data[f] !== undefined);
    const columns = ['job_id', 'passout_years', ...fieldsToInsert];
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const values = [jobId, job.passout_years, ...fieldsToInsert.map(f => data[f])];

    // Use transaction for criteria + skills atomicity
    const client = await getClient();
    let result;
    let requiredSkills = [];

    try {
        await client.query('BEGIN');

        result = await client.query(
            `INSERT INTO job_eligibility_criteria (${columns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING ${CRITERIA_RETURNING_COLUMNS}`,
            values
        );

        requiredSkills = await insertAndFetchSkills(client, jobId, data.required_skills);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        handleSkillFkError(err);
    } finally {
        client.release();
    }

    logger.info(`${LOG.AUTH} Eligibility criteria set for job`, {
        criteriaId: result.rows[0].criteria_id,
        jobId,
        jobTitle: job.job_title,
        criteriaFields: fieldsToInsert,
        collegeId,
    });

    // Audit trail — criteria creation
    if (auditCtx) {
        const auditNewValue = { ...result.rows[0] };
        if (requiredSkills.length > 0) {
            auditNewValue.required_skills = requiredSkills;
        }
        logAudit(query, {
            collegeId,
            userId: auditCtx.userId,
            userName: auditCtx.userName,
            userRole: auditCtx.userRole,
            action: AUDIT_ACTIONS.CREATE,
            resourceType: AUDIT_RESOURCE_TYPES.JOB_CRITERIA,
            resourceId: jobId,
            summary: `Set eligibility criteria for job: ${job.job_title}`,
            newValue: auditNewValue,
            ipAddress: auditCtx.ipAddress,
        });
    }

    return {
        ...result.rows[0],
        required_skills: requiredSkills,
        job_title: job.job_title,
        company_name: job.company_name,
    };
}

// ============================================================================
// 2. UPDATE CRITERIA
// ============================================================================

/**
 * Update existing eligibility criteria for a job.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated criteria
 */
async function updateCriteria(jobId, collegeId, data, auditCtx) {
    // 1. Verify job exists
    const job = await verifyJob(jobId, collegeId);

    // 2. Fetch full old criteria (for audit diff)
    const existing = await query(
        `SELECT ${CRITERIA_RETURNING_COLUMNS}
         FROM job_eligibility_criteria
         WHERE job_id = $1 LIMIT 1`,
        [jobId]
    );

    if (!existing.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CRITERIA_NOT_FOUND),
            { status: 404 }
        );
    }

    const oldCriteria = existing.rows[0];

    // 3. Build dynamic UPDATE for criteria table fields
    const fieldsToUpdate = CRITERIA_FIELDS.filter(f => data[f] !== undefined);
    const hasSkillChanges = data.required_skills !== undefined;

    if (!fieldsToUpdate.length && !hasSkillChanges) {
        throw Object.assign(new Error(ERROR_MESSAGES.NO_FIELDS_TO_UPDATE), { status: 400 });
    }

    // Fetch old skills BEFORE any mutations (for audit diff)
    const oldSkills = await fetchJobSkills(query, jobId);

    // Use transaction for criteria + skills atomicity
    const client = await getClient();
    let newCriteria = oldCriteria;
    let requiredSkills = [];

    try {
        await client.query('BEGIN');

        if (fieldsToUpdate.length) {
            const setClauses = fieldsToUpdate
                .map((field, index) => `${field} = $${index + 2}`)
                .join(', ');
            const values = [jobId, ...fieldsToUpdate.map(f => data[f])];

            const result = await client.query(
                `UPDATE job_eligibility_criteria
                 SET ${setClauses}
                 WHERE job_id = $1
                 RETURNING ${CRITERIA_RETURNING_COLUMNS}`,
                values
            );
            newCriteria = result.rows[0];
        }

        // 4. Handle required_skills — DELETE existing + re-INSERT
        if (hasSkillChanges) {
            await client.query(`DELETE FROM job_required_skills WHERE job_id = $1`, [jobId]);
            await insertAndFetchSkills(client, jobId, data.required_skills);
        }

        // Fetch current skills for response
        requiredSkills = (await client.query(
            `SELECT jrs.skill_id, sk.skill_name, sk.skill_category
             FROM job_required_skills jrs
             JOIN skills sk ON jrs.skill_id = sk.skill_id
             WHERE jrs.job_id = $1 ORDER BY sk.skill_name ASC`,
            [jobId]
        )).rows;

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        handleSkillFkError(err);
    } finally {
        client.release();
    }

    logger.info(`${LOG.AUTH} Eligibility criteria updated`, {
        jobId,
        updatedFields: fieldsToUpdate,
        skillsChanged: hasSkillChanges,
        collegeId,
    });

    // Audit trail — criteria update with diff
    if (auditCtx) {
        const auditOld = { ...oldCriteria, required_skills: oldSkills };
        const auditNew = { ...newCriteria };
        if (hasSkillChanges) {
            auditNew.required_skills = requiredSkills;
        }
        const diff = computeAuditDiff(auditOld, auditNew);
        logAudit(query, {
            collegeId,
            userId: auditCtx.userId,
            userName: auditCtx.userName,
            userRole: auditCtx.userRole,
            action: AUDIT_ACTIONS.UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.JOB_CRITERIA,
            resourceId: jobId,
            summary: `Updated eligibility criteria for job: ${job.job_title}`,
            oldValue: diff.old,
            newValue: diff.new,
            metadata: { updatedFields: fieldsToUpdate, skillsChanged: hasSkillChanges },
            ipAddress: auditCtx.ipAddress,
        });
    }

    return {
        ...newCriteria,
        required_skills: requiredSkills,
        job_title: job.job_title,
        company_name: job.company_name,
    };
}

// ============================================================================
// HELPER — Build eligibility criteria WHERE conditions
// ============================================================================

/**
 * Appends SQL conditions from criteria fields. Returns updated paramIndex.
 * @param {Object} criteria - The eligibility criteria record
 * @param {string[]} conditions - Mutable conditions array
 * @param {Array} params - Mutable params array
 * @param {number} paramIndex - Current param index
 * @returns {number} Updated paramIndex
 */
function buildCriteriaConditions(criteria, conditions, params, paramIndex) {
    if (!criteria) return paramIndex;

    // Numeric threshold filters
    const numericFilters = [
        { field: 'min_overall_cgpa', sql: col => `COALESCE(acad.overall_cgpa, 0) >= $${col}` },
        { field: 'max_live_kts', sql: col => `COALESCE(acad.total_live_kts, 0) <= $${col}` },
        { field: 'min_tenth_percentage', sql: col => `COALESCE(acad.tenth_percentage, 0) >= $${col}` },
        { field: 'min_twelfth_percentage', sql: col => `(acad.twelfth_or_diploma != '12th' OR COALESCE(acad.twelfth_percentage, 0) >= $${col})` },
        { field: 'min_diploma_percentage', sql: col => `(acad.twelfth_or_diploma != 'Diploma' OR COALESCE(acad.diploma_percentage, 0) >= $${col})` },
        { field: 'min_existing_package', sql: col => `COALESCE((SELECT MAX(pr.fulltime_package) FROM placement_results pr WHERE pr.student_id = s.student_id AND pr.placement_status IN ('accepted','joined') AND pr.fulltime_package IS NOT NULL), 0) >= $${col}` },
        { field: 'max_existing_package', sql: col => `COALESCE((SELECT MAX(pr.fulltime_package) FROM placement_results pr WHERE pr.student_id = s.student_id AND pr.placement_status IN ('accepted','joined') AND pr.fulltime_package IS NOT NULL), 0) <= $${col}` },
    ];

    let idx = paramIndex;
    for (const { field, sql } of numericFilters) {
        if (criteria[field] != null) {
            conditions.push(sql(idx));
            params.push(criteria[field]);
            idx++;
        }
    }

    // Array containment filters
    const arrayFilters = [
        { field: 'allowed_genders', sql: col => `pi.gender = ANY($${col})` },
        { field: 'allowed_departments', sql: col => `d.dept_name = ANY($${col})` },
        { field: 'allowed_gap_statuses', sql: col => `(CASE WHEN acad.any_gap_during_education = true THEN 'gap' ELSE 'no_gap' END) = ANY($${col})` },
    ];

    for (const { field, sql } of arrayFilters) {
        if (criteria[field]?.length > 0) {
            conditions.push(sql(idx));
            params.push(criteria[field]);
            idx++;
        }
    }

    // Exclude already placed — query placement_results (consistent with student-side evaluateEligibility)
    if (criteria.exclude_already_placed === true) {
        conditions.push(
            `NOT EXISTS (
                SELECT 1 FROM placement_results pr
                WHERE pr.student_id = s.student_id
                  AND pr.placement_status IN ('accepted', 'joined')
            )`
        );
    }

    return idx;
}

// ============================================================================
// HELPER — Append search/filter conditions from frontend query params
// ============================================================================

function applyQueryFilters(filters, conditions, params, paramIndex) {
    let idx = paramIndex;

    if (filters.search) {
        conditions.push(
            `(CONCAT(s.first_name, ' ', COALESCE(s.middle_name, ''), ' ', s.last_name) ILIKE $${idx}
              OR s.student_email ILIKE $${idx})`
        );
        params.push(`%${filters.search}%`);
        idx++;
    }

    if (filters.dept_name) {
        conditions.push(`d.dept_name ILIKE $${idx}`);
        params.push(`%${filters.dept_name}%`);
        idx++;
    }

    // Exclude restricted students
    conditions.push(
        `NOT EXISTS (
            SELECT 1 FROM student_restrictions sr
            WHERE sr.student_id = s.student_id
              AND sr.is_active = true
              AND sr.restriction_type IN ('bar_from_placements', 'temporary_suspension')
        )`
    );

    return idx;
}

// ============================================================================
// 3. GET ELIGIBLE STUDENTS (Dynamic WHERE — only non-null criteria apply)
// ============================================================================

/**
 * Get students who meet the eligibility criteria for this job.
 * ONLY criteria that are set (non-null) are used as filters.
 * If a criterion is not provided, it is NOT included in the filter.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} filters - { search, dept_name, page, limit }
 * @returns {{ criteria, eligible_count, total_students, students, page, limit }}
 */
async function getEligibleStudents(jobId, collegeId, filters = {}) {
    // 1. Verify job exists
    const job = await verifyJob(jobId, collegeId);

    // 2. Get criteria for this job
    const criteriaResult = await query(
        `SELECT ${CRITERIA_RETURNING_COLUMNS} FROM job_eligibility_criteria
         WHERE job_id = $1 LIMIT 1`,
        [jobId]
    );

    const criteria = criteriaResult.rows[0] || null;

    // Fetch required skills for this job
    const requiredSkillsResult = await query(
        `SELECT jrs.skill_id, sk.skill_name, sk.skill_category
         FROM job_required_skills jrs
         JOIN skills sk ON jrs.skill_id = sk.skill_id
         WHERE jrs.job_id = $1 ORDER BY sk.skill_name ASC`,
        [jobId]
    );
    const requiredSkills = requiredSkillsResult.rows;
    const hasSkillCriteria = requiredSkills.length > 0 && criteria?.min_skill_match_percentage != null;

    const { page, limit, offset } = getPagination(filters);

    // 3. Build dynamic eligibility query
    // Base: active students in this college with matching passout_year
    const conditions = [
        's.college_id = $1',
        's.student_status = $2',
        's.student_passout_year = ANY($3)',
    ];
    const params = [collegeId, STATUS.STUDENT.ACTIVE, job.passout_years];
    let paramIndex = 4;

    // 4. Add criteria-based conditions
    paramIndex = buildCriteriaConditions(criteria, conditions, params, paramIndex);

    // 4b. Add skill match condition if min_skill_match_percentage is set
    if (hasSkillCriteria) {
        conditions.push(
            `(SELECT CASE WHEN (SELECT COUNT(*) FROM job_required_skills WHERE job_id = $${paramIndex}) = 0 THEN 100
                ELSE ROUND(
                    (SELECT COUNT(*) FROM job_required_skills jrs2
                     JOIN student_skills ss2 ON jrs2.skill_id = ss2.skill_id AND ss2.student_id = s.student_id
                     WHERE jrs2.job_id = $${paramIndex})::numeric * 100
                    / GREATEST((SELECT COUNT(*) FROM job_required_skills WHERE job_id = $${paramIndex}), 1), 0
                )::integer
             END) >= $${paramIndex + 1}`
        );
        params.push(jobId, criteria.min_skill_match_percentage);
        paramIndex += 2;
    }

    // 5. Additional query-level filters (from frontend)
    paramIndex = applyQueryFilters(filters, conditions, params, paramIndex);

    const whereClause = conditions.join(' AND ');

    // 7. Count eligible + Count total + Fetch paginated students in parallel
    const [countResult, totalStudentsResult, studentsResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM students s
             LEFT JOIN student_academic_information acad ON s.student_id = acad.student_id
             LEFT JOIN student_personal_information pi ON s.student_id = pi.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT COUNT(*) AS total FROM students
             WHERE college_id = $1 AND student_passout_year = ANY($2) AND student_status = $3`,
            [collegeId, job.passout_years, STATUS.STUDENT.ACTIVE]
        ),
        query(
            `SELECT
                s.student_id,
                CONCAT(s.first_name, ' ', COALESCE(s.middle_name || ' ', ''), s.last_name) AS student_name,
                s.student_email,
                s.student_passout_year,
                d.dept_name,
                acad.overall_cgpa,
                acad.total_live_kts,
                acad.tenth_percentage,
                acad.twelfth_or_diploma,
                acad.twelfth_percentage,
                acad.diploma_percentage,
                acad.any_gap_during_education,
                pi.gender,
                s.profile_complete,
                s.profile_is_approved
             FROM students s
             LEFT JOIN student_academic_information acad ON s.student_id = acad.student_id
             LEFT JOIN student_personal_information pi ON s.student_id = pi.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY acad.overall_cgpa DESC NULLS LAST, s.first_name ASC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);
    const eligibleCount = Number.parseInt(countResult.rows[0].total, 10);
    const totalStudents = Number.parseInt(totalStudentsResult.rows[0].total, 10);

    // Post-process: compute skill_match_percentage per student if skill criteria active
    let students = studentsResult.rows;
    if (hasSkillCriteria && students.length > 0) {
        const studentIds = students.map(s => s.student_id);
        const skillMatchResult = await query(
            `SELECT ss.student_id,
                    COUNT(DISTINCT ss.skill_id) AS matched_count
             FROM student_skills ss
             JOIN job_required_skills jrs ON ss.skill_id = jrs.skill_id AND jrs.job_id = $1
             WHERE ss.student_id = ANY($2)
             GROUP BY ss.student_id`,
            [jobId, studentIds]
        );
        const matchMap = new Map(skillMatchResult.rows.map(r => [r.student_id, Number.parseInt(r.matched_count, 10)]));
        const totalRequired = requiredSkills.length;
        students = students.map(s => ({
            ...s,
            skill_match_percentage: totalRequired > 0
                ? Math.round(((matchMap.get(s.student_id) || 0) / totalRequired) * 100)
                : 100,
        }));
    }

    return {
        job: {
            job_id: job.job_id,
            job_title: job.job_title,
            company_name: job.company_name,
            passout_years: job.passout_years,
        },
        criteria: criteria ? { ...criteria, required_skills: requiredSkills } : null,
        eligible_count: eligibleCount,
        total_students: totalStudents,
        eligibility_percentage: totalStudents > 0
            ? Math.round((eligibleCount / totalStudents) * 100)
            : 0,
        students,
        page,
        limit,
    };
}

// ============================================================================
// 4. GET CRITERIA CHANGE HISTORY
// ============================================================================

/**
 * Retrieve audit trail for a job's eligibility criteria changes.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @returns {Array} History entries
 */
async function getCriteriaHistory(jobId, collegeId) {
    // Verify job belongs to college
    await verifyJob(jobId, collegeId);

    const result = await query(
        `SELECT user_name, user_role, action, old_value, new_value, summary, created_at
         FROM audit_log
         WHERE resource_type = 'job_criteria'
           AND resource_id = $1
           AND college_id = $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [jobId, collegeId]
    );

    return result.rows;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setCriteria,
    updateCriteria,
    getEligibleStudents,
    getCriteriaHistory,
};
