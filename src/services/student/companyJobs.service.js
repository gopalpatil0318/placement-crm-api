/**
 * ============================================================================
 * STUDENT COMPANY JOBS SERVICE — Off-campus jobs at a company
 * ============================================================================
 *   - getCompanyJobs(companyId, collegeId, passoutYear)
 * ============================================================================
 */

const { query } = require('../../config/db');

/**
 * Fetch off-campus / pool-campus jobs at a company for the student's passout year.
 * Returns lightweight job list for the self-report "pick your role" dropdown.
 */
async function getCompanyJobs(companyId, collegeId, passoutYear) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.job_location, j.drive_type, j.job_type,
                COUNT(pr.placement_id)::int AS placement_count
         FROM job_postings j
         LEFT JOIN placement_results pr ON pr.job_id = j.job_id
           AND pr.placement_status IN ('accepted', 'joined')
         WHERE j.company_id = $1 AND j.college_id = $2
           AND j.drive_type IN ('off_campus', 'pool_campus')
           AND $3 = ANY(j.passout_years)
         GROUP BY j.job_id
         ORDER BY j.created_at DESC
         LIMIT 50`,
        [companyId, collegeId, passoutYear]
    );

    return result.rows;
}

module.exports = { getCompanyJobs };
