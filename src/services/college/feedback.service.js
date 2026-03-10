/**
 * ============================================================================
 * COLLEGE FEEDBACK & INTERVIEW QUESTIONS SERVICE
 * ============================================================================
 * Business logic for APIs #99–#102
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const { ERROR_MESSAGES } = require('../../config/constants');

// ── #99  GET /get_all_feedback ─────────────────────────────────────────────
async function getAllFeedback(collegeId, filters) {
  const { page, limit, offset } = getPagination(filters);

  const conditions = ['pf.college_id = $1'];
  const params = [collegeId];
  let paramIndex = 2;

  if (filters.is_approved !== undefined) {
    conditions.push(`pf.is_approved = $${paramIndex++}`);
    params.push(filters.is_approved);
  }

  if (filters.company_id) {
    conditions.push(`pf.company_id = $${paramIndex++}`);
    params.push(filters.company_id);
  }

  if (filters.job_id) {
    conditions.push(`pf.job_id = $${paramIndex++}`);
    params.push(filters.job_id);
  }

  if (filters.rating) {
    conditions.push(`pf.rating = $${paramIndex++}`);
    params.push(filters.rating);
  }

  if (filters.search) {
    conditions.push(`pf.feedback_text ILIKE $${paramIndex++}`);
    params.push(`%${filters.search}%`);
  }

  const whereClause = conditions.join(' AND ');

  const allowedSortColumns = { created_at: 'pf.created_at', rating: 'pf.rating' };
  const sortColumn = allowedSortColumns[filters.sort_by] || 'pf.created_at';
  const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

  const dataParams = [...params, limit, offset];
  const [countResult, dataResult] = await Promise.all([
    query(
      `SELECT COUNT(*) FROM placement_feedback pf WHERE ${whereClause}`,
      params
    ),
    query(
      `SELECT
         pf.feedback_id, pf.job_id, pf.company_id, pf.student_id,
         pf.rating, pf.feedback_text, pf.is_anonymous, pf.is_approved,
         pf.created_at, pf.updated_at,
         co.company_name,
         jp.job_title,
         CASE WHEN pf.is_anonymous = true THEN 'Anonymous'
              ELSE s.first_name || ' ' || s.last_name END AS student_name,
         CASE WHEN pf.is_anonymous = true THEN NULL
              ELSE d.dept_name END AS department_name
       FROM placement_feedback pf
       JOIN companies co ON pf.company_id = co.company_id
       JOIN job_postings jp ON pf.job_id = jp.job_id
       JOIN students s ON pf.student_id = s.student_id
       LEFT JOIN departments d ON s.dept_id = d.dept_id
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      dataParams
    ),
  ]);
  const total = parseInt(countResult.rows[0].count, 10);

  return { feedback: dataResult.rows, total, page, limit };
}

// ── #100 PATCH /approve_feedback/:feedbackId ───────────────────────────────
async function approveFeedback(collegeId, feedbackId, isApproved) {
  const result = await query(
    `UPDATE placement_feedback
     SET is_approved = $1, updated_at = NOW()
     WHERE feedback_id = $2 AND college_id = $3
     RETURNING feedback_id, is_approved, updated_at`,
    [isApproved, feedbackId, collegeId]
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error(ERROR_MESSAGES.FEEDBACK_NOT_FOUND), { status: 404 });
  }

  return result.rows[0];
}

// ── #101 GET /get_all_interview_questions ──────────────────────────────────
async function getAllInterviewQuestions(collegeId, filters) {
  const { page, limit, offset } = getPagination(filters);

  const conditions = ['iq.college_id = $1'];
  const params = [collegeId];
  let paramIndex = 2;

  if (filters.is_approved !== undefined) {
    conditions.push(`iq.is_approved = $${paramIndex++}`);
    params.push(filters.is_approved);
  }

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
         iq.question_id, iq.company_id, iq.job_id, iq.student_id,
         iq.question_description, iq.topic, iq.sample_answer,
         iq.is_approved, iq.created_at, iq.updated_at,
         co.company_name,
         jp.job_title,
         s.first_name || ' ' || s.last_name AS student_name,
         d.dept_name AS department_name
       FROM interview_questions iq
       JOIN companies co ON iq.company_id = co.company_id
       JOIN job_postings jp ON iq.job_id = jp.job_id
       JOIN students s ON iq.student_id = s.student_id
       LEFT JOIN departments d ON s.dept_id = d.dept_id
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      dataParams
    ),
  ]);
  const total = parseInt(countResult.rows[0].count, 10);

  return { questions: dataResult.rows, total, page, limit };
}

// ── #102 PATCH /approve_interview_question/:questionId ────────────────────
async function approveInterviewQuestion(collegeId, questionId, isApproved) {
  const result = await query(
    `UPDATE interview_questions
     SET is_approved = $1, updated_at = NOW()
     WHERE question_id = $2 AND college_id = $3
     RETURNING question_id, is_approved, updated_at`,
    [isApproved, questionId, collegeId]
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error(ERROR_MESSAGES.INTERVIEW_QUESTION_NOT_FOUND), { status: 404 });
  }

  return result.rows[0];
}

module.exports = {
  getAllFeedback,
  approveFeedback,
  getAllInterviewQuestions,
  approveInterviewQuestion,
};
