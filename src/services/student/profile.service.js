/**
 * ============================================================================
 * STUDENT PROFILE SERVICE — Profile Data & Completion
 * ============================================================================
 * Functions:
 *   - getBasicInfo(studentId, collegeId)
 *   - getFullProfile(studentId, collegeId)
 *   - getProfileCompletion(studentId, collegeId)
 *
 * Performance: get_full_profile uses Promise.all for parallel DB queries
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    PROFILE_COMPLETION_WEIGHTS,
} = require('../../config/constants');

// ============================================================================
// 1. GET BASIC INFO
// ============================================================================

async function getBasicInfo(studentId, collegeId) {
    const result = await query(
        `SELECT
           s.student_id, s.first_name, s.middle_name, s.last_name,
           s.student_email, s.dept_id,
           s.student_passout_year, s.current_year,
           s.student_status, s.profile_complete, s.profile_is_approved,
           s.created_at, s.updated_at,
           d.dept_name
         FROM students s
         JOIN departments d ON s.dept_id = d.dept_id
         WHERE s.student_id = $1 AND s.college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 2. GET FULL PROFILE (Parallel queries for speed)
// ============================================================================

async function getFullProfile(studentId, collegeId) {
    // Fire ALL queries in parallel — reduces ~500ms → ~80-100ms
    const [
        studentResult,
        personalResult,
        academicResult,
        semesterResult,
        skillsResult,
        projectsResult,
        experienceResult,
        achievementsResult,
        certificatesResult,
        activitiesResult,
        profileLinksResult,
        verificationCountsResult,
    ] = await Promise.all([
        // 1. Basic student info + department
        query(
            `SELECT
               s.student_id, s.first_name, s.middle_name, s.last_name,
               s.student_email, s.dept_id, s.college_id,
               s.student_passout_year, s.current_year,
               s.student_status, s.profile_complete, s.profile_is_approved,
               s.created_at, s.updated_at,
               d.dept_name, c.college_name
             FROM students s
             JOIN departments d ON s.dept_id = d.dept_id
             JOIN colleges c ON s.college_id = c.college_id
             WHERE s.student_id = $1 AND s.college_id = $2
             LIMIT 1`,
            [studentId, collegeId]
        ),

        // 2. Personal information
        query(
            `SELECT
               mobile_number, alternate_mobile, birth_date, gender, blood_group,
               aadhaar_number, caste, category, nationality,
               father_name, father_mobile, father_occupation, father_annual_income,
               mother_name, mother_mobile, mother_occupation, mother_annual_income,
               guardian_name, guardian_mobile,
               permanent_address, permanent_city, permanent_district,
               permanent_state, permanent_pincode,
               current_address, current_city, current_district,
               current_state, current_pincode, same_as_permanent
             FROM student_personal_information
             WHERE student_id = $1 AND college_id = $2
             LIMIT 1`,
            [studentId, collegeId]
        ),

        // 3. Academic information
        query(
            `SELECT
               roll_number, enrollment_number, admission_year, admission_based_on,
               tenth_percentage, tenth_board, tenth_passing_year,
               twelfth_or_diploma, twelfth_percentage, twelfth_board,
               diploma_percentage, diploma_branch, higher_education_passing_year,
               overall_cgpa, total_live_kts, total_dead_kts,
               any_gap_during_education, gap_years, gap_reason
             FROM student_academic_information
             WHERE student_id = $1 AND college_id = $2
             LIMIT 1`,
            [studentId, collegeId]
        ),

        // 4. Semester grades
        query(
            `SELECT
               semester_number, academic_year, sgpa, cgpa,
               backlogs_in_semester, backlog_subjects, semester_status
             FROM student_semester_grades
             WHERE student_id = $1 AND college_id = $2
             ORDER BY semester_number ASC`,
            [studentId, collegeId]
        ),

        // 5. Skills (join with skills table for name)
        query(
            `SELECT
               ss.student_skill_id, ss.skill_id, ss.proficiency_level,
               sk.skill_name, sk.skill_category
             FROM student_skills ss
             JOIN skills sk ON ss.skill_id = sk.skill_id
             WHERE ss.student_id = $1 AND ss.college_id = $2
             ORDER BY sk.skill_name ASC`,
            [studentId, collegeId]
        ),

        // 6. Projects
        query(
            `SELECT
               project_id, project_title, project_description, project_type,
               project_url, github_link, demo_link, technologies_used,
               start_date, end_date, is_ongoing, team_size,
               role_in_project, display_order, is_featured
             FROM student_projects
             WHERE student_id = $1 AND college_id = $2
             ORDER BY display_order ASC NULLS LAST, created_at DESC`,
            [studentId, collegeId]
        ),

        // 7. Experience (approved only for profile view)
        query(
            `SELECT
               experience_id, company_name, company_website, position_title,
               employment_type, job_description, responsibilities,
               technologies_used, work_location, work_mode,
               start_date, end_date, is_current, duration_months,
               stipend_amount, offer_letter_url, completion_certificate_url,
               is_verified
             FROM student_experience
             WHERE student_id = $1 AND college_id = $2
               AND verification_status = 'approved'
             ORDER BY start_date DESC`,
            [studentId, collegeId]
        ),

        // 8. Achievements (approved only for profile view)
        query(
            `SELECT
               achievement_id, achievement_title, achievement_description,
               achievement_type, issuing_organization, event_name,
               achievement_level, position_rank, participants_count,
               achievement_date, certificate_url, proof_url,
               is_verified, is_featured, display_order
             FROM student_achievements
             WHERE student_id = $1 AND college_id = $2
               AND verification_status = 'approved'
             ORDER BY display_order ASC NULLS LAST, achievement_date DESC`,
            [studentId, collegeId]
        ),

        // 9. Certificates (approved only for profile view)
        query(
            `SELECT
               certificate_id, certificate_name, certificate_description,
               certificate_type, issuing_organization, issuing_platform,
               credential_id, credential_url, issue_date, expiry_date,
               does_not_expire, skills_covered, certificate_url, is_verified
             FROM student_certificates
             WHERE student_id = $1 AND college_id = $2
               AND verification_status = 'approved'
             ORDER BY issue_date DESC`,
            [studentId, collegeId]
        ),

        // 10. Extra-curricular activities
        query(
            `SELECT
               activity_id, activity_name, activity_description,
               activity_type, organizing_body, role_position,
               start_date, end_date, is_ongoing, hours_contributed,
               certificate_url, proof_urls
             FROM student_activities
             WHERE student_id = $1 AND college_id = $2
             ORDER BY start_date DESC`,
            [studentId, collegeId]
        ),

        // 11. Profile links
        query(
            `SELECT
               personal_portfolio_url, resume_url, profile_image_url,
               github_url, linkedin_url, leetcode_url, codechef_url,
               codeforces_url, hackerrank_url, geeksforgeeks_url,
               medium_url, bio, area_of_interest
             FROM student_profile_links
             WHERE student_id = $1 AND college_id = $2
             LIMIT 1`,
            [studentId, collegeId]
        ),

        // 12. Verification counts (pending/rejected) for summary badges
        query(
            `SELECT
               (SELECT COUNT(*) FROM student_experience
                WHERE student_id = $1 AND college_id = $2 AND verification_status = 'pending')::int AS exp_pending,
               (SELECT COUNT(*) FROM student_experience
                WHERE student_id = $1 AND college_id = $2 AND verification_status = 'rejected')::int AS exp_rejected,
               (SELECT COUNT(*) FROM student_achievements
                WHERE student_id = $1 AND college_id = $2 AND verification_status = 'pending')::int AS ach_pending,
               (SELECT COUNT(*) FROM student_achievements
                WHERE student_id = $1 AND college_id = $2 AND verification_status = 'rejected')::int AS ach_rejected,
               (SELECT COUNT(*) FROM student_certificates
                WHERE student_id = $1 AND college_id = $2 AND verification_status = 'pending')::int AS cert_pending,
               (SELECT COUNT(*) FROM student_certificates
                WHERE student_id = $1 AND college_id = $2 AND verification_status = 'rejected')::int AS cert_rejected`,
            [studentId, collegeId]
        ),
    ]);

    // Check student exists
    if (!studentResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    // Build verification summary
    const vc = verificationCountsResult.rows[0];

    // Calculate profile completion using total counts (all statuses, not just approved)
    // This prevents completion from dropping when items are pending/rejected
    const totalExperiences = experienceResult.rows.length + vc.exp_pending + vc.exp_rejected;
    const totalCertificates = certificatesResult.rows.length + vc.cert_pending + vc.cert_rejected;

    const completion = calculateProfileCompletion({
        personal: personalResult.rows[0] || null,
        academic: academicResult.rows[0] || null,
        semesters: semesterResult.rows,
        skills: skillsResult.rows,
        profileLinks: profileLinksResult.rows[0] || null,
        projects: projectsResult.rows,
        experience: totalExperiences > 0 ? [{ _total: true }] : [],
        certificates: totalCertificates > 0 ? [{ _total: true }] : [],
    });
    const verification_summary = {
        experience: { pending: vc.exp_pending, rejected: vc.exp_rejected },
        achievements: { pending: vc.ach_pending, rejected: vc.ach_rejected },
        certificates: { pending: vc.cert_pending, rejected: vc.cert_rejected },
    };

    return {
        student: studentResult.rows[0],
        personal_information: personalResult.rows[0] || null,
        academic_information: academicResult.rows[0] || null,
        semester_grades: semesterResult.rows,
        skills: skillsResult.rows,
        projects: projectsResult.rows,
        experience: experienceResult.rows,
        achievements: achievementsResult.rows,
        certificates: certificatesResult.rows,
        activities: activitiesResult.rows,
        profile_links: profileLinksResult.rows[0] || null,
        profile_completion: completion,
        verification_summary,
    };
}

// ============================================================================
// 3. GET PROFILE COMPLETION (Lightweight — COUNT queries only)
// ============================================================================

async function getProfileCompletion(studentId, collegeId) {
    // Parallel COUNT queries — very fast
    const [
        personalResult,
        academicResult,
        semesterResult,
        skillsResult,
        profileLinksResult,
        projectsResult,
        experienceResult,
        certificatesResult,
    ] = await Promise.all([
        query(
            `SELECT COUNT(*) AS cnt,
                    COUNT(mobile_number) + COUNT(birth_date) + COUNT(gender) +
                    COUNT(father_name) + COUNT(permanent_address) AS filled_fields
             FROM student_personal_information
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT COUNT(*) AS cnt,
                    COUNT(roll_number) + COUNT(tenth_percentage) +
                    COUNT(overall_cgpa) AS filled_fields
             FROM student_academic_information
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT COUNT(*) AS cnt FROM student_semester_grades
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT COUNT(*) AS cnt FROM student_skills
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT COUNT(*) AS cnt,
                    COUNT(resume_url) + COUNT(linkedin_url) +
                    COUNT(github_url) AS filled_fields
             FROM student_profile_links
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT COUNT(*) AS cnt FROM student_projects
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT COUNT(*) AS cnt FROM student_experience
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT COUNT(*) AS cnt FROM student_certificates
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
    ]);

    const completion = calculateProfileCompletion({
        personal: parseInt(personalResult.rows[0].cnt) > 0 && parseInt(personalResult.rows[0].filled_fields) >= 5
            ? { filled: true } : null,
        academic: parseInt(academicResult.rows[0].cnt) > 0 && parseInt(academicResult.rows[0].filled_fields) >= 3
            ? { filled: true } : null,
        semesters: parseInt(semesterResult.rows[0].cnt) > 0 ? [1] : [],
        skills: parseInt(skillsResult.rows[0].cnt) > 0 ? [1] : [],
        profileLinks: parseInt(profileLinksResult.rows[0].cnt) > 0 && parseInt(profileLinksResult.rows[0].filled_fields) >= 1
            ? { filled: true } : null,
        projects: parseInt(projectsResult.rows[0].cnt) > 0 ? [1] : [],
        experience: parseInt(experienceResult.rows[0].cnt) > 0 ? [1] : [],
        certificates: parseInt(certificatesResult.rows[0].cnt) > 0 ? [1] : [],
    });

    return completion;
}

// ============================================================================
// HELPER — Calculate profile completion percentage
// ============================================================================

function calculateProfileCompletion(data) {
    const sections = {};
    let totalPercentage = 0;

    // Personal info (20%) — row exists with ≥5 non-null fields
    const personalComplete = data.personal !== null;
    sections.personal_information = {
        weight: PROFILE_COMPLETION_WEIGHTS.PERSONAL_INFO,
        completed: personalComplete,
        earned: personalComplete ? PROFILE_COMPLETION_WEIGHTS.PERSONAL_INFO : 0,
    };

    // Academic info (20%) — row exists with ≥3 non-null fields
    const academicComplete = data.academic !== null;
    sections.academic_information = {
        weight: PROFILE_COMPLETION_WEIGHTS.ACADEMIC_INFO,
        completed: academicComplete,
        earned: academicComplete ? PROFILE_COMPLETION_WEIGHTS.ACADEMIC_INFO : 0,
    };

    // Semester grades (15%) — at least 1 record
    const semesterComplete = data.semesters.length > 0;
    sections.semester_grades = {
        weight: PROFILE_COMPLETION_WEIGHTS.SEMESTER_GRADES,
        completed: semesterComplete,
        earned: semesterComplete ? PROFILE_COMPLETION_WEIGHTS.SEMESTER_GRADES : 0,
        count: data.semesters.length,
    };

    // Skills (15%) — at least 1 skill
    const skillsComplete = data.skills.length > 0;
    sections.skills = {
        weight: PROFILE_COMPLETION_WEIGHTS.SKILLS,
        completed: skillsComplete,
        earned: skillsComplete ? PROFILE_COMPLETION_WEIGHTS.SKILLS : 0,
        count: data.skills.length,
    };

    // Profile links (10%) — row exists with ≥1 non-null URL
    const linksComplete = data.profileLinks !== null;
    sections.profile_links = {
        weight: PROFILE_COMPLETION_WEIGHTS.PROFILE_LINKS,
        completed: linksComplete,
        earned: linksComplete ? PROFILE_COMPLETION_WEIGHTS.PROFILE_LINKS : 0,
    };

    // Projects (10%) — at least 1 project
    const projectsComplete = data.projects.length > 0;
    sections.projects = {
        weight: PROFILE_COMPLETION_WEIGHTS.PROJECTS,
        completed: projectsComplete,
        earned: projectsComplete ? PROFILE_COMPLETION_WEIGHTS.PROJECTS : 0,
        count: data.projects.length,
    };

    // Experience (5%) — at least 1 record
    const experienceComplete = data.experience.length > 0;
    sections.experience = {
        weight: PROFILE_COMPLETION_WEIGHTS.EXPERIENCE,
        completed: experienceComplete,
        earned: experienceComplete ? PROFILE_COMPLETION_WEIGHTS.EXPERIENCE : 0,
        count: data.experience.length,
    };

    // Certificates (5%) — at least 1 record
    const certificatesComplete = data.certificates.length > 0;
    sections.certificates = {
        weight: PROFILE_COMPLETION_WEIGHTS.CERTIFICATES,
        completed: certificatesComplete,
        earned: certificatesComplete ? PROFILE_COMPLETION_WEIGHTS.CERTIFICATES : 0,
        count: data.certificates.length,
    };

    // Total
    for (const section of Object.values(sections)) {
        totalPercentage += section.earned;
    }

    return {
        total_percentage: totalPercentage,
        is_complete: totalPercentage >= 100,
        sections,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getBasicInfo,
    getFullProfile,
    getProfileCompletion,
};
