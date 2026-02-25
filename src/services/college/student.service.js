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

const { query } = require('../../config/db');
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
 * @returns {string} dept_id
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

    // 3. Hash password (provided or auto-generated)
    const rawPassword = student_password || generateDefaultPassword(first_name, student_passout_year);
    const hashedPassword = await hashPassword(rawPassword);

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

    // Pre-fetch all existing student emails for this college to check duplicates efficiently
    const existingEmailsResult = await query(
        `SELECT LOWER(student_email) AS email FROM students WHERE college_id = $1`,
        [collegeId]
    );
    const existingEmails = new Set(existingEmailsResult.rows.map((r) => r.email));

    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const rowIndex = i + 1;

        try {
            // Validate dept_name
            const deptId = deptMap.get(s.dept_name.toLowerCase());
            if (!deptId) {
                throw new Error(`Department "${s.dept_name}" not found or inactive`);
            }

            // Check duplicate email
            if (existingEmails.has(s.student_email.toLowerCase())) {
                throw new Error(`Email "${s.student_email}" already exists`);
            }

            // Auto-generate password
            const rawPassword = generateDefaultPassword(s.first_name, s.student_passout_year);
            const hashedPassword = await hashPassword(rawPassword);

            // Insert
            const result = await query(
                `INSERT INTO students
                   (college_id, first_name, middle_name, last_name, student_email, student_password,
                    dept_id, student_passout_year, current_year, student_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING student_id, first_name, last_name, student_email, dept_id,
                           student_passout_year, current_year, student_status, created_at`,
                [
                    collegeId, s.first_name, s.middle_name || null, s.last_name,
                    s.student_email, hashedPassword, deptId,
                    s.student_passout_year, s.current_year, STATUS.STUDENT.ACTIVE,
                ]
            );

            // Add to existing emails set to detect duplicates within the same batch
            existingEmails.add(s.student_email.toLowerCase());

            results.successful++;
            results.registered.push({
                row: rowIndex,
                student_id: result.rows[0].student_id,
                first_name: s.first_name,
                last_name: s.last_name,
                student_email: s.student_email,
                dept_name: s.dept_name,
                default_password: rawPassword,
            });
        } catch (err) {
            results.failed++;
            results.errors.push({
                row: rowIndex,
                first_name: s.first_name,
                last_name: s.last_name,
                student_email: s.student_email,
                error: err.message,
            });

            logger.warn(`${LOG.AUTH} Bulk register row ${rowIndex} failed`, {
                email: s.student_email,
                error: err.message,
            });
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

    // Count
    const countResult = await query(
        `SELECT COUNT(*) AS total FROM students s WHERE ${whereClause}`,
        params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch
    const studentResult = await query(
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
    );

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
 * @returns {Object} Full student profile
 */
async function getStudentFullProfile(studentId, collegeId) {
    // 1. Basic student info
    const studentResult = await query(
        `SELECT s.student_id, s.first_name, s.middle_name, s.last_name,
                s.student_email, s.dept_id, s.student_passout_year, s.current_year,
                s.student_status, s.profile_complete, s.profile_is_approved,
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

    // 2. Parallel queries for all related tables
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
    ] = await Promise.all([
        query(
            `SELECT * FROM student_personal_information
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT * FROM student_academic_information
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT * FROM student_semester_grades
             WHERE student_id = $1 AND college_id = $2
             ORDER BY semester_number ASC`,
            [studentId, collegeId]
        ),
        query(
            `SELECT ss.*, sk.skill_name, sk.skill_category
             FROM student_skills ss
             JOIN skills sk ON ss.skill_id = sk.skill_id
             WHERE ss.student_id = $1 AND ss.college_id = $2
             ORDER BY sk.skill_name`,
            [studentId, collegeId]
        ),
        query(
            `SELECT * FROM student_projects
             WHERE student_id = $1 AND college_id = $2
             ORDER BY display_order, created_at DESC`,
            [studentId, collegeId]
        ),
        query(
            `SELECT * FROM student_experience
             WHERE student_id = $1 AND college_id = $2
             ORDER BY start_date DESC`,
            [studentId, collegeId]
        ),
        query(
            `SELECT * FROM student_achievements
             WHERE student_id = $1 AND college_id = $2
             ORDER BY display_order, achievement_date DESC`,
            [studentId, collegeId]
        ),
        query(
            `SELECT * FROM student_certificates
             WHERE student_id = $1 AND college_id = $2
             ORDER BY issue_date DESC`,
            [studentId, collegeId]
        ),
        query(
            `SELECT * FROM student_activities
             WHERE student_id = $1 AND college_id = $2
             ORDER BY start_date DESC`,
            [studentId, collegeId]
        ),
        query(
            `SELECT * FROM student_profile_links
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
    ]);

    logger.debug(`${LOG.AUTH} Full profile fetched for student`, { studentId, collegeId });

    // 3. Calculate profile completion percentage
    const sections = {
        personal_info: { filled: !!personalInfo.rows[0], weight: 20, label: 'Personal Information' },
        academic_info: { filled: !!academicInfo.rows[0], weight: 20, label: 'Academic Information' },
        semester_grades: { filled: semesterGrades.rows.length > 0, weight: 15, label: 'Semester Grades' },
        skills: { filled: skills.rows.length > 0, weight: 10, label: 'Skills' },
        projects: { filled: projects.rows.length > 0, weight: 10, label: 'Projects' },
        experience: { filled: experience.rows.length > 0, weight: 10, label: 'Experience' },
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

    return {
        ...student,
        profile_summary: {
            profile_completion_percentage,
            profile_complete: student.profile_complete,
            profile_is_approved: student.profile_is_approved,
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
            new Error(`Student is already ${newStatus}`),
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
 * @param {boolean} isApproved
 * @returns {Object} Updated student
 */
async function approveStudentProfile(studentId, collegeId, isApproved) {
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
    if (isApproved && !existing.rows[0].profile_complete) {
        throw Object.assign(
            new Error('Cannot approve an incomplete profile. Student must complete their profile first'),
            { status: 400 }
        );
    }

    // 3. Update
    const result = await query(
        `UPDATE students
         SET profile_is_approved = $1, updated_at = NOW()
         WHERE student_id = $2 AND college_id = $3
         RETURNING student_id, first_name, last_name, student_email,
                   profile_complete, profile_is_approved, updated_at`,
        [isApproved, studentId, collegeId]
    );

    const action = isApproved ? 'approved' : 'rejected';
    logger.info(`${LOG.AUTH} Student profile ${action}`, { studentId, collegeId });

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
