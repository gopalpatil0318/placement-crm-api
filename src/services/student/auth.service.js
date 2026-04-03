/**
 * ============================================================================
 * STUDENT AUTH SERVICE — Authentication & Password Management
 * ============================================================================
 * Functions:
 *   - loginStudent(email, password)
 *   - forgotPassword(email)
 *   - changePassword(studentId, collegeId, currentPassword, newPassword)
 *
 * All queries scope to the students table (separate from users table).
 * JWT payload: { id: student_id, college_id, role: 'student', dept_id }
 * ============================================================================
 */

const { query } = require('../../config/db');
const { generateToken, verifyToken } = require('../../utils/jwtHelper');
const { hashPassword, comparePassword } = require('../../utils/passwordHelper');
const { sendEmail } = require('../../utils/emailHelper');
const config = require('../../config/env');
const logger = require('../../config/logger');
const {
    LOG,
    STATUS,
    ERROR_MESSAGES,
} = require('../../config/constants');

// Student role constant (matches authMiddleware.js)
const STUDENT_ROLE = 'student';

// ============================================================================
// 1. LOGIN
// ============================================================================

async function loginStudent(email, password) {
    // 1. Find student by email (join colleges for status check)
    const result = await query(
        `SELECT
           s.student_id, s.first_name, s.middle_name, s.last_name,
           s.student_email, s.student_password, s.student_status,
           s.college_id, s.dept_id, s.student_passout_year,
           s.profile_complete, s.profile_is_approved,
           c.college_name, c.college_status, c.default_academic_year,
           d.dept_name
         FROM students s
         JOIN colleges c ON s.college_id = c.college_id
         JOIN departments d ON s.dept_id = d.dept_id
         WHERE LOWER(s.student_email) = LOWER($1)
         LIMIT 1`,
        [email]
    );

    if (!result.rows.length) {
        logger.warn(`${LOG.SECURITY} Student login failed — email not found`, { email });
        throw Object.assign(new Error(ERROR_MESSAGES.INVALID_CREDENTIALS), { status: 401 });
    }

    const student = result.rows[0];

    // 2. College must be active
    if (student.college_status !== STATUS.ACTIVE) {
        logger.warn(`${LOG.SECURITY} Student login blocked — college inactive`, {
            email, collegeId: student.college_id,
        });
        throw Object.assign(
            new Error(ERROR_MESSAGES.COLLEGE_INACTIVE),
            { status: 403 }
        );
    }

    // 3. Student must be active
    if (student.student_status !== STATUS.ACTIVE) {
        logger.warn(`${LOG.SECURITY} Student login blocked — student inactive`, {
            email, status: student.student_status,
        });

        // Give status-specific messages
        const statusMessages = {
            inactive: 'Your account has been deactivated. Please contact your college administrator',
            suspended: 'Your account has been suspended. Please contact your college administrator',
            graduated: 'Your account is marked as graduated. Please contact your college administrator if you need access',
            dropout: 'Your account is no longer active. Please contact your college administrator',
        };

        const message = statusMessages[student.student_status] || ERROR_MESSAGES.ACCOUNT_INACTIVE;
        throw Object.assign(new Error(message), { status: 403 });
    }

    // 4. Verify password
    const passwordValid = await comparePassword(password, student.student_password);
    if (!passwordValid) {
        logger.warn(`${LOG.SECURITY} Student login failed — wrong password`, { email });
        throw Object.assign(new Error(ERROR_MESSAGES.INVALID_CREDENTIALS), { status: 401 });
    }

    // 5. Generate JWT (role = 'student' so authMiddleware queries students table)
    const token = generateToken({
        id: student.student_id,
        college_id: student.college_id,
        role: STUDENT_ROLE,
        dept_id: student.dept_id,
    });

    logger.info(`${LOG.AUTH} Student logged in`, {
        studentId: student.student_id,
        collegeId: student.college_id,
    });

    // 6. Return token + student data (never return password)
    return {
        token,
        student: {
            student_id: student.student_id,
            first_name: student.first_name,
            middle_name: student.middle_name,
            last_name: student.last_name,
            student_email: student.student_email,
            college_id: student.college_id,
            college_name: student.college_name,
            dept_id: student.dept_id,
            dept_name: student.dept_name,
            student_passout_year: student.student_passout_year,
            student_status: student.student_status,
            profile_complete: student.profile_complete,
            profile_is_approved: student.profile_is_approved,
            default_academic_year: student.default_academic_year,
        },
    };
}

// ============================================================================
// 2. FORGOT PASSWORD
// ============================================================================

async function forgotPassword(email) {
    // 1. Find student by email
    const result = await query(
        `SELECT s.student_id, s.first_name, s.last_name,
                s.student_email, s.student_status,
                c.college_status
         FROM students s
         JOIN colleges c ON s.college_id = c.college_id
         WHERE LOWER(s.student_email) = LOWER($1)
         LIMIT 1`,
        [email]
    );

    // Always return success to prevent email enumeration
    if (!result.rows.length) {
        logger.info(`${LOG.AUTH} Student forgot password — email not found (silent)`, { email });
        return { message: 'If an account with this email exists, you will receive a password reset link' };
    }

    const student = result.rows[0];

    // 2. Generate reset token (15 min expiry)
    const resetToken = generateToken(
        { id: student.student_id, purpose: 'password_reset', type: STUDENT_ROLE },
        { expiresIn: '15m' }
    );

    const resetUrl = `${config.frontendUrl}/student/reset-password?token=${resetToken}`;
    const studentName = `${student.first_name} ${student.last_name}`;

    // 3. Send reset email (non-blocking — don't delay response for SMTP)
    sendEmail({
        to: student.student_email,
        subject: 'Reset Your Password — Placement CRM',
        text: [
            `Hi ${studentName},`,
            '',
            'You requested a password reset for your Placement CRM student account.',
            '',
            'Click the link below to reset your password (valid for 15 minutes):',
            resetUrl,
            '',
            'If you did not request this, please ignore this email.',
            '',
            'Regards,',
            'Placement CRM Team',
        ].join('\n'),
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Reset Your Password</h2>
                <p>Hi <strong>${studentName}</strong>,</p>
                <p>You requested a password reset for your Placement CRM student account.</p>
                <p>Click the button below to reset your password (valid for <strong>15 minutes</strong>):</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-size: 16px;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #666; font-size: 13px;">Or copy and paste this link into your browser:</p>
                <p style="color: #4F46E5; font-size: 13px; word-break: break-all;">${resetUrl}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
            </div>
        `,
    }).catch((err) => {
        logger.error(`${LOG.AUTH} Failed to send student password reset email`, {
            studentId: student.student_id, email: student.student_email, error: err.message,
        });
    });

    logger.info(`${LOG.AUTH} Student password reset email queued`, {
        studentId: student.student_id, email: student.student_email,
    });

    return { message: 'If an account with this email exists, you will receive a password reset link' };
}

// ============================================================================
// 3. CHANGE PASSWORD
// ============================================================================

async function changePassword(studentId, collegeId, currentPassword, newPassword) {
    // 1. Get student's current password hash
    const result = await query(
        `SELECT student_id, first_name, last_name, student_email, student_password
         FROM students
         WHERE student_id = $1 AND college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const student = result.rows[0];

    // 2. Verify current password
    const currentValid = await comparePassword(currentPassword, student.student_password);
    if (!currentValid) {
        throw Object.assign(new Error('Current password is incorrect'), { status: 401 });
    }

    // 3. Hash new password and update
    const hashedNew = await hashPassword(newPassword);

    await query(
        `UPDATE students
         SET student_password = $1, updated_at = NOW()
         WHERE student_id = $2 AND college_id = $3`,
        [hashedNew, studentId, collegeId]
    );

    logger.info(`${LOG.AUTH} Student password changed`, { studentId, collegeId });

    return {
        student_id: student.student_id,
        student_name: `${student.first_name} ${student.last_name}`,
        student_email: student.student_email,
    };
}

// ============================================================================
// 4. RESET PASSWORD (from email link)
// ============================================================================

async function resetPassword(token, newPassword) {
    const payload = verifyToken(token);
    if (!payload?.purpose || payload.purpose !== 'password_reset' || payload.type !== STUDENT_ROLE) {
        throw Object.assign(
            new Error('Password reset link is invalid or has expired'),
            { status: 400 }
        );
    }

    const result = await query(
        `SELECT student_id, first_name, last_name, student_email
         FROM students
         WHERE student_id = $1
         LIMIT 1`,
        [payload.id]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const student = result.rows[0];
    const hashedNew = await hashPassword(newPassword);

    await query(
        `UPDATE students
         SET student_password = $1, updated_at = NOW()
         WHERE student_id = $2`,
        [hashedNew, student.student_id]
    );

    logger.info(`${LOG.AUTH} Student password reset successful`, {
        studentId: student.student_id,
    });

    return { student_email: student.student_email };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    loginStudent,
    forgotPassword,
    changePassword,
    resetPassword,
};
