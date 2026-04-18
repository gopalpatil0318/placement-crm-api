/**
 * ============================================================================
 * COMPANY TIER SERVICE — Business Logic for College-Defined Salary Tiers
 * ============================================================================
 *   - createTier(collegeId, data)
 *   - getAllTiers(collegeId, filters)
 *   - getTier(tierId, collegeId)
 *   - updateTier(tierId, collegeId, data)
 *   - deleteTier(tierId, collegeId)
 *   - classifyJobTier(collegeId, passoutYear, salaryMax)
 *   - reclassifyJobsForTier(collegeId, passoutYear)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG, ERROR_MESSAGES } = require('../../config/constants');

const TIER_RETURNING_COLUMNS = `
    tier_id, college_id, passout_year, tier_name, tier_level,
    min_package, max_package, description, is_active,
    created_at, updated_at`;

// ============================================================================
// 1. CREATE TIER
// ============================================================================

async function createTier(collegeId, data) {
    const result = await query(
        `INSERT INTO company_tiers
            (college_id, passout_year, tier_name, tier_level,
             min_package, max_package, description, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${TIER_RETURNING_COLUMNS}`,
        [
            collegeId,
            data.passout_year,
            data.tier_name.trim(),
            data.tier_level,
            data.min_package,
            data.max_package ?? null,
            data.description?.trim() || null,
            data.is_active ?? true,
        ]
    );

    return formatTier(result.rows[0]);
}

// ============================================================================
// 2. GET ALL TIERS (for a college, optionally filtered by passout year)
// ============================================================================

async function getAllTiers(collegeId, filters = {}) {
    const conditions = ['college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    if (filters.passout_year) {
        conditions.push(`passout_year = $${paramIndex}`);
        params.push(Number(filters.passout_year));
        paramIndex++;
    }

    if (filters.is_active !== undefined) {
        conditions.push(`is_active = $${paramIndex}`);
        params.push(filters.is_active === 'true');
    }

    const result = await query(
        `SELECT ${TIER_RETURNING_COLUMNS},
                (SELECT COUNT(*)::int FROM job_postings
                 WHERE tier_id = company_tiers.tier_id
                   AND job_status IN ('published', 'draft')) AS job_count
         FROM company_tiers
         WHERE ${conditions.join(' AND ')}
         ORDER BY passout_year DESC, tier_level ASC`,
        params
    );

    return result.rows.map(formatTierWithCount);
}

// ============================================================================
// 3. GET SINGLE TIER
// ============================================================================

async function getTier(tierId, collegeId) {
    const result = await query(
        `SELECT ${TIER_RETURNING_COLUMNS},
                (SELECT COUNT(*)::int FROM job_postings
                 WHERE tier_id = company_tiers.tier_id
                   AND job_status IN ('published', 'draft')) AS job_count
         FROM company_tiers
         WHERE tier_id = $1 AND college_id = $2 LIMIT 1`,
        [tierId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TIER_NOT_FOUND), { status: 404 });
    }

    return formatTierWithCount(result.rows[0]);
}

// ============================================================================
// 4. UPDATE TIER
// ============================================================================

async function updateTier(tierId, collegeId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Verify exists (lock row to prevent concurrent modifications)
        const existing = await client.query(
            `SELECT tier_id, tier_name, tier_level, min_package, max_package, passout_year
             FROM company_tiers WHERE tier_id = $1 AND college_id = $2
             FOR UPDATE LIMIT 1`,
            [tierId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TIER_NOT_FOUND), { status: 404 });
        }

        // Cross-validate max >= min if both will end up set
        const effectiveMin = data.min_package ?? Number(existing.rows[0].min_package);
        const effectiveMax = 'max_package' in data ? data.max_package : existing.rows[0].max_package;
        if (effectiveMax !== null && effectiveMax !== undefined && Number(effectiveMax) < effectiveMin) {
            throw Object.assign(new Error('Maximum package must be >= minimum package'), { status: 400 });
        }

        // Build dynamic SET
        const fields = ['tier_name', 'tier_level', 'min_package', 'max_package', 'description', 'is_active'];
        const setClauses = ['updated_at = NOW()'];
        const params = [tierId, collegeId];
        let paramIndex = 3;

        for (const field of fields) {
            if (data[field] !== undefined) {
                setClauses.push(`${field} = $${paramIndex}`);
                params.push(field === 'tier_name' || field === 'description'
                    ? (data[field]?.trim?.() ?? data[field])
                    : data[field]);
                paramIndex++;
            }
        }

        const result = await client.query(
            `UPDATE company_tiers
             SET ${setClauses.join(', ')}
             WHERE tier_id = $1 AND college_id = $2
             RETURNING ${TIER_RETURNING_COLUMNS}`,
            params
        );

        const tier = formatTier(result.rows[0]);

        // If thresholds changed, reclassify jobs within the same transaction
        const thresholdsChanged = data.min_package !== undefined || data.max_package !== undefined;
        let reclassifiedCount = 0;
        if (thresholdsChanged) {
            reclassifiedCount = await reclassifyJobsForTierTx(client, collegeId, tier.passout_year);
        }

        await client.query('COMMIT');

        tier._reclassified_jobs = reclassifiedCount;
        tier._previousName = existing.rows[0].tier_name;
        return tier;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 5. DELETE TIER
// ============================================================================

async function deleteTier(tierId, collegeId) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Lock the tier row to prevent new job assignments during deletion
        const existing = await client.query(
            `SELECT tier_id, tier_name, passout_year
             FROM company_tiers
             WHERE tier_id = $1 AND college_id = $2
             FOR UPDATE LIMIT 1`,
            [tierId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TIER_NOT_FOUND), { status: 404 });
        }

        // Check for active jobs under lock (prevents race with concurrent publish)
        const jobCheck = await client.query(
            `SELECT COUNT(*)::int AS cnt FROM job_postings
             WHERE tier_id = $1 AND job_status IN ('published', 'draft')`,
            [tierId]
        );

        if (jobCheck.rows[0].cnt > 0) {
            throw Object.assign(new Error(ERROR_MESSAGES.TIER_HAS_JOBS), { status: 400 });
        }

        // Nullify tier_id on ALL remaining jobs (any status — prevents orphaned FK)
        await client.query(
            `UPDATE job_postings SET tier_id = NULL, updated_at = NOW() WHERE tier_id = $1`,
            [tierId]
        );

        await client.query(
            `DELETE FROM company_tiers WHERE tier_id = $1 AND college_id = $2`,
            [tierId, collegeId]
        );

        await client.query('COMMIT');

        return {
            tier_id: tierId,
            tier_name: existing.rows[0].tier_name,
            passout_year: existing.rows[0].passout_year,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 6. CLASSIFY JOB TIER — Find best matching tier for a salary
// ============================================================================

/**
 * Find the tier whose range contains the given salary for a college+year.
 * Logic: select the highest-level tier where min_package <= salary AND (max_package IS NULL OR salary <= max_package).
 * Returns tier_id or null if no tier matches.
 */
async function classifyJobTier(collegeId, passoutYear, salaryMax) {
    if (!salaryMax && salaryMax !== 0) return null;

    const result = await query(
        `SELECT tier_id, tier_name, tier_level
         FROM company_tiers
         WHERE college_id = $1
           AND passout_year = $2
           AND is_active = true
           AND min_package <= $3
           AND (max_package IS NULL OR $3 <= max_package)
         ORDER BY tier_level DESC
         LIMIT 1`,
        [collegeId, passoutYear, salaryMax]
    );

    return result.rows[0] || null;
}

// ============================================================================
// 7. RECLASSIFY ALL JOBS — After tier thresholds change
// ============================================================================

/**
 * Recalculate tier_id for all published/draft jobs for a college+year.
 * Skips jobs with NULL salary_max (internships stay unclassified).
 * Returns count of reclassified jobs.
 */
async function reclassifyJobsForTier(collegeId, passoutYear) {
    return reclassifyJobsForTierTx({ query }, collegeId, passoutYear);
}

/**
 * Transaction-aware reclassify. Accepts a client or { query } for standalone use.
 */
async function reclassifyJobsForTierTx(dbClient, collegeId, passoutYear) {
    const execQuery = dbClient.query.bind(dbClient);

    const result = await execQuery(
        `UPDATE job_postings j
         SET tier_id = (
             SELECT t.tier_id
             FROM company_tiers t
             WHERE t.college_id = $1
               AND t.passout_year = $2
               AND t.is_active = true
               AND t.min_package <= j.salary_max
               AND (t.max_package IS NULL OR j.salary_max <= t.max_package)
             ORDER BY t.tier_level DESC
             LIMIT 1
         ),
         updated_at = NOW()
         WHERE j.college_id = $1
           AND $2 = ANY(j.passout_years)
           AND j.job_status IN ('published', 'draft')
           AND j.salary_max IS NOT NULL
         RETURNING j.job_id`,
        [collegeId, passoutYear]
    );

    const count = result.rowCount;
    if (count > 0) {
        logger.info(`${LOG.AUTH} Reclassified ${count} jobs after tier threshold change`, {
            collegeId, passoutYear, jobCount: count,
        });
    }

    return count;
}

// ============================================================================
// FORMATTERS
// ============================================================================

function formatTier(row) {
    return {
        tier_id: row.tier_id,
        college_id: row.college_id,
        passout_year: row.passout_year,
        tier_name: row.tier_name,
        tier_level: row.tier_level,
        min_package: Number.parseFloat(row.min_package),
        max_package: row.max_package == null ? null : Number.parseFloat(row.max_package),
        description: row.description ?? null,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function formatTierWithCount(row) {
    return {
        ...formatTier(row),
        job_count: row.job_count ?? 0,
    };
}

module.exports = {
    createTier,
    getAllTiers,
    getTier,
    updateTier,
    deleteTier,
    classifyJobTier,
    reclassifyJobsForTier,
};
