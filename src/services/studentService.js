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
   * API 1: Upsert Profile & Return Full Data
   * Handles Personal, Academic, Skill Links, and Rated Skills
   */
  async upsertStudentProfile(studentId, collegeId, email, data) {
    const pool = getMainPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN'); // Start Transaction

      logger.debug(`${LOG.TRANSACTION_PREFIX} Start Upsert Profile`, { student_id: studentId });

      // ---------------------------------------------------------
      // 1. Upsert Personal Info
      // ---------------------------------------------------------
      if (data.personal_info) {
        const p = data.personal_info;
        const personalQuery = `
          INSERT INTO student_personal_information (
            student_id, college_id, first_name, middle_name, last_name, email, mobile_number,
            birth_date, gender, aadhaar_number, caste, blood_group, father_name,
            father_mobile_number, father_occupation, mother_name, mother_mobile_number,
            mother_occupation, city, district, state, pincode, local_address, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW()
          )
          ON CONFLICT (student_id) DO UPDATE SET
            first_name = EXCLUDED.first_name, middle_name = EXCLUDED.middle_name, last_name = EXCLUDED.last_name,
            mobile_number = EXCLUDED.mobile_number, birth_date = EXCLUDED.birth_date, gender = EXCLUDED.gender,
            aadhaar_number = EXCLUDED.aadhaar_number, caste = EXCLUDED.caste, blood_group = EXCLUDED.blood_group,
            father_name = EXCLUDED.father_name, father_mobile_number = EXCLUDED.father_mobile_number,
            father_occupation = EXCLUDED.father_occupation, mother_name = EXCLUDED.mother_name,
            mother_mobile_number = EXCLUDED.mother_mobile_number, mother_occupation = EXCLUDED.mother_occupation,
            city = EXCLUDED.city, district = EXCLUDED.district, state = EXCLUDED.state,
            pincode = EXCLUDED.pincode, local_address = EXCLUDED.local_address, updated_at = NOW()
        `;
        await client.query(personalQuery, [
            studentId, collegeId, p.first_name, p.middle_name, p.last_name, email, p.mobile_number,
            p.birth_date, p.gender, p.aadhaar_number, p.caste, p.blood_group, p.father_name,
            p.father_mobile_number, p.father_occupation, p.mother_name, p.mother_mobile_number,
            p.mother_occupation, p.city, p.district, p.state, p.pincode, p.local_address
        ]);
      }

      // ---------------------------------------------------------
      // 2. Upsert Academic Info
      // ---------------------------------------------------------
      if (data.academic_info) {
        const a = data.academic_info;
        // Normalize gap reason
        const gapReason = (a.any_gap_during_education === 'Yes' || a.any_gap_during_education === 'true') ? a.gap_reason : null;

        const academicQuery = `
          INSERT INTO student_academic_information (
            student_id, college_id, prn_number, tenth_percentage, twelfth_or_diploma, diploma_or_12th_percentage,
            admission_based_on, department, division, "lgName", passout_year,
            sem1_cgpa, sem1_backlog, sem2_cgpa, sem2_backlog, sem3_cgpa, sem3_backlog,
            sem4_cgpa, sem4_backlog, sem5_cgpa, sem5_backlog, sem6_cgpa, sem6_backlog,
            sem7_cgpa, sem7_backlog, sem8_cgpa, sem8_backlog, overall_cgpa, any_live_kt,
            any_gap_during_education, gap_reason, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
            $28, $29, $30, $31, NOW()
          )
          ON CONFLICT (student_id) DO UPDATE SET
            prn_number = EXCLUDED.prn_number, tenth_percentage = EXCLUDED.tenth_percentage,
            twelfth_or_diploma = EXCLUDED.twelfth_or_diploma, diploma_or_12th_percentage = EXCLUDED.diploma_or_12th_percentage,
            admission_based_on = EXCLUDED.admission_based_on, department = EXCLUDED.department,
            division = EXCLUDED.division, "lgName" = EXCLUDED."lgName", passout_year = EXCLUDED.passout_year,
            sem1_cgpa = EXCLUDED.sem1_cgpa, sem1_backlog = EXCLUDED.sem1_backlog,
            sem2_cgpa = EXCLUDED.sem2_cgpa, sem2_backlog = EXCLUDED.sem2_backlog,
            sem3_cgpa = EXCLUDED.sem3_cgpa, sem3_backlog = EXCLUDED.sem3_backlog,
            sem4_cgpa = EXCLUDED.sem4_cgpa, sem4_backlog = EXCLUDED.sem4_backlog,
            sem5_cgpa = EXCLUDED.sem5_cgpa, sem5_backlog = EXCLUDED.sem5_backlog,
            sem6_cgpa = EXCLUDED.sem6_cgpa, sem6_backlog = EXCLUDED.sem6_backlog,
            sem7_cgpa = EXCLUDED.sem7_cgpa, sem7_backlog = EXCLUDED.sem7_backlog,
            sem8_cgpa = EXCLUDED.sem8_cgpa, sem8_backlog = EXCLUDED.sem8_backlog,
            overall_cgpa = EXCLUDED.overall_cgpa, any_live_kt = EXCLUDED.any_live_kt,
            any_gap_during_education = EXCLUDED.any_gap_during_education, gap_reason = EXCLUDED.gap_reason,
            updated_at = NOW()
        `;
        
        await client.query(academicQuery, [
           studentId, collegeId, a.prn_number, a.tenth_percentage, a.twelfth_or_diploma, a.diploma_or_12th_percentage,
           a.admission_based_on, a.department, a.division, a.lgName, a.passout_year,
           a.sem1_cgpa, a.sem1_backlog, a.sem2_cgpa, a.sem2_backlog, a.sem3_cgpa, a.sem3_backlog,
           a.sem4_cgpa, a.sem4_backlog, a.sem5_cgpa, a.sem5_backlog, a.sem6_cgpa, a.sem6_backlog,
           a.sem7_cgpa, a.sem7_backlog, a.sem8_cgpa, a.sem8_backlog,
           a.overall_cgpa, a.any_live_kt, a.any_gap_during_education, gapReason
        ]);
      }

      // ---------------------------------------------------------
      // 3. Upsert Skill Links (Info)
      // ---------------------------------------------------------
      if (data.skill_links) {
        const s = data.skill_links;
        const skillLinksQuery = `
          INSERT INTO student_skill_information (
            student_id, college_id, project_title_1, project_link_1, project_description_1,
            project_title_2, project_link_2, project_description_2, personal_portfolio_link,
            resume_drive_link, github_link, linkedin_link, instagram_link, twitter_link,
            leetcode_link, geeksforgeeks_link, codechef_link, hackerrank_link,
            area_of_interest, about_you, profile_image, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW()
          )
          ON CONFLICT (student_id) DO UPDATE SET
            project_title_1 = EXCLUDED.project_title_1, project_link_1 = EXCLUDED.project_link_1,
            project_description_1 = EXCLUDED.project_description_1, project_title_2 = EXCLUDED.project_title_2,
            project_link_2 = EXCLUDED.project_link_2, project_description_2 = EXCLUDED.project_description_2,
            personal_portfolio_link = EXCLUDED.personal_portfolio_link, resume_drive_link = EXCLUDED.resume_drive_link,
            github_link = EXCLUDED.github_link, linkedin_link = EXCLUDED.linkedin_link,
            instagram_link = EXCLUDED.instagram_link, twitter_link = EXCLUDED.twitter_link,
            leetcode_link = EXCLUDED.leetcode_link, geeksforgeeks_link = EXCLUDED.geeksforgeeks_link,
            codechef_link = EXCLUDED.codechef_link, hackerrank_link = EXCLUDED.hackerrank_link,
            area_of_interest = EXCLUDED.area_of_interest, about_you = EXCLUDED.about_you,
            profile_image = EXCLUDED.profile_image, updated_at = NOW()
        `;
        await client.query(skillLinksQuery, [
            studentId, collegeId, s.project_title_1, s.project_link_1, s.project_description_1,
            s.project_title_2, s.project_link_2, s.project_description_2, s.personal_portfolio_link,
            s.resume_drive_link, s.github_link, s.linkedin_link, s.instagram_link, s.twitter_link,
            s.leetcode_link, s.geeksforgeeks_link, s.codechef_link, s.hackerrank_link,
            s.area_of_interest, s.about_you, s.profile_image
        ]);
      }

      // ---------------------------------------------------------
      // 4. Upsert Rated Skills
      // ---------------------------------------------------------
      if (data.rated_skills && Array.isArray(data.rated_skills)) {
        // Iterate through skills and upsert each
        const skillQuery = `
          INSERT INTO student_skills (student_id, college_id, skill_id, rating, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (student_id, skill_id) 
          DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()
        `;

        for (const skill of data.rated_skills) {
          await client.query(skillQuery, [studentId, collegeId, skill.skill_id, skill.rating]);
        }
      }

      // ---------------------------------------------------------
      // 5. Update Profile Completion Status
      // ---------------------------------------------------------
      // Check if all tables have data
      const checkCompletion = `
        UPDATE students SET profile_complete = (
          EXISTS(SELECT 1 FROM student_personal_information WHERE student_id = $1) AND
          EXISTS(SELECT 1 FROM student_academic_information WHERE student_id = $1) AND
          EXISTS(SELECT 1 FROM student_skill_information WHERE student_id = $1)
        ), updated_at = NOW()
        WHERE student_id = $1
        RETURNING profile_complete
      `;
      const completionRes = await client.query(checkCompletion, [studentId]);
      
      await client.query('COMMIT');
      
      // ---------------------------------------------------------
      // 6. Fetch Full Data for Response
      // ---------------------------------------------------------
      return await this.fetchFullProfile(studentId, collegeId, completionRes.rows[0]?.profile_complete);

    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Fetch all data and structure strictly as requested
   */
  async fetchFullProfile(studentId, collegeId, profileCompleteStatus = null) {
    const pool = getMainPool();

    // Parallel fetch for speed
    const [student, personal, academic, skillInfo, ratedSkills] = await Promise.all([
      pool.query('SELECT * FROM students WHERE student_id = $1 AND college_id = $2', [studentId, collegeId]),
      pool.query('SELECT * FROM student_personal_information WHERE student_id = $1 AND college_id = $2', [studentId, collegeId]),
      pool.query('SELECT * FROM student_academic_information WHERE student_id = $1 AND college_id = $2', [studentId, collegeId]),
      pool.query('SELECT * FROM student_skill_information WHERE student_id = $1 AND college_id = $2', [studentId, collegeId]),
      pool.query(`
        SELECT ss.student_skill_id, ss.rating, s.skill_id, s.skill_name 
        FROM student_skills ss
        JOIN skills s ON ss.skill_id = s.skill_id
        WHERE ss.student_id = $1 AND ss.college_id = $2
      `, [studentId, collegeId])
    ]);

    // Determine completion if not provided
    let isComplete = profileCompleteStatus;
    if (isComplete === null && student.rows[0]) {
      isComplete = student.rows[0].profile_complete;
    }

    // Structure exact response requested
    return {
      student_id: studentId,
      college_id: collegeId,
      profile_complete: isComplete || false,
      profile_Data: {
        Studentinfo: student.rows[0] || {},
        "Student_personal_information": personal.rows[0] || {},
        "student_academic_information": academic.rows[0] || {},
        "student_skills_information": skillInfo.rows[0] || {},
        "Student_skills": ratedSkills.rows || []
      }
    };
  }

  /**
   * API 2: Add New Master Skill
   */
  async createMasterSkill(skillName) {
    const pool = getMainPool();
    
    try {
      const result = await pool.query(
        'INSERT INTO skills (skill_name) VALUES ($1) ON CONFLICT (lower(skill_name)) DO NOTHING RETURNING *',
        [skillName]
      );

      // If inserted, return new. If conflict (dup), fetch existing.
      if (result.rows.length > 0) {
        return result.rows[0];
      } else {
        const existing = await pool.query('SELECT * FROM skills WHERE lower(skill_name) = lower($1)', [skillName]);
        return existing.rows[0];
      }
    } catch (err) {
      throw err;
    }
  }
}

module.exports = new StudentService();