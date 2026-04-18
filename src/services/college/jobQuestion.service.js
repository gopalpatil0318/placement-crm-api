/**
 * ============================================================================
 * APPLICATION QUESTION SERVICE — Question Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - addQuestion(jobId, collegeId, data)
 *   - getJobQuestions(jobId, collegeId)
 *   - updateQuestion(questionId, collegeId, data)
 *   - deleteQuestion(questionId, collegeId)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    STATUS,
    MCQ_TYPES,
} = require('../../config/constants');

// Fields that can be dynamically updated
const FIELDS = ['question_text', 'question_type', 'question_options', 'is_required', 'question_order'];

// Explicit column list — never SELECT * or RETURNING *
const QUESTION_RETURNING_COLUMNS = 'question_id, job_id, question_text, question_type, question_options, is_required, question_order, created_at';

const QUESTION_VERIFY_COLUMNS = 'q.question_id, q.job_id, q.question_text, q.question_type, q.question_options, q.is_required, q.question_order, q.created_at, j.job_title, j.job_status, j.college_id, c.company_name';

// ============================================================================
// HELPER — Verify job exists and belongs to college
// ============================================================================

async function verifyJob(jobId, collegeId) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.job_status, c.company_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         WHERE j.job_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [jobId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Verify question exists and belongs to college
// ============================================================================

async function verifyQuestion(questionId, collegeId) {
    const result = await query(
        `SELECT ${QUESTION_VERIFY_COLUMNS}
         FROM application_questions q
         JOIN job_postings j ON q.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         WHERE q.question_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [questionId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.QUESTION_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Format question for response
// ============================================================================

function formatQuestion(record) {
    return {
        question_id: record.question_id,
        job_id: record.job_id,
        question_text: record.question_text,
        question_type: record.question_type,
        question_options: record.question_options ?? null,
        is_required: record.is_required,
        question_order: record.question_order,
        created_at: record.created_at,
        // Joined fields (when available)
        ...(record.job_title !== undefined && { job_title: record.job_title }),
        ...(record.company_name !== undefined && { company_name: record.company_name }),
    };
}

// ============================================================================
// 1. ADD QUESTION
// ============================================================================

/**
 * Add a new application question to a job posting.
 * question_order is auto-calculated as MAX existing + 1.
 * Cannot add to cancelled or closed jobs.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Created question
 */
async function addQuestion(jobId, collegeId, data) {
    // 1. Verify job exists and belongs to college
    const job = await verifyJob(jobId, collegeId);

    // 2. Cannot add to cancelled or closed jobs
    if (job.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_ADD_QUESTION_CANCELLED_JOB),
            { status: 400 }
        );
    }

    if (job.job_status === STATUS.JOB.CLOSED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_ADD_QUESTION_CLOSED_JOB),
            { status: 400 }
        );
    }

    // 3. Check duplicate + calculate next order in parallel
    const [duplicateCheck, maxResult] = await Promise.all([
        query(
            `SELECT question_id FROM application_questions
             WHERE job_id = $1 AND LOWER(TRIM(question_text)) = LOWER(TRIM($2))
             LIMIT 1`,
            [jobId, data.question_text]
        ),
        query(
            `SELECT COALESCE(MAX(question_order), 0) AS max_order
             FROM application_questions WHERE job_id = $1`,
            [jobId]
        ),
    ]);

    if (duplicateCheck.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.QUESTION_DUPLICATE),
            { status: 409 }
        );
    }

    const nextOrder = Number.parseInt(maxResult.rows[0].max_order, 10) + 1;

    // 5. Sanitize options: null for non-MCQ types
    // JSON.stringify for JSONB column — pg driver treats JS arrays as PostgreSQL arrays, not JSON
    const rawOptions = MCQ_TYPES.includes(data.question_type)
        ? data.question_options
        : null;
    const options = rawOptions ? JSON.stringify(rawOptions) : null;

    // 6. Insert the question (handle concurrent order conflicts)
    let result;
    try {
        result = await query(
            `INSERT INTO application_questions (job_id, question_text, question_type, question_options, is_required, question_order)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING ${QUESTION_RETURNING_COLUMNS}`,
            [
                jobId,
                data.question_text.trim(),
                data.question_type,
                options,
                data.is_required ?? true,
                nextOrder,
            ]
        );
    } catch (err) {
        // B26: Handle unique constraint violation on (job_id, question_order)
        if (err.code === '23505') {
            throw Object.assign(
                new Error('Question order conflict — please try again'),
                { status: 409 }
            );
        }
        throw err;
    }

    logger.info(`${LOG.AUTH} Application question added`, {
        questionId: result.rows[0].question_id,
        jobId,
        questionType: data.question_type,
        questionOrder: nextOrder,
        collegeId,
    });

    return formatQuestion({
        ...result.rows[0],
        job_title: job.job_title,
        company_name: job.company_name,
    });
}

// ============================================================================
// 2. GET JOB QUESTIONS
// ============================================================================

/**
 * Retrieve all application questions for a job, ordered by question_order.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @returns {Object} { questions: [...], total: N, job_title, company_name }
 */
async function getJobQuestions(jobId, collegeId) {
    // 1. Verify job exists and belongs to college
    const job = await verifyJob(jobId, collegeId);

    // 2. Fetch all questions ordered by question_order
    const result = await query(
        `SELECT ${QUESTION_RETURNING_COLUMNS}
         FROM application_questions
         WHERE job_id = $1
         ORDER BY question_order ASC, created_at ASC`,
        [jobId]
    );

    return {
        questions: result.rows.map(row => formatQuestion({
            ...row,
            job_title: job.job_title,
            company_name: job.company_name,
        })),
        total: result.rows.length,
        job_title: job.job_title,
        company_name: job.company_name,
    };
}

// ============================================================================
// 3. UPDATE QUESTION
// ============================================================================

/**
 * Block edits to questions in cancelled or closed jobs.
 */
function blockIfJobInactive(jobStatus) {
    if (jobStatus === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_EDIT_QUESTION_CANCELLED_JOB),
            { status: 400 }
        );
    }
    if (jobStatus === STATUS.JOB.CLOSED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_EDIT_QUESTION_CLOSED_JOB),
            { status: 400 }
        );
    }
}

/**
 * Handle MCQ type-change logic: require options when switching TO MCQ,
 * auto-clear options when switching FROM MCQ.
 */
function handleTypeChangeOptions(data, existingType) {
    const effectiveType = data.question_type ?? existingType;

    if (MCQ_TYPES.includes(effectiveType)) {
        if (data.question_type && !data.question_options && !MCQ_TYPES.includes(existingType)) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.MCQ_OPTIONS_REQUIRED),
                { status: 400 }
            );
        }
    } else if (data.question_type && MCQ_TYPES.includes(existingType)) {
        data.question_options = null;
    }
}

/**
 * Update an application question.
 * Cannot edit questions in cancelled or closed jobs.
 * Cannot edit questions in published jobs that have applications.
 * If changing type to MCQ, options must be provided.
 * If changing type to non-MCQ, options are auto-cleared.
 *
 * @param {string} questionId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated question
 */
async function updateQuestion(questionId, collegeId, data) {
    // 1. Verify question and job
    const existing = await verifyQuestion(questionId, collegeId);

    // 2. Cannot edit in cancelled or closed jobs
    blockIfJobInactive(existing.job_status);

    // 3. If published job has applications, block edits to prevent data inconsistency
    if (existing.job_status === STATUS.JOB.PUBLISHED) {
        const appCheck = await query(
            `SELECT application_id FROM student_applications
             WHERE job_id = $1 LIMIT 1`,
            [existing.job_id]
        );

        if (appCheck.rows.length) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.CANNOT_EDIT_QUESTION_WITH_APPLICATIONS),
                { status: 400 }
            );
        }
    }

    // 4. If question_text is changing, check duplicate
    if (data.question_text && data.question_text.trim().toLowerCase() !== existing.question_text.trim().toLowerCase()) {
        const duplicateCheck = await query(
            `SELECT question_id FROM application_questions
             WHERE job_id = $1 AND LOWER(TRIM(question_text)) = LOWER(TRIM($2)) AND question_id != $3
             LIMIT 1`,
            [existing.job_id, data.question_text, questionId]
        );

        if (duplicateCheck.rows.length) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.QUESTION_DUPLICATE),
                { status: 409 }
            );
        }
    }

    // 5. Handle type change logic
    handleTypeChangeOptions(data, existing.question_type);

    // 6. If reordering, validate the new order
    if (data.question_order !== undefined) {
        const maxResult = await query(
            `SELECT COALESCE(MAX(question_order), 0) AS max_order
             FROM application_questions WHERE job_id = $1`,
            [existing.job_id]
        );
        const maxOrder = Number.parseInt(maxResult.rows[0].max_order, 10);

        if (data.question_order > maxOrder + 1) {
            throw Object.assign(
                new Error(`Question order cannot exceed ${maxOrder + 1} (current max is ${maxOrder})`),
                { status: 400 }
            );
        }
    }

    // 7. Build dynamic UPDATE
    const fieldsToUpdate = FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.NO_FIELDS_TO_UPDATE), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 2}`)
        .join(', ');
    // JSON.stringify question_options for JSONB column
    const values = [questionId, ...fieldsToUpdate.map(f => {
        if (f === 'question_options' && Array.isArray(data[f])) {
            return JSON.stringify(data[f]);
        }
        return data[f];
    })];

    const result = await query(
        `UPDATE application_questions
         SET ${setClauses}
         WHERE question_id = $1
         RETURNING ${QUESTION_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Application question updated`, {
        questionId,
        updatedFields: fieldsToUpdate,
        jobId: existing.job_id,
        collegeId,
    });

    return formatQuestion({
        ...result.rows[0],
        job_title: existing.job_title,
        company_name: existing.company_name,
    });
}

// ============================================================================
// 4. DELETE QUESTION
// ============================================================================

/**
 * Hard delete a question. Allowed only on draft/published jobs without applications.
 * Re-orders remaining questions after deletion to maintain sequential order.
 *
 * @param {string} questionId
 * @param {string} collegeId
 * @returns {Object} Deleted question info
 */
async function deleteQuestion(questionId, collegeId) {
    // 1. Verify question and job
    const existing = await verifyQuestion(questionId, collegeId);

    // 2. Cannot delete from cancelled or closed jobs
    if (existing.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_DELETE_QUESTION_CANCELLED_JOB),
            { status: 400 }
        );
    }

    if (existing.job_status === STATUS.JOB.CLOSED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_DELETE_QUESTION_CLOSED_JOB),
            { status: 400 }
        );
    }

    // 3. If published job has applications, block delete
    if (existing.job_status === STATUS.JOB.PUBLISHED) {
        const appCheck = await query(
            `SELECT application_id FROM student_applications
             WHERE job_id = $1 LIMIT 1`,
            [existing.job_id]
        );

        if (appCheck.rows.length) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.CANNOT_DELETE_QUESTION_WITH_APPLICATIONS),
                { status: 400 }
            );
        }
    }

    // 4. Delete + re-order in a transaction
    const client = await getClient();
    try {
        await client.query('BEGIN');

        await client.query(
            `DELETE FROM application_questions WHERE question_id = $1`,
            [questionId]
        );

        // Re-order remaining questions to maintain sequential order
        await client.query(
            `WITH ordered AS (
               SELECT question_id, ROW_NUMBER() OVER (ORDER BY question_order ASC, created_at ASC) AS new_order
               FROM application_questions
               WHERE job_id = $1
             )
             UPDATE application_questions q
             SET question_order = o.new_order
             FROM ordered o
             WHERE q.question_id = o.question_id`,
            [existing.job_id]
        );

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    logger.info(`${LOG.AUTH} Application question deleted`, {
        questionId,
        questionText: existing.question_text.substring(0, 80),
        jobId: existing.job_id,
        collegeId,
    });

    return {
        question_id: questionId,
        question_text: existing.question_text,
        job_id: existing.job_id,
        job_title: existing.job_title,
        company_name: existing.company_name,
        deleted: true,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addQuestion,
    getJobQuestions,
    updateQuestion,
    deleteQuestion,
};
