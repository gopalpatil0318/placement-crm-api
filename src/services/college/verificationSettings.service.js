/**
 * ============================================================================
 * VERIFICATION SETTINGS SERVICE — College-Level Verification Config
 * ============================================================================
 * Functions:
 *   - getVerificationSettings(collegeId)         — Cached read (5-min TTL)
 *   - updateVerificationSettings(collegeId, data) — Write + invalidate cache
 *
 * Settings are stored as JSONB on the colleges table column:
 *   verification_settings
 *
 * Cache: In-memory Map with 5-minute TTL per college.
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG } = require('../../config/constants');

// ============================================================================
// DEFAULTS — Merged with DB values so missing keys use defaults
// ============================================================================

const DEFAULT_SETTINGS = Object.freeze({
    require_profile_approval_for_jobs: true,
    auto_approve_profile_on_complete: false,
    bypass: Object.freeze({
        profiles:     false,
        experience:   false,
        achievements: false,
        certificates: false,
    }),
    re_verify_on_edit: Object.freeze({
        personal_info:   false,
        academic_info:   false,
        semester_grades: false,
        experience:      false,
        achievements:    false,
        certificates:    false,
    }),
});

// ============================================================================
// IN-MEMORY CACHE — { collegeId → { settings, expiresAt } }
// ============================================================================

const CACHE_TTL_BASE_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_JITTER_MS  = 60 * 1000;     // up to 60s jitter to prevent stampede
const cache = new Map();

function getCached(collegeId) {
    const entry = cache.get(collegeId);
    if (entry && Date.now() < entry.expiresAt) {
        return entry.settings;
    }
    cache.delete(collegeId);
    return null;
}

function setCache(collegeId, settings) {
    const ttl = CACHE_TTL_BASE_MS + Math.floor(Math.random() * CACHE_JITTER_MS);
    cache.set(collegeId, { settings, expiresAt: Date.now() + ttl });
}

function invalidateCache(collegeId) {
    cache.delete(collegeId);
}

// ============================================================================
// CASCADE NORMALIZATION — Enforce dependency rules
// ============================================================================
// Rule 1: bypass.profiles ON → force bypass.experience/achievements/certificates ON
// Rule 2: bypass.profiles ON → force auto_approve_profile_on_complete = true
// Rule 3: bypass.profiles ON → force ALL re_verify_on_edit = false
// Rule 4: bypass.{cat} ON → force re_verify_on_edit.{cat} = false
// ============================================================================

function normalizeCascade(settings) {
    const s = { ...settings };
    s.bypass = { ...s.bypass };
    s.re_verify_on_edit = { ...s.re_verify_on_edit };

    // Rule 1 + 2 + 3: profile bypass cascades everything
    if (s.bypass.profiles) {
        s.bypass.experience = true;
        s.bypass.achievements = true;
        s.bypass.certificates = true;
        s.auto_approve_profile_on_complete = true;
        s.re_verify_on_edit.personal_info = false;
        s.re_verify_on_edit.academic_info = false;
        s.re_verify_on_edit.semester_grades = false;
        s.re_verify_on_edit.experience = false;
        s.re_verify_on_edit.achievements = false;
        s.re_verify_on_edit.certificates = false;
    } else {
        // Rule 4: individual category bypass disables its re-verify
        if (s.bypass.experience)   s.re_verify_on_edit.experience = false;
        if (s.bypass.achievements) s.re_verify_on_edit.achievements = false;
        if (s.bypass.certificates) s.re_verify_on_edit.certificates = false;
    }

    return s;
}

// ============================================================================
// DEEP MERGE — Merge DB settings with defaults (fills missing keys)
// Handles backward compat: old `categories` format → new `bypass` format
// ============================================================================

function mergeSettings(dbSettings) {
    if (!dbSettings) return normalizeCascade({ ...DEFAULT_SETTINGS });

    // ── Backward compat: convert old `categories` → `bypass` (inverted) ──
    let bypassSource = dbSettings.bypass;
    if (!bypassSource && dbSettings.categories) {
        bypassSource = {
            profiles:     !(dbSettings.categories.profiles?.enabled ?? true),
            experience:   !(dbSettings.categories.experience?.enabled ?? true),
            achievements: !(dbSettings.categories.achievements?.enabled ?? true),
            certificates: !(dbSettings.categories.certificates?.enabled ?? true),
        };
    }

    const merged = {
        require_profile_approval_for_jobs:
            dbSettings.require_profile_approval_for_jobs ?? DEFAULT_SETTINGS.require_profile_approval_for_jobs,
        auto_approve_profile_on_complete:
            dbSettings.auto_approve_profile_on_complete ?? DEFAULT_SETTINGS.auto_approve_profile_on_complete,
        bypass: {
            profiles:     bypassSource?.profiles ?? DEFAULT_SETTINGS.bypass.profiles,
            experience:   bypassSource?.experience ?? DEFAULT_SETTINGS.bypass.experience,
            achievements: bypassSource?.achievements ?? DEFAULT_SETTINGS.bypass.achievements,
            certificates: bypassSource?.certificates ?? DEFAULT_SETTINGS.bypass.certificates,
        },
        re_verify_on_edit: {
            personal_info:   dbSettings.re_verify_on_edit?.personal_info ?? DEFAULT_SETTINGS.re_verify_on_edit.personal_info,
            academic_info:   dbSettings.re_verify_on_edit?.academic_info ?? DEFAULT_SETTINGS.re_verify_on_edit.academic_info,
            semester_grades: dbSettings.re_verify_on_edit?.semester_grades ?? DEFAULT_SETTINGS.re_verify_on_edit.semester_grades,
            experience:      dbSettings.re_verify_on_edit?.experience ?? DEFAULT_SETTINGS.re_verify_on_edit.experience,
            achievements:    dbSettings.re_verify_on_edit?.achievements ?? DEFAULT_SETTINGS.re_verify_on_edit.achievements,
            certificates:    dbSettings.re_verify_on_edit?.certificates ?? DEFAULT_SETTINGS.re_verify_on_edit.certificates,
        },
    };

    return normalizeCascade(merged);
}

// ============================================================================
// 1. GET VERIFICATION SETTINGS (cached)
// ============================================================================

async function getVerificationSettings(collegeId) {
    // Check cache first
    const cached = getCached(collegeId);
    if (cached) return cached;

    const result = await query(
        `SELECT verification_settings FROM colleges WHERE college_id = $1 LIMIT 1`,
        [collegeId]
    );

    const dbSettings = result.rows[0]?.verification_settings || null;
    const merged = mergeSettings(dbSettings);

    setCache(collegeId, merged);
    return merged;
}

// ============================================================================
// 2. UPDATE VERIFICATION SETTINGS
// ============================================================================

async function updateVerificationSettings(collegeId, data) {
    // Read current settings first so partial PATCH doesn't reset unmentioned keys
    const current = await getVerificationSettings(collegeId);
    const patched = {
        ...current,
        ...data,
        bypass: { ...current.bypass, ...data.bypass },
        re_verify_on_edit: { ...current.re_verify_on_edit, ...data.re_verify_on_edit },
    };
    const normalized = normalizeCascade(patched);

    const result = await query(
        `UPDATE colleges
         SET verification_settings = $1::jsonb, updated_at = NOW()
         WHERE college_id = $2
         RETURNING college_id, verification_settings`,
        [JSON.stringify(normalized), collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error('College not found'), { status: 404 });
    }

    // Invalidate cache so next read fetches fresh data
    invalidateCache(collegeId);

    // ── Bypass flip: bulk-approve orphaned pending items ──────────────────
    // When a category flips from verified (bypass=false) to bypassed (bypass=true),
    // any existing pending items become invisible in VerificationCenter but remain
    // pending in DB. Auto-approve them to prevent stale data on later bypass-off.
    await reconcileBypassFlip(collegeId, current.bypass, normalized.bypass);

    logger.info(`${LOG.API_END} Verification settings updated`, { collegeId });

    // Return normalized settings (not raw DB value) for consistency
    return normalizeCascade(mergeSettings(result.rows[0].verification_settings));
}

// ============================================================================
// HELPER — Reconcile bypass flip: bulk-approve orphaned pending items
// ============================================================================

const BYPASS_CATEGORY_TABLES = Object.freeze({
    experience:   { table: 'student_experience',   idCol: 'experience_id' },
    achievements: { table: 'student_achievements',  idCol: 'achievement_id' },
    certificates: { table: 'student_certificates',  idCol: 'certificate_id' },
});

async function reconcileBypassFlip(collegeId, oldBypass, newBypass) {
    const flipped = [];

    // Item categories: auto-approve pending items
    for (const [cat, meta] of Object.entries(BYPASS_CATEGORY_TABLES)) {
        if (!oldBypass[cat] && newBypass[cat]) {
            const res = await query(
                `UPDATE ${meta.table}
                 SET verification_status = 'approved', is_verified = true,
                     verified_at = NOW(), updated_at = NOW()
                 WHERE college_id = $1 AND verification_status = 'pending'`,
                [collegeId]
            );
            if (res.rowCount > 0) flipped.push({ category: cat, count: res.rowCount });
        }
    }

    // Profile category: auto-approve pending profiles
    if (!oldBypass.profiles && newBypass.profiles) {
        const res = await query(
            `UPDATE students
             SET profile_is_approved = true,
                 profile_approval_status = 'approved',
                 approved_at = NOW(), updated_at = NOW()
             WHERE college_id = $1 AND profile_complete = true
               AND profile_approval_status = 'pending'`,
            [collegeId]
        );
        if (res.rowCount > 0) flipped.push({ category: 'profiles', count: res.rowCount });
    }

    if (flipped.length > 0) {
        logger.info(`${LOG.API_END} Bypass flip auto-approved pending items`, { collegeId, flipped });
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getVerificationSettings,
    updateVerificationSettings,
    DEFAULT_SETTINGS,
};
