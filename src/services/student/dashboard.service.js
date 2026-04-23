/**
 * ============================================================================
 * STUDENT DASHBOARD SERVICE — Composite Dashboard Overview
 * ============================================================================
 * Single endpoint that returns the full dashboard state in 1 DB round-trip
 * (personal data via CTE) + cached shared data (per college+year, 2 min TTL).
 *
 * Designed for 1M+ concurrent users:
 *   - 1 CTE query per request (not 7 separate)
 *   - Shared data cached in-memory (same pattern as deadlineHelper.js)
 *   - Response < 5KB raw, < 3KB gzipped
 *
 * Functions:
 *   - getDashboardOverview(studentId, collegeId)
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { STATUS, PROFILE_COMPLETION_WEIGHTS } = require('../../config/constants');

// ============================================================================
// SHARED DATA CACHE (per college+passoutYear, 2 min TTL)
// ============================================================================
// Same pattern as deadlineHelper.js — simple Map-based TTL cache.
// At ~500 colleges × ~4 passout years = ~2000 entries max. Negligible memory.

const _sharedCache = new Map();
const SHARED_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Get shared (non-student-specific) data for a college+passoutYear.
 * Cached in-memory for 2 minutes.
 */
async function getSharedData(collegeId, passoutYear) {
    const key = `${collegeId}:${passoutYear}`;
    const cached = _sharedCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const result = await query(
        `SELECT
           -- Jobs closing within 48 hours (eligible pool count)
           (SELECT COUNT(*)::int
            FROM job_postings
            WHERE college_id = $1
              AND job_status = $3
              AND allow_applications = true
              AND $2 = ANY(passout_years)
              AND application_deadline BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
           ) AS jobs_closing_soon,

           -- Total available jobs
           (SELECT COUNT(*)::int
            FROM job_postings
            WHERE college_id = $1
              AND job_status = $3
              AND allow_applications = true
              AND $2 = ANY(passout_years)
              AND application_deadline > NOW()
           ) AS total_available_jobs,

           -- Training programs with open enrollment
           (SELECT COUNT(*)::int
            FROM training_programs
            WHERE college_id = $1
              AND allow_enrollments = true
              AND enrollment_deadline > NOW()
              AND program_status NOT IN ('cancelled', 'completed', 'draft')
           ) AS open_training_count,

           -- College feature flags
           (SELECT enabled_features
            FROM colleges
            WHERE college_id = $1
           ) AS enabled_features,

           -- Placement settings for this passout year
           (SELECT json_build_object(
              'max_active_offers', COALESCE(ps.max_active_offers, 1),
              'allow_dream_upgrade', COALESCE(ps.allow_dream_upgrade, true),
              'max_active_applications', ps.max_active_applications,
              'default_offer_days', COALESCE(ps.default_offer_days, 7)
            )
            FROM placement_settings ps
            WHERE ps.college_id = $1 AND ps.passout_year = $2
           ) AS placement_settings`,
        [collegeId, passoutYear, STATUS.JOB.PUBLISHED]
    );

    const row = result.rows[0] || {};
    const data = {
        jobs_closing_soon: row.jobs_closing_soon || 0,
        total_available_jobs: row.total_available_jobs || 0,
        open_training_count: row.open_training_count || 0,
        enabled_features: row.enabled_features || ['core'],
        placement_settings: row.placement_settings || {
            max_active_offers: 1,
            allow_dream_upgrade: true,
            max_active_applications: null,
            default_offer_days: 7,
        },
    };

    _sharedCache.set(key, { data, expiresAt: Date.now() + SHARED_TTL_MS });
    return data;
}

// ============================================================================
// PERSONAL DATA — Single CTE query
// ============================================================================

const PERSONAL_DATA_SQL = `
WITH student_info AS (
  SELECT s.student_id, s.student_passout_year, s.profile_complete, s.profile_is_approved,
         s.profile_approval_status, s.profile_rejection_reason, s.rejected_at
  FROM students s
  WHERE s.student_id = $1 AND s.college_id = $2
  LIMIT 1
),

-- Application funnel counts
app_funnel AS (
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE application_status = 'pending')::int AS pending,
    COUNT(*) FILTER (WHERE application_status = 'under_review')::int AS under_review,
    COUNT(*) FILTER (WHERE application_status = 'shortlisted')::int AS shortlisted,
    COUNT(*) FILTER (WHERE application_status = 'selected')::int AS selected,
    COUNT(*) FILTER (WHERE application_status = 'waitlisted')::int AS waitlisted,
    COUNT(*) FILTER (WHERE application_status = 'offered')::int AS offered,
    COUNT(*) FILTER (WHERE application_status = 'rejected')::int AS rejected,
    COUNT(*) FILTER (WHERE application_status = 'withdrawn')::int AS withdrawn,
    COUNT(*) FILTER (WHERE application_status = 'auto_withdrawn')::int AS auto_withdrawn,
    COUNT(*) FILTER (WHERE application_status NOT IN ('rejected','withdrawn','auto_withdrawn'))::int AS active_count
  FROM student_applications
  WHERE student_id = $1 AND college_id = $2
),

-- Waitlist ranks
waitlist_info AS (
  SELECT sa.waitlist_rank, jp.job_title, c.company_name
  FROM student_applications sa
  JOIN job_postings jp ON jp.job_id = sa.job_id
  JOIN companies c ON c.company_id = jp.company_id
  WHERE sa.student_id = $1 AND sa.college_id = $2
    AND sa.application_status = 'waitlisted'
    AND sa.waitlist_rank IS NOT NULL
  ORDER BY sa.waitlist_rank ASC
),

-- All placements for this student
my_placements AS (
  SELECT
    pr.placement_id, pr.placement_status, pr.placement_type,
    pr.fulltime_package, pr.fulltime_designation, pr.fulltime_joining_date,
    pr.internship_stipend, pr.internship_duration, pr.internship_start_date,
    pr.offer_expires_at,
    pr.offer_letter_url, pr.offer_letter_verified, pr.offer_letter_rejection_reason,
    pr.joining_letter_url, pr.joining_letter_verified, pr.joining_letter_rejection_reason,
    c.company_name, c.company_logo,
    jp.job_title, jp.job_type, jp.tier_id,
    ct.tier_name, ct.tier_level
  FROM placement_results pr
  JOIN companies c ON c.company_id = pr.company_id
  JOIN job_postings jp ON jp.job_id = pr.job_id
  LEFT JOIN company_tiers ct ON ct.tier_id = jp.tier_id
  WHERE pr.student_id = $1 AND pr.college_id = $2
  ORDER BY pr.created_at DESC
),

-- Restrictions count
restriction_count AS (
  SELECT COUNT(*)::int AS active_count
  FROM student_restrictions
  WHERE student_id = $1 AND college_id = $2 AND is_active = true
),

-- Unread notifications count
unread_count AS (
  SELECT COUNT(*)::int AS cnt
  FROM notifications
  WHERE recipient_id = $1 AND college_id = $2
    AND recipient_type = 'student' AND is_read = false
),

-- Profile section completion (lightweight COUNT checks)
profile_sections AS (
  SELECT
    (SELECT COUNT(*) > 0 AND
            COUNT(mobile_number) + COUNT(birth_date) + COUNT(gender) +
            COUNT(father_name) + COUNT(permanent_address) >= 5
     FROM student_personal_information
     WHERE student_id = $1 AND college_id = $2) AS personal_complete,
    (SELECT COUNT(*) > 0 AND
            COUNT(roll_number) + COUNT(tenth_percentage) + COUNT(overall_cgpa) >= 3
     FROM student_academic_information
     WHERE student_id = $1 AND college_id = $2) AS academic_complete,
    (SELECT COUNT(*) > 0
     FROM student_semester_grades
     WHERE student_id = $1 AND college_id = $2) AS semesters_complete,
    (SELECT COUNT(*) > 0
     FROM student_skills
     WHERE student_id = $1 AND college_id = $2) AS skills_complete,
    (SELECT COUNT(*) > 0 AND
            COUNT(resume_url) + COUNT(linkedin_url) + COUNT(github_url) >= 1
     FROM student_profile_links
     WHERE student_id = $1 AND college_id = $2) AS links_complete,
    (SELECT COUNT(*) > 0
     FROM student_projects
     WHERE student_id = $1 AND college_id = $2) AS projects_complete,
    (SELECT COUNT(*) > 0
     FROM student_experience
     WHERE student_id = $1 AND college_id = $2) AS experience_complete,
    (SELECT COUNT(*) > 0
     FROM student_certificates
     WHERE student_id = $1 AND college_id = $2) AS certificates_complete
),

-- Upcoming rounds for student's active applications (next 30 days)
upcoming_rounds AS (
  SELECT
    jr.round_date AS event_date,
    'round' AS event_type,
    jr.round_type || ' — ' || jp.job_title AS title,
    c.company_name AS subtitle,
    jr.round_venue AS venue,
    '/student/applications' AS link
  FROM job_rounds jr
  JOIN student_applications sa ON sa.job_id = jr.job_id
    AND sa.student_id = $1 AND sa.college_id = $2
    AND sa.application_status NOT IN ('rejected','withdrawn','auto_withdrawn')
  JOIN job_postings jp ON jp.job_id = jr.job_id
  JOIN companies c ON c.company_id = jp.company_id
  WHERE jr.round_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
    AND jr.round_status NOT IN ('completed','cancelled')
  ORDER BY jr.round_date ASC
  LIMIT 10
),

-- Upcoming training sessions for enrolled programs (next 30 days)
upcoming_sessions AS (
  SELECT
    ts.session_date AS event_date,
    'training_session' AS event_type,
    tp.program_name || ' — Session ' || ts.session_number AS title,
    ts.session_topic AS subtitle,
    ts.venue AS venue,
    '/student/training' AS link
  FROM training_sessions ts
  JOIN training_enrollments te ON te.program_id = ts.program_id
    AND te.student_id = $1
    AND te.completion_status IN ('enrolled','in_progress')
  JOIN training_programs tp ON tp.program_id = ts.program_id
  WHERE ts.session_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
  ORDER BY ts.session_date ASC
  LIMIT 10
),

-- Self-report pending count
self_report_pending AS (
  SELECT COUNT(*)::int AS cnt
  FROM self_reported_placements
  WHERE student_id = $1 AND college_id = $2
    AND verification_status = 'pending'
)

SELECT json_build_object(
  'student', (SELECT row_to_json(student_info) FROM student_info),
  'funnel', (SELECT row_to_json(app_funnel) FROM app_funnel),
  'waitlist_ranks', (SELECT COALESCE(json_agg(row_to_json(waitlist_info)), '[]'::json) FROM waitlist_info),
  'placements', (SELECT COALESCE(json_agg(row_to_json(my_placements)), '[]'::json) FROM my_placements),
  'restriction_count', (SELECT active_count FROM restriction_count),
  'unread_notifications', (SELECT cnt FROM unread_count),
  'profile_sections', (SELECT row_to_json(profile_sections) FROM profile_sections),
  'schedule', (
    SELECT COALESCE(json_agg(e ORDER BY e.event_date ASC), '[]'::json)
    FROM (
      SELECT * FROM upcoming_rounds
      UNION ALL
      SELECT * FROM upcoming_sessions
    ) e
  ),
  'self_report_pending', (SELECT cnt FROM self_report_pending)
) AS dashboard;
`;

// ============================================================================
// JOURNEY STAGE COMPUTATION
// ============================================================================

function computeJourneyStage(data, sharedData) {
    const { placements, student, funnel } = data;

    // Priority order: offered > placed > onboarding > active > off_season > ready
    const hasOfferedPlacement = placements.some(p => p.placement_status === STATUS.PLACEMENT.OFFERED);
    if (hasOfferedPlacement) return 'offered';

    const hasActivePlacement = placements.some(p =>
        p.placement_status === STATUS.PLACEMENT.ACCEPTED || p.placement_status === STATUS.PLACEMENT.JOINED
    );
    if (hasActivePlacement) return 'placed';

    if (!student.profile_complete || !student.profile_is_approved) return 'onboarding';

    if (funnel.active_count > 0) return 'active';

    if (sharedData.total_available_jobs === 0) return 'off_season';

    return 'ready';
}

// ============================================================================
// PROFILE HEALTH BUILDER
// ============================================================================

function buildProfileHealth(profileSections, student) {
    const sectionMap = {
        personal_information: { weight: PROFILE_COMPLETION_WEIGHTS.PERSONAL_INFO, completed: profileSections.personal_complete, suggestion: 'Complete personal details (mobile, DOB, gender, address)' },
        academic_information: { weight: PROFILE_COMPLETION_WEIGHTS.ACADEMIC_INFO, completed: profileSections.academic_complete, suggestion: 'Add academic info (roll number, 10th %, CGPA)' },
        semester_grades: { weight: PROFILE_COMPLETION_WEIGHTS.SEMESTER_GRADES, completed: profileSections.semesters_complete, suggestion: 'Add at least one semester grade' },
        skills: { weight: PROFILE_COMPLETION_WEIGHTS.SKILLS, completed: profileSections.skills_complete, suggestion: 'Add at least one skill' },
        profile_links: { weight: PROFILE_COMPLETION_WEIGHTS.PROFILE_LINKS, completed: profileSections.links_complete, suggestion: 'Add resume, LinkedIn, or GitHub link' },
        projects: { weight: PROFILE_COMPLETION_WEIGHTS.PROJECTS, completed: profileSections.projects_complete, suggestion: 'Add a project to showcase your work' },
        experience: { weight: PROFILE_COMPLETION_WEIGHTS.EXPERIENCE, completed: profileSections.experience_complete, suggestion: 'Add internship or work experience' },
        certificates: { weight: PROFILE_COMPLETION_WEIGHTS.CERTIFICATES, completed: profileSections.certificates_complete, suggestion: 'Add a certification' },
    };

    let totalPercentage = 0;
    let nextIncomplete = null;

    for (const [key, section] of Object.entries(sectionMap)) {
        if (section.completed) {
            totalPercentage += section.weight;
        } else if (!nextIncomplete || section.weight > nextIncomplete.weight) {
            // Suggest the highest-weight incomplete section
            nextIncomplete = { section: key, weight: section.weight, suggestion: section.suggestion };
        }
    }

    return {
        total_percentage: totalPercentage,
        is_complete: totalPercentage >= 100,
        is_approved: student.profile_is_approved,
        approval_status: student.profile_approval_status || 'pending',
        rejection_reason: student.profile_rejection_reason || null,
        rejected_at: student.rejected_at || null,
        sections: sectionMap,
        next_incomplete: nextIncomplete,
    };
}

// ============================================================================
// ACTION QUEUE BUILDER
// ============================================================================

/** Collect P0 actions from offered placements (expiring offers, rejected docs). */
function collectP0Actions(placements) {
    const actions = [];
    for (const p of placements) {
        if (p.placement_status !== STATUS.PLACEMENT.OFFERED) continue;

        if (p.offer_expires_at) {
            const hoursLeft = (new Date(p.offer_expires_at) - Date.now()) / (1000 * 60 * 60);
            if (hoursLeft <= 0) {
                actions.push({
                    priority: 0, type: 'offer_expired',
                    title: `Offer from ${p.company_name} has expired`,
                    subtitle: 'Contact your TPO if you need an extension',
                    deadline: p.offer_expires_at,
                    link: '/student/placements', icon_hint: 'alert-triangle',
                });
            } else if (hoursLeft <= 24) {
                actions.push({
                    priority: 0, type: 'offer_expiring',
                    title: `Offer from ${p.company_name} expires soon`,
                    subtitle: 'Accept or decline before it expires',
                    deadline: p.offer_expires_at,
                    link: '/student/placements', icon_hint: 'clock',
                });
            }
        }
        if (p.offer_letter_rejection_reason && !p.offer_letter_verified) {
            actions.push({
                priority: 0, type: 'doc_rejected',
                title: `Offer letter rejected — ${p.company_name}`,
                subtitle: p.offer_letter_rejection_reason,
                deadline: null, link: '/student/placements', icon_hint: 'file-warning',
            });
        }
        if (p.joining_letter_rejection_reason && !p.joining_letter_verified) {
            actions.push({
                priority: 0, type: 'joining_doc_rejected',
                title: `Joining letter rejected — ${p.company_name}`,
                subtitle: p.joining_letter_rejection_reason,
                deadline: null, link: '/student/placements', icon_hint: 'file-warning',
            });
        }
    }
    return actions;
}

/** Collect P1 actions (closing jobs, imminent rounds). */
function collectP1Actions(schedule, sharedData) {
    const actions = [];
    if (sharedData.jobs_closing_soon > 0) {
        const n = sharedData.jobs_closing_soon;
        actions.push({
            priority: 1, type: 'jobs_closing',
            title: `${n} job${n > 1 ? 's' : ''} closing in 48 hours`,
            subtitle: 'Apply before the deadline passes',
            deadline: null, link: '/student/jobs', icon_hint: 'briefcase',
        });
    }
    const now = Date.now();
    const in48h = now + 48 * 60 * 60 * 1000;
    for (const event of schedule) {
        if (event.event_type !== 'round') continue;
        const t = new Date(event.event_date).getTime();
        if (t > now && t <= in48h) {
            actions.push({
                priority: 1, type: 'round_upcoming',
                title: event.title,
                subtitle: event.venue ? `Venue: ${event.venue}` : event.subtitle,
                deadline: event.event_date, link: '/student/applications', icon_hint: 'calendar',
            });
        }
    }
    return actions;
}

/** Collect P2 actions (restrictions, profile, missing docs). */
function collectP2Actions(data, profile) {
    const actions = [];
    if (data.restriction_count > 0) {
        const n = data.restriction_count;
        actions.push({
            priority: 2, type: 'restrictions',
            title: `${n} active restriction${n > 1 ? 's' : ''}`,
            subtitle: 'View details and submit an appeal if needed',
            deadline: null, link: '/student/restrictions', icon_hint: 'shield-alert',
        });
    }
    if (profile.total_percentage < 100 && profile.next_incomplete) {
        actions.push({
            priority: 2, type: 'profile_incomplete',
            title: `Profile ${profile.total_percentage}% complete`,
            subtitle: `${profile.next_incomplete.suggestion} (+${profile.next_incomplete.weight}%)`,
            deadline: null, link: '/student/profile', icon_hint: 'user',
        });
    }
    for (const p of data.placements) {
        const isAcceptedOrJoined = p.placement_status === STATUS.PLACEMENT.ACCEPTED
            || p.placement_status === STATUS.PLACEMENT.JOINED;
        if (!isAcceptedOrJoined) continue;
        if (!p.offer_letter_url) {
            actions.push({
                priority: 2, type: 'upload_offer_letter',
                title: `Upload offer letter — ${p.company_name}`,
                subtitle: 'Required for placement verification',
                deadline: null, link: '/student/placements', icon_hint: 'upload',
            });
        }
        if (p.placement_status === STATUS.PLACEMENT.JOINED && !p.joining_letter_url) {
            actions.push({
                priority: 2, type: 'upload_joining_letter',
                title: `Upload joining letter — ${p.company_name}`,
                subtitle: 'Required for joining verification',
                deadline: null, link: '/student/placements', icon_hint: 'upload',
            });
        }
    }
    return actions;
}

/** Collect P3 actions (training, notifications, self-reports). */
function collectP3Actions(data, sharedData) {
    const actions = [];
    if (sharedData.open_training_count > 0) {
        const n = sharedData.open_training_count;
        actions.push({
            priority: 3, type: 'training_open',
            title: `${n} training program${n > 1 ? 's' : ''} open for enrollment`,
            subtitle: 'Enroll before the deadline',
            deadline: null, link: '/student/training', icon_hint: 'graduation-cap',
        });
    }
    if (data.unread_notifications > 0) {
        const n = data.unread_notifications;
        actions.push({
            priority: 3, type: 'unread_notifications',
            title: `${n} unread notification${n > 1 ? 's' : ''}`,
            subtitle: null, deadline: null, link: '/student/notifications', icon_hint: 'bell',
        });
    }
    if (data.self_report_pending > 0) {
        const n = data.self_report_pending;
        actions.push({
            priority: 3, type: 'self_report_pending',
            title: `${n} off-campus report${n > 1 ? 's' : ''} under review`,
            subtitle: null, deadline: null, link: '/student/self-report', icon_hint: 'file-check',
        });
    }
    return actions;
}

/** Sort by priority then by deadline (soonest first). */
function sortActions(actions) {
    actions.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
        if (a.deadline) return -1;
        return 1;
    });
    return actions;
}

function buildActionQueue(data, sharedData, profile) {
    const actions = [
        ...collectP0Actions(data.placements),
        ...collectP1Actions(data.schedule, sharedData),
        ...collectP2Actions(data, profile),
        ...collectP3Actions(data, sharedData),
    ];
    return sortActions(actions);
}

// ============================================================================
// DOCUMENT STATUS HELPER
// ============================================================================

function getDocStatus(rejectionReason, isVerified, url) {
    if (rejectionReason) return 'rejected';
    if (isVerified) return 'verified';
    if (url) return 'uploaded';
    return 'missing';
}

// ============================================================================
// PLACEMENT CONTEXT BUILDER
// ============================================================================

function buildOfferItem(p) {
    return {
        placement_id: p.placement_id,
        company_name: p.company_name,
        company_logo: p.company_logo,
        job_title: p.job_title,
        placement_type: p.placement_type,
        fulltime_package: p.fulltime_package,
        fulltime_designation: p.fulltime_designation,
        offer_expires_at: p.offer_expires_at,
        doc_checklist: {
            offer_letter: getDocStatus(p.offer_letter_rejection_reason, p.offer_letter_verified, p.offer_letter_url),
            joining_letter: 'not_applicable',
        },
    };
}

function buildCurrentPlacement(p) {
    return {
        placement_id: p.placement_id,
        company_name: p.company_name,
        company_logo: p.company_logo,
        job_title: p.job_title,
        placement_status: p.placement_status,
        placement_type: p.placement_type,
        fulltime_package: p.fulltime_package,
        fulltime_designation: p.fulltime_designation,
        fulltime_joining_date: p.fulltime_joining_date,
        internship_stipend: p.internship_stipend,
        internship_duration: p.internship_duration,
        internship_start_date: p.internship_start_date,
        tier_name: p.tier_name,
        tier_level: p.tier_level,
        doc_checklist: {
            offer_letter: getDocStatus(p.offer_letter_rejection_reason, p.offer_letter_verified, p.offer_letter_url),
            joining_letter: getDocStatus(p.joining_letter_rejection_reason, p.joining_letter_verified, p.joining_letter_url),
        },
    };
}

function buildPlacementContext(placements, sharedData) {
    if (!placements.length) return null;

    const activePlacement = placements.find(p =>
        p.placement_status === STATUS.PLACEMENT.ACCEPTED || p.placement_status === STATUS.PLACEMENT.JOINED
    );

    const offers = placements
        .filter(p => p.placement_status === STATUS.PLACEMENT.OFFERED)
        .map(buildOfferItem);

    const settings = sharedData.placement_settings;

    return {
        current_placement: activePlacement ? buildCurrentPlacement(activePlacement) : null,
        offers,
        dream_upgrade_allowed: settings.allow_dream_upgrade,
        max_active_offers: settings.max_active_offers,
    };
}

// ============================================================================
// ADD OFFER DEADLINES TO SCHEDULE
// ============================================================================

function mergeOfferDeadlines(schedule, placements) {
    for (const p of placements) {
        if (p.placement_status === STATUS.PLACEMENT.OFFERED && p.offer_expires_at) {
            schedule.push({
                event_date: p.offer_expires_at,
                event_type: 'offer_deadline',
                title: `Offer deadline — ${p.company_name}`,
                subtitle: p.job_title,
                venue: null,
                link: '/student/placements',
            });
        }
    }

    // Re-sort merged schedule by date
    schedule.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

    // Cap at 10 items
    return schedule.slice(0, 10);
}

// ============================================================================
// MAIN: getDashboardOverview
// ============================================================================

async function getDashboardOverview(studentId, collegeId) {
    // Run personal CTE query
    const cteResult = await query(PERSONAL_DATA_SQL, [studentId, collegeId]);

    const raw = cteResult.rows[0]?.dashboard;
    if (!raw?.student) {
        throw Object.assign(new Error('Student not found'), { status: 404 });
    }

    const student = raw.student;
    const passoutYear = student.student_passout_year;

    // Get shared data (cached)
    const sharedData = await getSharedData(collegeId, passoutYear);

    // Build profile health
    const profile = buildProfileHealth(raw.profile_sections, student);

    // Build schedule with offer deadlines merged in
    const schedule = mergeOfferDeadlines(raw.schedule || [], raw.placements || []);

    // Build action queue
    const dataForActions = {
        placements: raw.placements || [],
        schedule,
        restriction_count: raw.restriction_count || 0,
        unread_notifications: raw.unread_notifications || 0,
        self_report_pending: raw.self_report_pending || 0,
    };
    const actions = buildActionQueue(dataForActions, sharedData, profile);

    // Compute journey stage
    const journeyStage = computeJourneyStage({
        placements: raw.placements || [],
        student,
        funnel: raw.funnel || { active_count: 0 },
    }, sharedData);

    // Build placement context
    const placementContext = buildPlacementContext(raw.placements || [], sharedData);

    // Build quick stats
    const quickStats = {
        jobs_available: sharedData.total_available_jobs,
        active_applications: raw.funnel?.active_count || 0,
        unread_notifications: raw.unread_notifications || 0,
        active_restrictions: raw.restriction_count || 0,
        is_placed: (raw.placements || []).some(p =>
            p.placement_status === STATUS.PLACEMENT.ACCEPTED || p.placement_status === STATUS.PLACEMENT.JOINED
        ),
    };

    return {
        journey_stage: journeyStage,
        profile,
        actions,
        funnel: raw.funnel || {
            total: 0, pending: 0, under_review: 0, shortlisted: 0, selected: 0,
            waitlisted: 0, offered: 0, rejected: 0, withdrawn: 0, auto_withdrawn: 0, active_count: 0,
        },
        schedule,
        placement_context: placementContext,
        quick_stats: quickStats,
        waitlist_ranks: raw.waitlist_ranks || [],
        enabled_features: sharedData.enabled_features,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getDashboardOverview,
};
