/**
 * ============================================================================
 * PLACEMENT RESULT SERVICE — Placement Record Management
 * ============================================================================
 *   - createPlacement(collegeId, userId, data)
 *   - getAllPlacements(collegeId, filters)
 *   - getPlacement(placementId, collegeId)
 *   - updatePlacement(placementId, collegeId, data)
 *   - verifyOfferLetter(placementId, collegeId, userId, verified, remarks)
 *   - updatePlacementStatus(placementId, collegeId, newStatus, acceptanceStatus, remarks)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
    NOTIFICATION_TYPE,
    RECIPIENT_TYPE,
} = require('../../config/constants');
const { assertTransition } = require('../../utils/stateMachine');
const { checkOfferPolicy, checkVacancy, autoFillPositions, reactivatePositions, sweepExpiredOffers } = require('../../utils/policyHelper');
const { promoteFromWaitlist } = require('../../utils/waitlistPromoter');
const { notifyOfferCreated, notifyExpiringOffers } = require('../../utils/placementNotifier');

// ============================================================================
// COLUMN CONSTANTS
// ============================================================================

const PLACEMENT_VERIFY_COLUMNS = `
    pr.placement_id, pr.student_id, pr.college_id, pr.company_id, pr.job_id,
    pr.position_id, pr.application_id,
    pr.placement_type,
    pr.fulltime_package, pr.fulltime_designation, pr.fulltime_joining_date,
    pr.internship_stipend, pr.internship_duration, pr.internship_start_date,
    pr.offer_letter_url, pr.offer_letter_verified,
    pr.offer_letter_rejection_reason, pr.offer_letter_rejected_at, pr.offer_letter_uploaded_by,
    pr.verified_by, pr.verified_at,
    pr.joining_letter_url, pr.joining_letter_verified,
    pr.joining_letter_verified_by, pr.joining_letter_verified_at,
    pr.joining_letter_rejection_reason, pr.joining_letter_rejected_at, pr.joining_letter_uploaded_by,
    pr.placement_status, pr.acceptance_status, pr.offer_expires_at,
    pr.passout_year, pr.created_at, pr.updated_at`;

const PLACEMENT_RETURNING_COLUMNS = `
    placement_id, student_id, college_id, company_id, job_id, position_id, application_id,
    placement_type,
    fulltime_package, fulltime_designation, fulltime_joining_date,
    internship_stipend, internship_duration, internship_start_date,
    offer_letter_url, offer_letter_verified, verified_by, verified_at,
    offer_letter_rejection_reason, offer_letter_rejected_at, offer_letter_uploaded_by,
    joining_letter_url, joining_letter_verified, joining_letter_verified_by, joining_letter_verified_at,
    joining_letter_rejection_reason, joining_letter_rejected_at, joining_letter_uploaded_by,
    placement_status, acceptance_status, offer_expires_at,
    passout_year, created_at, updated_at`;

const APPLICATION_FETCH_COLUMNS = `
    a.application_id, a.student_id, a.job_id, a.college_id,
    a.position_id, a.application_status, a.applied_at, a.last_updated_at`;

// Fields that can be updated on a placement record
const UPDATABLE_FIELDS = [
    'fulltime_package', 'fulltime_designation', 'fulltime_joining_date',
    'internship_stipend', 'internship_duration', 'internship_start_date',
    'offer_letter_url', 'joining_letter_url',
];

// Placement status transitions delegated to src/utils/stateMachine.js

// ============================================================================
// HELPER — Verify placement exists and belongs to college
// ============================================================================

async function verifyPlacement(placementId, collegeId) {
    const result = await query(
        `SELECT ${PLACEMENT_VERIFY_COLUMNS},
                s.first_name, s.last_name, s.student_email,
                d.dept_name,
                c.company_name,
                j.job_title, j.job_status,
                p.position_name,
                u.user_name AS verified_by_name,
                u2.user_name AS joining_letter_verified_by_name
         FROM placement_results pr
         JOIN students s ON pr.student_id = s.student_id
         JOIN companies c ON pr.company_id = c.company_id
         JOIN job_postings j ON pr.job_id = j.job_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN job_positions p ON pr.position_id = p.position_id
         LEFT JOIN users u ON pr.verified_by = u.user_id
         LEFT JOIN users u2 ON pr.joining_letter_verified_by = u2.user_id
         WHERE pr.placement_id = $1 AND pr.college_id = $2
         LIMIT 1`,
        [placementId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Validate future dates on placement data
// ============================================================================

function validatePlacementDates(data) {
    if (data.fulltime_joining_date) {
        const joinDate = new Date(data.fulltime_joining_date);
        if (joinDate <= new Date()) {
            throw Object.assign(new Error(ERROR_MESSAGES.JOINING_DATE_MUST_BE_FUTURE), { status: 400 });
        }
    }
    if (data.internship_start_date) {
        const startDate = new Date(data.internship_start_date);
        if (startDate <= new Date()) {
            throw Object.assign(new Error(ERROR_MESSAGES.INTERNSHIP_START_DATE_MUST_BE_FUTURE), { status: 400 });
        }
    }
}

// ============================================================================
// 1. CREATE PLACEMENT (from a selected/offered application)
// ============================================================================

/**
 * Create a placement record linked to a student application.
 * Validates: application exists, is selected/offered, no duplicate placement.
 *
 * @param {string} collegeId
 * @param {string} userId - who created the record (verified_by on future verify)
 * @param {Object} data
 * @returns {Object} Created placement
 */
async function createPlacement(collegeId, userId, data) {
    const { application_id, placement_type } = data;

    // 1. Fetch application (read-only pre-flight — safe outside transaction)
    const appResult = await query(
        `SELECT ${APPLICATION_FETCH_COLUMNS},
                s.first_name, s.last_name, s.student_email, s.student_passout_year,
                d.dept_name,
                j.job_title, j.company_id, j.job_status,
                c.company_name,
                p.position_name
         FROM student_applications a
         JOIN students s ON a.student_id = s.student_id
         JOIN job_postings j ON a.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN job_positions p ON a.position_id = p.position_id
         WHERE a.application_id = $1 AND a.college_id = $2
         LIMIT 1`,
        [application_id, collegeId]
    );

    if (!appResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.APPLICATION_NOT_FOUND), { status: 404 });
    }

    const app = appResult.rows[0];

    // 2. Application must be selected or offered
    if (!['selected', 'offered'].includes(app.application_status)) {
        throw Object.assign(new Error(ERROR_MESSAGES.APPLICATION_NOT_ELIGIBLE_FOR_PLACEMENT), { status: 400 });
    }

    // 3. Validate future dates
    validatePlacementDates(data);

    // 5. Policy checks: max_active_offers + vacancy enforcement
    const [offerPolicy, vacancyPolicy] = await Promise.all([
        checkOfferPolicy(app.student_id, collegeId, app.student_passout_year),
        checkVacancy(app.job_id, app.position_id),
    ]);

    if (!offerPolicy.allowed) {
        throw Object.assign(new Error(offerPolicy.reason), { status: 409 });
    }
    if (!vacancyPolicy.allowed) {
        throw Object.assign(new Error(vacancyPolicy.reason), { status: 409 });
    }

    // 6. Compute offer_expires_at from placement_settings.default_offer_days
    let offerExpiresAt = data.offer_expires_at ?? null;
    if (!offerExpiresAt) {
        const settingsResult = await query(
            `SELECT default_offer_days FROM placement_settings
             WHERE college_id = $1 AND passout_year = $2 LIMIT 1`,
            [collegeId, app.student_passout_year]
        );
        const defaultDays = settingsResult.rows[0]?.default_offer_days ?? 7;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + defaultDays);
        offerExpiresAt = expiry.toISOString();
    }

    // 7. Insert placement + update application status atomically
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Re-check duplicate inside transaction to prevent race condition
        const duplicateCheck = await client.query(
            `SELECT placement_id FROM placement_results
             WHERE application_id = $1
             LIMIT 1`,
            [application_id]
        );

        if (duplicateCheck.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_DUPLICATE_APPLICATION), { status: 409 });
        }

        // Re-check policy inside transaction (authoritative — prevents concurrent offer creation)
        const [offerPolicyTx, vacancyPolicyTx] = await Promise.all([
            checkOfferPolicy(app.student_id, collegeId, app.student_passout_year, client),
            checkVacancy(app.job_id, app.position_id, client),
        ]);

        if (!offerPolicyTx.allowed) {
            throw Object.assign(new Error(offerPolicyTx.reason), { status: 409 });
        }
        if (!vacancyPolicyTx.allowed) {
            throw Object.assign(new Error(vacancyPolicyTx.reason), { status: 409 });
        }

        const result = await client.query(
            `INSERT INTO placement_results
               (student_id, college_id, company_id, job_id, position_id, application_id,
                placement_type, fulltime_package, fulltime_designation, fulltime_joining_date,
                internship_stipend, internship_duration, internship_start_date,
                offer_letter_url, offer_letter_uploaded_by,
                joining_letter_url, joining_letter_uploaded_by,
                placement_status, acceptance_status, offer_expires_at, passout_year)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
             RETURNING ${PLACEMENT_RETURNING_COLUMNS}`,
            [
                app.student_id,
                collegeId,
                app.company_id,
                app.job_id,
                app.position_id ?? null,
                application_id,
                placement_type,
                data.fulltime_package ?? null,
                data.fulltime_designation ?? null,
                data.fulltime_joining_date ?? null,
                data.internship_stipend ?? null,
                data.internship_duration ?? null,
                data.internship_start_date ?? null,
                data.offer_letter_url ?? null,
                data.offer_letter_url ? 'college' : null,
                data.joining_letter_url ?? null,
                data.joining_letter_url ? 'college' : null,
                STATUS.PLACEMENT.OFFERED,
                'pending',
                offerExpiresAt,
                app.student_passout_year,
            ]
        );

        // 8. Update application status to 'offered' if it was 'selected'
        if (app.application_status === 'selected') {
            await client.query(
                `UPDATE student_applications
                 SET application_status = 'offered', last_updated_at = NOW()
                 WHERE application_id = $1`,
                [application_id]
            );
        }

        // 9. Auto-fill positions if vacancies are now exhausted
        await autoFillPositions(client, collegeId);

        await client.query('COMMIT');

        // 10. Notify student about the offer (after COMMIT — fire-and-forget)
        notifyOfferCreated(
            collegeId, app.student_id,
            result.rows[0].placement_id, app.job_title, app.company_name,
            offerExpiresAt
        ).catch(() => {});

        logger.info(`${LOG.AUTH} Placement record created`, {
            placementId: result.rows[0].placement_id,
            studentId: app.student_id,
            jobId: app.job_id,
            companyId: app.company_id,
            placementType: placement_type,
            collegeId,
        });

        return {
            ...result.rows[0],
            student_name: `${app.first_name} ${app.last_name}`,
            student_email: app.student_email,
            dept_name: app.dept_name ?? null,
            company_name: app.company_name,
            job_title: app.job_title,
            position_name: app.position_name ?? null,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 2. GET ALL PLACEMENTS (paginated, filtered, sorted)
// ============================================================================

/**
 * List placements with filters, sorting, and pagination.
 *
 * @param {string} collegeId
 * @param {Object} filters
 * @returns {{ placements, total, page, limit, stats }}
 */
async function getAllPlacements(collegeId, filters = {}) {
    // Proactive expiry sweep — auto-expire offered placements past deadline
    await sweepExpiredOffers(collegeId);
    // Proactive expiring-soon reminders (TTL-cached, fire-and-forget)
    notifyExpiringOffers(collegeId).catch(() => {});

    const { page, limit, offset } = getPagination(filters);

    const conditions = ['pr.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    if (filters.passout_year) {
        conditions.push(`pr.passout_year = $${paramIndex}`);
        params.push(filters.passout_year);
        paramIndex++;
    }

    if (filters.company_id) {
        conditions.push(`pr.company_id = $${paramIndex}`);
        params.push(filters.company_id);
        paramIndex++;
    }

    if (filters.job_id) {
        conditions.push(`pr.job_id = $${paramIndex}`);
        params.push(filters.job_id);
        paramIndex++;
    }

    if (filters.placement_status) {
        conditions.push(`pr.placement_status = $${paramIndex}`);
        params.push(filters.placement_status);
        paramIndex++;
    }

    if (filters.placement_type) {
        conditions.push(`pr.placement_type = $${paramIndex}`);
        params.push(filters.placement_type);
        paramIndex++;
    }

    if (filters.acceptance_status) {
        conditions.push(`pr.acceptance_status = $${paramIndex}`);
        params.push(filters.acceptance_status);
        paramIndex++;
    }

    if (filters.offer_letter_verified !== undefined && filters.offer_letter_verified !== '') {
        conditions.push(`pr.offer_letter_verified = $${paramIndex}`);
        params.push(filters.offer_letter_verified === 'true');
        paramIndex++;
    }

    if (filters.search) {
        conditions.push(
            `(s.first_name ILIKE $${paramIndex} OR s.last_name ILIKE $${paramIndex} OR s.student_email ILIKE $${paramIndex} OR co.company_name ILIKE $${paramIndex} OR j.job_title ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sort
    const SORTABLE = {
        created_at: 'pr.created_at',
        fulltime_package: 'pr.fulltime_package',
        student_name: 's.first_name',
        placement_status: 'pr.placement_status',
        passout_year: 'pr.passout_year',
        company_name: 'co.company_name',
    };
    const sortCol = SORTABLE[filters.sort_by] || 'pr.created_at';
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Build stats params (independent of filter params)
    const statsParams = [collegeId];
    let statsWhere = 'pr.college_id = $1';
    if (filters.passout_year) {
        statsWhere += ' AND pr.passout_year = $2';
        statsParams.push(filters.passout_year);
    }

    // Run count, fetch, and stats in parallel (all independent)
    const [countResult, placementResult, statsResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM placement_results pr
             JOIN students s ON pr.student_id = s.student_id
             JOIN companies co ON pr.company_id = co.company_id
             JOIN job_postings j ON pr.job_id = j.job_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT ${PLACEMENT_VERIFY_COLUMNS},
                    s.first_name, s.last_name, s.student_email,
                    d.dept_name,
                    co.company_name,
                    j.job_title,
                    p.position_name,
                    u.user_name AS verified_by_name,
                    u2.user_name AS joining_letter_verified_by_name
             FROM placement_results pr
             JOIN students s ON pr.student_id = s.student_id
             JOIN companies co ON pr.company_id = co.company_id
             JOIN job_postings j ON pr.job_id = j.job_id
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             LEFT JOIN job_positions p ON pr.position_id = p.position_id
             LEFT JOIN users u ON pr.verified_by = u.user_id
             LEFT JOIN users u2 ON pr.joining_letter_verified_by = u2.user_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT
                COUNT(*) AS total_placements,
                COUNT(DISTINCT pr.student_id) AS unique_students,
                COUNT(DISTINCT pr.company_id) AS unique_companies,
                AVG(pr.fulltime_package) FILTER (WHERE pr.fulltime_package IS NOT NULL) AS avg_package,
                MAX(pr.fulltime_package) AS highest_package,
                MIN(pr.fulltime_package) FILTER (WHERE pr.fulltime_package IS NOT NULL AND pr.fulltime_package > 0) AS lowest_package,
                SUM(CASE WHEN pr.placement_status = 'offered' THEN 1 ELSE 0 END) AS offered_count,
                SUM(CASE WHEN pr.placement_status = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
                SUM(CASE WHEN pr.placement_status = 'joined' THEN 1 ELSE 0 END) AS joined_count,
                SUM(CASE WHEN pr.placement_status = 'declined' THEN 1 ELSE 0 END) AS declined_count,
                SUM(CASE WHEN pr.placement_status = 'revoked' THEN 1 ELSE 0 END) AS revoked_count,
                SUM(CASE WHEN pr.placement_status = 'expired' THEN 1 ELSE 0 END) AS expired_count,
                SUM(CASE WHEN pr.placement_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
                SUM(CASE WHEN pr.offer_letter_verified = true THEN 1 ELSE 0 END) AS verified_offers,
                SUM(CASE WHEN pr.joining_letter_verified = true THEN 1 ELSE 0 END) AS verified_joining_letters
             FROM placement_results pr
             WHERE ${statsWhere}`,
            statsParams
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);

    const stats = statsResult.rows[0];

    return {
        placements: placementResult.rows.map(row => ({
            placement_id: row.placement_id,
            student_id: row.student_id,
            job_id: row.job_id,
            company_id: row.company_id,
            position_id: row.position_id,
            application_id: row.application_id,
            placement_type: row.placement_type,
            fulltime_package: row.fulltime_package === null ? null : Number.parseFloat(row.fulltime_package),
            fulltime_designation: row.fulltime_designation,
            fulltime_joining_date: row.fulltime_joining_date,
            internship_stipend: row.internship_stipend === null ? null : Number.parseFloat(row.internship_stipend),
            internship_duration: row.internship_duration,
            internship_start_date: row.internship_start_date,
            offer_letter_url: row.offer_letter_url,
            offer_letter_verified: row.offer_letter_verified,
            offer_letter_rejection_reason: row.offer_letter_rejection_reason ?? null,
            offer_letter_rejected_at: row.offer_letter_rejected_at ?? null,
            offer_letter_uploaded_by: row.offer_letter_uploaded_by ?? null,
            verified_by_name: row.verified_by_name ?? null,
            verified_at: row.verified_at,
            joining_letter_url: row.joining_letter_url ?? null,
            joining_letter_verified: row.joining_letter_verified ?? false,
            joining_letter_verified_by_name: row.joining_letter_verified_by_name ?? null,
            joining_letter_verified_at: row.joining_letter_verified_at ?? null,
            joining_letter_rejection_reason: row.joining_letter_rejection_reason ?? null,
            joining_letter_rejected_at: row.joining_letter_rejected_at ?? null,
            joining_letter_uploaded_by: row.joining_letter_uploaded_by ?? null,
            placement_status: row.placement_status,
            acceptance_status: row.acceptance_status,
            offer_expires_at: row.offer_expires_at ?? null,
            passout_year: row.passout_year,
            created_at: row.created_at,
            updated_at: row.updated_at,
            // Joined data
            student_name: `${row.first_name} ${row.last_name}`,
            student_email: row.student_email,
            dept_name: row.dept_name ?? null,
            company_name: row.company_name,
            job_title: row.job_title,
            position_name: row.position_name ?? null,
        })),
        total,
        page,
        limit,
        stats: {
            total_placements: Number.parseInt(stats.total_placements, 10),
            unique_students: Number.parseInt(stats.unique_students, 10),
            unique_companies: Number.parseInt(stats.unique_companies, 10),
            avg_package: stats.avg_package === null ? null : Math.round(Number.parseFloat(stats.avg_package) * 100) / 100,
            highest_package: stats.highest_package === null ? null : Number.parseFloat(stats.highest_package),
            lowest_package: stats.lowest_package === null ? null : Number.parseFloat(stats.lowest_package),
            offered_count: Number.parseInt(stats.offered_count || 0, 10),
            accepted_count: Number.parseInt(stats.accepted_count || 0, 10),
            joined_count: Number.parseInt(stats.joined_count || 0, 10),
            declined_count: Number.parseInt(stats.declined_count || 0, 10),
            revoked_count: Number.parseInt(stats.revoked_count || 0, 10),
            expired_count: Number.parseInt(stats.expired_count || 0, 10),
            cancelled_count: Number.parseInt(stats.cancelled_count || 0, 10),
            verified_offers: Number.parseInt(stats.verified_offers || 0, 10),
            verified_joining_letters: Number.parseInt(stats.verified_joining_letters || 0, 10),
        },
    };
}

// ============================================================================
// 3. GET SINGLE PLACEMENT (full detail)
// ============================================================================

/**
 * Get complete placement detail with student, job, round results.
 *
 * @param {string} placementId
 * @param {string} collegeId
 * @returns {Object} Full placement detail
 */
async function getPlacement(placementId, collegeId) {
    const placement = await verifyPlacement(placementId, collegeId);

    // Fetch round results + academic info in parallel
    const [roundResults, academicResult] = await Promise.all([
        query(
            `SELECT rr.result_id, rr.round_id, rr.result_status, rr.score, rr.remarks,
                    rr.attended, rr.scheduled_at, rr.completed_at,
                    jr.round_name, jr.round_number, jr.round_type, jr.round_status
             FROM student_round_results rr
             JOIN job_rounds jr ON rr.round_id = jr.round_id
             WHERE rr.student_id = $1 AND jr.job_id = $2
             ORDER BY jr.round_number ASC`,
            [placement.student_id, placement.job_id]
        ),
        query(
            `SELECT overall_cgpa, total_live_kts, total_dead_kts,
                    tenth_percentage, twelfth_percentage, diploma_percentage,
                    roll_number, enrollment_number
             FROM student_academic_information
             WHERE student_id = $1
             LIMIT 1`,
            [placement.student_id]
        ),
    ]);

    return {
        placement_id: placement.placement_id,
        student_id: placement.student_id,
        job_id: placement.job_id,
        company_id: placement.company_id,
        position_id: placement.position_id,
        application_id: placement.application_id,
        placement_type: placement.placement_type,
        fulltime_package: placement.fulltime_package === null ? null : Number.parseFloat(placement.fulltime_package),
        fulltime_designation: placement.fulltime_designation,
        fulltime_joining_date: placement.fulltime_joining_date,
        internship_stipend: placement.internship_stipend === null ? null : Number.parseFloat(placement.internship_stipend),
        internship_duration: placement.internship_duration,
        internship_start_date: placement.internship_start_date,
        offer_letter_url: placement.offer_letter_url,
        offer_letter_verified: placement.offer_letter_verified,
        offer_letter_rejection_reason: placement.offer_letter_rejection_reason ?? null,
        offer_letter_rejected_at: placement.offer_letter_rejected_at ?? null,
        offer_letter_uploaded_by: placement.offer_letter_uploaded_by ?? null,
        verified_by_name: placement.verified_by_name ?? null,
        verified_at: placement.verified_at,
        joining_letter_url: placement.joining_letter_url ?? null,
        joining_letter_verified: placement.joining_letter_verified ?? false,
        joining_letter_verified_by_name: placement.joining_letter_verified_by_name ?? null,
        joining_letter_verified_at: placement.joining_letter_verified_at ?? null,
        joining_letter_rejection_reason: placement.joining_letter_rejection_reason ?? null,
        joining_letter_rejected_at: placement.joining_letter_rejected_at ?? null,
        joining_letter_uploaded_by: placement.joining_letter_uploaded_by ?? null,
        placement_status: placement.placement_status,
        acceptance_status: placement.acceptance_status,
        passout_year: placement.passout_year,
        created_at: placement.created_at,
        updated_at: placement.updated_at,
        // Student info
        student_name: `${placement.first_name} ${placement.last_name}`,
        student_email: placement.student_email,
        dept_name: placement.dept_name ?? null,
        // Job & company
        company_name: placement.company_name,
        job_title: placement.job_title,
        position_name: placement.position_name ?? null,
        // Academic info
        academic_info: academicResult.rows[0] ?? null,
        // Round journey
        round_results: roundResults.rows.map(row => ({
            result_id: row.result_id,
            round_id: row.round_id,
            round_name: row.round_name,
            round_number: row.round_number,
            round_type: row.round_type,
            round_status: row.round_status,
            result_status: row.result_status,
            score: row.score === null ? null : Number.parseFloat(row.score),
            remarks: row.remarks ?? null,
            attended: row.attended,
            scheduled_at: row.scheduled_at,
            completed_at: row.completed_at,
        })),
    };
}

// ============================================================================
// 4. UPDATE PLACEMENT (core fields)
// ============================================================================

/**
 * Update placement record fields (package, designation, dates, offer URL).
 * Cannot update cancelled or terminal (declined/revoked/expired) placements.
 *
 * @param {string} placementId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated placement
 */
async function updatePlacement(placementId, collegeId, data) {
    const existing = await verifyPlacement(placementId, collegeId);

    // Cannot update terminal statuses
    if ([STATUS.PLACEMENT.CANCELLED, STATUS.PLACEMENT.DECLINED, STATUS.PLACEMENT.REVOKED, STATUS.PLACEMENT.EXPIRED].includes(existing.placement_status)) {
        throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_NOT_UPDATEABLE), { status: 400 });
    }

    // Validate future dates
    validatePlacementDates(data);

    // Build dynamic UPDATE
    const fieldsToUpdate = UPDATABLE_FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_NO_FIELDS_TO_UPDATE), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 2}`)
        .concat(['updated_at = NOW()']);
    const values = [placementId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE placement_results
         SET ${setClauses.join(', ')}
         WHERE placement_id = $1
         RETURNING ${PLACEMENT_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Placement updated`, {
        placementId,
        updatedFields: fieldsToUpdate,
        collegeId,
    });

    return {
        ...result.rows[0],
        fulltime_package: result.rows[0].fulltime_package === null ? null : Number.parseFloat(result.rows[0].fulltime_package),
        internship_stipend: result.rows[0].internship_stipend === null ? null : Number.parseFloat(result.rows[0].internship_stipend),
        student_name: `${existing.first_name} ${existing.last_name}`,
        company_name: existing.company_name,
        job_title: existing.job_title,
    };
}

// ============================================================================
// 5. VERIFY / REJECT OFFER LETTER
// ============================================================================

/**
 * Approve or reject an offer letter.
 *
 * @param {string} placementId
 * @param {string} collegeId
 * @param {string} userId - who performed the action
 * @param {'approved'|'rejected'} action
 * @param {string|null} rejectionReason - required when action is 'rejected'
 * @returns {Object} Updated placement
 */
async function verifyOfferLetter(placementId, collegeId, userId, action, rejectionReason = null) {
    const existing = await verifyPlacement(placementId, collegeId);

    // Must have an offer letter URL to approve
    if (action === 'approved' && !existing.offer_letter_url) {
        throw Object.assign(new Error(ERROR_MESSAGES.OFFER_LETTER_NO_URL), { status: 400 });
    }

    // Cannot verify for terminal statuses
    if ([STATUS.PLACEMENT.CANCELLED, STATUS.PLACEMENT.DECLINED, STATUS.PLACEMENT.REVOKED, STATUS.PLACEMENT.EXPIRED].includes(existing.placement_status)) {
        throw Object.assign(new Error(ERROR_MESSAGES.OFFER_LETTER_TERMINAL_STATUS), { status: 400 });
    }

    // Rejection requires a reason
    if (action === 'rejected' && !rejectionReason) {
        throw Object.assign(new Error(ERROR_MESSAGES.DOCUMENT_REJECTION_REASON_REQUIRED), { status: 400 });
    }

    const isApproved = action === 'approved';

    const result = await query(
        `UPDATE placement_results
         SET offer_letter_verified = $1,
             verified_by = $2,
             verified_at = $3,
             offer_letter_rejection_reason = $4,
             offer_letter_rejected_at = $5,
             updated_at = NOW()
         WHERE placement_id = $6
         RETURNING ${PLACEMENT_RETURNING_COLUMNS}`,
        [
            isApproved,
            isApproved ? userId : null,
            isApproved ? new Date() : null,
            isApproved ? null : rejectionReason,
            isApproved ? null : new Date(),
            placementId,
        ]
    );

    logger.info(`${LOG.AUTH} Offer letter ${action}`, {
        placementId,
        action,
        userId,
        collegeId,
    });

    return {
        placement_id: result.rows[0].placement_id,
        offer_letter_url: result.rows[0].offer_letter_url,
        offer_letter_verified: result.rows[0].offer_letter_verified,
        verified_by: result.rows[0].verified_by,
        verified_at: result.rows[0].verified_at,
        offer_letter_rejection_reason: result.rows[0].offer_letter_rejection_reason,
        offer_letter_rejected_at: result.rows[0].offer_letter_rejected_at,
        student_name: `${existing.first_name} ${existing.last_name}`,
        company_name: existing.company_name,
        job_title: existing.job_title,
        placement_status: result.rows[0].placement_status,
    };
}

// ============================================================================
// 5b. VERIFY / REJECT JOINING LETTER
// ============================================================================

/**
 * Approve or reject a joining letter.
 *
 * @param {string} placementId
 * @param {string} collegeId
 * @param {string} userId - who performed the action
 * @param {'approved'|'rejected'} action
 * @param {string|null} rejectionReason - required when action is 'rejected'
 * @returns {Object} Updated placement
 */
async function verifyJoiningLetter(placementId, collegeId, userId, action, rejectionReason = null) {
    const existing = await verifyPlacement(placementId, collegeId);

    // Must have a joining letter URL to approve
    if (action === 'approved' && !existing.joining_letter_url) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOINING_LETTER_NO_URL), { status: 400 });
    }

    // Cannot verify for terminal statuses
    if ([STATUS.PLACEMENT.CANCELLED, STATUS.PLACEMENT.DECLINED, STATUS.PLACEMENT.REVOKED, STATUS.PLACEMENT.EXPIRED].includes(existing.placement_status)) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOINING_LETTER_TERMINAL_STATUS), { status: 400 });
    }

    // Joining letter only for accepted/joined placements
    if (![STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.JOINED].includes(existing.placement_status)) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOINING_LETTER_NOT_ACCEPTED), { status: 400 });
    }

    // Rejection requires a reason
    if (action === 'rejected' && !rejectionReason) {
        throw Object.assign(new Error(ERROR_MESSAGES.DOCUMENT_REJECTION_REASON_REQUIRED), { status: 400 });
    }

    const isApproved = action === 'approved';

    const result = await query(
        `UPDATE placement_results
         SET joining_letter_verified = $1,
             joining_letter_verified_by = $2,
             joining_letter_verified_at = $3,
             joining_letter_rejection_reason = $4,
             joining_letter_rejected_at = $5,
             updated_at = NOW()
         WHERE placement_id = $6
         RETURNING ${PLACEMENT_RETURNING_COLUMNS}`,
        [
            isApproved,
            isApproved ? userId : null,
            isApproved ? new Date() : null,
            isApproved ? null : rejectionReason,
            isApproved ? null : new Date(),
            placementId,
        ]
    );

    logger.info(`${LOG.AUTH} Joining letter ${action}`, {
        placementId,
        action,
        userId,
        collegeId,
    });

    return {
        placement_id: result.rows[0].placement_id,
        joining_letter_url: result.rows[0].joining_letter_url,
        joining_letter_verified: result.rows[0].joining_letter_verified,
        joining_letter_verified_by: result.rows[0].joining_letter_verified_by,
        joining_letter_verified_at: result.rows[0].joining_letter_verified_at,
        joining_letter_rejection_reason: result.rows[0].joining_letter_rejection_reason,
        joining_letter_rejected_at: result.rows[0].joining_letter_rejected_at,
        student_name: `${existing.first_name} ${existing.last_name}`,
        company_name: existing.company_name,
        job_title: existing.job_title,
        placement_status: result.rows[0].placement_status,
    };
}

// ============================================================================
// 6. UPDATE PLACEMENT STATUS (with transitions)
// ============================================================================

/**
 * Change placement status with transition rules:
 *   offered → accepted, declined, revoked, expired, cancelled
 *   accepted → joined, cancelled
 *   joined → cancelled
 *   declined → (terminal)
 *   revoked → (terminal)
 *   expired → (terminal)
 *   cancelled → (terminal)
 *
 * @param {string} placementId
 * @param {string} collegeId
 * @param {string} newStatus
 * @param {string|null} acceptanceStatus
 * @param {string|null} remarks
 * @returns {Object} Updated placement
 */
async function updatePlacementStatus(placementId, collegeId, newStatus, acceptanceStatus = null, remarks = null) {
    const existing = await verifyPlacement(placementId, collegeId);
    const currentStatus = existing.placement_status;

    // Validate transition (same-status + invalid both handled)
    assertTransition('placement', currentStatus, newStatus);

    // If revoking, delegate to revokePlacement for proper cascade
    if (newStatus === STATUS.PLACEMENT.REVOKED) {
        return revokePlacement(placementId, collegeId, existing, remarks);
    }

    // Auto-set acceptance_status based on placement_status if not explicitly provided
    let effectiveAcceptance = acceptanceStatus;
    if (!effectiveAcceptance) {
        if (newStatus === STATUS.PLACEMENT.ACCEPTED || newStatus === STATUS.PLACEMENT.JOINED) {
            effectiveAcceptance = 'accepted';
        } else if (newStatus === STATUS.PLACEMENT.DECLINED) {
            effectiveAcceptance = 'rejected';
        }
    }

    const result = await query(
        `UPDATE placement_results
         SET placement_status = $1,
             acceptance_status = COALESCE($2, acceptance_status),
             updated_at = NOW()
         WHERE placement_id = $3
         RETURNING ${PLACEMENT_RETURNING_COLUMNS}`,
        [newStatus, effectiveAcceptance, placementId]
    );

    logger.info(`${LOG.AUTH} Placement status changed`, {
        placementId,
        previousStatus: currentStatus,
        newStatus,
        acceptanceStatus: effectiveAcceptance,
        studentId: existing.student_id,
        collegeId,
    });

    return {
        placement_id: result.rows[0].placement_id,
        placement_status: result.rows[0].placement_status,
        acceptance_status: result.rows[0].acceptance_status,
        previous_status: currentStatus,
        updated_at: result.rows[0].updated_at,
        student_name: `${existing.first_name} ${existing.last_name}`,
        company_name: existing.company_name,
        job_title: existing.job_title,
    };
}

// ============================================================================
// 7. REVOKE PLACEMENT — Revoke offer, revert app to selected, notify student
// ============================================================================

async function revokePlacement(placementId, collegeId, existing, reason) {
    if (!reason || reason.trim().length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.OFFER_REVOKE_REASON_REQUIRED), { status: 400 });
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock the placement row to prevent concurrent revoke/accept/decline
        const locked = await client.query(
            `SELECT placement_status FROM placement_results
             WHERE placement_id = $1 FOR UPDATE`,
            [placementId]
        );

        // Re-validate status under lock — may have changed concurrently
        if (locked.rows[0].placement_status !== STATUS.PLACEMENT.OFFERED) {
            throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_ALREADY_STATUS), { status: 409 });
        }

        // 1. Revoke the placement
        const result = await client.query(
            `UPDATE placement_results
             SET placement_status = $1,
                 revoked_reason = $2,
                 acceptance_status = 'rejected',
                 updated_at = NOW()
             WHERE placement_id = $3
             RETURNING ${PLACEMENT_RETURNING_COLUMNS}`,
            [STATUS.PLACEMENT.REVOKED, reason, placementId]
        );

        // 2. Revert the application back to 'selected'
        if (existing.application_id) {
            await client.query(
                `UPDATE student_applications
                 SET application_status = $1,
                     last_updated_at = NOW()
                 WHERE application_id = $2
                   AND application_status = $3`,
                [STATUS.APPLICATION.SELECTED, existing.application_id, STATUS.APPLICATION.OFFERED]
            );
        }

        // 3. Notify the student
        await client.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                collegeId,
                RECIPIENT_TYPE.STUDENT,
                existing.student_id,
                `Offer Revoked: ${existing.job_title}`,
                `Your offer from ${existing.company_name} for ${existing.job_title} has been revoked. Reason: ${reason}`,
                NOTIFICATION_TYPE.OFFER_REVOKED,
                'placement',
                placementId,
            ]
        );

        // 4. Reactivate positions that now have vacancies after revoke
        await reactivatePositions(client, collegeId);

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Placement revoked`, {
            placementId,
            previousStatus: existing.placement_status,
            studentId: existing.student_id,
            reason,
            collegeId,
        });

        // Trigger waitlist promotion — a slot has opened up
        promoteFromWaitlist(existing.job_id, collegeId).catch(err => {
            logger.error(`${LOG.AUTH} Waitlist promotion after revoke failed`, {
                jobId: existing.job_id, collegeId, error: err.message,
            });
        });

        return {
            placement_id: result.rows[0].placement_id,
            placement_status: result.rows[0].placement_status,
            acceptance_status: result.rows[0].acceptance_status,
            previous_status: existing.placement_status,
            revoked_reason: reason,
            application_reverted: true,
            updated_at: result.rows[0].updated_at,
            student_name: `${existing.first_name} ${existing.last_name}`,
            company_name: existing.company_name,
            job_title: existing.job_title,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 8. REVERT APPLICATION — rejected → selected (system-rejections only)
// ============================================================================

/**
 * Revert a system-rejected application back to selected so it can be re-offered.
 * Only allows reverting applications whose auto_withdrawal_reason is set (system-generated)
 * or whose status was changed due to offer expiry/job close/round failure.
 *
 * @param {string} applicationId
 * @param {string} collegeId
 * @returns {Object} Reverted application
 */
async function revertApplication(applicationId, collegeId) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock the application row to prevent concurrent revert/modify
        const appResult = await client.query(
            `SELECT a.application_id, a.student_id, a.job_id, a.college_id,
                    a.application_status, a.auto_withdrawal_reason,
                    s.first_name, s.last_name,
                    j.job_title, c.company_name
             FROM student_applications a
             JOIN students s ON a.student_id = s.student_id
             JOIN job_postings j ON a.job_id = j.job_id
             JOIN companies c ON j.company_id = c.company_id
             WHERE a.application_id = $1 AND a.college_id = $2
             LIMIT 1
             FOR UPDATE OF a`,
            [applicationId, collegeId]
        );

        if (!appResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.APPLICATION_NOT_FOUND), { status: 404 });
        }

        const app = appResult.rows[0];

        // Only allow reverting rejected or auto_withdrawn apps
        if (app.application_status !== STATUS.APPLICATION.REJECTED &&
            app.application_status !== STATUS.APPLICATION.AUTO_WITHDRAWN) {
            throw Object.assign(new Error(ERROR_MESSAGES.APPLICATION_REVERT_NOT_ALLOWED), { status: 400 });
        }

        // Revert to selected
        const result = await client.query(
            `UPDATE student_applications
             SET application_status = $1,
                 auto_withdrawal_reason = NULL,
                 last_updated_at = NOW()
             WHERE application_id = $2
             RETURNING application_id, application_status, last_updated_at`,
            [STATUS.APPLICATION.SELECTED, applicationId]
        );

        // Notify student (inside transaction for atomicity)
        await client.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                collegeId,
                RECIPIENT_TYPE.STUDENT,
                app.student_id,
                `Application Reverted: ${app.job_title}`,
                `Your application for ${app.job_title} at ${app.company_name} has been reverted to "selected" status. You may receive a new offer.`,
                NOTIFICATION_TYPE.APPLICATION_STATUS_CHANGED,
                'application',
                applicationId,
            ]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Application reverted to selected`, {
            applicationId,
            previousStatus: app.application_status,
            studentId: app.student_id,
            jobTitle: app.job_title,
            collegeId,
        });

        return {
            application_id: result.rows[0].application_id,
            application_status: result.rows[0].application_status,
            previous_status: app.application_status,
            updated_at: result.rows[0].last_updated_at,
            student_name: `${app.first_name} ${app.last_name}`,
            job_title: app.job_title,
            company_name: app.company_name,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 9. BULK CREATE PLACEMENTS — Mass offer creation in one transaction
// ============================================================================

/**
 * Create multiple placement records in a single transaction.
 * Validates each application, checks offer limits and vacancy per-item.
 *
 * @param {string} collegeId
 * @param {string} userId
 * @param {Object[]} items - Array of { application_id, placement_type, ... }
 * @returns {{ created, skipped, errors }}
 */
/**
 * Process a single item for bulkCreatePlacements — validate, insert, update app status.
 * Returns { created: {...} } on success or { skipped: {...} } if ineligible.
 * Throws on unexpected DB errors (handled by caller).
 */
async function processBulkItem(client, item, collegeId, settingsByYear, defaultDays) {
    const appResult = await client.query(
        `SELECT a.application_id, a.student_id, a.job_id, a.college_id,
                a.position_id, a.application_status,
                s.first_name, s.last_name, s.student_email, s.student_passout_year,
                j.job_title, j.company_id,
                c.company_name
         FROM student_applications a
         JOIN students s ON a.student_id = s.student_id
         JOIN job_postings j ON a.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         WHERE a.application_id = $1 AND a.college_id = $2
         LIMIT 1
         FOR UPDATE OF a`,
        [item.application_id, collegeId]
    );

    if (!appResult.rows.length) {
        return { skipped: { application_id: item.application_id, reason: 'Application not found' } };
    }

    const app = appResult.rows[0];

    if (!['selected', 'offered'].includes(app.application_status)) {
        return { skipped: { application_id: item.application_id, reason: `Application status is ${app.application_status}, not selected/offered` } };
    }

    const dupCheck = await client.query(
        `SELECT placement_id FROM placement_results WHERE application_id = $1 LIMIT 1`,
        [item.application_id]
    );
    if (dupCheck.rows.length) {
        return { skipped: { application_id: item.application_id, reason: 'Placement already exists' } };
    }

    const offerCount = await client.query(
        `SELECT COUNT(*) AS cnt FROM placement_results
         WHERE student_id = $1 AND college_id = $2 AND placement_status = $3`,
        [app.student_id, collegeId, STATUS.PLACEMENT.OFFERED]
    );
    const yearSettings = settingsByYear.get(app.student_passout_year);
    const maxOffers = yearSettings?.max_active_offers ?? 1;
    const activeOffers = Number.parseInt(offerCount.rows[0].cnt, 10);
    if (activeOffers >= maxOffers) {
        return { skipped: { application_id: item.application_id, reason: `Max active offers reached (${activeOffers}/${maxOffers})` } };
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + defaultDays);

    const placementResult = await client.query(
        `INSERT INTO placement_results
           (student_id, college_id, company_id, job_id, position_id, application_id,
            placement_type, fulltime_package, fulltime_designation, fulltime_joining_date,
            internship_stipend, internship_duration, internship_start_date,
            offer_letter_url, offer_letter_uploaded_by,
            joining_letter_url, joining_letter_uploaded_by,
            placement_status, acceptance_status, offer_expires_at, passout_year)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING placement_id`,
        [
            app.student_id, collegeId, app.company_id, app.job_id,
            app.position_id ?? null, item.application_id,
            item.placement_type,
            item.fulltime_package ?? null,
            item.fulltime_designation ?? null,
            item.fulltime_joining_date ?? null,
            item.internship_stipend ?? null,
            item.internship_duration ?? null,
            item.internship_start_date ?? null,
            item.offer_letter_url ?? null,
            item.offer_letter_url ? 'college' : null,
            item.joining_letter_url ?? null,
            item.joining_letter_url ? 'college' : null,
            STATUS.PLACEMENT.OFFERED, 'pending',
            expiry.toISOString(),
            app.student_passout_year,
        ]
    );

    if (app.application_status === 'selected') {
        await client.query(
            `UPDATE student_applications
             SET application_status = 'offered', last_updated_at = NOW()
             WHERE application_id = $1`,
            [item.application_id]
        );
    }

    return {
        created: {
            placement_id: placementResult.rows[0].placement_id,
            application_id: item.application_id,
            student_id: app.student_id,
            student_name: `${app.first_name} ${app.last_name}`,
            job_title: app.job_title,
            company_name: app.company_name,
        },
    };
}

async function bulkCreatePlacements(collegeId, userId, items) {
    if (!items || items.length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.BULK_PLACEMENT_NO_ITEMS), { status: 400 });
    }

    // Get default offer days from settings (use first item's passout year, fallback 7)
    const settingsResult = await query(
        `SELECT default_offer_days FROM placement_settings
         WHERE college_id = $1 LIMIT 1`,
        [collegeId]
    );
    const defaultDays = settingsResult.rows[0]?.default_offer_days ?? 7;

    const client = await getClient();
    const created = [];
    const skipped = [];

    // Pre-fetch all placement_settings for this college (keyed by passout_year)
    const allSettingsResult = await query(
        `SELECT passout_year, max_active_offers, default_offer_days
         FROM placement_settings WHERE college_id = $1`,
        [collegeId]
    );
    const settingsByYear = new Map(
        allSettingsResult.rows.map(r => [r.passout_year, r])
    );

    try {
        await client.query('BEGIN');

        for (const item of items) {
            try {
                const outcome = await processBulkItem(client, item, collegeId, settingsByYear, defaultDays);
                if (outcome.created) {
                    created.push(outcome.created);
                } else {
                    skipped.push(outcome.skipped);
                }
            } catch (itemError) {
                skipped.push({
                    application_id: item.application_id,
                    reason: itemError.message,
                });
            }
        }

        // Auto-fill positions after bulk creation
        await autoFillPositions(client, collegeId);

        await client.query('COMMIT');

        // Batch-notify all students who received offers (after COMMIT — fire-and-forget)
        if (created.length > 0) {
            const { notifyStudents } = require('../../utils/placementNotifier');
            const offerNotifications = created.map(c => ({
                student_id: c.student_id ?? null,
                title: `Offer Received: ${c.job_title}`,
                body: `Congratulations! You have received a placement offer from ${c.company_name} for ${c.job_title}.`,
                notification_type: NOTIFICATION_TYPE.OFFER_RECEIVED,
                entity_type: 'placement',
                entity_id: c.placement_id,
            })).filter(n => n.student_id);
            if (offerNotifications.length > 0) {
                notifyStudents({ query }, collegeId, offerNotifications).catch(() => {});
            }
        }

        logger.info(`${LOG.AUTH} Bulk placements created`, {
            collegeId,
            totalRequested: items.length,
            created: created.length,
            skipped: skipped.length,
        });

        return {
            created_count: created.length,
            skipped_count: skipped.length,
            created,
            skipped,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createPlacement,
    getAllPlacements,
    getPlacement,
    updatePlacement,
    verifyOfferLetter,
    verifyJoiningLetter,
    updatePlacementStatus,
    revokePlacement,
    revertApplication,
    bulkCreatePlacements,
};
