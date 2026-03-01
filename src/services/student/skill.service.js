/**
 * ============================================================================
 * STUDENT SKILL SERVICE — Master Skills + Student Skill Sync
 * ============================================================================
 * Functions:
 *   Master Skills Table:
 *     - addSkill(collegeId, data)              — Add skill to catalog
 *     - deleteSkill(skillId, collegeId)        — Remove skill from catalog
 *     - getAllSkills(collegeId)                 — List all available skills
 *
 *   Student Skills Table:
 *     - syncMySkills(studentId, collegeId, skills[])  — Smart sync
 *     - getMySkills(studentId, collegeId)              — Get student's skills
 *
 * Smart Sync Logic:
 *   Frontend sends: [{ skill_id, proficiency_level }]
 *   Backend compares with current student_skills and:
 *     - ADDs skills that are new
 *     - REMOVEs skills that are no longer in the array
 *     - UPDATEs proficiency if changed
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    DB_ERROR_CODES,
} = require('../../config/constants');

// ============================================================================
// 1. ADD SKILL (to master skills table)
// ============================================================================

async function addSkill(collegeId, data) {
    try {
        const result = await query(
            `INSERT INTO skills (college_id, skill_name, skill_category)
             VALUES ($1, $2, $3)
             RETURNING skill_id, skill_name, skill_category, created_at`,
            [collegeId, data.skill_name.trim(), data.skill_category || null]
        );

        return result.rows[0];
    } catch (err) {
        // Handle duplicate skill name per college (case-insensitive unique index)
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
            throw Object.assign(
                new Error(`Skill "${data.skill_name}" already exists in your college`),
                { status: 409 }
            );
        }
        throw err;
    }
}

// ============================================================================
// 2. DELETE SKILL (from master skills table — college user only)
// ============================================================================

async function deleteSkill(skillId, collegeId) {
    const result = await query(
        `DELETE FROM skills
         WHERE skill_id = $1 AND college_id = $2
         RETURNING skill_id, skill_name`,
        [skillId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.SKILL_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 3. GET ALL SKILLS (master catalog for this college)
// ============================================================================

async function getAllSkills(collegeId) {
    const result = await query(
        `SELECT skill_id, skill_name, skill_category, created_at
         FROM skills
         WHERE college_id = $1
         ORDER BY skill_name ASC`,
        [collegeId]
    );

    return result.rows;
}

// ============================================================================
// 4. SYNC MY SKILLS (Smart array sync — add/remove/update in a transaction)
// ============================================================================

async function syncMySkills(studentId, collegeId, incomingSkills) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 1. Get current student skills
        const currentResult = await client.query(
            `SELECT student_skill_id, skill_id, proficiency_level
             FROM student_skills
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        );

        const currentSkillsMap = new Map();
        for (const row of currentResult.rows) {
            currentSkillsMap.set(row.skill_id, {
                student_skill_id: row.student_skill_id,
                proficiency_level: row.proficiency_level,
            });
        }

        // 2. Build sets for comparison
        const incomingSkillIds = new Set(incomingSkills.map(s => s.skill_id));
        const incomingSkillsMap = new Map(incomingSkills.map(s => [s.skill_id, s.proficiency_level]));

        const toAdd = [];
        const toUpdate = [];
        const toRemove = [];

        // 3. Skills to ADD or UPDATE
        for (const skill of incomingSkills) {
            const current = currentSkillsMap.get(skill.skill_id);

            if (!current) {
                // New skill — add it
                toAdd.push(skill);
            } else if (current.proficiency_level !== skill.proficiency_level) {
                // Exists but proficiency changed — update it
                toUpdate.push({
                    student_skill_id: current.student_skill_id,
                    skill_id: skill.skill_id,
                    proficiency_level: skill.proficiency_level,
                });
            }
            // If same proficiency, do nothing
        }

        // 4. Skills to REMOVE (in current but not in incoming)
        for (const [skillId, data] of currentSkillsMap) {
            if (!incomingSkillIds.has(skillId)) {
                toRemove.push({
                    student_skill_id: data.student_skill_id,
                    skill_id: skillId,
                });
            }
        }

        // 5. Execute changes

        // ADD new skills
        for (const skill of toAdd) {
            await client.query(
                `INSERT INTO student_skills (student_id, college_id, skill_id, proficiency_level)
                 VALUES ($1, $2, $3, $4)`,
                [studentId, collegeId, skill.skill_id, skill.proficiency_level]
            );
        }

        // UPDATE proficiency
        for (const skill of toUpdate) {
            await client.query(
                `UPDATE student_skills
                 SET proficiency_level = $1, updated_at = NOW()
                 WHERE student_skill_id = $2 AND student_id = $3`,
                [skill.proficiency_level, skill.student_skill_id, studentId]
            );
        }

        // REMOVE skills no longer in array
        for (const skill of toRemove) {
            await client.query(
                `DELETE FROM student_skills
                 WHERE student_skill_id = $1 AND student_id = $2`,
                [skill.student_skill_id, studentId]
            );
        }

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Student skills synced`, {
            studentId,
            added: toAdd.length,
            updated: toUpdate.length,
            removed: toRemove.length,
        });

        // 6. Return updated skills list
        const updatedResult = await query(
            `SELECT ss.student_skill_id, ss.skill_id, ss.proficiency_level,
                    ss.created_at, ss.updated_at,
                    sk.skill_name, sk.skill_category
             FROM student_skills ss
             JOIN skills sk ON ss.skill_id = sk.skill_id
             WHERE ss.student_id = $1 AND ss.college_id = $2
             ORDER BY sk.skill_name ASC`,
            [studentId, collegeId]
        );

        return {
            sync_summary: {
                added: toAdd.length,
                updated: toUpdate.length,
                removed: toRemove.length,
                total: updatedResult.rows.length,
            },
            skills: updatedResult.rows,
        };
    } catch (err) {
        await client.query('ROLLBACK');

        logger.error(`${LOG.TRANSACTION} Student skills sync rolled back`, {
            studentId,
            error: err.message,
            stack: err.stack,
        });

        // Handle invalid skill_id (FK violation)
        if (err.code === DB_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
            throw Object.assign(
                new Error('One or more skill IDs are invalid. Please check your selection'),
                { status: 400 }
            );
        }
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 5. GET MY SKILLS (student's own skills with skill details)
// ============================================================================

async function getMySkills(studentId, collegeId) {
    const result = await query(
        `SELECT ss.student_skill_id, ss.skill_id, ss.proficiency_level,
                ss.created_at, ss.updated_at,
                sk.skill_name, sk.skill_category
         FROM student_skills ss
         JOIN skills sk ON ss.skill_id = sk.skill_id
         WHERE ss.student_id = $1 AND ss.college_id = $2
         ORDER BY sk.skill_name ASC`,
        [studentId, collegeId]
    );

    return result.rows;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addSkill,
    deleteSkill,
    getAllSkills,
    syncMySkills,
    getMySkills,
};
