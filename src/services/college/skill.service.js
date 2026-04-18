/**
 * ============================================================================
 * COLLEGE SKILL SERVICE — Skills Master Business Logic
 * ============================================================================
 *   #103  createSkill(collegeId, data)
 *   #104  getAllSkills(collegeId, filters)
 *   #105  deleteSkill(skillId, collegeId)
 *   #106  updateSkill(skillId, collegeId, data)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const {
    ERROR_MESSAGES,
    DB_ERROR_CODES,
    SKILL_CATEGORY_LABELS,
} = require('../../config/constants');

// ============================================================================
// #103 — CREATE SKILL
// ============================================================================

async function createSkill(collegeId, data) {
    try {
        const result = await query(
            `INSERT INTO skills (college_id, skill_name, skill_category)
             VALUES ($1, $2, $3)
             RETURNING skill_id, skill_name, skill_category, created_at`,
            [collegeId, data.skill_name, data.skill_category]
        );

        return result.rows[0];
    } catch (err) {
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.SKILL_DUPLICATE),
                { status: 409 }
            );
        }
        throw err;
    }
}

// ============================================================================
// #104 — GET ALL SKILLS (paginated, searchable, filterable)
// ============================================================================

async function getAllSkills(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['s.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    // Filter: category
    if (filters.skill_category) {
        conditions.push(`s.skill_category = $${paramIndex}`);
        params.push(filters.skill_category);
        paramIndex++;
    }

    // Filter: search (skill_name or category)
    if (filters.search) {
        conditions.push(
            `(s.skill_name ILIKE $${paramIndex} OR s.skill_category ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        skill_name: 's.skill_name',
        created_at: 's.created_at',
        skill_category: 's.skill_category',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.skill_name;
    const sortOrd = filters.sort_order === 'desc' ? 'DESC' : 'ASC';

    // Count + Skills + Categories (parallel — all independent)
    const [countResult, skillsResult, categorySummary] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM skills s WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT s.skill_id, s.skill_name, s.skill_category, s.created_at,
                    COALESCE(sc.student_count, 0) AS student_count
             FROM skills s
             LEFT JOIN (
                 SELECT skill_id, COUNT(*) AS student_count
                 FROM student_skills
                 GROUP BY skill_id
             ) sc ON s.skill_id = sc.skill_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}, s.skill_name ASC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT skill_category, COUNT(*) AS cnt
             FROM skills
             WHERE college_id = $1
             GROUP BY skill_category
             ORDER BY skill_category ASC`,
            [collegeId]
        ),
    ]);
    const total = Number(countResult.rows[0].total);

    const skills = skillsResult.rows.map(row => ({
        skill_id: row.skill_id,
        skill_name: row.skill_name,
        skill_category: row.skill_category,
        student_count: Number(row.student_count),
        created_at: row.created_at,
    }));

    return {
        skills,
        total,
        page,
        limit,
        categories: categorySummary.rows.map(r => ({
            category: r.skill_category,
            label: SKILL_CATEGORY_LABELS[r.skill_category] || r.skill_category,
            count: Number(r.cnt),
        })),
    };
}

// ============================================================================
// #105 — DELETE SKILL (cascade-deletes student_skills via FK)
// ============================================================================

async function deleteSkill(skillId, collegeId) {
    const result = await query(
        `DELETE FROM skills
         WHERE skill_id = $1 AND college_id = $2
         RETURNING skill_id, skill_name, skill_category`,
        [skillId, collegeId]
    );

    if (result.rowCount === 0) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.SKILL_NOT_FOUND),
            { status: 404 }
        );
    }

    return result.rows[0];
}

// ============================================================================
// #106 — UPDATE SKILL (partial — name and/or category)
// ============================================================================

async function updateSkill(skillId, collegeId, data) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 1. Fetch existing with row-level lock to prevent concurrent edits
        const existing = await client.query(
            `SELECT skill_id, skill_name, skill_category
             FROM skills
             WHERE skill_id = $1 AND college_id = $2
             FOR UPDATE`,
            [skillId, collegeId]
        );

        if (existing.rows.length === 0) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.SKILL_NOT_FOUND),
                { status: 404 }
            );
        }

        const current = existing.rows[0];

        // 2. Determine which fields are being updated
        const updateFields = [];
        const updateValues = [];
        const oldSnapshot = {};
        let paramIdx = 3; // $1=skillId, $2=collegeId

        if (data.skill_name !== undefined) {
            updateFields.push(`skill_name = $${paramIdx}`);
            updateValues.push(data.skill_name);
            oldSnapshot.skill_name = current.skill_name;
            paramIdx++;
        }

        if (data.skill_category !== undefined) {
            updateFields.push(`skill_category = $${paramIdx}`);
            updateValues.push(data.skill_category);
            oldSnapshot.skill_category = current.skill_category;
            paramIdx++;
        }

        if (updateFields.length === 0) {
            await client.query('ROLLBACK');
            return { ...current, _old: null };
        }

        // 3. Duplicate name check (case-insensitive, exclude current skill)
        if (data.skill_name !== undefined) {
            const dupeCheck = await client.query(
                `SELECT skill_id FROM skills
                 WHERE college_id = $1 AND LOWER(skill_name) = LOWER($2) AND skill_id != $3
                 LIMIT 1`,
                [collegeId, data.skill_name, skillId]
            );

            if (dupeCheck.rows.length > 0) {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.SKILL_DUPLICATE),
                    { status: 409 }
                );
            }
        }

        // 4. Execute update
        updateFields.push('updated_at = NOW()');

        const result = await client.query(
            `UPDATE skills
             SET ${updateFields.join(', ')}
             WHERE skill_id = $1 AND college_id = $2
             RETURNING skill_id, skill_name, skill_category, created_at, updated_at`,
            [skillId, collegeId, ...updateValues]
        );

        await client.query('COMMIT');

        const updated = result.rows[0];
        updated._old = oldSnapshot;
        return updated;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    createSkill,
    getAllSkills,
    deleteSkill,
    updateSkill,
};
