/**
 * ============================================================================
 * JOB SERVICE — Job Posting Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - createJob(collegeId, userId, data)          → Transaction (4 tables)
 *   - getAllJobs(collegeId, filters)               → Paginated list
 *   - getJobById(jobId, collegeId)                → Full details
 *   - updateJob(jobId, collegeId, data)           → Core fields only
 *   - updateJobStatus(jobId, collegeId, newStatus) → Status transitions
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const chunkedQuery = require('../../utils/chunkedQuery');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// Core job fields that can be updated
const UPDATABLE_FIELDS = [
    'job_title', 'job_description', 'job_location',
    'salary_package', 'salary_min', 'salary_max',
    'bond_duration', 'bond_details', 'job_type',
    'internship_duration', 'internship_stipend',
    'passout_years', 'application_deadline', 'allow_applications',
];

// Explicit column lists — no SELECT * or RETURNING *
const JOB_RETURNING_COLUMNS = [
    'job_id', 'college_id', 'company_id', 'job_title', 'job_description',
    'job_location', 'salary_package', 'salary_min', 'salary_max',
    'bond_duration', 'bond_details', 'job_type',
    'internship_duration', 'internship_stipend',
    'passout_years', 'application_deadline', 'job_status',
    'allow_applications', 'created_by', 'created_at', 'updated_at',
].join(', ');

const POSITION_COLUMNS = [
    'position_id', 'job_id', 'position_name', 'position_description',
    'vacancies', 'position_status', 'created_at',
].join(', ');

const CRITERIA_COLUMNS = [
    'criteria_id', 'job_id', 'min_overall_cgpa', 'max_live_kts',
    'min_tenth_percentage', 'min_twelfth_percentage', 'min_diploma_percentage',
    'allowed_genders', 'allowed_departments', 'allowed_gap_statuses',
    'passout_years', 'min_existing_package', 'max_existing_package',
    'exclude_already_placed', 'created_at',
].join(', ');

const ROUND_COLUMNS = [
    'round_id', 'job_id', 'round_number', 'round_name', 'round_description',
    'round_type', 'round_date', 'round_venue', 'round_status', 'created_at',
].join(', ');

const QUESTION_COLUMNS = [
    'question_id', 'job_id', 'question_text', 'question_type',
    'question_options', 'is_required', 'question_order', 'created_at',
].join(', ');

// Valid status transitions
const STATUS_TRANSITIONS = {
    [STATUS.JOB.DRAFT]: [STATUS.JOB.PUBLISHED, STATUS.JOB.CANCELLED],
    [STATUS.JOB.PUBLISHED]: [STATUS.JOB.CLOSED, STATUS.JOB.CANCELLED],
    [STATUS.JOB.CLOSED]: [STATUS.JOB.PUBLISHED],
    [STATUS.JOB.CANCELLED]: [],
};

// ============================================================================
// 1. CREATE JOB (Transaction: job + positions + criteria + rounds + questions)
// ============================================================================

/**
 * Create a job posting with all related data in a single transaction.
 *
 * @param {string} collegeId
 * @param {string} userId - created_by
 * @param {Object} data - { core fields, positions[], eligibility_criteria{}, rounds[], questions[] }
 * @returns {Object} Full created job
 */
async function createJob(collegeId, userId, data) {
    const {
        company_id, job_title, job_description, job_location,
        salary_package, salary_min, salary_max,
        bond_duration, bond_details, job_type,
        internship_duration, internship_stipend,
        passout_years, application_deadline,
        positions, eligibility_criteria, rounds, questions,
    } = data;

    // 1. Verify company exists and is active
    const companyCheck = await query(
        `SELECT company_id, company_name, company_status FROM companies
         WHERE company_id = $1 AND college_id = $2
         LIMIT 1`,
        [company_id, collegeId]
    );

    if (!companyCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COMPANY_NOT_FOUND), { status: 404 });
    }

    if (companyCheck.rows[0].company_status !== STATUS.COMPANY.ACTIVE) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.INACTIVE_COMPANY),
            { status: 400 }
        );
    }

    // 2. Validate deadline is in the future
    const now = new Date();
    const deadline = new Date(application_deadline);
    if (deadline <= now) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.DEADLINE_MUST_BE_FUTURE),
            { status: 400 }
        );
    }

    // 3. Validate salary_min <= salary_max
    if (salary_min !== undefined && salary_min !== null &&
        salary_max !== undefined && salary_max !== null &&
        Number(salary_min) > Number(salary_max)) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.SALARY_MIN_EXCEEDS_MAX),
            { status: 400 }
        );
    }

    // 4. Transaction
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 4a. Insert job posting
        const jobResult = await client.query(
            `INSERT INTO job_postings
               (college_id, company_id, job_title, job_description, job_location,
                salary_package, salary_min, salary_max, bond_duration, bond_details,
                job_type, internship_duration, internship_stipend,
                passout_years, application_deadline, job_status, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING ${JOB_RETURNING_COLUMNS}`,
            [
                collegeId, company_id, job_title, job_description ?? null, job_location,
                salary_package ?? null, salary_min ?? null, salary_max ?? null,
                bond_duration ?? null, bond_details ?? null,
                job_type, internship_duration ?? null, internship_stipend ?? null,
                passout_years, application_deadline, STATUS.JOB.DRAFT, userId,
            ]
        );

        const job = jobResult.rows[0];
        const jobId = job.job_id;

        // 4b. Insert positions (required, at least 1) — multi-row INSERT
        const posNames = positions.map(p => p.position_name);
        const posDescs = positions.map(p => p.position_description ?? null);
        const posVacancies = positions.map(p => p.vacancies ?? null);

        const posResult = await client.query(
            `INSERT INTO job_positions (job_id, position_name, position_description, vacancies)
             SELECT $1, unnest($2::text[]), unnest($3::text[]), unnest($4::int[])
             RETURNING ${POSITION_COLUMNS}`,
            [jobId, posNames, posDescs, posVacancies]
        );
        const insertedPositions = posResult.rows;

        // 4c. Insert eligibility criteria (optional, 1 per job)
        let insertedCriteria = null;
        if (eligibility_criteria) {
            const ec = eligibility_criteria;
            const criteriaResult = await client.query(
                `INSERT INTO job_eligibility_criteria
                   (job_id, min_overall_cgpa, max_live_kts,
                    min_tenth_percentage, min_twelfth_percentage, min_diploma_percentage,
                    allowed_genders, allowed_departments, allowed_gap_statuses,
                    passout_years, min_existing_package, max_existing_package,
                    exclude_already_placed)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                 RETURNING ${CRITERIA_COLUMNS}`,
                [
                    jobId,
                    ec.min_overall_cgpa ?? null,
                    ec.max_live_kts ?? 0,
                    ec.min_tenth_percentage ?? null,
                    ec.min_twelfth_percentage ?? null,
                    ec.min_diploma_percentage ?? null,
                    ec.allowed_genders ?? null,
                    ec.allowed_departments ?? null,
                    ec.allowed_gap_statuses ?? null,
                    passout_years,
                    ec.min_existing_package ?? null,
                    ec.max_existing_package ?? null,
                    ec.exclude_already_placed ?? false,
                ]
            );
            insertedCriteria = criteriaResult.rows[0];
        }

        // 4d. Insert rounds (optional) — multi-row INSERT
        let insertedRounds = [];
        if (rounds && rounds.length > 0) {
            const roundNumbers = rounds.map(r => r.round_number);
            const roundNames = rounds.map(r => r.round_name);
            const roundDescs = rounds.map(r => r.round_description || null);
            const roundTypes = rounds.map(r => r.round_type || null);
            const roundDates = rounds.map(r => r.round_date || null);
            const roundVenues = rounds.map(r => r.round_venue || null);

            const roundResult = await client.query(
                `INSERT INTO job_rounds
                   (job_id, round_number, round_name, round_description, round_type, round_date, round_venue)
                 SELECT $1, unnest($2::int[]), unnest($3::text[]), unnest($4::text[]),
                        unnest($5::text[]), unnest($6::timestamptz[]), unnest($7::text[])
                 RETURNING ${ROUND_COLUMNS}`,
                [jobId, roundNumbers, roundNames, roundDescs, roundTypes, roundDates, roundVenues]
            );
            insertedRounds = roundResult.rows;
        }

        // 4e. Insert application questions (optional) — multi-row INSERT
        let insertedQuestions = [];
        if (questions && questions.length > 0) {
            const qTexts = questions.map(q => q.question_text);
            const qTypes = questions.map(q => q.question_type);
            const qOptions = questions.map(q => q.question_options ? JSON.stringify(q.question_options) : null);
            const qRequired = questions.map(q => q.is_required !== undefined ? q.is_required : true);
            const qOrders = questions.map(q => q.question_order);

            const qResult = await client.query(
                `INSERT INTO application_questions
                   (job_id, question_text, question_type, question_options, is_required, question_order)
                 SELECT $1, unnest($2::text[]), unnest($3::text[]), unnest($4::jsonb[]),
                        unnest($5::boolean[]), unnest($6::int[])
                 RETURNING ${QUESTION_COLUMNS}`,
                [jobId, qTexts, qTypes, qOptions, qRequired, qOrders]
            );
            insertedQuestions = qResult.rows;
        }

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Job created successfully`, {
            jobId,
            jobTitle: job_title,
            companyId: company_id,
            positions: insertedPositions.length,
            hasCriteria: !!insertedCriteria,
            rounds: insertedRounds.length,
            questions: insertedQuestions.length,
            collegeId,
        });

        return {
            ...job,
            company_name: companyCheck.rows[0].company_name,
            positions: insertedPositions,
            eligibility_criteria: insertedCriteria,
            rounds: insertedRounds.sort((a, b) => a.round_number - b.round_number),
            questions: insertedQuestions.sort((a, b) => a.question_order - b.question_order),
        };
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`${LOG.TRANSACTION} Job creation failed — rolled back`, {
            error: err.message,
            collegeId,
        });
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 2. GET ALL JOBS (with filters, sorting, pagination)
// ============================================================================

/**
 * List jobs with filters, enriched with company name + counts.
 *
 * @param {string} collegeId
 * @param {Object} filters
 * @returns {{ jobs, total, page, limit }}
 */
async function getAllJobs(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['j.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    if (filters.passout_year) {
        conditions.push(`$${paramIndex} = ANY(j.passout_years)`);
        params.push(Number(filters.passout_year));
        paramIndex++;
    }

    if (filters.job_status) {
        conditions.push(`j.job_status = $${paramIndex}`);
        params.push(filters.job_status);
        paramIndex++;
    }

    if (filters.company_id) {
        conditions.push(`j.company_id = $${paramIndex}`);
        params.push(filters.company_id);
        paramIndex++;
    }

    if (filters.job_type) {
        conditions.push(`j.job_type = $${paramIndex}`);
        params.push(filters.job_type);
        paramIndex++;
    }

    if (filters.search) {
        conditions.push(
            `(j.job_title ILIKE $${paramIndex} OR c.company_name ILIKE $${paramIndex} OR j.job_location ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        job_title: 'j.job_title',
        created_at: 'j.created_at',
        application_deadline: 'j.application_deadline',
    };
    const sortCol = SORTABLE[filters.sort_by] || 'j.created_at';
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count + Fetch in parallel
    const [countResult, jobResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM job_postings j
             JOIN companies c ON j.company_id = c.company_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT j.${JOB_RETURNING_COLUMNS.split(', ').join(', j.')},
                    c.company_name,
                    c.company_logo,
                    COALESCE(pos.cnt, 0) AS positions_count,
                    COALESCE(app.cnt, 0) AS applications_count,
                    u.user_name AS created_by_name
             FROM job_postings j
             JOIN companies c ON j.company_id = c.company_id
             LEFT JOIN users u ON j.created_by = u.user_id
             LEFT JOIN (
                 SELECT job_id, COUNT(*) AS cnt
                 FROM job_positions WHERE position_status = 'active'
                 GROUP BY job_id
             ) pos ON j.job_id = pos.job_id
             LEFT JOIN (
                 SELECT job_id, COUNT(*) AS cnt
                 FROM student_applications
                 GROUP BY job_id
             ) app ON j.job_id = app.job_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);
    const total = Number.parseInt(countResult.rows[0].total, 10);

    return {
        jobs: jobResult.rows.map(row => ({
            ...row,
            positions_count: Number.parseInt(row.positions_count, 10),
            applications_count: Number.parseInt(row.applications_count, 10),
        })),
        total,
        page,
        limit,
    };
}

// ============================================================================
// 3. GET JOB BY ID (full details: positions + criteria + rounds + questions)
// ============================================================================

/**
 * Get complete job details with all related data.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @returns {Object} Full job with positions, criteria, rounds, questions
 */
async function getJobById(jobId, collegeId) {
    // 1. Fetch job with company info
    const jobResult = await query(
        `SELECT j.${JOB_RETURNING_COLUMNS.split(', ').join(', j.')},
                c.company_name, c.company_logo, c.company_website,
                u.user_name AS created_by_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         LEFT JOIN users u ON j.created_by = u.user_id
         WHERE j.job_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [jobId, collegeId]
    );

    if (!jobResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    // 2. Fetch all related data — chunked to max 3 connections at a time
    const [positionsRes, criteriaRes, roundsRes, questionsRes, applicationsCountRes] = await chunkedQuery([
        {
            text: `SELECT ${POSITION_COLUMNS} FROM job_positions
             WHERE job_id = $1
             ORDER BY created_at ASC`,
            params: [jobId],
        },
        {
            text: `SELECT ${CRITERIA_COLUMNS} FROM job_eligibility_criteria
             WHERE job_id = $1
             LIMIT 1`,
            params: [jobId],
        },
        {
            text: `SELECT ${ROUND_COLUMNS} FROM job_rounds
             WHERE job_id = $1
             ORDER BY round_number ASC`,
            params: [jobId],
        },
        {
            text: `SELECT ${QUESTION_COLUMNS} FROM application_questions
             WHERE job_id = $1
             ORDER BY question_order ASC`,
            params: [jobId],
        },
        {
            text: `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN application_status = 'pending' THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN application_status = 'shortlisted' THEN 1 ELSE 0 END) AS shortlisted,
                    SUM(CASE WHEN application_status = 'selected' THEN 1 ELSE 0 END) AS selected,
                    SUM(CASE WHEN application_status = 'rejected' THEN 1 ELSE 0 END) AS rejected
             FROM student_applications
             WHERE job_id = $1 AND college_id = $2`,
            params: [jobId, collegeId],
        },
    ], 3);

    const job = jobResult.rows[0];
    const appStats = applicationsCountRes.rows[0];

    return {
        ...job,
        positions: positionsRes.rows,
        eligibility_criteria: criteriaRes.rows[0] || null,
        rounds: roundsRes.rows,
        questions: questionsRes.rows,
        application_stats: {
            total: Number.parseInt(appStats.total, 10),
            pending: Number.parseInt(appStats.pending || 0, 10),
            shortlisted: Number.parseInt(appStats.shortlisted || 0, 10),
            selected: Number.parseInt(appStats.selected || 0, 10),
            rejected: Number.parseInt(appStats.rejected || 0, 10),
        },
    };
}

// ============================================================================
// 4. UPDATE JOB (core fields only)
// ============================================================================

/**
 * Update core job posting fields. Only allowed in draft/published status.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated job
 */
async function updateJob(jobId, collegeId, data) {
    // 1. Verify job exists
    const existing = await query(
        `SELECT j.job_id, j.job_status, j.salary_min, j.salary_max,
                j.application_deadline, c.company_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         WHERE j.job_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [jobId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    // 2. Can only edit draft or published jobs (not closed or cancelled)
    const currentStatus = existing.rows[0].job_status;
    if (currentStatus === STATUS.JOB.CANCELLED || currentStatus === STATUS.JOB.CLOSED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.JOB_NOT_EDITABLE),
            { status: 400 }
        );
    }

    // 3. Validate deadline if being updated
    if (data.application_deadline) {
        const now = new Date();
        const deadline = new Date(data.application_deadline);
        if (deadline <= now) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.DEADLINE_MUST_BE_FUTURE),
                { status: 400 }
            );
        }
    }

    // 4. Validate salary range
    const salaryMin = data.salary_min !== undefined ? data.salary_min : existing.rows[0].salary_min;
    const salaryMax = data.salary_max !== undefined ? data.salary_max : existing.rows[0].salary_max;
    if (salaryMin !== null && salaryMax !== null &&
        Number(salaryMin) > Number(salaryMax)) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.SALARY_MIN_EXCEEDS_MAX),
            { status: 400 }
        );
    }

    // 5. Build dynamic UPDATE
    const fieldsToUpdate = UPDATABLE_FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.NO_FIELDS_TO_UPDATE), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 3}`)
        .concat(['updated_at = NOW()']);
    const values = [jobId, collegeId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE job_postings
         SET ${setClauses.join(', ')}
         WHERE job_id = $1 AND college_id = $2
         RETURNING ${JOB_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Job updated`, {
        jobId,
        updatedFields: fieldsToUpdate,
        collegeId,
    });

    return {
        ...result.rows[0],
        company_name: existing.rows[0].company_name,
    };
}

// ============================================================================
// 5. UPDATE JOB STATUS (with transition validation)
// ============================================================================

/**
 * Change job status following valid transitions:
 *   draft → published, cancelled
 *   published → closed, cancelled
 *   closed → published (reopen)
 *   cancelled → (none — terminal)
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {string} newStatus
 * @returns {Object} Updated job
 */
async function updateJobStatus(jobId, collegeId, newStatus) {
    // 1. Verify job exists
    const existing = await query(
        `SELECT j.job_id, j.job_status, j.application_deadline, c.company_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         WHERE j.job_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [jobId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    const currentStatus = existing.rows[0].job_status;

    // 2. Same status?
    if (currentStatus === newStatus) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.JOB_ALREADY_STATUS),
            { status: 400 }
        );
    }

    // 3. Validate transition
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
        throw Object.assign(
            new Error(`${ERROR_MESSAGES.INVALID_JOB_STATUS_TRANSITION}. Allowed: ${allowedTransitions.join(', ') || 'none'}`),
            { status: 400 }
        );
    }

    // 4. If publishing, validate job has at least 1 active position + valid deadline
    if (newStatus === STATUS.JOB.PUBLISHED) {
        const posCheck = await query(
            `SELECT COUNT(*) AS cnt FROM job_positions
             WHERE job_id = $1 AND position_status = 'active'`,
            [jobId]
        );
        if (Number.parseInt(posCheck.rows[0].cnt, 10) === 0) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.JOB_NO_ACTIVE_POSITIONS),
                { status: 400 }
            );
        }

        // When reopening (closed → published), ensure deadline is still valid
        if (currentStatus === STATUS.JOB.CLOSED) {
            const deadline = new Date(existing.rows[0].application_deadline);
            if (deadline <= new Date()) {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.JOB_EXPIRED_DEADLINE_REOPEN),
                    { status: 400 }
                );
            }
        }
    }

    // 5. Update status + handle allow_applications
    const allowApplications = newStatus === STATUS.JOB.PUBLISHED;

    const result = await query(
        `UPDATE job_postings
         SET job_status = $1, allow_applications = $2, updated_at = NOW()
         WHERE job_id = $3 AND college_id = $4
         RETURNING ${JOB_RETURNING_COLUMNS}`,
        [newStatus, allowApplications, jobId, collegeId]
    );

    logger.info(`${LOG.AUTH} Job status changed`, {
        jobId,
        previousStatus: currentStatus,
        newStatus,
        collegeId,
    });

    return {
        ...result.rows[0],
        company_name: existing.rows[0].company_name,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createJob,
    getAllJobs,
    getJobById,
    updateJob,
    updateJobStatus,
};
