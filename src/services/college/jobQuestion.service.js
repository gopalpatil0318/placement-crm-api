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

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// Fields that can be dynamically updated
const FIELDS = ['question_text', 'question_type', 'question_options', 'is_required', 'question_order'];

// MCQ question types that require options
const MCQ_TYPES = ['mcq_single', 'mcq_multiple'];

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
        `SELECT q.*, j.job_title, j.job_status, j.college_id, c.company_name
         FROM application_questions q
         JOIN job_postings j ON q.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         WHERE q.question_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [questionId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error('Application question not found'), { status: 404 });
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
            new Error('Cannot add questions to a cancelled job'),
            { status: 400 }
        );
    }

    if (job.job_status === STATUS.JOB.CLOSED) {
        throw Object.assign(
            new Error('Cannot add questions to a closed job'),
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
            new Error('This question already exists for this job posting'),
            { status: 409 }
        );
    }

    const nextOrder = parseInt(maxResult.rows[0].max_order, 10) + 1;

    // 5. Sanitize options: null for non-MCQ types
    // JSON.stringify for JSONB column — pg driver treats JS arrays as PostgreSQL arrays, not JSON
    const rawOptions = MCQ_TYPES.includes(data.question_type)
        ? data.question_options
        : null;
    const options = rawOptions ? JSON.stringify(rawOptions) : null;

    // 6. Insert the question
    const result = await query(
        `INSERT INTO application_questions (job_id, question_text, question_type, question_options, is_required, question_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
            jobId,
            data.question_text.trim(),
            data.question_type,
            options,
            data.is_required ?? true,
            nextOrder,
        ]
    );

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
        `SELECT q.*
         FROM application_questions q
         WHERE q.job_id = $1
         ORDER BY q.question_order ASC, q.created_at ASC`,
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
    if (existing.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error('Cannot edit questions in a cancelled job'),
            { status: 400 }
        );
    }

    if (existing.job_status === STATUS.JOB.CLOSED) {
        throw Object.assign(
            new Error('Cannot edit questions in a closed job'),
            { status: 400 }
        );
    }

    // 3. If published job has applications, block edits to prevent data inconsistency
    if (existing.job_status === STATUS.JOB.PUBLISHED) {
        const appCheck = await query(
            `SELECT application_id FROM student_applications
             WHERE job_id = $1 LIMIT 1`,
            [existing.job_id]
        );

        if (appCheck.rows.length) {
            throw Object.assign(
                new Error('Cannot edit questions after students have started applying. Consider closing the job first'),
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
                new Error('This question already exists for this job posting'),
                { status: 409 }
            );
        }
    }

    // 5. Handle type change logic
    const effectiveType = data.question_type ?? existing.question_type;

    if (MCQ_TYPES.includes(effectiveType)) {
        // Changing to MCQ: options must be provided
        if (data.question_type && !data.question_options && !MCQ_TYPES.includes(existing.question_type)) {
            throw Object.assign(
                new Error('Options are required when changing question type to MCQ'),
                { status: 400 }
            );
        }
    } else {
        // Changing to non-MCQ: auto-clear options
        if (data.question_type && MCQ_TYPES.includes(existing.question_type)) {
            data.question_options = null;
        }
    }

    // 6. If reordering, validate the new order
    if (data.question_order !== undefined) {
        const maxResult = await query(
            `SELECT COALESCE(MAX(question_order), 0) AS max_order
             FROM application_questions WHERE job_id = $1`,
            [existing.job_id]
        );
        const maxOrder = parseInt(maxResult.rows[0].max_order, 10);

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
        throw Object.assign(new Error('No valid fields provided for update'), { status: 400 });
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
         RETURNING *`,
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
            new Error('Cannot delete questions from a cancelled job'),
            { status: 400 }
        );
    }

    if (existing.job_status === STATUS.JOB.CLOSED) {
        throw Object.assign(
            new Error('Cannot delete questions from a closed job'),
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
                new Error('Cannot delete questions after students have started applying'),
                { status: 400 }
            );
        }
    }

    // 4. Delete the question
    await query(
        `DELETE FROM application_questions WHERE question_id = $1`,
        [questionId]
    );

    // 5. Re-order remaining questions to maintain sequential order
    await query(
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
