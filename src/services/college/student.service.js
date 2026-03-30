/**
 * ============================================================================
 * STUDENT SERVICE — Student Management (COLLEGEADMIN only)
 * ============================================================================
 *   - registerStudent(data, collegeId)
 *   - bulkRegisterStudents(students, collegeId)
 *   - getAllStudents(collegeId, filters)
 *   - getStudentById(studentId, collegeId)
 *   - getStudentFullProfile(studentId, collegeId)
 *   - updateStudent(studentId, collegeId, data)
 *   - toggleStudentStatus(studentId, collegeId, newStatus)
 *   - approveStudentProfile(studentId, collegeId, isApproved)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const chunkedQuery = require('../../utils/chunkedQuery');
const { hashPassword } = require('../../utils/passwordHelper');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// ============================================================================
// HELPER — Resolve dept_name → dept_id (college-scoped)
// ============================================================================

/**
 * Look up dept_id by dept_name within a college.
 *
 * @param {string} deptName
 * @param {string} collegeId
 * @returns {Promise<string>} dept_id
 * @throws {Error} If department not found
 */
async function resolveDeptId(deptName, collegeId) {
    const result = await query(
        `SELECT dept_id FROM departments
         WHERE college_id = $1 AND LOWER(dept_name) = LOWER($2) AND is_active = true
         LIMIT 1`,
        [collegeId, deptName]
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error(`Department "${deptName}" not found or inactive in your college`),
            { status: 404 }
        );
    }

    return result.rows[0].dept_id;
}

// ============================================================================
// HELPER — Generate default password
// ============================================================================

/**
 * Generate a default password: first_name@passout_year
 * e.g. "rahul@2026"
 */
function generateDefaultPassword(firstName, passoutYear) {
    return `${firstName.toLowerCase()}@${passoutYear}`;
}

// ============================================================================
// 1. REGISTER SINGLE STUDENT
// ============================================================================

/**
 * Register a single student.
 * Frontend sends dept_name → resolved to dept_id.
 * If password not provided, auto-generates: firstName@passoutYear
 *
 * @param {Object} data
 * @param {string} collegeId
 * @returns {Object} Created student (without password)
 */
async function registerStudent(data, collegeId) {
    const {
        first_name,
        middle_name = null,
        last_name,
        student_email,
        student_password,
        dept_name,
        student_passout_year,
        current_year,
    } = data;

    // 1. Resolve dept_name → dept_id
    const dept_id = await resolveDeptId(dept_name, collegeId);

    logger.debug(`${LOG.AUTH} Resolved dept_name="${dept_name}" → dept_id=${dept_id}`);

    // 2. Check email uniqueness within college
    const emailCheck = await query(
        `SELECT student_id FROM students
         WHERE college_id = $1 AND LOWER(student_email) = LOWER($2)
         LIMIT 1`,
        [collegeId, student_email]
    );

    if (emailCheck.rows.length) {
        throw Object.assign(
            new Error('A student with this email already exists in your college'),
            { status: 409 }
        );
    }

    // 3. Hash password
    const hashedPassword = await hashPassword(student_password);

    // 4. Insert student
    const result = await query(
        `INSERT INTO students
           (college_id, first_name, middle_name, last_name, student_email, student_password,
            dept_id, student_passout_year, current_year, student_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING student_id, first_name, middle_name, last_name, student_email,
                   dept_id, student_passout_year, current_year, student_status,
                   profile_complete, profile_is_approved, created_at`,
        [
            collegeId, first_name, middle_name, last_name, student_email,
            hashedPassword, dept_id, student_passout_year, current_year,
            STATUS.STUDENT.ACTIVE,
        ]
    );

    const student = result.rows[0];

    logger.info(`${LOG.AUTH} Student registered`, {
        studentId: student.student_id,
        email: student_email,
        deptName: dept_name,
        collegeId,
    });

    return {
        ...student,
        dept_name,
    };
}

// ============================================================================
// 2. BULK REGISTER STUDENTS
// ============================================================================

/**
 * Bulk register students from a JSON array.
 * Each student has dept_name (resolved to dept_id).
 * Auto-generates password: firstName@passoutYear
 * Returns detailed success/failure report.
 *
 * @param {Array} students - Array of student objects
 * @param {string} collegeId
 * @returns {{ total, successful, failed, results }}
 */
async function bulkRegisterStudents(students, collegeId) {
    const results = {
        total: students.length,
        successful: 0,
        failed: 0,
        registered: [],
        errors: [],
    };

    // Pre-fetch all departments for this college to avoid N+1 queries
    const deptResult = await query(
        `SELECT dept_id, dept_name FROM departments
         WHERE college_id = $1 AND is_active = true`,
        [collegeId]
    );

    const deptMap = new Map();
    deptResult.rows.forEach((d) => {
        deptMap.set(d.dept_name.toLowerCase(), d.dept_id);
    });

    logger.info(`${LOG.AUTH} Starting bulk student registration`, {
        count: students.length,
        collegeId,
        availableDepts: deptResult.rows.length,
    });

    // Batch-check only incoming emails instead of loading ALL college emails
    const incomingEmails = students.map((s) => s.student_email.toLowerCase());
    const existingEmailsResult = await query(
        `SELECT LOWER(student_email) AS email FROM students
         WHERE college_id = $1 AND LOWER(student_email) = ANY($2::TEXT[])`,
        [collegeId, incomingEmails]
    );
    const existingEmails = new Set(existingEmailsResult.rows.map((r) => r.email));

    // Phase 1: Pre-validate all rows and collect valid students
    const validStudents = [];
    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const rowIndex = i + 1;

        const deptId = deptMap.get(s.dept_name.toLowerCase());
        if (!deptId) {
            results.failed++;
            results.errors.push({
                row: rowIndex, first_name: s.first_name, last_name: s.last_name,
                student_email: s.student_email, error: `Department "${s.dept_name}" not found or inactive`,
            });
            continue;
        }

        if (existingEmails.has(s.student_email.toLowerCase())) {
            results.failed++;
            results.errors.push({
                row: rowIndex, first_name: s.first_name, last_name: s.last_name,
                student_email: s.student_email, error: `Email "${s.student_email}" already exists`,
            });
            continue;
        }

        // Track within-batch duplicates
        existingEmails.add(s.student_email.toLowerCase());

        const rawPassword = generateDefaultPassword(s.first_name, s.student_passout_year);
        validStudents.push({ ...s, deptId, rawPassword, rowIndex });
    }

    // Phase 2: Batch hash passwords (5 concurrent to avoid event loop starvation)
    const HASH_CONCURRENCY = 5;
    const hashedPasswords = new Array(validStudents.length);
    for (let i = 0; i < validStudents.length; i += HASH_CONCURRENCY) {
        const chunk = validStudents.slice(i, i + HASH_CONCURRENCY);
        const hashes = await Promise.all(chunk.map((v) => hashPassword(v.rawPassword)));
        hashes.forEach((h, j) => { hashedPasswords[i + j] = h; });
    }

    // Phase 3: Insert using a single connection + transaction with savepoints
    if (validStudents.length > 0) {
        const client = await getClient();
        try {
            await client.query('BEGIN');

            for (let i = 0; i < validStudents.length; i++) {
                const v = validStudents[i];
                const savepointName = `sp_${i}`;
                try {
                    await client.query(`SAVEPOINT ${savepointName}`);
                    const result = await client.query(
                        `INSERT INTO students
                           (college_id, first_name, middle_name, last_name, student_email, student_password,
                            dept_id, student_passout_year, current_year, student_status)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         RETURNING student_id, first_name, last_name, student_email, dept_id,
                                   student_passout_year, current_year, student_status, created_at`,
                        [
                            collegeId, v.first_name, v.middle_name || null, v.last_name,
                            v.student_email, hashedPasswords[i], v.deptId,
                            v.student_passout_year, v.current_year, STATUS.STUDENT.ACTIVE,
                        ]
                    );

                    results.successful++;
                    results.registered.push({
                        row: v.rowIndex,
                        student_id: result.rows[0].student_id,
                        first_name: v.first_name,
                        last_name: v.last_name,
                        student_email: v.student_email,
                        dept_name: v.dept_name,
                        default_password: v.rawPassword,
                    });
                } catch (err) {
                    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                    results.failed++;
                    results.errors.push({
                        row: v.rowIndex, first_name: v.first_name, last_name: v.last_name,
                        student_email: v.student_email, error: err.message,
                    });
                    logger.warn(`${LOG.AUTH} Bulk register row ${v.rowIndex} failed`, {
                        email: v.student_email, error: err.message,
                    });
                }
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    logger.info(`${LOG.AUTH} Bulk student registration complete`, {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        collegeId,
    });

    return results;
}

// ============================================================================
// 3. GET ALL STUDENTS
// ============================================================================

/**
 * List students with filters and pagination.
 *
 * @param {string} collegeId
 * @param {Object} filters
 * @returns {{ students, total, page, limit }}
 */
async function getAllStudents(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['s.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    if (filters.student_status) {
        conditions.push(`s.student_status = $${paramIndex}`);
        params.push(filters.student_status);
        paramIndex++;
    }

    if (filters.dept_id) {
        conditions.push(`s.dept_id = $${paramIndex}`);
        params.push(filters.dept_id);
        paramIndex++;
    }

    if (filters.student_passout_year) {
        conditions.push(`s.student_passout_year = $${paramIndex}`);
        params.push(filters.student_passout_year);
        paramIndex++;
    }

    if (filters.profile_complete !== undefined) {
        conditions.push(`s.profile_complete = $${paramIndex}`);
        params.push(filters.profile_complete);
        paramIndex++;
    }

    if (filters.profile_is_approved !== undefined) {
        conditions.push(`s.profile_is_approved = $${paramIndex}`);
        params.push(filters.profile_is_approved);
        paramIndex++;
    }

    if (filters.search) {
        conditions.push(
            `(s.first_name ILIKE $${paramIndex} OR s.last_name ILIKE $${paramIndex} OR s.student_email ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count and fetch in parallel
    const [countResult, studentResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM students s WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT s.student_id, s.first_name, s.middle_name, s.last_name,
                s.student_email, s.dept_id, s.student_passout_year, s.current_year,
                s.student_status, s.profile_complete, s.profile_is_approved,
                s.created_at, s.updated_at,
                d.dept_name
         FROM students s
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         WHERE ${whereClause}
         ORDER BY s.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);

    return {
        students: studentResult.rows,
        total,
        page,
        limit,
    };
}

// ============================================================================
// 4. GET STUDENT BY ID (Basic Info)
// ============================================================================

/**
 * Get a single student's basic info with department name.
 *
 * @param {string} studentId
 * @param {string} collegeId
 * @returns {Object}
 */
async function getStudentById(studentId, collegeId) {
    const result = await query(
        `SELECT s.student_id, s.first_name, s.middle_name, s.last_name,
                s.student_email, s.dept_id, s.student_passout_year, s.current_year,
                s.student_status, s.profile_complete, s.profile_is_approved,
                s.created_at, s.updated_at,
                d.dept_name
         FROM students s
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         WHERE s.student_id = $1 AND s.college_id = $2`,
        [studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 5. GET STUDENT FULL PROFILE (all tables joined)
// ============================================================================

/**
 * Fetch complete student profile including all related tables.
 * Used for admin review of student profiles.
 *
 * @param {string} studentId
 * @param {string} collegeId
 * @param {boolean} review - If true, show all items with verification status. If false, only approved items.
 * @returns {Object} Full student profile
 */
async function getStudentFullProfile(studentId, collegeId, review = false) {
    // 1. Basic student info
    const studentResult = await query(
        `SELECT s.student_id, s.first_name, s.middle_name, s.last_name,
                s.student_email, s.dept_id, s.student_passout_year, s.current_year,
                s.student_status, s.profile_complete, s.profile_is_approved,
                s.profile_approval_status, s.approved_by, s.approved_at,
                s.profile_rejection_reason, s.rejected_at,
                s.created_at, s.updated_at,
                d.dept_name, d.dept_code
         FROM students s
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         WHERE s.student_id = $1 AND s.college_id = $2`,
        [studentId, collegeId]
    );

    if (!studentResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const student = studentResult.rows[0];

    // Build verification filter — only filter when not in review mode
    const verificationFilter = review ? '' : "AND verification_status = 'approved'";

    // 2. Chunked queries for all related tables — max 3 connections at a time
    const [
        personalInfo,
        academicInfo,
        semesterGrades,
        skills,
        projects,
        experience,
        achievements,
        certificates,
        activities,
        profileLinks,
        verificationCounts,
    ] = await chunkedQuery([
        {
            text: `SELECT mobile_number, alternate_mobile, birth_date, gender, blood_group,
                    aadhaar_number, caste, category, nationality,
                    father_name, father_mobile, father_occupation, father_annual_income,
                    mother_name, mother_mobile, mother_occupation, mother_annual_income,
                    guardian_name, guardian_mobile,
                    permanent_address, permanent_city, permanent_district, permanent_state, permanent_pincode,
                    current_address, current_city, current_district, current_state, current_pincode,
                    same_as_permanent, created_at, updated_at
             FROM student_personal_information
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT roll_number, enrollment_number, admission_year, admission_based_on,
                    tenth_percentage, tenth_board, tenth_passing_year,
                    twelfth_or_diploma, twelfth_percentage, twelfth_board,
                    diploma_percentage, diploma_branch, higher_education_passing_year,
                    overall_cgpa, total_live_kts, total_dead_kts,
                    any_gap_during_education, gap_years, gap_reason,
                    created_at, updated_at
             FROM student_academic_information
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT grade_id, semester_number, academic_year, sgpa, cgpa,
                    backlogs_in_semester, backlog_subjects, semester_status
             FROM student_semester_grades
             WHERE student_id = $1 AND college_id = $2
             ORDER BY semester_number ASC`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT ss.student_skill_id, ss.proficiency_level, sk.skill_name, sk.skill_category
             FROM student_skills ss
             JOIN skills sk ON ss.skill_id = sk.skill_id
             WHERE ss.student_id = $1 AND ss.college_id = $2
             ORDER BY sk.skill_name`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT project_id, project_title, project_description, project_type,
                    project_url, github_link, demo_link, technologies_used,
                    start_date, end_date, is_ongoing, team_size, role_in_project,
                    display_order, is_featured
             FROM student_projects
             WHERE student_id = $1 AND college_id = $2
             ORDER BY display_order, created_at DESC
             LIMIT 100`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT experience_id, company_name, company_website, position_title,
                    employment_type, job_description, responsibilities, technologies_used,
                    work_location, work_mode, start_date, end_date, is_current, duration_months,
                    stipend_amount, offer_letter_url, completion_certificate_url,
                    verification_status, verified_by, verified_at, rejection_reason, rejected_at
             FROM student_experience
             WHERE student_id = $1 AND college_id = $2 ${verificationFilter}
             ORDER BY start_date DESC
             LIMIT 100`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT achievement_id, achievement_title, achievement_description, achievement_type,
                    issuing_organization, event_name, achievement_level, position_rank,
                    participants_count, achievement_date, certificate_url, proof_url,
                    verification_status, verified_by, verified_at, rejection_reason, rejected_at,
                    is_featured, display_order
             FROM student_achievements
             WHERE student_id = $1 AND college_id = $2 ${verificationFilter}
             ORDER BY display_order, achievement_date DESC
             LIMIT 100`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT certificate_id, certificate_name, certificate_description, certificate_type,
                    issuing_organization, issuing_platform, credential_id, credential_url,
                    issue_date, expiry_date, does_not_expire, skills_covered, certificate_url,
                    verification_status, verified_by, verified_at, rejection_reason, rejected_at
             FROM student_certificates
             WHERE student_id = $1 AND college_id = $2 ${verificationFilter}
             ORDER BY issue_date DESC
             LIMIT 100`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT activity_id, activity_name, activity_description, activity_type,
                    organizing_body, role_position, start_date, end_date, is_ongoing,
                    hours_contributed, certificate_url, proof_urls
             FROM student_activities
             WHERE student_id = $1 AND college_id = $2
             ORDER BY start_date DESC
             LIMIT 100`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT personal_portfolio_url, resume_url, profile_image_url,
                    github_url, linkedin_url, leetcode_url, codechef_url, codeforces_url,
                    hackerrank_url, geeksforgeeks_url, medium_url, bio, area_of_interest
             FROM student_profile_links
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        // Verification counts — single query with UNION ALL instead of 6 correlated subqueries
        {
            text: `SELECT section, verification_status AS status, COUNT(*)::int AS cnt
             FROM (
               SELECT 'exp' AS section, verification_status FROM student_experience
               WHERE student_id = $1 AND college_id = $2 AND verification_status IN ('pending','rejected')
               UNION ALL
               SELECT 'ach', verification_status FROM student_achievements
               WHERE student_id = $1 AND college_id = $2 AND verification_status IN ('pending','rejected')
               UNION ALL
               SELECT 'cert', verification_status FROM student_certificates
               WHERE student_id = $1 AND college_id = $2 AND verification_status IN ('pending','rejected')
             ) v
             GROUP BY section, verification_status`,
            params: [studentId, collegeId],
        },
    ], 3);

    logger.debug(`${LOG.AUTH} Full profile fetched for student`, { studentId, collegeId, review });

    // Build verification summary from UNION ALL rows
    const vcMap = { exp_pending: 0, exp_rejected: 0, ach_pending: 0, ach_rejected: 0, cert_pending: 0, cert_rejected: 0 };
    for (const row of verificationCounts.rows) {
        const key = `${row.section}_${row.status}`;
        if (key in vcMap) vcMap[key] = row.cnt;
    }
    const vc = vcMap;

    // 3. Calculate profile completion percentage
    // Use total counts (all statuses) for experience — prevents completion from dropping when items are pending
    const totalExperiences = experience.rows.length + vc.exp_pending + vc.exp_rejected;

    const sections = {
        personal_info: { filled: !!personalInfo.rows[0], weight: 20, label: 'Personal Information' },
        academic_info: { filled: !!academicInfo.rows[0], weight: 20, label: 'Academic Information' },
        semester_grades: { filled: semesterGrades.rows.length > 0, weight: 15, label: 'Semester Grades' },
        skills: { filled: skills.rows.length > 0, weight: 10, label: 'Skills' },
        projects: { filled: projects.rows.length > 0, weight: 10, label: 'Projects' },
        experience: { filled: totalExperiences > 0, weight: 10, label: 'Experience' },
        profile_links: { filled: !!profileLinks.rows[0], weight: 15, label: 'Profile Links' },
    };

    let earnedWeight = 0;
    let totalWeight = 0;
    const section_status = {};

    for (const [key, sec] of Object.entries(sections)) {
        totalWeight += sec.weight;
        if (sec.filled) earnedWeight += sec.weight;
        section_status[key] = {
            label: sec.label,
            completed: sec.filled,
            weight: `${sec.weight}%`,
        };
    }

    const profile_completion_percentage = Math.round((earnedWeight / totalWeight) * 100);

    // Verification summary for badges
    const verification_summary = {
        experience: { pending: vc.exp_pending, rejected: vc.exp_rejected },
        achievements: { pending: vc.ach_pending, rejected: vc.ach_rejected },
        certificates: { pending: vc.cert_pending, rejected: vc.cert_rejected },
    };

    return {
        ...student,
        profile_summary: {
            profile_completion_percentage,
            profile_complete: student.profile_complete,
            profile_is_approved: student.profile_is_approved,
            profile_approval_status: student.profile_approval_status,
            approved_by: student.approved_by,
            approved_at: student.approved_at,
            profile_rejection_reason: student.profile_rejection_reason,
            rejected_at: student.rejected_at,
            section_status,
        },
        personal_info: personalInfo.rows[0] || null,
        academic_info: academicInfo.rows[0] || null,
        semester_grades: semesterGrades.rows,
        skills: skills.rows,
        projects: projects.rows,
        experience: experience.rows,
        achievements: achievements.rows,
        certificates: certificates.rows,
        activities: activities.rows,
        profile_links: profileLinks.rows[0] || null,
        verification_summary,
    };
}

// ============================================================================
// 6. UPDATE STUDENT (basic info only)
// ============================================================================

/**
 * Update a student's basic info. If dept_name is provided, resolves to dept_id.
 *
 * @param {string} studentId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated student
 */
async function updateStudent(studentId, collegeId, data) {
    // 1. Verify student exists
    const existing = await query(
        `SELECT student_id FROM students
         WHERE student_id = $1 AND college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    // 2. If dept_name provided, resolve to dept_id
    if (data.dept_name) {
        data.dept_id = await resolveDeptId(data.dept_name, collegeId);
        delete data.dept_name; // Remove non-column field
    }

    // 3. If email changing, check uniqueness
    if (data.student_email) {
        const emailCheck = await query(
            `SELECT student_id FROM students
             WHERE college_id = $1 AND LOWER(student_email) = LOWER($2) AND student_id != $3
             LIMIT 1`,
            [collegeId, data.student_email, studentId]
        );

        if (emailCheck.rows.length) {
            throw Object.assign(
                new Error('A student with this email already exists in your college'),
                { status: 409 }
            );
        }
    }

    // 4. Build dynamic UPDATE
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
    }

    fields.push('updated_at = NOW()');
    values.push(studentId, collegeId);

    const result = await query(
        `UPDATE students
         SET ${fields.join(', ')}
         WHERE student_id = $${paramIndex} AND college_id = $${paramIndex + 1}
         RETURNING student_id, first_name, middle_name, last_name, student_email,
                   dept_id, student_passout_year, current_year, student_status,
                   profile_complete, profile_is_approved, updated_at`,
        values
    );

    logger.info(`${LOG.AUTH} Student updated`, { studentId, collegeId });

    return result.rows[0];
}

// ============================================================================
// 7. TOGGLE STUDENT STATUS
// ============================================================================

/**
 * Change student status (active, inactive, suspended, graduated, dropout).
 *
 * @param {string} studentId
 * @param {string} collegeId
 * @param {string} newStatus
 * @returns {Object} Updated student
 */
async function toggleStudentStatus(studentId, collegeId, newStatus) {
    // 1. Verify exists
    const existing = await query(
        `SELECT student_id, student_status FROM students
         WHERE student_id = $1 AND college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    // 2. Already same status?
    if (existing.rows[0].student_status === newStatus) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.STUDENT_ALREADY_STATUS),
            { status: 400 }
        );
    }

    // 3. Update
    const result = await query(
        `UPDATE students
         SET student_status = $1, updated_at = NOW()
         WHERE student_id = $2 AND college_id = $3
         RETURNING student_id, first_name, last_name, student_email,
                   student_status, updated_at`,
        [newStatus, studentId, collegeId]
    );

    logger.info(`${LOG.AUTH} Student status changed to ${newStatus}`, {
        studentId,
        collegeId,
        previousStatus: existing.rows[0].student_status,
        newStatus,
    });

    return result.rows[0];
}

// ============================================================================
// 8. APPROVE / REJECT STUDENT PROFILE
// ============================================================================

/**
 * Approve or reject a student's profile.
 *
 * @param {string} studentId
 * @param {string} collegeId
 * @param {string} userId - The college user performing the action
 * @param {string} action - 'approved' or 'rejected'
 * @param {string|null} rejectionReason
 * @returns {Object} Updated student
 */
async function approveStudentProfile(studentId, collegeId, userId, action, rejectionReason) {
    // 1. Verify exists
    const existing = await query(
        `SELECT student_id, profile_is_approved, profile_complete FROM students
         WHERE student_id = $1 AND college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    // 2. If approving, check profile is complete first
    if (action === STATUS.VERIFICATION.APPROVED && !existing.rows[0].profile_complete) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.PROFILE_INCOMPLETE_CANNOT_APPROVE),
            { status: 400 }
        );
    }

    const isApproved = action === STATUS.VERIFICATION.APPROVED;

    // 3. Use transaction when approving (need to auto-approve pending items)
    if (isApproved) {
        const client = await getClient();
        try {
            await client.query('BEGIN');

            // 3a. Update student profile
            const result = await client.query(
                `UPDATE students
                 SET profile_is_approved = $1,
                     profile_approval_status = $2,
                     approved_by = $3,
                     approved_at = NOW(),
                     profile_rejection_reason = NULL,
                     rejected_at = NULL,
                     updated_at = NOW()
                 WHERE student_id = $4 AND college_id = $5
                 RETURNING student_id, first_name, last_name, student_email,
                           profile_complete, profile_is_approved, profile_approval_status,
                           approved_by, approved_at, profile_rejection_reason, rejected_at, updated_at`,
                [true, STATUS.VERIFICATION.APPROVED, userId, studentId, collegeId]
            );

            // 3b. Auto-approve all pending items in a single CTE query (3→1 round-trip)
            const autoApproveResult = await client.query(
                `WITH exp AS (
                    UPDATE student_experience
                    SET verification_status = $4, is_verified = true,
                        verified_by = $1, verified_at = NOW(),
                        rejection_reason = NULL, rejected_at = NULL
                    WHERE student_id = $2 AND college_id = $3 AND verification_status = $5
                    RETURNING 1
                ), ach AS (
                    UPDATE student_achievements
                    SET verification_status = $4, is_verified = true,
                        verified_by = $1, verified_at = NOW(),
                        rejection_reason = NULL, rejected_at = NULL
                    WHERE student_id = $2 AND college_id = $3 AND verification_status = $5
                    RETURNING 1
                ), cert AS (
                    UPDATE student_certificates
                    SET verification_status = $4, is_verified = true,
                        verified_by = $1, verified_at = NOW(),
                        rejection_reason = NULL, rejected_at = NULL
                    WHERE student_id = $2 AND college_id = $3 AND verification_status = $5
                    RETURNING 1
                )
                SELECT
                    (SELECT COUNT(*)::int FROM exp) AS experiences,
                    (SELECT COUNT(*)::int FROM ach) AS achievements,
                    (SELECT COUNT(*)::int FROM cert) AS certificates`,
                [userId, studentId, collegeId, STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.PENDING]
            );

            await client.query('COMMIT');

            const autoApproved = autoApproveResult.rows[0];

            logger.info(`${LOG.AUTH} Student profile approved with auto-approve`, {
                studentId, collegeId, userId,
                autoApproved,
            });

            return {
                ...result.rows[0],
                auto_approved: autoApproved,
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // 4. Rejection — no transaction needed, only update student table
    const result = await query(
        `UPDATE students
         SET profile_is_approved = $1,
             profile_approval_status = $2,
             approved_by = $3,
             approved_at = approved_at,
             profile_rejection_reason = $4,
             rejected_at = NOW(),
             updated_at = NOW()
         WHERE student_id = $5 AND college_id = $6
         RETURNING student_id, first_name, last_name, student_email,
                   profile_complete, profile_is_approved, profile_approval_status,
                   approved_by, approved_at, profile_rejection_reason, rejected_at, updated_at`,
        [false, STATUS.VERIFICATION.REJECTED, userId, rejectionReason || null, studentId, collegeId]
    );

    logger.info(`${LOG.AUTH} Student profile rejected`, { studentId, collegeId, userId });

    return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    registerStudent,
    bulkRegisterStudents,
    getAllStudents,
    getStudentById,
    getStudentFullProfile,
    updateStudent,
    toggleStudentStatus,
    approveStudentProfile,
};
