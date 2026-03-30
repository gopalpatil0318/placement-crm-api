/**
 * ============================================================================
 * COLLEGE DASHBOARD SERVICE — Dashboard & Statistics Business Logic
 * ============================================================================
 *  8 endpoints split for lazy-loading performance:
 *
 *  ON LOGIN (lightweight):
 *   #105a  getOverview(collegeId, passoutYear)
 *
 *  ON DEMAND (user navigates to section):
 *   #105b  getPlacementStats(collegeId, passoutYear)
 *   #105c  getApplicationFunnel(collegeId, passoutYear)
 *   #105d  getStudentReadiness(collegeId, passoutYear)
 *   #105e  getDiversityStats(collegeId, passoutYear)
 *   #105f  getTrainingStats(collegeId, passoutYear)
 *   #106   getDepartmentWise(collegeId, passoutYear, deptId?)
 *   #107   getCompanyWise(collegeId, passoutYear, companyId?)
 *   #108   getYearComparison(collegeId, passoutYears[])
 * ============================================================================
 */

const { query } = require('../../config/db');
const { STATUS, PLACEMENT_TYPES, ERROR_MESSAGES } = require('../../config/constants');

// Shared placement filter: valid (non-cancelled, non-rejected) offers
const VALID_PLACEMENT = `placement_status NOT IN ('${STATUS.PLACEMENT.CANCELLED}', '${STATUS.PLACEMENT.REJECTED}')`;
const PUBLISHED_JOBS  = `job_status IN ('${STATUS.JOB.PUBLISHED}', '${STATUS.JOB.CLOSED}')`;
const NOT_DROPOUT     = `student_status != '${STATUS.STUDENT.DROPOUT}'`;
// ============================================================================
// #105a — DASHBOARD OVERVIEW  (loaded on login — super lightweight)
// ============================================================================

async function getOverview(collegeId, passoutYear) {
    const sql = `
        WITH student_count AS (
            SELECT COUNT(*)::int AS total
            FROM students
            WHERE college_id = $1
              AND student_passout_year = $2
              AND ${NOT_DROPOUT}
        ),
        placement_agg AS (
            SELECT
                COUNT(DISTINCT student_id)::int AS placed_count,
                COUNT(*)::int                   AS total_offers,
                COALESCE(MAX(fulltime_package), 0)                                             AS highest_package,
                COALESCE(MIN(fulltime_package) FILTER (WHERE fulltime_package > 0), 0)         AS lowest_package,
                COALESCE(ROUND(AVG(fulltime_package) FILTER (WHERE fulltime_package > 0), 2), 0) AS average_package
            FROM placement_results
            WHERE college_id = $1
              AND passout_year = $2
              AND ${VALID_PLACEMENT}
        ),
        median_calc AS (
            SELECT COALESCE(
                ROUND(CAST(
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fulltime_package)
                AS numeric), 2), 0
            ) AS median_package
            FROM placement_results
            WHERE college_id = $1
              AND passout_year = $2
              AND ${VALID_PLACEMENT}
              AND fulltime_package > 0
        ),
        company_agg AS (
            SELECT
                COUNT(DISTINCT company_id)::int AS total_companies,
                COUNT(*)::int                   AS total_job_postings
            FROM job_postings
            WHERE college_id = $1
              AND $2 = ANY(passout_years)
              AND ${PUBLISHED_JOBS}
        )
        SELECT
            sc.total             AS total_students,
            pa.placed_count,
            CASE WHEN sc.total > 0
                THEN ROUND((pa.placed_count::numeric / sc.total) * 100, 2)
                ELSE 0
            END                  AS placement_percentage,
            pa.total_offers,
            pa.highest_package,
            pa.lowest_package,
            pa.average_package,
            mc.median_package,
            (GREATEST(sc.total - pa.placed_count, 0))::int AS unplaced_count,
            ca.total_companies,
            ca.total_job_postings
        FROM student_count sc, placement_agg pa, median_calc mc, company_agg ca
    `;

    const { rows } = await query(sql, [collegeId, passoutYear]);
    return rows[0];
}

// ============================================================================
// #105b — PLACEMENT STATS  (package slabs, offer breakdown, internships)
// ============================================================================

async function getPlacementStats(collegeId, passoutYear) {
    const params = [collegeId, passoutYear];

    const [slabResult, offerResult, internshipResult] = await Promise.all([
        // Package slab distribution
        query(`
            SELECT
                COUNT(*) FILTER (WHERE fulltime_package > 0 AND fulltime_package < 300000)::int         AS below_3l,
                COUNT(*) FILTER (WHERE fulltime_package >= 300000  AND fulltime_package < 500000)::int  AS "3l_to_5l",
                COUNT(*) FILTER (WHERE fulltime_package >= 500000  AND fulltime_package < 800000)::int  AS "5l_to_8l",
                COUNT(*) FILTER (WHERE fulltime_package >= 800000  AND fulltime_package < 1200000)::int AS "8l_to_12l",
                COUNT(*) FILTER (WHERE fulltime_package >= 1200000 AND fulltime_package < 2000000)::int AS "12l_to_20l",
                COUNT(*) FILTER (WHERE fulltime_package >= 2000000)::int                                AS above_20l
            FROM placement_results
            WHERE college_id = $1 AND passout_year = $2
              AND ${VALID_PLACEMENT} AND fulltime_package > 0
        `, params),

        // Offer status breakdown + multiple-offer students
        query(`
            SELECT
                COUNT(*) FILTER (WHERE placement_type IN ('${PLACEMENT_TYPES[0]}', '${PLACEMENT_TYPES[2]}'))::int AS fulltime_offers,
                COUNT(*) FILTER (WHERE placement_type IN ('${PLACEMENT_TYPES[1]}', '${PLACEMENT_TYPES[2]}'))::int AS internship_offers,
                COUNT(*) FILTER (WHERE placement_status = '${STATUS.PLACEMENT.OFFERED}')::int  AS pending_offers,
                COUNT(*) FILTER (WHERE placement_status = '${STATUS.PLACEMENT.ACCEPTED}')::int AS accepted_offers,
                COUNT(*) FILTER (WHERE placement_status = '${STATUS.PLACEMENT.JOINED}')::int   AS joined_count,
                COUNT(*) FILTER (WHERE placement_status = '${STATUS.PLACEMENT.REJECTED}')::int AS rejected_offers,
                COUNT(*) FILTER (WHERE placement_status = '${STATUS.PLACEMENT.CANCELLED}')::int AS cancelled_offers,
                (
                    SELECT COUNT(*)::int FROM (
                        SELECT student_id
                        FROM placement_results
                        WHERE college_id = $1 AND passout_year = $2 AND ${VALID_PLACEMENT}
                        GROUP BY student_id HAVING COUNT(*) > 1
                    ) multi
                ) AS students_with_multiple_offers
            FROM placement_results
            WHERE college_id = $1 AND passout_year = $2
        `, params),

        // Internship stats
        query(`
            SELECT
                COALESCE(MAX(internship_stipend), 0)                                                   AS highest_stipend,
                COALESCE(ROUND(AVG(internship_stipend) FILTER (WHERE internship_stipend > 0), 2), 0)   AS average_stipend,
                COUNT(*) FILTER (WHERE internship_stipend > 0)::int                                    AS with_stipend_count
            FROM placement_results
            WHERE college_id = $1 AND passout_year = $2
              AND ${VALID_PLACEMENT}
              AND placement_type IN ('${PLACEMENT_TYPES[1]}', '${PLACEMENT_TYPES[2]}')
        `, params),
    ]);

    return {
        package_slabs: slabResult.rows[0],
        offer_breakdown: offerResult.rows[0],
        internship_stats: internshipResult.rows[0],
    };
}

// ============================================================================
// #105c — APPLICATION FUNNEL  (pipeline, selection rate, eligible-not-applied)
// ============================================================================

async function getApplicationFunnel(collegeId, passoutYear) {
    const params = [collegeId, passoutYear];

    const [funnelResult, enaResult] = await Promise.all([
        query(`
            SELECT
                COUNT(*)::int                AS total_applications,
                COUNT(DISTINCT sa.student_id)::int AS unique_applicants,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.PENDING}')::int       AS pending,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.UNDER_REVIEW}')::int  AS under_review,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.SHORTLISTED}')::int   AS shortlisted,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.SELECTED}')::int      AS selected,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.OFFERED}')::int       AS offered,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.REJECTED}')::int      AS rejected,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.WITHDRAWN}')::int     AS withdrawn,
                CASE WHEN COUNT(*) > 0
                    THEN ROUND(
                        (COUNT(*) FILTER (WHERE sa.application_status IN ('${STATUS.APPLICATION.SELECTED}', '${STATUS.APPLICATION.OFFERED}'))::numeric / COUNT(*)) * 100, 2
                    )
                    ELSE 0
                END AS selection_rate,
                CASE WHEN COUNT(DISTINCT sa.student_id) > 0
                    THEN ROUND(COUNT(*)::numeric / COUNT(DISTINCT sa.student_id), 2)
                    ELSE 0
                END AS applications_per_student
            FROM student_applications sa
            JOIN job_postings jp ON jp.job_id = sa.job_id
            WHERE sa.college_id = $1 AND $2 = ANY(jp.passout_years)
        `, params),

        query(`
            SELECT COUNT(*)::int AS eligible_not_applied_count
            FROM eligible_not_applied ena
            JOIN job_postings jp ON jp.job_id = ena.job_id
            WHERE ena.college_id = $1 AND $2 = ANY(jp.passout_years)
        `, params),
    ]);

    return {
        ...funnelResult.rows[0],
        eligible_not_applied_count: enaResult.rows[0].eligible_not_applied_count,
    };
}

// ============================================================================
// #105d — STUDENT READINESS  (profile status, restrictions)
// ============================================================================

async function getStudentReadiness(collegeId, passoutYear) {
    const params = [collegeId, passoutYear];

    const [statusResult, restrictionResult] = await Promise.all([
        query(`
            SELECT
                COUNT(*)::int AS total_students,
                COUNT(*) FILTER (WHERE student_status = '${STATUS.STUDENT.ACTIVE}')::int    AS active,
                COUNT(*) FILTER (WHERE student_status = '${STATUS.STUDENT.INACTIVE}')::int  AS inactive,
                COUNT(*) FILTER (WHERE student_status = '${STATUS.STUDENT.SUSPENDED}')::int AS suspended,
                COUNT(*) FILTER (WHERE student_status = '${STATUS.STUDENT.GRADUATED}')::int AS graduated,
                COUNT(*) FILTER (WHERE student_status = '${STATUS.STUDENT.DROPOUT}')::int   AS dropout,
                COUNT(*) FILTER (WHERE profile_complete = true)::int      AS profile_complete,
                COUNT(*) FILTER (WHERE profile_complete = false)::int     AS profile_incomplete,
                COUNT(*) FILTER (WHERE profile_is_approved = true)::int   AS profile_approved,
                COUNT(*) FILTER (WHERE profile_is_approved = false AND profile_complete = true)::int AS profile_pending_approval
            FROM students
            WHERE college_id = $1 AND student_passout_year = $2
        `, params),

        query(`
            SELECT
                COUNT(*)::int AS total_active_restrictions,
                COUNT(*) FILTER (WHERE sr.restriction_type = '${STATUS.RESTRICTION.BAR_FROM_PLACEMENTS}')::int   AS bar_from_placements,
                COUNT(*) FILTER (WHERE sr.restriction_type = '${STATUS.RESTRICTION.BAR_FROM_COMPANY}')::int      AS bar_from_company,
                COUNT(*) FILTER (WHERE sr.restriction_type = '${STATUS.RESTRICTION.PROBATION}')::int             AS probation,
                COUNT(*) FILTER (WHERE sr.restriction_type = '${STATUS.RESTRICTION.WARNING}')::int               AS warning,
                COUNT(*) FILTER (WHERE sr.restriction_type = '${STATUS.RESTRICTION.TEMPORARY_SUSPENSION}')::int  AS temporary_suspension,
                COUNT(DISTINCT sr.student_id)::int AS restricted_students
            FROM student_restrictions sr
            JOIN students s ON s.student_id = sr.student_id
            WHERE sr.college_id = $1 AND s.student_passout_year = $2 AND sr.is_active = true
        `, params),
    ]);

    return {
        student_status: statusResult.rows[0],
        restrictions: restrictionResult.rows[0],
    };
}

// ============================================================================
// #105e — DIVERSITY STATS  (gender & category — NAAC/AICTE reports)
// ============================================================================

async function getDiversityStats(collegeId, passoutYear) {
    const params = [collegeId, passoutYear];

    const [genderResult, categoryResult] = await Promise.all([
        query(`
            SELECT
                COALESCE(spi.gender, '${ERROR_MESSAGES.DASHBOARD_NOT_SPECIFIED}') AS gender,
                COUNT(DISTINCT s.student_id)::int     AS total,
                COUNT(DISTINCT pr.student_id)::int    AS placed,
                CASE WHEN COUNT(DISTINCT s.student_id) > 0
                    THEN ROUND((COUNT(DISTINCT pr.student_id)::numeric / COUNT(DISTINCT s.student_id)) * 100, 2)
                    ELSE 0
                END AS placement_percentage
            FROM students s
            LEFT JOIN student_personal_information spi ON spi.student_id = s.student_id
            LEFT JOIN placement_results pr ON pr.student_id = s.student_id
                AND pr.college_id = $1 AND pr.passout_year = $2 AND pr.${VALID_PLACEMENT}
            WHERE s.college_id = $1 AND s.student_passout_year = $2 AND s.${NOT_DROPOUT}
            GROUP BY spi.gender
            ORDER BY total DESC
        `, params),

        query(`
            SELECT
                COALESCE(spi.category, '${ERROR_MESSAGES.DASHBOARD_NOT_SPECIFIED}') AS category,
                COUNT(DISTINCT s.student_id)::int       AS total,
                COUNT(DISTINCT pr.student_id)::int      AS placed,
                CASE WHEN COUNT(DISTINCT s.student_id) > 0
                    THEN ROUND((COUNT(DISTINCT pr.student_id)::numeric / COUNT(DISTINCT s.student_id)) * 100, 2)
                    ELSE 0
                END AS placement_percentage
            FROM students s
            LEFT JOIN student_personal_information spi ON spi.student_id = s.student_id
            LEFT JOIN placement_results pr ON pr.student_id = s.student_id
                AND pr.college_id = $1 AND pr.passout_year = $2 AND pr.${VALID_PLACEMENT}
            WHERE s.college_id = $1 AND s.student_passout_year = $2 AND s.${NOT_DROPOUT}
            GROUP BY spi.category
            ORDER BY total DESC
        `, params),
    ]);

    return {
        gender_wise: genderResult.rows,
        category_wise: categoryResult.rows,
    };
}

// ============================================================================
// #105f — TRAINING & FEEDBACK STATS
// ============================================================================

async function getTrainingStats(collegeId, passoutYear) {
    const params = [collegeId, passoutYear];

    const [trainingResult, feedbackResult] = await Promise.all([
        query(`
            SELECT
                COUNT(*)::int AS total_programs,
                COUNT(*) FILTER (WHERE tp.program_status = '${STATUS.TRAINING.UPCOMING}')::int         AS upcoming,
                COUNT(*) FILTER (WHERE tp.program_status = '${STATUS.TRAINING.ENROLLMENT_OPEN}')::int  AS enrollment_open,
                COUNT(*) FILTER (WHERE tp.program_status = '${STATUS.TRAINING.IN_PROGRESS}')::int      AS in_progress,
                COUNT(*) FILTER (WHERE tp.program_status = '${STATUS.TRAINING.COMPLETED}')::int        AS completed,
                COUNT(*) FILTER (WHERE tp.program_status = '${STATUS.TRAINING.CANCELLED}')::int        AS cancelled,
                COALESCE(SUM(te.enrolled_count), 0)::int                            AS total_enrolled,
                COALESCE(SUM(te.completed_count), 0)::int                           AS total_completed_enrollment,
                COALESCE(SUM(te.dropped_count), 0)::int                             AS total_dropped,
                COALESCE(ROUND(AVG(te.avg_rating), 2), 0)                           AS overall_avg_rating
            FROM training_programs tp
            LEFT JOIN (
                SELECT
                    program_id,
                    COUNT(*)::int AS enrolled_count,
                    COUNT(*) FILTER (WHERE completion_status = '${STATUS.ENROLLMENT.COMPLETED}')::int AS completed_count,
                    COUNT(*) FILTER (WHERE completion_status = '${STATUS.ENROLLMENT.DROPPED}')::int   AS dropped_count,
                    AVG(student_rating) FILTER (WHERE student_rating IS NOT NULL) AS avg_rating
                FROM training_enrollments
                WHERE college_id = $1
                GROUP BY program_id
            ) te ON te.program_id = tp.program_id
            WHERE tp.college_id = $1 AND tp.target_passout_year = $2
        `, params),

        query(`
            SELECT
                COUNT(*)::int                          AS total_feedback,
                COALESCE(ROUND(AVG(rating), 2), 0)     AS average_rating,
                COUNT(*) FILTER (WHERE rating = 5)::int AS five_star,
                COUNT(*) FILTER (WHERE rating = 4)::int AS four_star,
                COUNT(*) FILTER (WHERE rating = 3)::int AS three_star,
                COUNT(*) FILTER (WHERE rating = 2)::int AS two_star,
                COUNT(*) FILTER (WHERE rating = 1)::int AS one_star
            FROM placement_feedback pf
            JOIN job_postings jp ON jp.job_id = pf.job_id
            WHERE pf.college_id = $1 AND $2 = ANY(jp.passout_years)
        `, params),
    ]);

    return {
        training: trainingResult.rows[0],
        feedback: feedbackResult.rows[0],
    };
}

// ============================================================================
// #106 — DEPARTMENT-WISE STATS
// ============================================================================

async function getDepartmentWise(collegeId, passoutYear, deptId) {
    const params = [collegeId, passoutYear];
    let deptFilter = '';
    if (deptId) {
        deptFilter = ' AND d.dept_id = $3';
        params.push(deptId);
    }

    const sql = `
        SELECT
            d.dept_id,
            d.dept_name,
            COALESCE(ss.total_students, 0)::int          AS total_students,
            COALESCE(ps.placed_count, 0)::int             AS placed_count,
            CASE WHEN COALESCE(ss.total_students, 0) > 0
                THEN ROUND((COALESCE(ps.placed_count, 0)::numeric / ss.total_students) * 100, 2)
                ELSE 0
            END                                            AS placement_percentage,
            (COALESCE(ss.total_students, 0) - COALESCE(ps.placed_count, 0))::int AS unplaced_count,
            COALESCE(ps.highest_package, 0)                AS highest_package,
            COALESCE(ps.average_package, 0)                AS average_package,
            COALESCE(ss.avg_cgpa, 0)                       AS avg_cgpa,
            COALESCE(ss.profile_complete_count, 0)::int    AS profile_complete_count
        FROM departments d
        LEFT JOIN (
            SELECT
                s.dept_id,
                COUNT(*)::int AS total_students,
                ROUND(AVG(sai.overall_cgpa), 2) AS avg_cgpa,
                COUNT(*) FILTER (WHERE s.profile_complete = true)::int AS profile_complete_count
            FROM students s
            LEFT JOIN student_academic_information sai ON sai.student_id = s.student_id
            WHERE s.college_id = $1 AND s.student_passout_year = $2 AND s.${NOT_DROPOUT}
            GROUP BY s.dept_id
        ) ss ON ss.dept_id = d.dept_id
        LEFT JOIN (
            SELECT
                s.dept_id,
                COUNT(DISTINCT pr.student_id)::int AS placed_count,
                MAX(pr.fulltime_package)            AS highest_package,
                ROUND(AVG(pr.fulltime_package) FILTER (WHERE pr.fulltime_package > 0), 2) AS average_package
            FROM placement_results pr
            JOIN students s ON s.student_id = pr.student_id
            WHERE pr.college_id = $1 AND pr.passout_year = $2 AND pr.${VALID_PLACEMENT}
            GROUP BY s.dept_id
        ) ps ON ps.dept_id = d.dept_id
        WHERE d.college_id = $1 AND d.is_active = true${deptFilter}
        ORDER BY d.dept_name
    `;

    const { rows } = await query(sql, params);
    return rows;
}

// ============================================================================
// #107 — COMPANY-WISE STATS
// ============================================================================

async function getCompanyWise(collegeId, passoutYear, companyId) {
    const params = [collegeId, passoutYear];
    let companyFilter = '';
    if (companyId) {
        companyFilter = ' AND c.company_id = $3';
        params.push(companyId);
    }

    const sql = `
        SELECT
            c.company_id,
            c.company_name,
            c.industry,
            COALESCE(js.total_jobs, 0)::int           AS total_jobs,
            COALESCE(js.total_positions, 0)::int      AS total_positions,
            COALESCE(ap.total_applications, 0)::int   AS total_applications,
            COALESCE(ap.shortlisted, 0)::int          AS shortlisted,
            COALESCE(ap.selected, 0)::int             AS selected,
            COALESCE(ap.rejected, 0)::int             AS rejected,
            CASE WHEN COALESCE(ap.total_applications, 0) > 0
                THEN ROUND((COALESCE(ap.selected, 0)::numeric / ap.total_applications) * 100, 2)
                ELSE 0
            END                                        AS selection_rate,
            COALESCE(ps.offers_made, 0)::int           AS offers_made,
            COALESCE(ps.avg_package, 0)                AS avg_package,
            COALESCE(ps.highest_package, 0)            AS highest_package,
            COALESCE(fb.avg_rating, 0)                 AS feedback_avg_rating,
            COALESCE(fb.feedback_count, 0)::int        AS feedback_count
        FROM companies c
        LEFT JOIN (
            SELECT
                jp.company_id,
                COUNT(*)::int AS total_jobs,
                COALESCE(SUM(jp_pos.vacancies), 0)::int AS total_positions
            FROM job_postings jp
            LEFT JOIN (
                SELECT job_id, SUM(vacancies)::int AS vacancies FROM job_positions GROUP BY job_id
            ) jp_pos ON jp_pos.job_id = jp.job_id
            WHERE jp.college_id = $1 AND $2 = ANY(jp.passout_years) AND jp.${PUBLISHED_JOBS}
            GROUP BY jp.company_id
        ) js ON js.company_id = c.company_id
        LEFT JOIN (
            SELECT
                jp.company_id,
                COUNT(*)::int AS total_applications,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.SHORTLISTED}')::int             AS shortlisted,
                COUNT(*) FILTER (WHERE sa.application_status IN ('${STATUS.APPLICATION.SELECTED}', '${STATUS.APPLICATION.OFFERED}'))::int   AS selected,
                COUNT(*) FILTER (WHERE sa.application_status = '${STATUS.APPLICATION.REJECTED}')::int                 AS rejected
            FROM student_applications sa
            JOIN job_postings jp ON jp.job_id = sa.job_id
            WHERE sa.college_id = $1 AND $2 = ANY(jp.passout_years)
            GROUP BY jp.company_id
        ) ap ON ap.company_id = c.company_id
        LEFT JOIN (
            SELECT
                company_id,
                COUNT(*)::int AS offers_made,
                ROUND(AVG(fulltime_package) FILTER (WHERE fulltime_package > 0), 2) AS avg_package,
                MAX(fulltime_package) AS highest_package
            FROM placement_results
            WHERE college_id = $1 AND passout_year = $2 AND ${VALID_PLACEMENT}
            GROUP BY company_id
        ) ps ON ps.company_id = c.company_id
        LEFT JOIN (
            SELECT
                pf.company_id,
                ROUND(AVG(pf.rating), 2) AS avg_rating,
                COUNT(*)::int AS feedback_count
            FROM placement_feedback pf
            JOIN job_postings jp ON jp.job_id = pf.job_id
            WHERE pf.college_id = $1 AND $2 = ANY(jp.passout_years)
            GROUP BY pf.company_id
        ) fb ON fb.company_id = c.company_id
        WHERE c.college_id = $1 AND c.company_status = '${STATUS.COMPANY.ACTIVE}'
          AND (js.total_jobs > 0 OR ps.offers_made > 0)${companyFilter}
        ORDER BY COALESCE(ps.offers_made, 0) DESC, c.company_name
    `;

    const { rows } = await query(sql, params);
    return rows;
}

// ============================================================================
// #108 — YEAR COMPARISON  (side-by-side for multiple passout years)
// ============================================================================

async function getYearComparison(collegeId, passoutYears) {
    const sql = `
        WITH years AS (SELECT unnest($2::int[]) AS yr),
        student_stats AS (
            SELECT
                s.student_passout_year AS yr,
                COUNT(*)::int AS total_students
            FROM students s
            WHERE s.college_id = $1 AND s.student_passout_year = ANY($2::int[])
              AND s.student_status != '${STATUS.STUDENT.DROPOUT}'
            GROUP BY s.student_passout_year
        ),
        placement_stats AS (
            SELECT
                pr.passout_year AS yr,
                COUNT(DISTINCT pr.student_id)::int AS placed_count,
                COUNT(*)::int AS total_offers,
                COUNT(*) FILTER (WHERE pr.placement_type IN ('${PLACEMENT_TYPES[0]}', '${PLACEMENT_TYPES[2]}'))::int  AS fulltime_count,
                COUNT(*) FILTER (WHERE pr.placement_type IN ('${PLACEMENT_TYPES[1]}', '${PLACEMENT_TYPES[2]}'))::int AS internship_count,
                COALESCE(MAX(pr.fulltime_package), 0)                                                     AS highest_package,
                COALESCE(ROUND(AVG(pr.fulltime_package) FILTER (WHERE pr.fulltime_package > 0), 2), 0)    AS average_package
            FROM placement_results pr
            WHERE pr.college_id = $1 AND pr.passout_year = ANY($2::int[]) AND pr.${VALID_PLACEMENT}
            GROUP BY pr.passout_year
        ),
        company_stats AS (
            SELECT
                yr,
                COUNT(DISTINCT jp.company_id)::int AS total_companies,
                COUNT(*)::int AS total_jobs
            FROM job_postings jp,
                 LATERAL unnest(jp.passout_years) AS yr
            WHERE jp.college_id = $1 AND yr = ANY($2::int[]) AND jp.${PUBLISHED_JOBS}
            GROUP BY yr
        ),
        application_stats AS (
            SELECT
                yr,
                COUNT(*)::int AS total_applications,
                CASE WHEN COUNT(*) > 0
                    THEN ROUND(
                        (COUNT(*) FILTER (WHERE sa.application_status IN ('${STATUS.APPLICATION.SELECTED}', '${STATUS.APPLICATION.OFFERED}'))::numeric / COUNT(*)) * 100, 2
                    )
                    ELSE 0
                END AS selection_rate
            FROM student_applications sa
            JOIN job_postings jp ON jp.job_id = sa.job_id,
                 LATERAL unnest(jp.passout_years) AS yr
            WHERE sa.college_id = $1 AND yr = ANY($2::int[])
            GROUP BY yr
        )
        SELECT
            y.yr                      AS passout_year,
            COALESCE(ss.total_students, 0)   AS total_students,
            COALESCE(ps.placed_count, 0)     AS placed_count,
            CASE WHEN COALESCE(ss.total_students, 0) > 0
                THEN ROUND((COALESCE(ps.placed_count, 0)::numeric / ss.total_students) * 100, 2)
                ELSE 0
            END                               AS placement_percentage,
            COALESCE(ps.total_offers, 0)      AS total_offers,
            COALESCE(ps.fulltime_count, 0)    AS fulltime_count,
            COALESCE(ps.internship_count, 0)  AS internship_count,
            COALESCE(ps.highest_package, 0)   AS highest_package,
            COALESCE(ps.average_package, 0)   AS average_package,
            COALESCE(cs.total_companies, 0)   AS total_companies,
            COALESCE(cs.total_jobs, 0)        AS total_jobs,
            COALESCE(apps.total_applications, 0) AS total_applications,
            COALESCE(apps.selection_rate, 0)     AS selection_rate
        FROM years y
        LEFT JOIN student_stats ss     ON ss.yr = y.yr
        LEFT JOIN placement_stats ps   ON ps.yr = y.yr
        LEFT JOIN company_stats cs     ON cs.yr = y.yr
        LEFT JOIN application_stats apps ON apps.yr = y.yr
        ORDER BY y.yr DESC
    `;

    const { rows } = await query(sql, [collegeId, passoutYears]);
    return rows;
}

module.exports = {
    getOverview,
    getPlacementStats,
    getApplicationFunnel,
    getStudentReadiness,
    getDiversityStats,
    getTrainingStats,
    getDepartmentWise,
    getCompanyWise,
    getYearComparison,
};
