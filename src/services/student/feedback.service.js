/**
 * ============================================================================
 * STUDENT FEEDBACK & INTERVIEW QUESTIONS SERVICE
 * ============================================================================
 * Business logic for APIs #172–#175
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const { ERROR_MESSAGES, DB_ERROR_CODES } = require('../../config/constants');

// ── #172 POST /submit_feedback ─────────────────────────────────────────────
async function submitFeedback(studentId, collegeId, data) {
  // Verify job belongs to this college and student applied to it
  const jobCheck = await query(
    `SELECT jp.job_id, jp.company_id
     FROM job_postings jp
     JOIN student_applications sa ON sa.job_id = jp.job_id
     WHERE jp.job_id = $1
       AND jp.college_id = $2
       AND sa.student_id = $3
       AND jp.company_id = $4`,
    [data.job_id, collegeId, studentId, data.company_id]
  );

  if (jobCheck.rows.length === 0) {
    throw Object.assign(
      new Error(ERROR_MESSAGES.JOB_NOT_FOUND),
      { status: 404 }
    );
  }

  try {
    const result = await query(
      `INSERT INTO placement_feedback
         (college_id, job_id, company_id, student_id, rating, feedback_text, is_anonymous)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING feedback_id, job_id, company_id, rating, feedback_text,
                 is_anonymous, is_approved, created_at`,
      [collegeId, data.job_id, data.company_id, studentId,
       data.rating, data.feedback_text || null, data.is_anonymous]
    );

    return result.rows[0];
  } catch (err) {
    if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
      throw Object.assign(
        new Error(ERROR_MESSAGES.FEEDBACK_ALREADY_SUBMITTED),
        { status: 409 }
      );
    }
    throw err;
  }
}

// ── #173 GET /get_my_feedback ──────────────────────────────────────────────
async function getMyFeedback(studentId, collegeId, filters) {
  const { page, limit, offset } = getPagination(filters);

  const allowedSortColumns = { created_at: 'pf.created_at', rating: 'pf.rating' };
  const sortColumn = allowedSortColumns[filters.sort_by] || 'pf.created_at';
  const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

  const [countResult, dataResult] = await Promise.all([
    query(
      `SELECT COUNT(*)
       FROM placement_feedback pf
       WHERE pf.student_id = $1 AND pf.college_id = $2`,
      [studentId, collegeId]
    ),
    query(
      `SELECT
         pf.feedback_id, pf.job_id, pf.company_id,
         pf.rating, pf.feedback_text, pf.is_anonymous,
         pf.is_approved, pf.created_at, pf.updated_at,
         co.company_name,
         jp.job_title
       FROM placement_feedback pf
       JOIN companies co ON pf.company_id = co.company_id
       JOIN job_postings jp ON pf.job_id = jp.job_id
       WHERE pf.student_id = $1 AND pf.college_id = $2
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $3 OFFSET $4`,
      [studentId, collegeId, limit, offset]
    ),
  ]);

  const total = parseInt(countResult.rows[0].count, 10);

  return { feedback: dataResult.rows, total, page, limit };
}

// ── #174 POST /submit_interview_question ──────────────────────────────────
async function submitInterviewQuestion(studentId, collegeId, data) {
  // Verify job and company belong to this college
  const jobCheck = await query(
    `SELECT jp.job_id
     FROM job_postings jp
     WHERE jp.job_id = $1
       AND jp.college_id = $2
       AND jp.company_id = $3`,
    [data.job_id, collegeId, data.company_id]
  );

  if (jobCheck.rows.length === 0) {
    throw Object.assign(
      new Error(ERROR_MESSAGES.JOB_NOT_FOUND),
      { status: 404 }
    );
  }

  const result = await query(
    `INSERT INTO interview_questions
       (college_id, company_id, job_id, student_id, question_description, topic, sample_answer)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING question_id, company_id, job_id, question_description,
               topic, sample_answer, is_approved, created_at`,
    [collegeId, data.company_id, data.job_id, studentId,
     data.question_description, data.topic || null, data.sample_answer || null]
  );

  return result.rows[0];
}

// ── #175 GET /browse_interview_questions ──────────────────────────────────
async function browseInterviewQuestions(collegeId, filters) {
  const { page, limit, offset } = getPagination(filters);

  // Students can only browse approved questions
  const conditions = ['iq.college_id = $1', 'iq.is_approved = true'];
  const params = [collegeId];
  let paramIndex = 2;

  if (filters.company_id) {
    conditions.push(`iq.company_id = $${paramIndex++}`);
    params.push(filters.company_id);
  }

  if (filters.job_id) {
    conditions.push(`iq.job_id = $${paramIndex++}`);
    params.push(filters.job_id);
  }

  if (filters.topic) {
    conditions.push(`iq.topic ILIKE $${paramIndex++}`);
    params.push(`%${filters.topic}%`);
  }

  if (filters.search) {
    conditions.push(`(iq.question_description ILIKE $${paramIndex} OR iq.topic ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  const allowedSortColumns = { created_at: 'iq.created_at', topic: 'iq.topic' };
  const sortColumn = allowedSortColumns[filters.sort_by] || 'iq.created_at';
  const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

  const dataParams = [...params, limit, offset];
  const [countResult, dataResult] = await Promise.all([
    query(
      `SELECT COUNT(*) FROM interview_questions iq WHERE ${whereClause}`,
      params
    ),
    query(
      `SELECT
         iq.question_id, iq.company_id, iq.job_id,
         iq.question_description, iq.topic, iq.sample_answer,
         iq.created_at,
         co.company_name,
         jp.job_title,
         jp.passout_years[1] AS passout_year
       FROM interview_questions iq
       JOIN companies co ON iq.company_id = co.company_id
       JOIN job_postings jp ON iq.job_id = jp.job_id
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      dataParams
    ),
  ]);

  const total = parseInt(countResult.rows[0].count, 10);

  return { questions: dataResult.rows, total, page, limit };
}

module.exports = {
  submitFeedback,
  getMyFeedback,
  submitInterviewQuestion,
  browseInterviewQuestions,
};
