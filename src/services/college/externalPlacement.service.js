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
    NOTIFICATION_TYPE,
    RECIPIENT_TYPE,
} = require('../../config/constants');
const { checkOfferPolicy } = require('../../utils/policyHelper');
const { notifyOfferCreated } = require('../../utils/placementNotifier');

// ============================================================================
// RECORD EXTERNAL PLACEMENT (Transaction: job + application + placement)
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
async function recordExternalPlacement(collegeId, userId, data) {
    const {
        student_id,
        company_id,
        job_title,
        job_location,
        job_type,
        drive_type,
        placement_type,
        fulltime_package,
        fulltime_designation,
        fulltime_joining_date,
        internship_stipend,
        internship_duration,
        internship_start_date,
        offer_letter_url,
        joining_letter_url,
        remarks,
        passout_year,
    } = data;

    // 1. Pre-flight checks (outside transaction — read-only)

    // Verify student exists in this college
    const studentCheck = await query(
        `SELECT student_id, first_name, last_name, student_email, student_passout_year,
                dept_id
         FROM students
         WHERE student_id = $1 AND college_id = $2
         LIMIT 1`,
        [student_id, collegeId]
    );

    if (!studentCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const student = studentCheck.rows[0];
    const effectivePassoutYear = passout_year ?? student.student_passout_year;

    // Verify company exists and is active
    const companyCheck = await query(
        `SELECT company_id, company_name, company_status
         FROM companies
         WHERE company_id = $1 AND college_id = $2
         LIMIT 1`,
        [company_id, collegeId]
    );

    if (!companyCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COMPANY_NOT_FOUND), { status: 404 });
    }

    if (companyCheck.rows[0].company_status !== STATUS.COMPANY.ACTIVE) {
        throw Object.assign(new Error(ERROR_MESSAGES.INACTIVE_COMPANY), { status: 400 });
    }

    const companyName = companyCheck.rows[0].company_name;

    // Check offer policy (max_active_offers)
    const offerPolicy = await checkOfferPolicy(student_id, collegeId, effectivePassoutYear);
    if (!offerPolicy.allowed) {
        throw Object.assign(new Error(offerPolicy.reason), { status: 409 });
    }

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
        const offerPolicyTx = await checkOfferPolicy(student_id, collegeId, effectivePassoutYear, client);
        if (!offerPolicyTx.allowed) {
            throw Object.assign(new Error(offerPolicyTx.reason), { status: 409 });
        }

        // 2a. Create job posting (closed immediately — external placements don't need applications)
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
                company_id,
                job_title,
                remarks ?? null,
                job_location ?? 'External',
                salaryPackageStr,
                fulltime_package ?? null,
                fulltime_package ?? null,
                job_type ?? placement_type,
                [effectivePassoutYear],
                STATUS.JOB.CLOSED,
                drive_type ?? 'off_campus',
                userId,
            ]
        );

        const job = jobResult.rows[0];
        const jobId = job.job_id;

        // 2b. Create a single position
        const posResult = await client.query(
            `INSERT INTO job_positions (job_id, position_name, vacancies, position_status)
             VALUES ($1, $2, 1, 'filled')
             RETURNING position_id`,
            [jobId, fulltime_designation || 'External Hire']
        );

        const positionId = posResult.rows[0].position_id;

        // 2c. Create application (directly as 'selected' → 'offered')
        const appResult = await client.query(
            `INSERT INTO student_applications
               (student_id, job_id, position_id, college_id,
                application_status, is_eligible)
             VALUES ($1, $2, $3, $4, 'offered', true)
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
                student_id,
                collegeId,
                company_id,
                jobId,
                positionId,
                applicationId,
                placement_type,
                fulltime_package ?? null,
                fulltime_designation ?? null,
                fulltime_joining_date ?? null,
                internship_stipend ?? null,
                internship_duration ?? null,
                internship_start_date ?? null,
                offer_letter_url ?? null,
                offer_letter_url ? 'college' : null,
                data.joining_letter_url ?? null,
                data.joining_letter_url ? 'college' : null,
                STATUS.PLACEMENT.ACCEPTED,
                'accepted',
                null, // no expiry — already accepted
                effectivePassoutYear,
            ]
        );

        const placement = placementResult.rows[0];

        // 2e. Auto-withdraw active applications for this student
        // Use the same tier-based logic as acceptance cascade
        const { runAcceptanceCascade } = require('../../utils/policyHelper');
        const cascadeResult = await runAcceptanceCascade(
            client,
            placement.placement_id,
            student_id,
            collegeId,
            effectivePassoutYear
        );

        await client.query('COMMIT');

        // 3. Notification (after COMMIT — fire-and-forget)
        notifyOfferCreated(
            collegeId, student_id,
            placement.placement_id, job_title, companyName,
            null
        ).catch(() => {});

        logger.info(`${LOG.TRANSACTION} External placement recorded`, {
            placementId: placement.placement_id,
            jobId,
            studentId: student_id,
            companyId: company_id,
            driveType: drive_type ?? 'off_campus',
            cascadeResult,
            collegeId,
        });

        return {
            job: {
                ...job,
                company_name: companyName,
            },
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
            studentId: student_id,
            companyId: company_id,
            collegeId,
        });
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    recordExternalPlacement,
};
