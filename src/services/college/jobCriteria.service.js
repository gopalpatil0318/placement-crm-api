/**
 * ============================================================================
 * JOB CRITERIA SERVICE — Eligibility Criteria Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - setCriteria(jobId, collegeId, data)
 *   - updateCriteria(jobId, collegeId, data)
 *   - getEligibleStudents(jobId, collegeId, filters)
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// All criteria columns
const CRITERIA_FIELDS = [
    'min_overall_cgpa', 'max_live_kts',
    'min_tenth_percentage', 'min_twelfth_percentage', 'min_diploma_percentage',
    'allowed_genders', 'allowed_departments', 'allowed_gap_statuses',
    'min_existing_package', 'max_existing_package', 'exclude_already_placed',
];

// Columns returned by INSERT/UPDATE on job_eligibility_criteria
const CRITERIA_RETURNING_COLUMNS = [
    'criteria_id', 'job_id', 'passout_years',
    'min_overall_cgpa', 'max_live_kts',
    'min_tenth_percentage', 'min_twelfth_percentage', 'min_diploma_percentage',
    'allowed_genders', 'allowed_departments', 'allowed_gap_statuses',
    'min_existing_package', 'max_existing_package', 'exclude_already_placed',
    'created_at',
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
async function setCriteria(jobId, collegeId, data) {
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
    const values = [jobId, job.passout_years, ...fieldsToInsert.map(f => {
        // Arrays need to be handled for PostgreSQL
        if (Array.isArray(data[f])) return data[f];
        return data[f];
    })];

    const result = await query(
        `INSERT INTO job_eligibility_criteria (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING ${CRITERIA_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Eligibility criteria set for job`, {
        criteriaId: result.rows[0].criteria_id,
        jobId,
        jobTitle: job.job_title,
        criteriaFields: fieldsToInsert,
        collegeId,
    });

    return {
        ...result.rows[0],
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
async function updateCriteria(jobId, collegeId, data) {
    // 1. Verify job exists
    const job = await verifyJob(jobId, collegeId);

    // 2. Check criteria exists
    const existing = await query(
        `SELECT criteria_id FROM job_eligibility_criteria
         WHERE job_id = $1 LIMIT 1`,
        [jobId]
    );

    if (!existing.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CRITERIA_NOT_FOUND),
            { status: 404 }
        );
    }

    // 3. Build dynamic UPDATE
    const fieldsToUpdate = CRITERIA_FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.NO_FIELDS_TO_UPDATE), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 2}`)
        .join(', ');
    const values = [jobId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE job_eligibility_criteria
         SET ${setClauses}
         WHERE job_id = $1
         RETURNING ${CRITERIA_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Eligibility criteria updated`, {
        jobId,
        updatedFields: fieldsToUpdate,
        collegeId,
    });

    return {
        ...result.rows[0],
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

    // Exclude already placed
    if (criteria.exclude_already_placed === true) {
        conditions.push(
            `NOT EXISTS (
                SELECT 1 FROM student_applications sa
                WHERE sa.student_id = s.student_id
                  AND sa.application_status = 'selected'
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

    return {
        job: {
            job_id: job.job_id,
            job_title: job.job_title,
            company_name: job.company_name,
            passout_years: job.passout_years,
        },
        criteria,
        eligible_count: eligibleCount,
        total_students: totalStudents,
        eligibility_percentage: totalStudents > 0
            ? Math.round((eligibleCount / totalStudents) * 100)
            : 0,
        students: studentsResult.rows,
        page,
        limit,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setCriteria,
    updateCriteria,
    getEligibleStudents,
};
