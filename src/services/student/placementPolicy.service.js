/**
 * ============================================================================
 * STUDENT PLACEMENT POLICY SERVICE — Read-Only Access to College Policies
 * ============================================================================
 *   - getActivePolicies(userId, collegeId)
 * ============================================================================
 */

const { query } = require('../../config/db');
const { ERROR_MESSAGES } = require('../../config/constants');

// ============================================================================
// GET ACTIVE POLICIES — for student's college + passout year
// ============================================================================

async function getActivePolicies(userId, collegeId) {
    // Get student's passout year from DB
    const studentResult = await query(
        `SELECT student_passout_year FROM students
         WHERE student_id = $1 AND college_id = $2 LIMIT 1`,
        [userId, collegeId]
    );

    if (!studentResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const passoutYear = studentResult.rows[0].student_passout_year;

    const result = await query(
        `SELECT pp.policy_id, pp.policy_title, pp.policy_description,
                pp.passout_year, pp.created_at, pp.updated_at,
                u.user_name AS created_by_name
         FROM placement_policies pp
         LEFT JOIN users u ON pp.created_by = u.user_id
         WHERE pp.college_id = $1
           AND pp.passout_year = $2
           AND pp.is_active = true
         ORDER BY pp.created_at ASC`,
        [collegeId, passoutYear]
    );

    return result.rows;
}

module.exports = { getActivePolicies };
