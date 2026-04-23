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
const chunkedQuery = require('../../utils/chunkedQuery');
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
           s.student_passout_year,
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
    // Chunked parallelism — max 3 connections at a time instead of 12
    // Prevents pool exhaustion under high concurrency (10L+ students)
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
    ] = await chunkedQuery([
        // 1. Basic student info + department
        {
            text: `SELECT
               s.student_id, s.first_name, s.middle_name, s.last_name,
               s.student_email, s.dept_id, s.college_id,
               s.student_passout_year,
               s.student_status, s.profile_complete, s.profile_is_approved,
               s.created_at, s.updated_at,
               d.dept_name, c.college_name
             FROM students s
             JOIN departments d ON s.dept_id = d.dept_id
             JOIN colleges c ON s.college_id = c.college_id
             WHERE s.student_id = $1 AND s.college_id = $2
             LIMIT 1`,
            params: [studentId, collegeId],
        },

        // 2. Personal information
        {
            text: `SELECT
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
            params: [studentId, collegeId],
        },

        // 3. Academic information
        {
            text: `SELECT
               roll_number, enrollment_number, admission_year, admission_based_on,
               tenth_percentage, tenth_board, tenth_passing_year,
               twelfth_or_diploma, twelfth_percentage, twelfth_board,
               diploma_percentage, diploma_branch, higher_education_passing_year,
               overall_cgpa, total_live_kts, total_dead_kts,
               any_gap_during_education, gap_years, gap_reason
             FROM student_academic_information
             WHERE student_id = $1 AND college_id = $2
             LIMIT 1`,
            params: [studentId, collegeId],
        },

        // 4. Semester grades
        {
            text: `SELECT
               semester_number, academic_year, sgpa, cgpa,
               backlogs_in_semester, backlog_subjects, semester_status
             FROM student_semester_grades
             WHERE student_id = $1 AND college_id = $2
             ORDER BY semester_number ASC`,
            params: [studentId, collegeId],
        },

        // 5. Skills (join with skills table for name)
        {
            text: `SELECT
               ss.student_skill_id, ss.skill_id, ss.proficiency_level,
               sk.skill_name, sk.skill_category
             FROM student_skills ss
             JOIN skills sk ON ss.skill_id = sk.skill_id
             WHERE ss.student_id = $1 AND ss.college_id = $2
             ORDER BY sk.skill_name ASC`,
            params: [studentId, collegeId],
        },

        // 6. Projects
        {
            text: `SELECT
               project_id, project_title, project_description, project_type,
               project_url, github_link, demo_link, technologies_used,
               start_date, end_date, is_ongoing, team_size,
               role_in_project, display_order, is_featured
             FROM student_projects
             WHERE student_id = $1 AND college_id = $2
             ORDER BY display_order ASC NULLS LAST, created_at DESC`,
            params: [studentId, collegeId],
        },

        // 7. Experience (approved only for profile view)
        {
            text: `SELECT
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
            params: [studentId, collegeId],
        },

        // 8. Achievements (approved only for profile view)
        {
            text: `SELECT
               achievement_id, achievement_title, achievement_description,
               achievement_type, issuing_organization, event_name,
               achievement_level, position_rank, participants_count,
               achievement_date, certificate_url, proof_url,
               is_verified, is_featured, display_order
             FROM student_achievements
             WHERE student_id = $1 AND college_id = $2
               AND verification_status = 'approved'
             ORDER BY display_order ASC NULLS LAST, achievement_date DESC`,
            params: [studentId, collegeId],
        },

        // 9. Certificates (approved only for profile view)
        {
            text: `SELECT
               certificate_id, certificate_name, certificate_description,
               certificate_type, issuing_organization, issuing_platform,
               credential_id, credential_url, issue_date, expiry_date,
               does_not_expire, skills_covered, certificate_url, is_verified
             FROM student_certificates
             WHERE student_id = $1 AND college_id = $2
               AND verification_status = 'approved'
             ORDER BY issue_date DESC`,
            params: [studentId, collegeId],
        },

        // 10. Extra-curricular activities
        {
            text: `SELECT
               activity_id, activity_name, activity_description,
               activity_type, organizing_body, role_position,
               start_date, end_date, is_ongoing, hours_contributed,
               certificate_url, proof_urls
             FROM student_activities
             WHERE student_id = $1 AND college_id = $2
             ORDER BY start_date DESC`,
            params: [studentId, collegeId],
        },

        // 11. Profile links
        {
            text: `SELECT
               personal_portfolio_url, resume_url, profile_image_url,
               github_url, linkedin_url, leetcode_url, codechef_url,
               codeforces_url, hackerrank_url, geeksforgeeks_url,
               medium_url, bio, area_of_interest
             FROM student_profile_links
             WHERE student_id = $1 AND college_id = $2
             LIMIT 1`,
            params: [studentId, collegeId],
        },

        // 12. Verification counts (pending/rejected) for summary badges
        {
            text: `SELECT
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
            params: [studentId, collegeId],
        },
    ], 3);

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
        personal: personalResult.rows[0]
            ? (() => {
                const p = personalResult.rows[0];
                const filled = [p.mobile_number, p.birth_date, p.gender, p.father_name, p.permanent_address]
                    .filter(v => v != null && v !== "").length;
                return filled >= 5 ? p : null;
            })()
            : null,
        academic: academicResult.rows[0]
            ? (() => {
                const a = academicResult.rows[0];
                const filled = [a.roll_number, a.tenth_percentage, a.overall_cgpa]
                    .filter(v => v != null && v !== "").length;
                return filled >= 3 ? a : null;
            })()
            : null,
        semesters: semesterResult.rows,
        skills: skillsResult.rows,
        profileLinks: profileLinksResult.rows[0]
            ? (() => {
                const pl = profileLinksResult.rows[0];
                const filled = [pl.resume_url, pl.linkedin_url, pl.github_url]
                    .filter(v => v != null && v !== "").length;
                return filled >= 1 ? pl : null;
            })()
            : null,
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
    // Chunked COUNT queries — max 3 connections at a time
    const [
        personalResult,
        academicResult,
        semesterResult,
        skillsResult,
        profileLinksResult,
        projectsResult,
        experienceResult,
        certificatesResult,
    ] = await chunkedQuery([
        {
            text: `SELECT COUNT(*) AS cnt,
                    COUNT(mobile_number) + COUNT(birth_date) + COUNT(gender) +
                    COUNT(father_name) + COUNT(permanent_address) AS filled_fields
             FROM student_personal_information
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT COUNT(*) AS cnt,
                    COUNT(roll_number) + COUNT(tenth_percentage) +
                    COUNT(overall_cgpa) AS filled_fields
             FROM student_academic_information
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT COUNT(*) AS cnt FROM student_semester_grades
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT COUNT(*) AS cnt FROM student_skills
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT COUNT(*) AS cnt,
                    COUNT(resume_url) + COUNT(linkedin_url) +
                    COUNT(github_url) AS filled_fields
             FROM student_profile_links
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT COUNT(*) AS cnt FROM student_projects
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT COUNT(*) AS cnt FROM student_experience
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
        {
            text: `SELECT COUNT(*) AS cnt FROM student_certificates
             WHERE student_id = $1 AND college_id = $2`,
            params: [studentId, collegeId],
        },
    ], 3);

    const completion = calculateProfileCompletion({
        personal: Number.parseInt(personalResult.rows[0].cnt) > 0 && Number.parseInt(personalResult.rows[0].filled_fields) >= 5
            ? { filled: true } : null,
        academic: Number.parseInt(academicResult.rows[0].cnt) > 0 && Number.parseInt(academicResult.rows[0].filled_fields) >= 3
            ? { filled: true } : null,
        semesters: Number.parseInt(semesterResult.rows[0].cnt) > 0 ? [1] : [],
        skills: Number.parseInt(skillsResult.rows[0].cnt) > 0 ? [1] : [],
        profileLinks: Number.parseInt(profileLinksResult.rows[0].cnt) > 0 && Number.parseInt(profileLinksResult.rows[0].filled_fields) >= 1
            ? { filled: true } : null,
        projects: Number.parseInt(projectsResult.rows[0].cnt) > 0 ? [1] : [],
        experience: Number.parseInt(experienceResult.rows[0].cnt) > 0 ? [1] : [],
        certificates: Number.parseInt(certificatesResult.rows[0].cnt) > 0 ? [1] : [],
    });

    // Sync profile_complete column to match computed state (lazy update)
    syncProfileComplete(studentId, collegeId, completion.is_complete).catch(err => {
        logger.warn(`${LOG.DB_QUERY} Failed to sync profile_complete`, { studentId, error: err.message });
    });

    // Fetch approval status + rejection reason to include in response
    const approvalResult = await query(
        `SELECT profile_approval_status, profile_rejection_reason, rejected_at,
                profile_is_approved, profile_complete
         FROM students WHERE student_id = $1 AND college_id = $2 LIMIT 1`,
        [studentId, collegeId]
    );

    const approval = approvalResult.rows[0] || {};

    return {
        ...completion,
        profile_approval_status: approval.profile_approval_status || 'pending',
        profile_rejection_reason: approval.profile_rejection_reason || null,
        rejected_at: approval.rejected_at || null,
        profile_is_approved: approval.profile_is_approved || false,
        profile_complete: approval.profile_complete || false,
    };
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
// HELPER — Sync profile_complete DB column with computed state
// ============================================================================

async function syncProfileComplete(studentId, collegeId, isComplete) {
    if (isComplete) {
        // Determine if auto-approve should fire
        let shouldAutoApprove = false;
        try {
            const { getVerificationSettings } = require('../college/verificationSettings.service');
            const settings = await getVerificationSettings(collegeId);
            shouldAutoApprove = settings?.auto_approve_profile_on_complete || settings?.bypass?.profiles || false;
        } catch (err) {
            logger.warn('Failed to fetch verification settings for auto-approve', { studentId, error: err.message });
        }

        // Single atomic UPDATE: set profile_complete + conditionally auto-approve
        await query(
            `UPDATE students
             SET profile_complete = true,
                 profile_is_approved = CASE WHEN $3 AND profile_approval_status != 'approved' THEN true ELSE profile_is_approved END,
                 profile_approval_status = CASE WHEN $3 AND profile_approval_status != 'approved' THEN 'approved' ELSE profile_approval_status END,
                 approved_at = CASE WHEN $3 AND profile_approval_status != 'approved' THEN NOW() ELSE approved_at END,
                 updated_at = NOW()
             WHERE student_id = $1 AND college_id = $2 AND profile_complete = false`,
            [studentId, collegeId, shouldAutoApprove]
        );
    } else {
        await query(
            `UPDATE students SET profile_complete = false, updated_at = NOW()
             WHERE student_id = $1 AND college_id = $2 AND profile_complete = true`,
            [studentId, collegeId]
        );
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getBasicInfo,
    getFullProfile,
    getProfileCompletion,
    calculateProfileCompletion,
};
