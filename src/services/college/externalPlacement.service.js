/**
 * ============================================================================
 * EXTERNAL PLACEMENT SERVICE — One-Click Off-Campus / PPO Recording
 * ============================================================================
 *   - recordExternalPlacement(collegeId, userId, data)
 *
 * Creates a job + application + placement in a single transaction.
 * Auto-withdraws the student's active applications based on policy.
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');
const { checkOfferPolicy, runAcceptanceCascade } = require('../../utils/policyHelper');
const { notifyOfferCreated } = require('../../utils/placementNotifier');

// ============================================================================
// HELPERS — Extracted to reduce cognitive complexity of the main function
// ============================================================================

/** Validate that the student exists and the target company is active. */
async function validatePreflight(collegeId, studentId, companyId) {
    const studentCheck = await query(
        `SELECT student_id, first_name, last_name, student_email, student_passout_year,
                dept_id
         FROM students
         WHERE student_id = $1 AND college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );
    if (!studentCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const companyCheck = await query(
        `SELECT company_id, company_name, company_status
         FROM companies
         WHERE company_id = $1 AND college_id = $2
         LIMIT 1`,
        [companyId, collegeId]
    );
    if (!companyCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COMPANY_NOT_FOUND), { status: 404 });
    }
    if (companyCheck.rows[0].company_status !== STATUS.COMPANY.ACTIVE) {
        throw Object.assign(new Error(ERROR_MESSAGES.INACTIVE_COMPANY), { status: 400 });
    }

    return { student: studentCheck.rows[0], companyName: companyCheck.rows[0].company_name };
}

/** Check offer policy unless off-campus or explicitly skipped. Pass `client` for in-tx checks. */
async function assertOfferPolicy(studentId, collegeId, passoutYear, skipCheck, isOffCampus, client) {
    if (skipCheck || isOffCampus) return;
    const policy = client
        ? await checkOfferPolicy(studentId, collegeId, passoutYear, client)
        : await checkOfferPolicy(studentId, collegeId, passoutYear);
    if (!policy.allowed) {
        throw Object.assign(new Error(policy.reason), { status: 409 });
    }
}

/** Reuse an explicitly provided job_id after validating ownership and drive type. */
async function reuseProvidedJob(client, providedJobId, collegeId, companyId, effectiveDriveType, effectivePassoutYear) {
    const existingJob = await client.query(
        `SELECT job_id, college_id, company_id, job_title, job_location,
                job_type, drive_type, job_status, passout_years, created_at
         FROM job_postings
         WHERE job_id = $1 AND college_id = $2
         FOR UPDATE`,
        [providedJobId, collegeId]
    );
    if (!existingJob.rows.length) {
        throw Object.assign(new Error('Job not found'), { status: 404 });
    }

    const ej = existingJob.rows[0];
    if (ej.company_id !== companyId) {
        throw Object.assign(new Error('Job does not belong to this company'), { status: 400 });
    }
    if (ej.drive_type !== effectiveDriveType) {
        throw Object.assign(new Error('Drive type mismatch with selected job'), { status: 400 });
    }

    if (!Array.isArray(ej.passout_years) || !ej.passout_years.includes(effectivePassoutYear)) {
        await client.query(
            `UPDATE job_postings SET passout_years = array_append(COALESCE(passout_years, '{}'), $1)
             WHERE job_id = $2`,
            [effectivePassoutYear, ej.job_id]
        );
    }

    return { job: ej, jobId: ej.job_id, jobReused: true };
}

/** Auto-match an existing job by company + title + drive type + passout year, or create a new one. */
async function autoMatchOrCreateJob(client, collegeId, companyId, effectiveDriveType, effectivePassoutYear, jobData) {
    const { job_title, placement_type, fulltime_package, remarks, job_location, job_type, userId } = jobData;

    const autoMatch = await client.query(
        `SELECT job_id, college_id, company_id, job_title, job_location,
                job_type, drive_type, job_status, passout_years, created_at
         FROM job_postings
         WHERE company_id = $1 AND college_id = $2
           AND LOWER(job_title) = LOWER($3)
           AND drive_type = $4
           AND $5 = ANY(passout_years)
         LIMIT 1
         FOR UPDATE`,
        [companyId, collegeId, job_title, effectiveDriveType, effectivePassoutYear]
    );
    if (autoMatch.rows.length) {
        return { job: autoMatch.rows[0], jobId: autoMatch.rows[0].job_id, jobReused: true };
    }

    const salaryPackageStr = (fulltime_package !== undefined && fulltime_package !== null)
        ? String(fulltime_package) : null;
    const jobResult = await client.query(
        `INSERT INTO job_postings
           (college_id, company_id, job_title, job_description, job_location,
            salary_package, salary_min, salary_max,
            job_type, passout_years, application_deadline,
            job_status, allow_applications, drive_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, false, $12, $13)
         RETURNING job_id, college_id, company_id, job_title, job_location,
                   job_type, drive_type, job_status, created_at`,
        [
            collegeId,
            companyId,
            job_title,
            remarks ?? null,
            job_location ?? 'External',
            salaryPackageStr,
            fulltime_package ?? null,
            fulltime_package ?? null,
            job_type ?? placement_type,
            [effectivePassoutYear],
            STATUS.JOB.CLOSED,
            effectiveDriveType,
            userId,
        ]
    );

    return { job: jobResult.rows[0], jobId: jobResult.rows[0].job_id, jobReused: false };
}

/** Find an existing position by name (case-insensitive) or create a new one. */
async function resolveOrCreatePosition(client, jobId, positionName) {
    const existingPos = await client.query(
        `SELECT position_id, vacancies FROM job_positions
         WHERE job_id = $1 AND LOWER(position_name) = LOWER($2)
         LIMIT 1
         FOR UPDATE`,
        [jobId, positionName]
    );

    if (existingPos.rows.length) {
        await client.query(
            `UPDATE job_positions SET vacancies = COALESCE(vacancies, 0) + 1
             WHERE position_id = $1`,
            [existingPos.rows[0].position_id]
        );
        return existingPos.rows[0].position_id;
    }

    const posResult = await client.query(
        `INSERT INTO job_positions (job_id, position_name, vacancies, position_status)
         VALUES ($1, $2, 1, '${STATUS.POSITION.FILLED}')
         RETURNING position_id`,
        [jobId, positionName]
    );
    return posResult.rows[0].position_id;
}

// ============================================================================
// RECORD EXTERNAL PLACEMENT (Orchestrator)
// ============================================================================

/**
 * Record an external placement (off-campus hire, PPO, pool campus, etc.)
 * in a single atomic transaction.
 *
 * Creates:
 *   1. A job posting (status = 'closed', drive_type from data)
 *   2. A single position (vacancy 1)
 *   3. An application (status = 'selected')
 *   4. A placement (status = 'accepted', acceptance_status = 'accepted')
 *
 * Side effects:
 *   - Auto-withdraws active applications based on tier policy
 *   - Notifies the student
 *
 * @param {string} collegeId
 * @param {string} userId - admin who created
 * @param {Object} data
 * @returns {Object} { job, placement }
 */
async function recordExternalPlacement(collegeId, userId, data, options = {}) {
    const {
        student_id, company_id, job_id: providedJobId,
        job_title, job_location, job_type, drive_type, placement_type,
        fulltime_package, fulltime_designation, fulltime_joining_date,
        internship_stipend, internship_duration, internship_start_date,
        offer_letter_url, remarks, passout_year,
    } = data;

    // 1. Pre-flight checks (outside transaction — read-only)
    const { student, companyName } = await validatePreflight(collegeId, student_id, company_id);
    const effectivePassoutYear = passout_year ?? student.student_passout_year;
    const isOffCampus = (drive_type ?? 'off_campus') === 'off_campus';
    const effectiveDriveType = drive_type ?? 'off_campus';

    await assertOfferPolicy(student_id, collegeId, effectivePassoutYear, options.skipOfferCheck, isOffCampus);

    // 2. Transaction — create job + position + application + placement + auto-withdraw
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock student row to prevent concurrent placement creation
        await client.query(
            `SELECT student_id FROM students
             WHERE student_id = $1 AND college_id = $2
             FOR UPDATE`,
            [student_id, collegeId]
        );

        // Re-check offer policy inside transaction (now serialized via lock)
        await assertOfferPolicy(student_id, collegeId, effectivePassoutYear, options.skipOfferCheck, isOffCampus, client);

        // 2a. Resolve or create job posting
        const { job, jobId, jobReused } = providedJobId
            ? await reuseProvidedJob(client, providedJobId, collegeId, company_id, effectiveDriveType, effectivePassoutYear)
            : await autoMatchOrCreateJob(client, collegeId, company_id, effectiveDriveType, effectivePassoutYear, {
                job_title, placement_type, fulltime_package, remarks, job_location, job_type, userId,
            });

        // 2b. Resolve or create position
        const positionName = fulltime_designation || 'External Hire';
        const positionId = await resolveOrCreatePosition(client, jobId, positionName);

        // 2c. Create application (directly as 'offered')
        const appResult = await client.query(
            `INSERT INTO student_applications
               (student_id, job_id, position_id, college_id,
                application_status, is_eligible)
             VALUES ($1, $2, $3, $4, '${STATUS.APPLICATION.OFFERED}', true)
             RETURNING application_id`,
            [student_id, jobId, positionId, collegeId]
        );
        const applicationId = appResult.rows[0].application_id;

        // 2d. Create placement (accepted immediately for external placements)
        const placementResult = await client.query(
            `INSERT INTO placement_results
               (student_id, college_id, company_id, job_id, position_id, application_id,
                placement_type, fulltime_package, fulltime_designation, fulltime_joining_date,
                internship_stipend, internship_duration, internship_start_date,
                offer_letter_url, offer_letter_uploaded_by,
                joining_letter_url, joining_letter_uploaded_by,
                placement_status, acceptance_status,
                offer_expires_at, passout_year)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
             RETURNING placement_id, student_id, college_id, company_id, job_id,
                       placement_type, placement_status, acceptance_status,
                       fulltime_package, fulltime_designation, fulltime_joining_date,
                       internship_stipend, internship_duration, internship_start_date,
                       offer_letter_url, joining_letter_url, passout_year, created_at`,
            [
                student_id, collegeId, company_id, jobId, positionId, applicationId,
                placement_type,
                fulltime_package ?? null, fulltime_designation ?? null, fulltime_joining_date ?? null,
                internship_stipend ?? null, internship_duration ?? null, internship_start_date ?? null,
                offer_letter_url ?? null, offer_letter_url ? 'college' : null,
                data.joining_letter_url ?? null, data.joining_letter_url ? 'college' : null,
                STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.ACCEPTED,
                null, // no expiry — already accepted
                effectivePassoutYear,
            ]
        );
        const placement = placementResult.rows[0];

        // 2e. Auto-withdraw active applications (tier-based cascade)
        const cascadeResult = await runAcceptanceCascade(
            client, placement.placement_id, student_id, collegeId, effectivePassoutYear
        );

        await client.query('COMMIT');

        // 3. Notification (after COMMIT — fire-and-forget)
        notifyOfferCreated(
            collegeId, student_id,
            placement.placement_id, job_title, companyName,
            null
        ).catch(err => logger.warn(`${LOG.TRANSACTION} External placement notify failed`, { error: err.message }));

        logger.info(`${LOG.TRANSACTION} External placement recorded`, {
            placementId: placement.placement_id,
            jobId, jobReused,
            studentId: student_id, companyId: company_id,
            driveType: effectiveDriveType, cascadeResult, collegeId,
        });

        return {
            job: { ...job, company_name: companyName, reused: jobReused },
            placement: {
                ...placement,
                student_name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown',
                student_email: student.student_email,
                company_name: companyName,
                job_title,
            },
            auto_withdrawal: {
                withdrawn_apps: cascadeResult.withdrawn_apps,
                revoked_placements: cascadeResult.revoked_placements,
            },
        };
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`${LOG.TRANSACTION} External placement recording failed — rolled back`, {
            error: error.message,
            studentId: student_id, companyId: company_id, collegeId,
        });
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    recordExternalPlacement,
};
