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
    NOTIFICATION_TYPE,
    RECIPIENT_TYPE,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');
const { assertTransition } = require('../../utils/stateMachine');
const { enforceDeadlines } = require('../../utils/deadlineHelper');
const { logAudit } = require('../../utils/auditHelper');
const { notifyJobPublished } = require('../../utils/placementNotifier');

// Core job fields that can be updated
const UPDATABLE_FIELDS = [
    'job_title', 'job_description', 'job_location',
    'salary_package', 'salary_min', 'salary_max',
    'bond_duration', 'bond_details', 'job_type',
    'internship_duration', 'internship_stipend',
    'passout_years', 'application_deadline', 'allow_applications',
    'drive_type',
];

// Explicit column lists — no SELECT * or RETURNING *
const JOB_RETURNING_COLUMNS = [
    'job_id', 'college_id', 'company_id', 'job_title', 'job_description',
    'job_location', 'salary_package', 'salary_min', 'salary_max',
    'bond_duration', 'bond_details', 'job_type',
    'internship_duration', 'internship_stipend',
    'passout_years', 'application_deadline', 'job_status',
    'allow_applications', 'drive_type', 'tier_id',
    'created_by', 'created_at', 'updated_at',
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
    'min_skill_match_percentage', 'exclude_already_placed', 'created_at',
].join(', ');

const ROUND_COLUMNS = [
    'round_id', 'job_id', 'round_number', 'round_name', 'round_description',
    'round_type', 'round_date', 'round_venue', 'round_status', 'created_at',
].join(', ');

const QUESTION_COLUMNS = [
    'question_id', 'job_id', 'question_text', 'question_type',
    'question_options', 'is_required', 'question_order', 'created_at',
].join(', ');

// Status transitions delegated to src/utils/stateMachine.js

// ============================================================================
// HELPER — Insert eligibility criteria + required skills (within transaction)
// ============================================================================

async function insertJobCriteria(client, jobId, passoutYears, eligibilityCriteria) {
    if (!eligibilityCriteria) return null;

    const ec = eligibilityCriteria;
    const criteriaResult = await client.query(
        `INSERT INTO job_eligibility_criteria
           (job_id, min_overall_cgpa, max_live_kts,
            min_tenth_percentage, min_twelfth_percentage, min_diploma_percentage,
            allowed_genders, allowed_departments, allowed_gap_statuses,
            passout_years, min_existing_package, max_existing_package,
            min_skill_match_percentage, exclude_already_placed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING ${CRITERIA_COLUMNS}`,
        [
            jobId,
            ec.min_overall_cgpa ?? null,
            ec.max_live_kts ?? null,
            ec.min_tenth_percentage ?? null,
            ec.min_twelfth_percentage ?? null,
            ec.min_diploma_percentage ?? null,
            ec.allowed_genders ?? null,
            ec.allowed_departments ?? null,
            ec.allowed_gap_statuses ?? null,
            passoutYears,
            ec.min_existing_package ?? null,
            ec.max_existing_package ?? null,
            ec.min_skill_match_percentage ?? null,
            ec.exclude_already_placed ?? false,
        ]
    );
    const insertedCriteria = criteriaResult.rows[0];

    // Insert required skills for skill-based matching
    if (ec.required_skills && ec.required_skills.length > 0) {
        const skillIds = [...new Set(ec.required_skills.map(s => s.skill_id))];
        await client.query(
            `INSERT INTO job_required_skills (job_id, skill_id)
             SELECT $1, unnest($2::uuid[])
             ON CONFLICT (job_id, skill_id) DO NOTHING`,
            [jobId, skillIds]
        );
    }

    return insertedCriteria;
}

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
        drive_type,
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
                passout_years, application_deadline, job_status, created_by, drive_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             RETURNING ${JOB_RETURNING_COLUMNS}`,
            [
                collegeId, company_id, job_title, job_description ?? null, job_location,
                salary_package ?? null, salary_min ?? null, salary_max ?? null,
                bond_duration ?? null, bond_details ?? null,
                job_type, internship_duration ?? null, internship_stipend ?? null,
                passout_years, application_deadline, STATUS.JOB.DRAFT, userId,
                drive_type ?? 'on_campus',
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
        const insertedCriteria = await insertJobCriteria(client, jobId, passout_years, eligibility_criteria);

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
            const qRequired = questions.map(q => q.is_required === undefined ? true : q.is_required);
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
async function getAllJobs(collegeId, filters = {}, deptScope = null) {
    // Auto-close applications past deadline (check-on-access)
    await enforceDeadlines(collegeId);

    const { page, limit, offset } = getPagination(filters);

    const conditions = ['j.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    // Department scope: show jobs targeting the requester's depts or college-wide jobs
    let deptJoin = '';
    if (deptScope) {
        deptJoin = ' LEFT JOIN job_eligibility_criteria jec_scope ON j.job_id = jec_scope.job_id';
        conditions.push(
            `(jec_scope.allowed_departments IS NULL OR jec_scope.allowed_departments && $${paramIndex}::uuid[])`
        );
        params.push(deptScope);
        paramIndex++;
    }

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

    if (filters.drive_type) {
        conditions.push(`j.drive_type = $${paramIndex}`);
        params.push(filters.drive_type);
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
             JOIN companies c ON j.company_id = c.company_id${deptJoin}
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT j.${JOB_RETURNING_COLUMNS.split(', ').join(', j.')},
                    c.company_name,
                    c.company_logo,
                    ct.tier_name,
                    ct.tier_level,
                    COALESCE(pos.cnt, 0) AS positions_count,
                    COALESCE(app.cnt, 0) AS applications_count,
                    u.user_name AS created_by_name
             FROM job_postings j
             JOIN companies c ON j.company_id = c.company_id${deptJoin}
             LEFT JOIN company_tiers ct ON j.tier_id = ct.tier_id
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
                ct.tier_name, ct.tier_level,
                u.user_name AS created_by_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         LEFT JOIN company_tiers ct ON j.tier_id = ct.tier_id
         LEFT JOIN users u ON j.created_by = u.user_id
         WHERE j.job_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [jobId, collegeId]
    );

    if (!jobResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    // 2. Fetch all related data — chunked to max 3 connections at a time
    const [positionsRes, criteriaRes, roundsRes, questionsRes, applicationsCountRes, requiredSkillsRes] = await chunkedQuery([
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
        {
            text: `SELECT jrs.skill_id, sk.skill_name, sk.skill_category
             FROM job_required_skills jrs
             JOIN skills sk ON jrs.skill_id = sk.skill_id
             WHERE jrs.job_id = $1
             ORDER BY sk.skill_name ASC`,
            params: [jobId],
        },
    ], 3);

    const job = jobResult.rows[0];
    const appStats = applicationsCountRes.rows[0];
    const criteriaRow = criteriaRes.rows[0] || null;

    return {
        ...job,
        positions: positionsRes.rows,
        eligibility_criteria: criteriaRow
            ? { ...criteriaRow, required_skills: requiredSkillsRes.rows }
            : null,
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
    // 1. Verify job exists + fetch application count
    const [existing, appCountResult] = await Promise.all([
        query(
            `SELECT j.job_id, j.job_status, j.salary_min, j.salary_max,
                    j.application_deadline, c.company_name
             FROM job_postings j
             JOIN companies c ON j.company_id = c.company_id
             WHERE j.job_id = $1 AND j.college_id = $2
             LIMIT 1`,
            [jobId, collegeId]
        ),
        query(
            `SELECT COUNT(*) AS total FROM student_applications
             WHERE job_id = $1 AND college_id = $2`,
            [jobId, collegeId]
        ),
    ]);

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    const applicationCount = Number.parseInt(appCountResult.rows[0].total, 10);

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
    const salaryMin = data.salary_min === undefined ? existing.rows[0].salary_min : data.salary_min;
    const salaryMax = data.salary_max === undefined ? existing.rows[0].salary_max : data.salary_max;
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
        applicationCount,
        collegeId,
    });

    return {
        ...result.rows[0],
        company_name: existing.rows[0].company_name,
        application_count: applicationCount,
    };
}

// ============================================================================
// 5. UPDATE JOB STATUS (with transition validation)
// ============================================================================

/**
 * Determine the best tier_id for a job by iterating ALL passout years
 * and picking the tier with the highest tier_level.
 */
async function autoClassifyTier(jobId, collegeId) {
    const jobInfo = await query(
        `SELECT salary_max, passout_years FROM job_postings WHERE job_id = $1`,
        [jobId]
    );
    const { salary_max, passout_years } = jobInfo.rows[0];
    if (!salary_max || !passout_years?.length) return null;

    const { classifyJobTier } = require('./companyTier.service');
    let bestTier = null;
    for (const year of passout_years) {
        const tier = await classifyJobTier(collegeId, year, salary_max);
        if (tier && (!bestTier || tier.tier_level > bestTier.tier_level)) {
            bestTier = tier;
        }
    }
    return bestTier?.tier_id || null;
}

/**
 * Cascade on job close/cancel: reject active apps, cancel pending/in_progress rounds.
 * MUST run inside a transaction — accepts client, not the pool query function.
 */
async function cascadeJobClose(client, jobId, collegeId) {
    // Reject pending + under_review + shortlisted applications
    const rejectedApps = await client.query(
        `UPDATE student_applications
         SET application_status = $1,
             eligibility_remarks = COALESCE(eligibility_remarks, '') || ' | Auto-rejected: job closed',
             last_updated_at = NOW()
         WHERE job_id = $2 AND college_id = $3
           AND application_status IN ($4, $5, $6)
         RETURNING application_id, student_id`,
        [STATUS.APPLICATION.REJECTED, jobId, collegeId,
         STATUS.APPLICATION.PENDING, STATUS.APPLICATION.UNDER_REVIEW, STATUS.APPLICATION.SHORTLISTED]
    );

    // Reject selected + waitlisted applications (no active offer yet)
    const rejectedAdvanced = await client.query(
        `UPDATE student_applications
         SET application_status = $1,
             eligibility_remarks = COALESCE(eligibility_remarks, '') || ' | Auto-rejected: job cancelled',
             last_updated_at = NOW()
         WHERE job_id = $2 AND college_id = $3
           AND application_status IN ($4, $5)
         RETURNING application_id, student_id`,
        [STATUS.APPLICATION.REJECTED, jobId, collegeId,
         STATUS.APPLICATION.SELECTED, STATUS.APPLICATION.WAITLISTED]
    );

    // Revoke active placements (offered status only — accepted/joined placements are kept)
    const revokedPlacements = await client.query(
        `UPDATE placement_results
         SET placement_status = 'revoked',
             updated_at = NOW()
         WHERE job_id = $1 AND college_id = $2
           AND placement_status = 'offered'
         RETURNING placement_id, student_id, application_id`,
        [jobId, collegeId]
    );

    // Reject the applications behind revoked placements
    if (revokedPlacements.rowCount > 0) {
        const revokedAppIds = revokedPlacements.rows.map(r => r.application_id);
        await client.query(
            `UPDATE student_applications
             SET application_status = $1,
                 eligibility_remarks = COALESCE(eligibility_remarks, '') || ' | Offer revoked: job cancelled',
                 last_updated_at = NOW()
             WHERE application_id = ANY($2)`,
            [STATUS.APPLICATION.REJECTED, revokedAppIds]
        );
    }

    // Cancel pending + in_progress rounds
    const cancelledRounds = await client.query(
        `UPDATE job_rounds
         SET round_status = $1
         WHERE job_id = $2
           AND round_status IN ($3, $4)
         RETURNING round_id`,
        [STATUS.ROUND.CANCELLED, jobId,
         STATUS.ROUND.PENDING, STATUS.ROUND.IN_PROGRESS]
    );

    // Notify affected students (batched to handle large cascades)
    const allAffectedStudents = [
        ...rejectedApps.rows.map(r => ({ ...r, reason: 'Your application was automatically rejected because the job posting was closed.' })),
        ...rejectedAdvanced.rows.map(r => ({ ...r, reason: 'Your application was rejected because the job has been cancelled.' })),
        ...revokedPlacements.rows.map(r => ({ student_id: r.student_id, application_id: r.application_id, reason: 'Your offer has been revoked because the job has been cancelled.' })),
    ];

    if (allAffectedStudents.length > 0) {
        const BATCH = 100;
        for (let i = 0; i < allAffectedStudents.length; i += BATCH) {
            const batch = allAffectedStudents.slice(i, i + BATCH);
            const vals = batch.map((_, j) => {
                const o = j * 8;
                return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
            }).join(', ');
            const params = batch.flatMap(row => [
                collegeId, RECIPIENT_TYPE.STUDENT, row.student_id,
                'Application Auto-Rejected',
                row.reason,
                NOTIFICATION_TYPE.AUTO_WITHDRAWN,
                'application', row.application_id,
            ]);

            await client.query(
                `INSERT INTO notifications
                    (college_id, recipient_type, recipient_id, title, body,
                     notification_type, related_entity_type, related_entity_id)
                 VALUES ${vals}`,
                params
            );
        }
    }

    const totalRejected = rejectedApps.rowCount + rejectedAdvanced.rowCount + revokedPlacements.rowCount;

    // Audit trail for cascade
    await logAudit(client, {
        collegeId,
        userId: 'system',
        userName: 'System',
        userRole: 'system',
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.JOB,
        resourceId: jobId,
        summary: `Job close cascade: ${totalRejected} applications rejected, ${revokedPlacements.rowCount} offers revoked, ${cancelledRounds.rowCount} rounds cancelled`,
        metadata: {
            applicationsRejected: rejectedApps.rowCount,
            advancedAppsRejected: rejectedAdvanced.rowCount,
            offersRevoked: revokedPlacements.rowCount,
            roundsCancelled: cancelledRounds.rowCount,
        },
    });

    if (totalRejected > 0 || cancelledRounds.rowCount > 0) {
        logger.info(`${LOG.AUTH} Job close cascade`, {
            jobId, collegeId,
            applicationsRejected: rejectedApps.rowCount,
            advancedAppsRejected: rejectedAdvanced.rowCount,
            offersRevoked: revokedPlacements.rowCount,
            roundsCancelled: cancelledRounds.rowCount,
        });
    }

    return {
        applicationsRejected: totalRejected,
        offersRevoked: revokedPlacements.rowCount,
        roundsCancelled: cancelledRounds.rowCount,
    };
}

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
    // 1. Verify job exists (outside transaction — read-only)
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

    // 2. Validate transition (same-status + invalid both handled)
    assertTransition('job', currentStatus, newStatus);

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

    // 5. Auto-classify tier on publish
    const autoTierId = newStatus === STATUS.JOB.PUBLISHED
        ? await autoClassifyTier(jobId, collegeId)
        : null;

    // 6. Update status + cascade in a single transaction
    const allowApplications = newStatus === STATUS.JOB.PUBLISHED;
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const updateFields = ['job_status = $1', 'allow_applications = $2', 'updated_at = NOW()'];
        const updateParams = [newStatus, allowApplications];
        let paramIdx = 3;

        if (autoTierId) {
            updateFields.push(`tier_id = $${paramIdx}`);
            updateParams.push(autoTierId);
            paramIdx++;
        }

        updateParams.push(jobId, collegeId);

        const result = await client.query(
            `UPDATE job_postings
             SET ${updateFields.join(', ')}
             WHERE job_id = $${paramIdx} AND college_id = $${paramIdx + 1}
             RETURNING ${JOB_RETURNING_COLUMNS}`,
            updateParams
        );

        // 7. Cascade on job close/cancel (inside same transaction)
        let cascade = null;
        if (newStatus === STATUS.JOB.CLOSED || newStatus === STATUS.JOB.CANCELLED) {
            cascade = await cascadeJobClose(client, jobId, collegeId);
        }

        await client.query('COMMIT');

        // Fire-and-forget: notify students when job is published
        if (newStatus === STATUS.JOB.PUBLISHED && currentStatus !== STATUS.JOB.PUBLISHED) {
            notifyJobPublished(collegeId, jobId, result.rows[0].job_title, existing.rows[0].company_name).catch(() => {});
        }

        logger.info(`${LOG.AUTH} Job status changed`, {
            jobId,
            previousStatus: currentStatus,
            newStatus,
            collegeId,
        });

        return {
            ...result.rows[0],
            company_name: existing.rows[0].company_name,
            _previousStatus: currentStatus,
            _cascade: cascade,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
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
