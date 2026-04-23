/**
 * ============================================================================
 * PLACEMENT SETTINGS SERVICE — Structured Policy Rules Per College+Year
 * ============================================================================
 *   - getSettings(collegeId, passoutYear)
 *   - upsertSettings(collegeId, userId, data)
 * ============================================================================
 */

const { query } = require('../../config/db');
const { ERROR_MESSAGES } = require('../../config/constants');

const SETTINGS_RETURNING_COLUMNS = `
    setting_id, college_id, passout_year,
    max_active_offers, allow_dream_upgrade,
    auto_withdrawal_rule, default_offer_days,
    exclude_placed_by_default, auto_reject_on_round_fail,
    allow_reapply_after_withdrawal, max_active_applications,
    created_by, created_at, updated_at`;

// ============================================================================
// 1. GET SETTINGS — for a college + passout year
// ============================================================================

async function getSettings(collegeId, passoutYear) {
    const result = await query(
        `SELECT ${SETTINGS_RETURNING_COLUMNS}
         FROM placement_settings
         WHERE college_id = $1 AND passout_year = $2
         LIMIT 1`,
        [collegeId, passoutYear]
    );

    if (!result.rows.length) {
        // Return defaults instead of 404 — settings are auto-created on first save
        return getDefaults(collegeId, passoutYear);
    }

    return formatSettings(result.rows[0]);
}

// ============================================================================
// 2. UPSERT SETTINGS — INSERT or UPDATE on conflict
// ============================================================================

async function upsertSettings(collegeId, userId, data) {
    const result = await query(
        `INSERT INTO placement_settings
            (college_id, passout_year, max_active_offers, allow_dream_upgrade,
             auto_withdrawal_rule, default_offer_days, exclude_placed_by_default,
             auto_reject_on_round_fail, allow_reapply_after_withdrawal,
             max_active_applications, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (college_id, passout_year)
         DO UPDATE SET
            max_active_offers = EXCLUDED.max_active_offers,
            allow_dream_upgrade = EXCLUDED.allow_dream_upgrade,
            auto_withdrawal_rule = EXCLUDED.auto_withdrawal_rule,
            default_offer_days = EXCLUDED.default_offer_days,
            exclude_placed_by_default = EXCLUDED.exclude_placed_by_default,
            auto_reject_on_round_fail = EXCLUDED.auto_reject_on_round_fail,
            allow_reapply_after_withdrawal = EXCLUDED.allow_reapply_after_withdrawal,
            max_active_applications = EXCLUDED.max_active_applications,
            updated_at = NOW()
         RETURNING ${SETTINGS_RETURNING_COLUMNS}`,
        [
            collegeId,
            data.passout_year,
            data.max_active_offers ?? 1,
            data.allow_dream_upgrade ?? true,
            data.auto_withdrawal_rule ?? 'same_or_lower_tier',
            data.default_offer_days ?? 7,
            data.exclude_placed_by_default ?? true,
            data.auto_reject_on_round_fail ?? true,
            data.allow_reapply_after_withdrawal ?? false,
            data.max_active_applications ?? null,
            userId,
        ]
    );

    return formatSettings(result.rows[0]);
}

// ============================================================================
// HELPERS
// ============================================================================

function getDefaults(collegeId, passoutYear) {
    return {
        setting_id: null,
        college_id: collegeId,
        passout_year: passoutYear,
        max_active_offers: 1,
        allow_dream_upgrade: true,
        auto_withdrawal_rule: 'same_or_lower_tier',
        default_offer_days: 7,
        exclude_placed_by_default: true,
        auto_reject_on_round_fail: true,
        allow_reapply_after_withdrawal: false,
        max_active_applications: null,
        created_by: null,
        created_at: null,
        updated_at: null,
        is_default: true,
    };
}

function formatSettings(row) {
    return {
        setting_id: row.setting_id,
        college_id: row.college_id,
        passout_year: row.passout_year,
        max_active_offers: row.max_active_offers,
        allow_dream_upgrade: row.allow_dream_upgrade,
        auto_withdrawal_rule: row.auto_withdrawal_rule,
        default_offer_days: row.default_offer_days,
        exclude_placed_by_default: row.exclude_placed_by_default,
        auto_reject_on_round_fail: row.auto_reject_on_round_fail,
        allow_reapply_after_withdrawal: row.allow_reapply_after_withdrawal,
        max_active_applications: row.max_active_applications ?? null,
        created_by: row.created_by ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_default: false,
    };
}

module.exports = { getSettings, upsertSettings };
