/**
 * ============================================================================
 * STUDENT SERVICE - Student Management (UPDATED)
 * ============================================================================
 * Single Database Architecture
 * - Register single student
 * - Bulk register students
 * - Authenticate student (login)
 * - Update student password
 * - Update student profile (admin/teacher)
 * - Status checks: college active, student active
 */


const { getMainPool } = require('../config/db');
const passwordHelper = require('../utils/passwordHelper');
const jwtHelper = require('../utils/jwtHelper');
const logger = require('../config/logger');
const {
  LOG,
  STATUS,
  DB_ERROR_CODES
} = require('../config/constants');

class StudentService {
  /**
   * Register single student
   * 
   * Single Database:
   * 1. Verify college is active
   * 2. Hash password
   * 3. Check email uniqueness
   * 4. Create student
   * 
   * @param {Object} data - { college_id, student_name, student_email, student_password, student_department, student_year }
   * @returns {Object} Created student (without password)
   * @throws {Error} If validation fails
   */
  async registerStudent(data) {
    const {
      college_id,
      student_name,
      student_email,
      student_password,
      student_department,
      student_year
    } = data;

    const mainPool = getMainPool();
    const client = await mainPool.connect();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting student registration`,
        { college_id, student_email }
      );

      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // ====================================================================
      // Step 1: Verify college exists and is active
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Verifying college status`, {
        college_id
      });

      const collegeQuery = `
        SELECT college_id, college_status
        FROM colleges
        WHERE college_id = $1
        LIMIT 1
      `;

      const collegeResult = await client.query(collegeQuery, [college_id]);

      if (!collegeResult.rows.length) {
        await client.query('ROLLBACK');
        throw new Error('College not found');
      }

      const college = collegeResult.rows[0];

      if (college.college_status !== STATUS.ACTIVE) {
        await client.query('ROLLBACK');
        throw new Error('College is inactive');
      }

      // ====================================================================
      // Step 2: Hash password
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Hashing student password`);

      const hashedPassword = await passwordHelper.hashPassword(student_password);

      // ====================================================================
      // Step 3: Check email uniqueness
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Checking email uniqueness`, {
        student_email
      });

      const emailCheckQuery = `
        SELECT student_id FROM students
        WHERE LOWER(student_email) = LOWER($1)
        AND college_id = $2
        LIMIT 1
      `;

      const emailCheckResult = await client.query(emailCheckQuery, [
        student_email,
        college_id
      ]);

      if (emailCheckResult.rows.length > 0) {
        await client.query('ROLLBACK');
        throw new Error('Email already exists');
      }

      // ====================================================================
      // Step 4: Create student
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Creating student record`, {
        college_id,
        student_email
      });

      const studentInsertQuery = `
        INSERT INTO students (
          college_id,
          student_name,
          student_email,
          student_password,
          student_department,
          student_year,
          student_status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING 
          student_id, 
          college_id, 
          student_name, 
          student_email, 
          student_department,
          student_year,
          student_status, 
          created_at
      `;

      const studentResult = await client.query(studentInsertQuery, [
        college_id,
        student_name,
        student_email,
        hashedPassword,
        student_department,
        student_year,
        STATUS.ACTIVE
      ]);

      await client.query('COMMIT');

      const student = studentResult.rows[0];

      logger.info(
        `${LOG.TRANSACTION_PREFIX} Student registered successfully`,
        {
          student_id: student.student_id,
          college_id: student.college_id,
          student_email: student.student_email
        }
      );

      return student;

    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.error(
          `${LOG.TRANSACTION_PREFIX} Rollback failed`,
          { error: rollbackErr.message }
        );
      }

      logger.error(
        `${LOG.TRANSACTION_PREFIX} Student registration failed`,
        {
          error: err.message,
          code: err.code,
          college_id
        }
      );

      if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
        throw new Error('Email already exists');
      }

      if (err.code === DB_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
        throw new Error('Invalid college reference');
      }

      throw err;

    } finally {
      client.release();
    }
  }

  /**
   * Bulk register students
   * 
   * @param {Array} students - Array of student objects
   * @param {string} collegeId - College ID
   * @returns {Object} { success, failed }
   */
  async bulkRegisterStudents(students, collegeId) {
    const mainPool = getMainPool();

    logger.debug(
      `${LOG.TRANSACTION_PREFIX} Starting bulk student registration`,
      { college_id: collegeId, total_students: students.length }
    );

    const success = [];
    const failed = [];

    for (const student of students) {
      try {
        const result = await this.registerStudent({
          college_id: collegeId,
          student_name: student.student_name,
          student_email: student.student_email,
          student_password: student.student_password,
          student_department: student.student_department,
          student_year: student.student_year
        });

        success.push({
          student_id: result.student_id,
          student_email: result.student_email,
          student_name: result.student_name
        });

      } catch (err) {
        failed.push({
          student_email: student.student_email,
          error: err.message
        });

        logger.warn(
          `${LOG.TRANSACTION_PREFIX} Failed to register student in bulk`,
          {
            student_email: student.student_email,
            error: err.message,
            college_id: collegeId
          }
        );
      }
    }

    logger.info(
      `${LOG.TRANSACTION_PREFIX} Bulk registration completed`,
      {
        college_id: collegeId,
        success_count: success.length,
        failed_count: failed.length
      }
    );

    return { success, failed };
  }

  /**
   * Authenticate student
   * 
   * Single Database:
   * 1. Query student by email and college
   * 2. Verify college is active
   * 3. Verify student is active
   * 4. Verify password
   * 5. Generate token
   * 
   * @param {string} email - Student email
   * @param {string} password - Student password
   * @param {string} collegeId - College ID
   * @returns {Object} { token, student }
   * @throws {Error} If authentication fails
   */
  async authenticateStudent(email, password, collegeId) {
    const mainPool = getMainPool();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting student authentication`,
        { student_email: email, college_id: collegeId }
      );

      // ====================================================================
      // Step 1: Query student with college details
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Querying student credentials`, {
        email,
        college_id: collegeId
      });

      const studentQuery = `
        SELECT 
          s.student_id,
          s.student_email,
          s.student_password,
          s.student_name,
          s.college_id,
          s.student_status,
          c.college_id,
          c.college_status,
          c.college_name
        FROM students s
        JOIN colleges c ON s.college_id = c.college_id
        WHERE LOWER(s.student_email) = LOWER($1)
        AND s.college_id = $2
        LIMIT 1
      `;

      const { rows } = await mainPool.query(studentQuery, [email, collegeId]);

      if (!rows || rows.length === 0) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Authentication failed - student not found`,
          { email, college_id: collegeId }
        );
        throw new Error('Invalid credentials');
      }

      const studentRecord = rows[0];

      // ====================================================================
      // Step 2: Check college is active
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Checking college status`, {
        college_id: studentRecord.college_id,
        college_status: studentRecord.college_status
      });

      if (studentRecord.college_status !== STATUS.ACTIVE) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Authentication failed - college not active`,
          {
            student_id: studentRecord.student_id,
            college_id: studentRecord.college_id
          }
        );
        throw new Error('College is inactive');
      }

      // ====================================================================
      // Step 3: Check student is active
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Checking student status`, {
        student_id: studentRecord.student_id,
        student_status: studentRecord.student_status
      });

      if (studentRecord.student_status !== STATUS.ACTIVE) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Authentication failed - student not active`,
          {
            student_id: studentRecord.student_id,
            student_status: studentRecord.student_status
          }
        );
        throw new Error('Student account is inactive');
      }

      // ====================================================================
      // Step 4: Validate password
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Validating password`, {
        student_id: studentRecord.student_id
      });

      const passwordMatch = await passwordHelper.compare(
        password,
        studentRecord.student_password
      );

      if (!passwordMatch) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Authentication failed - invalid password`,
          { student_id: studentRecord.student_id, email }
        );
        throw new Error('Invalid credentials');
      }

      // ====================================================================
      // Step 5: Generate JWT token
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Generating JWT token`, {
        student_id: studentRecord.student_id
      });

      const studentToken = jwtHelper.sign({
        id: studentRecord.student_id,
        role: 'student',
        email: studentRecord.student_email,
        college_id: studentRecord.college_id,
        timestamp: Date.now()
      });

      logger.info(
        `${LOG.TRANSACTION_PREFIX} Student authenticated successfully`,
        {
          student_id: studentRecord.student_id,
          college_id: studentRecord.college_id
        }
      );

      return {
        token: studentToken,
        student: {
          student_id: studentRecord.student_id,
          student_email: studentRecord.student_email,
          student_name: studentRecord.student_name,
          college_id: studentRecord.college_id
        }
      };

    } catch (err) {
      logger.error(
        `${LOG.TRANSACTION_PREFIX} Student authentication failed`,
        { error: err.message, email, college_id: collegeId }
      );

      throw err;
    }
  }

  /**
   * Update student password
   * 
   * @param {string} studentId - Student ID
   * @param {string} oldPassword - Current password
   * @param {string} newPassword - New password
   * @throws {Error} If password verification fails
   */
  async updatePassword(studentId, oldPassword, newPassword) {
    const mainPool = getMainPool();
    const client = await mainPool.connect();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting password update`,
        { student_id: studentId }
      );

      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // ====================================================================
      // Step 1: Get student's current password
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Fetching student password hash`, {
        student_id: studentId
      });

      const studentQuery = `
        SELECT student_id, student_password, student_status
        FROM students
        WHERE student_id = $1
        LIMIT 1
      `;

      const studentResult = await client.query(studentQuery, [studentId]);

      if (!studentResult.rows.length) {
        await client.query('ROLLBACK');
        throw new Error('Student not found');
      }

      const student = studentResult.rows[0];

      // ====================================================================
      // Step 2: Verify old password
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Verifying old password`, {
        student_id: studentId
      });

      const passwordMatch = await passwordHelper.compare(
        oldPassword,
        student.student_password
      );

      if (!passwordMatch) {
        await client.query('ROLLBACK');
        logger.warn(
          `${LOG.SECURITY_PREFIX} Password update failed - invalid old password`,
          { student_id: studentId }
        );
        throw new Error('Invalid old password');
      }

      // ====================================================================
      // Step 3: Hash new password
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Hashing new password`);

      const hashedNewPassword = await passwordHelper.hashPassword(newPassword);

      // ====================================================================
      // Step 4: Update password
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Updating password`, {
        student_id: studentId
      });

      const updateQuery = `
        UPDATE students
        SET student_password = $1, updated_at = NOW()
        WHERE student_id = $2
        RETURNING student_id
      `;

      await client.query(updateQuery, [hashedNewPassword, studentId]);

      await client.query('COMMIT');

      logger.info(
        `${LOG.TRANSACTION_PREFIX} Password updated successfully`,
        { student_id: studentId }
      );

    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.error(
          `${LOG.TRANSACTION_PREFIX} Rollback failed`,
          { error: rollbackErr.message }
        );
      }

      logger.error(
        `${LOG.TRANSACTION_PREFIX} Password update failed`,
        {
          error: err.message,
          student_id: studentId
        }
      );

      throw err;

    } finally {
      client.release();
    }
  }

  /**
   * Update student profile (admin/teacher)
   * 
   * @param {string} studentId - Student ID
   * @param {string} collegeId - College ID (for isolation)
   * @param {Object} data - { student_name, student_department, student_year, student_status }
   * @returns {Object} Updated student
   * @throws {Error} If not found or access denied
   */
  async checkAndUpdateProfileCompletion(studentId, collegeId) {
    const pool = getMainPool();

    const personal = await pool.query(
      `SELECT 1 FROM student_personal_information
       WHERE student_id = $1 AND college_id = $2`,
      [studentId, collegeId]
    );

    const academic = await pool.query(
      `SELECT 1 FROM student_academic_information
       WHERE student_id = $1 AND college_id = $2`,
      [studentId, collegeId]
    );

    const skills = await pool.query(
      `SELECT 1 FROM student_skill_information
       WHERE student_id = $1 AND college_id = $2`,
      [studentId, collegeId]
    );

    const missing = [];
    if (!personal.rows.length) missing.push('personal');
    if (!academic.rows.length) missing.push('academic');
    if (!skills.rows.length) missing.push('skills');

    await pool.query(
      `UPDATE students
       SET profile_complete = $1, updated_at = NOW()
       WHERE student_id = $2 AND college_id = $3`,
      [missing.length === 0, studentId, collegeId]
    );

    return {
      profile_complete: missing.length === 0,
      missing
    };
  }

  /**
   * ==========================================================================
   * GET PROFILE STATUS
   * ==========================================================================
   */
  async getProfileStatus(studentId, collegeId) {
    return this.checkAndUpdateProfileCompletion(studentId, collegeId);
  }

  /**
   * ==========================================================================
   * UPSERT PERSONAL INFORMATION
   * ==========================================================================
   */
  async insertPersonalInfo(studentId, collegeId, data,studentEmail) {
    const pool = getMainPool();

    const exists = await pool.query(
      `SELECT 1 FROM student_personal_information WHERE student_id=$1 AND college_id=$2`,
      [studentId, collegeId]
    );

    if (exists.rows.length) {
      throw new Error('PERSONAL_INFO_ALREADY_FILLED');
    }

    await pool.query(
    `
    INSERT INTO student_personal_information (
      student_id, college_id,
      first_name, middle_name, last_name,
      email, mobile_number, birth_date,
      gender, aadhaar_number, caste, blood_group,
      father_name, father_mobile_number, father_occupation,
      mother_name, mother_mobile_number, mother_occupation,
      city, district, state, pincode, local_address
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
      $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
    )
    `,
    [
      studentId,
      collegeId,
      data.first_name,
      data.middle_name,
      data.last_name,
      studentEmail,              // ✅ FROM JWT
      data.mobile_number,
      data.birth_date,
      data.gender,
      data.aadhaar_number,
      data.caste,
      data.blood_group,
      data.father_name,
      data.father_mobile_number,
      data.father_occupation,
      data.mother_name,
      data.mother_mobile_number,
      data.mother_occupation,
      data.city,
      data.district,
      data.state,
      data.pincode,
      data.local_address
    ]
  );
    return this.checkAndUpdateProfileCompletion(studentId, collegeId);
  }


  /**
   * ==========================================================================
   * INSERT ACADEMIC INFORMATION (ONCE)
   * ==========================================================================
   */
async insertAcademicInfo(studentId, collegeId, data) {
  const pool = getMainPool();
  const exists = await pool.query(
    `SELECT 1 FROM student_academic_information WHERE student_id=$1 AND college_id=$2`,
    [studentId, collegeId]
  );

  if (exists.rows.length) {
    throw new Error('ACADEMIC_INFO_ALREADY_FILLED');
  }

  // ✅ Normalize gap_reason
  const gapReason =
    data.any_gap_during_education === 'yes'
      ? data.gap_reason
      : null;
try {

await pool.query(
    `
    INSERT INTO student_academic_information (
      student_id, college_id,
      prn_number, tenth_percentage,
      twelfth_or_diploma, diploma_or_12th_percentage,
      admission_based_on, department, division,
      passout_year,
      "lgName",

      sem1_cgpa, sem1_sgpa, sem1_backlog,
      sem2_cgpa, sem2_sgpa, sem2_backlog,
      sem3_cgpa, sem3_sgpa, sem3_backlog,
      sem4_cgpa, sem4_sgpa, sem4_backlog,
      sem5_cgpa, sem5_sgpa, sem5_backlog,
      sem6_cgpa, sem6_sgpa, sem6_backlog,
      sem7_cgpa, sem7_sgpa, sem7_backlog,
      sem8_cgpa, sem8_sgpa, sem8_backlog,

      overall_cgpa,
      any_live_kt,
      any_gap_during_education,
      gap_reason
    )
    VALUES (
      $1,$2,
      $3,$4,
      $5,$6,
      $7,$8,$9,
      $10,
      $11,

      $12,$13,$14,
      $15,$16,$17,
      $18,$19,$20,
      $21,$22,$23,
      $24,$25,$26,
      $27,$28,$29,
      $30,$31,$32,
      $33,$34,$35,

      $36,
      $37,
      $38,
      $39
    )
    `,
    [
      studentId,
      collegeId,
      data.prn_number,
      data.tenth_percentage,
      data.twelfth_or_diploma,
      data.diploma_or_12th_percentage,
      data.admission_based_on,
      data.department,
      data.division,
      data.passout_year,
      data.lgName,

      data.sem1_cgpa, data.sem1_sgpa, data.sem1_backlog,
      data.sem2_cgpa, data.sem2_sgpa, data.sem2_backlog,
      data.sem3_cgpa, data.sem3_sgpa, data.sem3_backlog,
      data.sem4_cgpa, data.sem4_sgpa, data.sem4_backlog,
      data.sem5_cgpa, data.sem5_sgpa, data.sem5_backlog,
      data.sem6_cgpa, data.sem6_sgpa, data.sem6_backlog,
      data.sem7_cgpa, data.sem7_sgpa, data.sem7_backlog,
      data.sem8_cgpa, data.sem8_sgpa, data.sem8_backlog,

      data.overall_cgpa,
      data.any_live_kt,
      data.any_gap_during_education,
      gapReason
    ]
  );
}
catch (err) {
 
  throw err;
}

  return this.checkAndUpdateProfileCompletion(studentId, collegeId);
}
  /**
   * ==========================================================================
   * INSERT SKILL INFORMATION (ONCE)
   * ==========================================================================
   */
  async insertSkillInfo(studentId, collegeId, data) {
    const pool = getMainPool();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting skill info insert`,
        { student_id: studentId, college_id: collegeId }
      );

      // 1️⃣ Check if skill info already exists
      const exists = await pool.query(
        `SELECT 1 FROM student_skill_information
         WHERE student_id = $1 AND college_id = $2`,
        [studentId, collegeId]
      );

      if (exists.rows.length > 0) {
        logger.warn(
          `${LOG.TRANSACTION_PREFIX} Skill info already exists`,
          { student_id: studentId, college_id: collegeId }
        );
        throw new Error('SKILL_INFO_ALREADY_FILLED');
      }

      // 2️⃣ Insert skill info
      const insertQuery = `
        INSERT INTO student_skill_information (
          student_id, college_id,

          project_title_1, project_link_1, project_description_1,
          project_title_2, project_link_2, project_description_2,

          personal_portfolio_link,
          resume_drive_link,

          github_link,
          linkedin_link,
          instagram_link,
          twitter_link,

          leetcode_link,
          geeksforgeeks_link,
          codechef_link,
          hackerrank_link,

          area_of_interest,
        
          about_you,
          profile_image
        )
        VALUES (
          $1,$2,
          $3,$4,$5,
          $6,$7,$8,
          $9,
          $10,
          $11,$12,$13,$14,
          $15,$16,$17,$18,
          $19,
          
          $20,
          $21
        )
      `;

      const values = [
        studentId,
        collegeId,

        data.project_title_1 || null,
        data.project_link_1 || null,
        data.project_description_1 || null,

        data.project_title_2 || null,
        data.project_link_2 || null,
        data.project_description_2 || null,

        data.personal_portfolio_link || null,
        data.resume_drive_link || null,

        data.github_link || null,
        data.linkedin_link || null,
        data.instagram_link || null,
        data.twitter_link || null,

        data.leetcode_link || null,
        data.geeksforgeeks_link || null,
        data.codechef_link || null,
        data.hackerrank_link || null,

        data.area_of_interest || null,
     
        data.about_you,
        data.profile_image || null
      ];

      await pool.query(insertQuery, values);

      const result = await this.checkAndUpdateProfileCompletion(studentId, collegeId);

      logger.info(
        `${LOG.TRANSACTION_PREFIX} Skill info inserted successfully`,
        { student_id: studentId, college_id: collegeId }
      );

      return result;

    } catch (err) {
   console.error('🔥 ACADEMIC INSERT FAILED 🔥');
  console.error('PG CODE:', err.code);
  console.error('PG MESSAGE:', err.message);
  console.error('DETAIL:', err.detail);
  console.error('CONSTRAINT:', err.constraint);
  throw err;

     
    }
  }

  // ========================== EDIT PROFILE INFO ==========================
async updatePersonalInfo(studentId, collegeId, data) {
  const pool = getMainPool();
  console.log('fired updatePersonalInfo with data:', data);

    const result = await pool.query(
      `
      UPDATE student_personal_information
      SET
        first_name = COALESCE($3, first_name),
        middle_name = COALESCE($4, middle_name),
        last_name = COALESCE($5, last_name),
            
        mobile_number = COALESCE($6, mobile_number),
        birth_date = COALESCE($7, birth_date),
        gender = COALESCE($8, gender),
        caste = COALESCE($9, caste),
        blood_group = COALESCE($10, blood_group),
        father_name = COALESCE($11, father_name),
        father_mobile_number = COALESCE($12, father_mobile_number),
        mother_name = COALESCE($13, mother_name),
        mother_mobile_number = COALESCE($14, mother_mobile_number),
        city = COALESCE($15, city),
        district = COALESCE($16, district),
        state = COALESCE($17, state),
        pincode = COALESCE($18, pincode),
        local_address = COALESCE($19, local_address),
        updated_at = NOW()
      WHERE student_id = $1 AND college_id = $2
      RETURNING student_id
      `,
      [
        studentId,
        collegeId,
        data.first_name,
        data.middle_name,
        data.last_name,
        
        data.mobile_number,
        data.birth_date,
        data.gender,
        data.caste,
        data.blood_group,
        data.father_name,
        data.father_mobile_number,
        data.mother_name,
        data.mother_mobile_number,
        data.city,
        data.district,
        data.state,
        data.pincode,
        data.local_address
      ]
    );

    if (!result.rows.length) {
      throw new Error('PERSONAL_INFO_NOT_FOUND');
    }

    return this.checkAndUpdateProfileCompletion(studentId, collegeId);

  
}

  // ==========================================================================
  // EDIT ACADEMIC INFORMATION
  // ==========================================================================

  async updateAcademicInfo(studentId, collegeId, data) {
    const pool = getMainPool();

    const gapReason =
      data.any_gap_during_education === "yes"
        ? data.gap_reason
        : null;

    const result = await pool.query(
    `
    UPDATE student_academic_information
    SET
      prn_number = COALESCE($3, prn_number),
      tenth_percentage = COALESCE($4, tenth_percentage),
      twelfth_or_diploma = COALESCE($5, twelfth_or_diploma),
      diploma_or_12th_percentage = COALESCE($6, diploma_or_12th_percentage),
      admission_based_on = COALESCE($7, admission_based_on),
      department = COALESCE($8, department),
      division = COALESCE($9, division),
      passout_year = COALESCE($10, passout_year),
      "lgName" = COALESCE($11, "lgName"),

      sem1_cgpa = COALESCE($12, sem1_cgpa),
      sem1_sgpa = COALESCE($13, sem1_sgpa),
      sem1_backlog = COALESCE($14, sem1_backlog),

      sem2_cgpa = COALESCE($15, sem2_cgpa),
      sem2_sgpa = COALESCE($16, sem2_sgpa),
      sem2_backlog = COALESCE($17, sem2_backlog),

      sem3_cgpa = COALESCE($18, sem3_cgpa),
      sem3_sgpa = COALESCE($19, sem3_sgpa),
      sem3_backlog = COALESCE($20, sem3_backlog),

      sem4_cgpa = COALESCE($21, sem4_cgpa),
      sem4_sgpa = COALESCE($22, sem4_sgpa),
      sem4_backlog = COALESCE($23, sem4_backlog),

      sem5_cgpa = COALESCE($24, sem5_cgpa),
      sem5_sgpa = COALESCE($25, sem5_sgpa),
      sem5_backlog = COALESCE($26, sem5_backlog),

      sem6_cgpa = COALESCE($27, sem6_cgpa),
      sem6_sgpa = COALESCE($28, sem6_sgpa),
      sem6_backlog = COALESCE($29, sem6_backlog),

      sem7_cgpa = COALESCE($30, sem7_cgpa),
      sem7_sgpa = COALESCE($31, sem7_sgpa),
      sem7_backlog = COALESCE($32, sem7_backlog),

      sem8_cgpa = COALESCE($33, sem8_cgpa),
      sem8_sgpa = COALESCE($34, sem8_sgpa),
      sem8_backlog = COALESCE($35, sem8_backlog),

      overall_cgpa = COALESCE($36, overall_cgpa),
      any_live_kt = COALESCE($37, any_live_kt),
      any_gap_during_education = COALESCE($38, any_gap_during_education),
      gap_reason = COALESCE($39, gap_reason),

      updated_at = NOW()

    WHERE student_id = $1 AND college_id = $2
    RETURNING student_id
    `,
    [
      studentId,
      collegeId,
      data.prn_number,
      data.tenth_percentage,
      data.twelfth_or_diploma,
      data.diploma_or_12th_percentage,
      data.admission_based_on,
      data.department,
      data.division,
      data.passout_year,
      data.lgName,

      data.sem1_cgpa, data.sem1_sgpa, data.sem1_backlog,
      data.sem2_cgpa, data.sem2_sgpa, data.sem2_backlog,
      data.sem3_cgpa, data.sem3_sgpa, data.sem3_backlog,
      data.sem4_cgpa, data.sem4_sgpa, data.sem4_backlog,
      data.sem5_cgpa, data.sem5_sgpa, data.sem5_backlog,
      data.sem6_cgpa, data.sem6_sgpa, data.sem6_backlog,
      data.sem7_cgpa, data.sem7_sgpa, data.sem7_backlog,
      data.sem8_cgpa, data.sem8_sgpa, data.sem8_backlog,

      data.overall_cgpa,
      data.any_live_kt,
      data.any_gap_during_education,
      gapReason
    ]
  );
    if (!result.rows.length) {
      throw new Error('ACADEMIC_INFO_NOT_FOUND');
    }

    return this.checkAndUpdateProfileCompletion(studentId, collegeId);
  }

  // ==========================================================================
  // EDIT SKILL INFORMATION
  // ==========================================================================
  async updateSkillInfo(studentId, collegeId, data) {
    const pool = getMainPool();

   const result = await pool.query(
  `
  UPDATE student_skill_information
  SET
    project_title_1 = COALESCE($3, project_title_1),
    project_link_1 = COALESCE($4, project_link_1),
    project_description_1 = COALESCE($5, project_description_1),

    project_title_2 = COALESCE($6, project_title_2),
    project_link_2 = COALESCE($7, project_link_2),
    project_description_2 = COALESCE($8, project_description_2),

    personal_portfolio_link = COALESCE($9, personal_portfolio_link),
    resume_drive_link = COALESCE($10, resume_drive_link),

    github_link = COALESCE($11, github_link),
    linkedin_link = COALESCE($12, linkedin_link),
    instagram_link = COALESCE($13, instagram_link),
    twitter_link = COALESCE($14, twitter_link),

    leetcode_link = COALESCE($15, leetcode_link),
    geeksforgeeks_link = COALESCE($16, geeksforgeeks_link),
    codechef_link = COALESCE($17, codechef_link),
    hackerrank_link = COALESCE($18, hackerrank_link),

    area_of_interest = COALESCE($19, area_of_interest),
    about_you = COALESCE($20, about_you),
    profile_image = COALESCE($21, profile_image),

    updated_at = NOW()
  WHERE student_id = $1 AND college_id = $2
  RETURNING student_id
  `,
  [
    studentId,
    collegeId,
    data.project_title_1,
    data.project_link_1,
    data.project_description_1,
    data.project_title_2,
    data.project_link_2,
    data.project_description_2,
    data.personal_portfolio_link,
    data.resume_drive_link,
    data.github_link,
    data.linkedin_link,
    data.instagram_link,
    data.twitter_link,
    data.leetcode_link,
    data.geeksforgeeks_link,
    data.codechef_link,
    data.hackerrank_link,
    data.area_of_interest,
    data.about_you,
    data.profile_image
  ]
);


    if (!result.rows.length) {
      throw new Error('SKILL_INFO_NOT_FOUND');
    }

    return this.checkAndUpdateProfileCompletion(studentId, collegeId);
  }

  // ==========================================================================
  // GET PERSONAL INFORMATION
  // ==========================================================================
  async getStudentPersonalInfo(studentId, collegeId) {
    const pool = getMainPool();

    const { rows } = await pool.query(
      `SELECT * FROM student_personal_information
       WHERE student_id = $1 AND college_id = $2
       LIMIT 1`,
      [studentId, collegeId]
    );

    if (!rows.length) {
      throw new Error('PERSONAL_INFO_NOT_FOUND');
    }

    return rows[0];
  }


async getStudentAcademicInfo(studentId, collegeId) {
  const pool = getMainPool();

  const { rows } = await pool.query(
    `
    SELECT *
    FROM student_academic_information
    WHERE student_id = $1 AND college_id = $2
    LIMIT 1
    `,
    [studentId, collegeId]
  );

  if (!rows.length) {
    throw new Error('ACADEMIC_INFO_NOT_FOUND');
  }

  return rows[0];
}
async getStudentSkillInfo(studentId, collegeId){

  const pool = getMainPool()

  const {rows} = await pool.query(
    `
    SELECT * FROM student_skill_information
    WHERE student_id = $1 AND college_id = $2
    LIMIT 1 `,
    [studentId,collegeId]
  )
  if(!rows.length){
    throw new Error('SKILL_INFO_NOT_FOUND');
  }
  return rows[0]
}
}

module.exports = new StudentService();