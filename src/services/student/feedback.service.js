/**
 * ============================================================================
 * STUDENT FEEDBACK & INTERVIEW QUESTIONS SERVICE
 * ============================================================================
 * Business logic for APIs #172–#175
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const { ERROR_MESSAGES, DB_ERROR_CODES } = require('../../config/constants');

// ── Valid round types ──────────────────────────────────────────────────────
const VALID_ROUND_TYPES = [
  'aptitude', 'technical_interview', 'hr_interview', 'group_discussion',
  'coding_test', 'written_test', 'case_study', 'psychometric_test',
  'managerial_round', 'other',
];

// ── Column constants ───────────────────────────────────────────────────────
const FEEDBACK_RETURNING_COLUMNS = `feedback_id, job_id, company_id, rating, feedback_text,
                 is_anonymous, is_approved, created_at`;

const FEEDBACK_SELECT_COLUMNS = `
  pf.feedback_id, pf.job_id, pf.company_id,
  pf.rating, pf.feedback_text, pf.is_anonymous,
  pf.is_approved, pf.created_at, pf.updated_at,
  co.company_name,
  jp.job_title`;

const QUESTION_RETURNING_COLUMNS = `question_id, company_id, job_id, question_description,
               topic, sample_answer, round_type, is_approved, created_at`;

const QUESTION_SELECT_COLUMNS = `
  iq.question_id, iq.company_id, iq.job_id,
  iq.question_description, iq.topic, iq.sample_answer,
  iq.round_type, iq.created_at,
  co.company_name,
  jp.job_title,
  jp.passout_years[1] AS passout_year`;

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
       AND jp.company_id = $4
     LIMIT 1`,
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
       RETURNING ${FEEDBACK_RETURNING_COLUMNS}`,
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
         ${FEEDBACK_SELECT_COLUMNS}
       FROM placement_feedback pf
       JOIN companies co ON pf.company_id = co.company_id
       JOIN job_postings jp ON pf.job_id = jp.job_id
       WHERE pf.student_id = $1 AND pf.college_id = $2
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $3 OFFSET $4`,
      [studentId, collegeId, limit, offset]
    ),
  ]);

  const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10);

  return { feedback: dataResult.rows, total, page, limit };
}

// ── #174 POST /submit_interview_question ──────────────────────────────────
async function submitInterviewQuestion(studentId, collegeId, data) {
  // Verify job belongs to this college AND student applied to it
  const jobCheck = await query(
    `SELECT jp.job_id
     FROM job_postings jp
     JOIN student_applications sa ON sa.job_id = jp.job_id
     WHERE jp.job_id = $1
       AND jp.college_id = $2
       AND jp.company_id = $3
       AND sa.student_id = $4
     LIMIT 1`,
    [data.job_id, collegeId, data.company_id, studentId]
  );

  if (jobCheck.rows.length === 0) {
    throw Object.assign(
      new Error(ERROR_MESSAGES.JOB_NOT_FOUND),
      { status: 404 }
    );
  }

  const result = await query(
    `INSERT INTO interview_questions
       (college_id, company_id, job_id, student_id, question_description, topic, sample_answer, round_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${QUESTION_RETURNING_COLUMNS}`,
    [collegeId, data.company_id, data.job_id, studentId,
     data.question_description, data.topic || null, data.sample_answer || null, data.round_type || null]
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

  if (filters.topic?.trim()) {
    conditions.push(`iq.topic ILIKE $${paramIndex++}`);
    params.push(`%${filters.topic.trim()}%`);
  }

  if (filters.round_type?.trim()) {
    conditions.push(`iq.round_type = $${paramIndex++}`);
    params.push(filters.round_type.trim());
  }

  if (filters.search?.trim()) {
    conditions.push(`iq.question_description ILIKE $${paramIndex}`);
    params.push(`%${filters.search.trim()}%`);
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
         ${QUESTION_SELECT_COLUMNS}
       FROM interview_questions iq
       JOIN companies co ON iq.company_id = co.company_id
       JOIN job_postings jp ON iq.job_id = jp.job_id
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      dataParams
    ),
  ]);

  const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10);

  return { questions: dataResult.rows, total, page, limit };
}

// ── #176 GET /applied_job_options ──────────────────────────────────────────
async function getAppliedJobOptions(studentId, collegeId) {
  const result = await query(
    `SELECT DISTINCT
       co.company_id, co.company_name,
       jp.job_id, jp.job_title
     FROM student_applications sa
     JOIN job_postings jp ON sa.job_id = jp.job_id
     JOIN companies co ON jp.company_id = co.company_id
     WHERE sa.student_id = $1
       AND sa.college_id = $2
     ORDER BY co.company_name, jp.job_title`,
    [studentId, collegeId]
  );

  // Group by company
  const companyMap = new Map();
  for (const row of result.rows) {
    if (!companyMap.has(row.company_id)) {
      companyMap.set(row.company_id, {
        company_id: row.company_id,
        company_name: row.company_name,
        jobs: [],
      });
    }
    companyMap.get(row.company_id).jobs.push({
      job_id: row.job_id,
      job_title: row.job_title,
    });
  }

  return { companies: Array.from(companyMap.values()) };
}

// ── #177 POST /submit_interview_questions (batch) ─────────────────────────
async function submitInterviewQuestions(studentId, collegeId, data) {
  const { company_id, job_id, round_type, questions } = data;

  if (!questions || questions.length === 0) {
    throw Object.assign(new Error('At least one question is required'), { status: 400 });
  }
  if (questions.length > 10) {
    throw Object.assign(
      new Error(ERROR_MESSAGES.INTERVIEW_QUESTIONS_BATCH_LIMIT),
      { status: 400 }
    );
  }

  // Verify job belongs to this college AND student applied to it
  const jobCheck = await query(
    `SELECT jp.job_id
     FROM job_postings jp
     JOIN student_applications sa ON sa.job_id = jp.job_id
     WHERE jp.job_id = $1
       AND jp.college_id = $2
       AND jp.company_id = $3
       AND sa.student_id = $4
     LIMIT 1`,
    [job_id, collegeId, company_id, studentId]
  );

  if (jobCheck.rows.length === 0) {
    throw Object.assign(
      new Error(ERROR_MESSAGES.JOB_NOT_FOUND),
      { status: 404 }
    );
  }

  // Build batch INSERT with parameterized values
  const values = [];
  const placeholders = [];
  let paramIdx = 1;

  for (const q of questions) {
    placeholders.push(
      `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
    );
    values.push(
      collegeId, company_id, job_id, studentId,
      q.question_description,
      q.sample_answer || null,
      round_type || null
    );
  }

  // Use transaction for atomic batch insert
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO interview_questions
         (college_id, company_id, job_id, student_id, question_description, sample_answer, round_type)
       VALUES ${placeholders.join(', ')}
       RETURNING ${QUESTION_RETURNING_COLUMNS}`,
      values
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── #178 GET /interview_question_companies ─────────────────────────────────
async function getInterviewQuestionCompanies(collegeId) {
  const result = await query(
    `SELECT
       co.company_id, co.company_name,
       COUNT(iq.question_id)::int AS question_count,
       MAX(iq.created_at) AS latest_date
     FROM interview_questions iq
     JOIN companies co ON iq.company_id = co.company_id
     WHERE iq.college_id = $1
       AND iq.is_approved = true
     GROUP BY co.company_id, co.company_name
     HAVING COUNT(iq.question_id) > 0
     ORDER BY COUNT(iq.question_id) DESC, co.company_name`,
    [collegeId]
  );

  return { companies: result.rows };
}

module.exports = {
  submitFeedback,
  getMyFeedback,
  submitInterviewQuestion,
  browseInterviewQuestions,
  getAppliedJobOptions,
  submitInterviewQuestions,
  getInterviewQuestionCompanies,
};
