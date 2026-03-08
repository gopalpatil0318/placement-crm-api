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
} = require('../../config/constants');

// Fields that can be updated on a placement record
const UPDATABLE_FIELDS = [
    'fulltime_package', 'fulltime_designation', 'fulltime_joining_date',
    'internship_stipend', 'internship_duration', 'internship_start_date',
    'offer_letter_url',
];

// Valid placement status transitions
const STATUS_TRANSITIONS = {
    [STATUS.PLACEMENT.OFFERED]: [STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.REJECTED, STATUS.PLACEMENT.CANCELLED],
    [STATUS.PLACEMENT.ACCEPTED]: [STATUS.PLACEMENT.JOINED, STATUS.PLACEMENT.CANCELLED],
    [STATUS.PLACEMENT.REJECTED]: [],                          // terminal
    [STATUS.PLACEMENT.JOINED]: [STATUS.PLACEMENT.CANCELLED],  // can cancel if student leaves
    [STATUS.PLACEMENT.CANCELLED]: [],                         // terminal
};

// ============================================================================
// HELPER — Verify placement exists and belongs to college
// ============================================================================

async function verifyPlacement(placementId, collegeId) {
    const result = await query(
        `SELECT pr.*,
                s.first_name, s.last_name, s.student_email,
                d.dept_name,
                c.company_name,
                j.job_title, j.job_status,
                p.position_name,
                u.user_name AS verified_by_name
         FROM placement_results pr
         JOIN students s ON pr.student_id = s.student_id
         JOIN companies c ON pr.company_id = c.company_id
         JOIN job_postings j ON pr.job_id = j.job_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN job_positions p ON pr.position_id = p.position_id
         LEFT JOIN users u ON pr.verified_by = u.user_id
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

    // 1. Fetch application with full context
    const appResult = await query(
        `SELECT a.*,
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
        throw Object.assign(
            new Error(`Cannot create placement for an application with status "${app.application_status}". Application must be "selected" or "offered"`),
            { status: 400 }
        );
    }

    // 3. Check if placement already exists for this application
    const duplicateCheck = await query(
        `SELECT placement_id FROM placement_results
         WHERE application_id = $1
         LIMIT 1`,
        [application_id]
    );

    if (duplicateCheck.rows.length) {
        throw Object.assign(
            new Error('Placement record already exists for this application'),
            { status: 409 }
        );
    }

    // 4. Validate fulltime_joining_date is in the future (if provided)
    if (data.fulltime_joining_date) {
        const joinDate = new Date(data.fulltime_joining_date);
        if (joinDate <= new Date()) {
            throw Object.assign(
                new Error('Full-time joining date must be in the future'),
                { status: 400 }
            );
        }
    }

    // 5. Validate internship_start_date is in the future (if provided)
    if (data.internship_start_date) {
        const startDate = new Date(data.internship_start_date);
        if (startDate <= new Date()) {
            throw Object.assign(
                new Error('Internship start date must be in the future'),
                { status: 400 }
            );
        }
    }

    // 6. Insert placement
    const result = await query(
        `INSERT INTO placement_results
           (student_id, college_id, company_id, job_id, position_id, application_id,
            placement_type, fulltime_package, fulltime_designation, fulltime_joining_date,
            internship_stipend, internship_duration, internship_start_date,
            offer_letter_url, placement_status, acceptance_status, passout_year)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
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
            STATUS.PLACEMENT.OFFERED,
            'pending',
            app.student_passout_year,
        ]
    );

    // 7. Update application status to 'offered' if it was 'selected'
    if (app.application_status === 'selected') {
        await query(
            `UPDATE student_applications
             SET application_status = 'offered', last_updated_at = NOW()
             WHERE application_id = $1`,
            [application_id]
        );
    }

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

    // Count
    const countResult = await query(
        `SELECT COUNT(*) AS total
         FROM placement_results pr
         JOIN students s ON pr.student_id = s.student_id
         JOIN companies co ON pr.company_id = co.company_id
         JOIN job_postings j ON pr.job_id = j.job_id
         WHERE ${whereClause}`,
        params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch
    const placementResult = await query(
        `SELECT pr.*,
                s.first_name, s.last_name, s.student_email,
                d.dept_name,
                co.company_name,
                j.job_title,
                p.position_name,
                u.user_name AS verified_by_name
         FROM placement_results pr
         JOIN students s ON pr.student_id = s.student_id
         JOIN companies co ON pr.company_id = co.company_id
         JOIN job_postings j ON pr.job_id = j.job_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN job_positions p ON pr.position_id = p.position_id
         LEFT JOIN users u ON pr.verified_by = u.user_id
         WHERE ${whereClause}
         ORDER BY ${sortCol} ${sortOrd}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
    );

    // Stats (unfiltered for college, optionally filtered by passout_year)
    const statsParams = [collegeId];
    let statsWhere = 'pr.college_id = $1';
    if (filters.passout_year) {
        statsWhere += ' AND pr.passout_year = $2';
        statsParams.push(filters.passout_year);
    }

    const statsResult = await query(
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
            SUM(CASE WHEN pr.placement_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
            SUM(CASE WHEN pr.placement_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
            SUM(CASE WHEN pr.offer_letter_verified = true THEN 1 ELSE 0 END) AS verified_offers
         FROM placement_results pr
         WHERE ${statsWhere}`,
        statsParams
    );

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
            fulltime_package: row.fulltime_package !== null ? parseFloat(row.fulltime_package) : null,
            fulltime_designation: row.fulltime_designation,
            fulltime_joining_date: row.fulltime_joining_date,
            internship_stipend: row.internship_stipend !== null ? parseFloat(row.internship_stipend) : null,
            internship_duration: row.internship_duration,
            internship_start_date: row.internship_start_date,
            offer_letter_url: row.offer_letter_url,
            offer_letter_verified: row.offer_letter_verified,
            verified_by_name: row.verified_by_name ?? null,
            verified_at: row.verified_at,
            placement_status: row.placement_status,
            acceptance_status: row.acceptance_status,
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
            total_placements: parseInt(stats.total_placements, 10),
            unique_students: parseInt(stats.unique_students, 10),
            unique_companies: parseInt(stats.unique_companies, 10),
            avg_package: stats.avg_package !== null ? Math.round(parseFloat(stats.avg_package) * 100) / 100 : null,
            highest_package: stats.highest_package !== null ? parseFloat(stats.highest_package) : null,
            lowest_package: stats.lowest_package !== null ? parseFloat(stats.lowest_package) : null,
            offered_count: parseInt(stats.offered_count || 0, 10),
            accepted_count: parseInt(stats.accepted_count || 0, 10),
            joined_count: parseInt(stats.joined_count || 0, 10),
            rejected_count: parseInt(stats.rejected_count || 0, 10),
            cancelled_count: parseInt(stats.cancelled_count || 0, 10),
            verified_offers: parseInt(stats.verified_offers || 0, 10),
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

    // Fetch round results for this student + job
    const roundResults = await query(
        `SELECT rr.result_id, rr.round_id, rr.result_status, rr.score, rr.remarks,
                rr.attended, rr.scheduled_at, rr.completed_at,
                jr.round_name, jr.round_number, jr.round_type, jr.round_status
         FROM student_round_results rr
         JOIN job_rounds jr ON rr.round_id = jr.round_id
         WHERE rr.student_id = $1 AND jr.job_id = $2
         ORDER BY jr.round_number ASC`,
        [placement.student_id, placement.job_id]
    );

    // Fetch student academic info
    const academicResult = await query(
        `SELECT overall_cgpa, total_live_kts, total_dead_kts,
                tenth_percentage, twelfth_percentage, diploma_percentage,
                roll_number, enrollment_number
         FROM student_academic_information
         WHERE student_id = $1
         LIMIT 1`,
        [placement.student_id]
    );

    return {
        placement_id: placement.placement_id,
        student_id: placement.student_id,
        job_id: placement.job_id,
        company_id: placement.company_id,
        position_id: placement.position_id,
        application_id: placement.application_id,
        placement_type: placement.placement_type,
        fulltime_package: placement.fulltime_package !== null ? parseFloat(placement.fulltime_package) : null,
        fulltime_designation: placement.fulltime_designation,
        fulltime_joining_date: placement.fulltime_joining_date,
        internship_stipend: placement.internship_stipend !== null ? parseFloat(placement.internship_stipend) : null,
        internship_duration: placement.internship_duration,
        internship_start_date: placement.internship_start_date,
        offer_letter_url: placement.offer_letter_url,
        offer_letter_verified: placement.offer_letter_verified,
        verified_by_name: placement.verified_by_name ?? null,
        verified_at: placement.verified_at,
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
            score: row.score !== null ? parseFloat(row.score) : null,
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
 * Cannot update cancelled or rejected placements.
 *
 * @param {string} placementId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated placement
 */
async function updatePlacement(placementId, collegeId, data) {
    const existing = await verifyPlacement(placementId, collegeId);

    // Cannot update terminal statuses
    if ([STATUS.PLACEMENT.CANCELLED, STATUS.PLACEMENT.REJECTED].includes(existing.placement_status)) {
        throw Object.assign(
            new Error(`Cannot update a ${existing.placement_status} placement record`),
            { status: 400 }
        );
    }

    // Validate joining date is in the future (if being updated)
    if (data.fulltime_joining_date) {
        const joinDate = new Date(data.fulltime_joining_date);
        if (joinDate <= new Date()) {
            throw Object.assign(
                new Error('Full-time joining date must be in the future'),
                { status: 400 }
            );
        }
    }

    // Validate internship start date is in the future (if being updated)
    if (data.internship_start_date) {
        const startDate = new Date(data.internship_start_date);
        if (startDate <= new Date()) {
            throw Object.assign(
                new Error('Internship start date must be in the future'),
                { status: 400 }
            );
        }
    }

    // Build dynamic UPDATE
    const fieldsToUpdate = UPDATABLE_FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error('No valid fields provided for update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 2}`)
        .concat(['updated_at = NOW()']);
    const values = [placementId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE placement_results
         SET ${setClauses.join(', ')}
         WHERE placement_id = $1
         RETURNING *`,
        values
    );

    logger.info(`${LOG.AUTH} Placement updated`, {
        placementId,
        updatedFields: fieldsToUpdate,
        collegeId,
    });

    return {
        ...result.rows[0],
        fulltime_package: result.rows[0].fulltime_package !== null ? parseFloat(result.rows[0].fulltime_package) : null,
        internship_stipend: result.rows[0].internship_stipend !== null ? parseFloat(result.rows[0].internship_stipend) : null,
        student_name: `${existing.first_name} ${existing.last_name}`,
        company_name: existing.company_name,
        job_title: existing.job_title,
    };
}

// ============================================================================
// 5. VERIFY OFFER LETTER
// ============================================================================

/**
 * Mark an offer letter as verified/unverified.
 *
 * @param {string} placementId
 * @param {string} collegeId
 * @param {string} userId - who verified
 * @param {boolean} verified
 * @param {string|null} remarks
 * @returns {Object} Updated placement
 */
async function verifyOfferLetter(placementId, collegeId, userId, verified, remarks = null) {
    const existing = await verifyPlacement(placementId, collegeId);

    // Must have an offer letter URL to verify
    if (verified && !existing.offer_letter_url) {
        throw Object.assign(
            new Error('Cannot verify offer letter — no offer letter URL uploaded yet'),
            { status: 400 }
        );
    }

    // Cannot verify for terminal statuses
    if ([STATUS.PLACEMENT.CANCELLED, STATUS.PLACEMENT.REJECTED].includes(existing.placement_status)) {
        throw Object.assign(
            new Error(`Cannot verify offer for a ${existing.placement_status} placement`),
            { status: 400 }
        );
    }

    const result = await query(
        `UPDATE placement_results
         SET offer_letter_verified = $1,
             verified_by = $2,
             verified_at = $3,
             updated_at = NOW()
         WHERE placement_id = $4
         RETURNING *`,
        [
            verified,
            verified ? userId : null,
            verified ? new Date() : null,
            placementId,
        ]
    );

    logger.info(`${LOG.AUTH} Offer letter ${verified ? 'verified' : 'unverified'}`, {
        placementId,
        verifiedBy: userId,
        collegeId,
    });

    return {
        placement_id: result.rows[0].placement_id,
        offer_letter_url: result.rows[0].offer_letter_url,
        offer_letter_verified: result.rows[0].offer_letter_verified,
        verified_by: result.rows[0].verified_by,
        verified_at: result.rows[0].verified_at,
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
 *   offered → accepted, rejected, cancelled
 *   accepted → joined, cancelled
 *   joined → cancelled
 *   rejected → (terminal)
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

    // Same status check
    if (currentStatus === newStatus) {
        throw Object.assign(
            new Error(`Placement is already "${newStatus}"`),
            { status: 400 }
        );
    }

    // Validate transition
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
        throw Object.assign(
            new Error(
                `Cannot change placement status from "${currentStatus}" to "${newStatus}". ` +
                `Allowed: ${allowedTransitions.length ? allowedTransitions.join(', ') : 'none (terminal state)'}`
            ),
            { status: 400 }
        );
    }

    // Auto-set acceptance_status based on placement_status if not explicitly provided
    let effectiveAcceptance = acceptanceStatus;
    if (!effectiveAcceptance) {
        if (newStatus === STATUS.PLACEMENT.ACCEPTED || newStatus === STATUS.PLACEMENT.JOINED) {
            effectiveAcceptance = 'accepted';
        } else if (newStatus === STATUS.PLACEMENT.REJECTED) {
            effectiveAcceptance = 'rejected';
        }
    }

    const result = await query(
        `UPDATE placement_results
         SET placement_status = $1,
             acceptance_status = COALESCE($2, acceptance_status),
             updated_at = NOW()
         WHERE placement_id = $3
         RETURNING *`,
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
// EXPORTS
// ============================================================================

module.exports = {
    createPlacement,
    getAllPlacements,
    getPlacement,
    updatePlacement,
    verifyOfferLetter,
    updatePlacementStatus,
};
