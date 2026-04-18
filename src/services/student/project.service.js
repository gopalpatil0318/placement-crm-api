/**
 * ============================================================================
 * STUDENT PROJECT SERVICE — CRUD with Max 10 Limit
 * ============================================================================
 * Functions:
 *   - addProject(studentId, collegeId, data)
 *   - getAllProjects(studentId, collegeId)
 *   - updateProject(projectId, studentId, collegeId, data)
 *   - deleteProject(projectId, studentId, collegeId)
 *
 * Business Rules:
 *   - Maximum 10 projects per student
 *   - Ownership check: student can only manage their own projects
 *   - is_ongoing = true → end_date is ignored/set to null
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG, ERROR_MESSAGES } = require('../../config/constants');
const { maybeResetApproval } = require('../../utils/approvalResetHelper');

const MAX_PROJECTS = 10;

// Explicit columns returned from all queries (excludes student_id, college_id)
const RETURNING_COLUMNS = `project_id, project_title, project_description, project_type,
    project_url, github_link, demo_link, technologies_used,
    start_date, end_date, is_ongoing, team_size, role_in_project,
    display_order, is_featured, created_at, updated_at`;

// All insertable/updatable columns
const PROJECT_FIELDS = [
    'project_title', 'project_description', 'project_type',
    'project_url', 'github_link', 'demo_link',
    'technologies_used', 'start_date', 'end_date',
    'is_ongoing', 'team_size', 'role_in_project',
    'display_order', 'is_featured',
];

// ============================================================================
// 1. ADD PROJECT
// ============================================================================

async function addProject(studentId, collegeId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Check max project limit
        const countResult = await client.query(
            `SELECT COUNT(*) AS cnt FROM student_projects
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        );

        const currentCount = Number.parseInt(countResult.rows[0].cnt);
        if (currentCount >= MAX_PROJECTS) {
            throw Object.assign(
                new Error(`Maximum ${MAX_PROJECTS} projects allowed. Please remove an existing project before adding a new one`),
                { status: 400 }
            );
        }

        // 2. If ongoing, clear end_date
        if (data.is_ongoing === true) {
            data.end_date = null;
        }

        // 3. Validate end_date >= start_date (when both provided and not ongoing)
        if (data.end_date && data.start_date && new Date(data.end_date) < new Date(data.start_date)) {
            throw Object.assign(new Error('End date must be after start date'), { status: 400 });
        }

        // 4. Build insert
        const fieldsToInsert = PROJECT_FIELDS.filter(f => data[f] !== undefined);
        const insertColumns = ['student_id', 'college_id', ...fieldsToInsert];
        const insertValues = [studentId, collegeId, ...fieldsToInsert.map(f => data[f])];
        const placeholders = insertValues.map((_, i) => `$${i + 1}`);

        const result = await client.query(
            `INSERT INTO student_projects (${insertColumns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING ${RETURNING_COLUMNS}`,
            insertValues
        );

        // 5. Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'projects');

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Project added`, {
            studentId,
            project_id: result.rows[0].project_id,
            project_count: currentCount + 1,
        });

        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 2. GET ALL PROJECTS
// ============================================================================

async function getAllProjects(studentId, collegeId) {
    const result = await query(
        `SELECT ${RETURNING_COLUMNS}
         FROM student_projects
         WHERE student_id = $1 AND college_id = $2
         ORDER BY display_order ASC NULLS LAST, created_at DESC`,
        [studentId, collegeId]
    );

    return {
        total_projects: result.rows.length,
        max_projects: MAX_PROJECTS,
        projects: result.rows,
    };
}

// ============================================================================
// 3. UPDATE PROJECT
// ============================================================================

async function updateProject(projectId, studentId, collegeId, data) {
    // If ongoing, clear end_date
    if (data.is_ongoing === true) {
        data.end_date = null;
    }

    // Build dynamic UPDATE
    const fieldsToUpdate = PROJECT_FIELDS.filter(f => data[f] !== undefined);

    if (fieldsToUpdate.length === 0) {
        throw Object.assign(new Error('At least one field must be provided to update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 4}`)
        .concat(['updated_at = NOW()']);

    const values = [
        projectId, studentId, collegeId,
        ...fieldsToUpdate.map(f => data[f]),
    ];

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE student_projects
             SET ${setClauses.join(', ')}
             WHERE project_id = $1 AND student_id = $2 AND college_id = $3
             RETURNING ${RETURNING_COLUMNS}`,
            values
        );

        if (!result.rows.length) {
            throw Object.assign(
                new Error('Project not found or does not belong to you'),
                { status: 404 }
            );
        }

        // Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'projects');

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Project updated`, {
            studentId,
            project_id: projectId,
        });

        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 4. DELETE PROJECT
// ============================================================================

async function deleteProject(projectId, studentId, collegeId) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `DELETE FROM student_projects
             WHERE project_id = $1 AND student_id = $2 AND college_id = $3
             RETURNING project_id, project_title`,
            [projectId, studentId, collegeId]
        );

        if (!result.rows.length) {
            throw Object.assign(
                new Error('Project not found or does not belong to you'),
                { status: 404 }
            );
        }

        // Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'projects');

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Project deleted`, {
            studentId,
            project_id: projectId,
            project_title: result.rows[0].project_title,
        });

        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addProject,
    getAllProjects,
    updateProject,
    deleteProject,
};
