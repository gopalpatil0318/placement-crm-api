/**
 * ============================================================================
 * STUDENT PLACEMENT SERVICE — Own Placement Results Business Logic
 * ============================================================================
 *   - getMyPlacements(studentId, collegeId, filters)
 *   - acceptPlacement(placementId, studentId, collegeId)
 *   - rejectPlacement(placementId, studentId, collegeId, reason)
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

// ============================================================================
// HELPER — Verify placement belongs to the student
// ============================================================================

async function verifyStudentPlacement(placementId, studentId, collegeId) {
    const result = await query(
        `SELECT pr.*,
                c.company_name, c.company_website, c.industry AS industry_type,
                j.job_title, j.job_type, j.job_location,
                p.position_name
         FROM placement_results pr
         JOIN companies c ON pr.company_id = c.company_id
         JOIN job_postings j ON pr.job_id = j.job_id
         LEFT JOIN job_positions p ON pr.position_id = p.position_id
         WHERE pr.placement_id = $1 AND pr.student_id = $2 AND pr.college_id = $3
         LIMIT 1`,
        [placementId, studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 1. GET MY PLACEMENTS (paginated, filtered, sorted)
// ============================================================================

async function getMyPlacements(studentId, collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    // Build WHERE
    const conditions = ['pr.student_id = $1', 'pr.college_id = $2'];
    const params = [studentId, collegeId];
    let paramIndex = 3;

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

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        created_at: 'pr.created_at',
        fulltime_package: 'pr.fulltime_package',
        placement_status: 'pr.placement_status',
        company_name: 'c.company_name',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.created_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Run count, fetch, and summary in parallel (all independent)
    const [countResult, placementResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM placement_results pr
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT pr.placement_id, pr.student_id, pr.company_id, pr.job_id,
                pr.position_id, pr.application_id,
                pr.placement_type,
                pr.fulltime_package, pr.fulltime_designation, pr.fulltime_joining_date,
                pr.internship_stipend, pr.internship_duration, pr.internship_start_date,
                pr.offer_letter_url, pr.offer_letter_verified,
                pr.placement_status, pr.acceptance_status,
                pr.passout_year,
                pr.created_at, pr.updated_at,
                c.company_name, c.company_website, c.industry AS industry_type,
                j.job_title, j.job_type, j.job_location,
                p.position_name
         FROM placement_results pr
         JOIN companies c ON pr.company_id = c.company_id
         JOIN job_postings j ON pr.job_id = j.job_id
         LEFT JOIN job_positions p ON pr.position_id = p.position_id
         WHERE ${whereClause}
         ORDER BY ${sortCol} ${sortOrd}, pr.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT placement_status, COUNT(*) AS cnt
             FROM placement_results
             WHERE student_id = $1 AND college_id = $2
             GROUP BY placement_status`,
            [studentId, collegeId]
        ),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    const statusSummary = {
        total: 0,
        offered: 0,
        accepted: 0,
        rejected: 0,
        joined: 0,
        cancelled: 0,
    };

    for (const row of summaryResult.rows) {
        const count = parseInt(row.cnt, 10);
        statusSummary[row.placement_status] = count;
        statusSummary.total += count;
    }

    const placements = placementResult.rows.map(row => ({
        placement_id: row.placement_id,
        application_id: row.application_id,
        placement_type: row.placement_type,
        // Full-time details
        fulltime_package: row.fulltime_package != null ? parseFloat(row.fulltime_package) : null,
        fulltime_designation: row.fulltime_designation ?? null,
        fulltime_joining_date: row.fulltime_joining_date ?? null,
        // Internship details
        internship_stipend: row.internship_stipend != null ? parseFloat(row.internship_stipend) : null,
        internship_duration: row.internship_duration ?? null,
        internship_start_date: row.internship_start_date ?? null,
        // Offer letter
        offer_letter_url: row.offer_letter_url ?? null,
        offer_letter_verified: row.offer_letter_verified,
        // Status
        placement_status: row.placement_status,
        acceptance_status: row.acceptance_status ?? null,
        passout_year: row.passout_year,
        created_at: row.created_at,
        updated_at: row.updated_at,
        // Company info
        company_id: row.company_id,
        company_name: row.company_name,
        company_website: row.company_website ?? null,
        industry_type: row.industry_type ?? null,
        // Job info
        job_id: row.job_id,
        job_title: row.job_title,
        job_type: row.job_type,
        job_location: row.job_location ?? null,
        // Position info
        position_id: row.position_id ?? null,
        position_name: row.position_name ?? null,
    }));

    return { placements, total, page, limit, status_summary: statusSummary };
}

// ============================================================================
// 2. ACCEPT PLACEMENT OFFER
// ============================================================================

async function acceptPlacement(placementId, studentId, collegeId) {
    const placement = await verifyStudentPlacement(placementId, studentId, collegeId);

    // Validate current status
    if (placement.placement_status !== STATUS.PLACEMENT.OFFERED) {
        throw Object.assign(
            new Error(
                `Cannot accept a placement with status "${placement.placement_status}". ` +
                `Only offers with status "offered" can be accepted`
            ),
            { status: 400 }
        );
    }

    // Check if already accepted
    if (placement.acceptance_status === 'accepted') {
        throw Object.assign(
            new Error('You have already accepted this offer'),
            { status: 409 }
        );
    }

    // Check if already rejected
    if (placement.acceptance_status === 'rejected') {
        throw Object.assign(
            new Error('This offer has already been rejected and cannot be accepted'),
            { status: 400 }
        );
    }

    const result = await query(
        `UPDATE placement_results
         SET acceptance_status = 'accepted',
             placement_status = $1,
             updated_at = NOW()
         WHERE placement_id = $2
         RETURNING *`,
        [STATUS.PLACEMENT.ACCEPTED, placementId]
    );

    logger.info(`${LOG.AUTH} Student accepted placement offer`, {
        placementId,
        studentId,
        jobId: placement.job_id,
        companyId: placement.company_id,
        collegeId,
    });

    return {
        placement_id: result.rows[0].placement_id,
        placement_status: result.rows[0].placement_status,
        acceptance_status: result.rows[0].acceptance_status,
        previous_status: placement.placement_status,
        previous_acceptance: placement.acceptance_status,
        updated_at: result.rows[0].updated_at,
        job_title: placement.job_title,
        company_name: placement.company_name,
        position_name: placement.position_name ?? null,
        fulltime_package: placement.fulltime_package != null ? parseFloat(placement.fulltime_package) : null,
        fulltime_designation: placement.fulltime_designation ?? null,
        fulltime_joining_date: placement.fulltime_joining_date ?? null,
        internship_stipend: placement.internship_stipend != null ? parseFloat(placement.internship_stipend) : null,
    };
}

// ============================================================================
// 3. REJECT PLACEMENT OFFER
// ============================================================================

async function rejectPlacement(placementId, studentId, collegeId, reason) {
    const placement = await verifyStudentPlacement(placementId, studentId, collegeId);

    // Validate current status
    if (placement.placement_status !== STATUS.PLACEMENT.OFFERED) {
        throw Object.assign(
            new Error(
                `Cannot reject a placement with status "${placement.placement_status}". ` +
                `Only offers with status "offered" can be rejected`
            ),
            { status: 400 }
        );
    }

    // Check if already rejected
    if (placement.acceptance_status === 'rejected') {
        throw Object.assign(
            new Error('You have already rejected this offer'),
            { status: 409 }
        );
    }

    // Check if already accepted
    if (placement.acceptance_status === 'accepted') {
        throw Object.assign(
            new Error('This offer has already been accepted and cannot be rejected'),
            { status: 400 }
        );
    }

    const result = await query(
        `UPDATE placement_results
         SET acceptance_status = 'rejected',
             placement_status = $1,
             updated_at = NOW()
         WHERE placement_id = $2
         RETURNING *`,
        [STATUS.PLACEMENT.REJECTED, placementId]
    );

    logger.info(`${LOG.AUTH} Student rejected placement offer`, {
        placementId,
        studentId,
        jobId: placement.job_id,
        companyId: placement.company_id,
        collegeId,
        reason,
    });

    return {
        placement_id: result.rows[0].placement_id,
        placement_status: result.rows[0].placement_status,
        acceptance_status: result.rows[0].acceptance_status,
        previous_status: placement.placement_status,
        previous_acceptance: placement.acceptance_status,
        rejection_reason: reason,
        updated_at: result.rows[0].updated_at,
        job_title: placement.job_title,
        company_name: placement.company_name,
        position_name: placement.position_name ?? null,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getMyPlacements,
    acceptPlacement,
    rejectPlacement,
};
