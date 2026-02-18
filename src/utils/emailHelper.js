/**
 * ============================================================================
 * EMAIL HELPER — Nodemailer with Dev/Prod Switching
 * ============================================================================
 *
 * DEVELOPMENT (NODE_ENV !== 'production'):
 *   → Logs the email to console/logger (no SMTP needed)
 *   → You can see the full email content in your terminal
 *
 * PRODUCTION (NODE_ENV === 'production'):
 *   → Sends real emails via SMTP (Gmail, SendGrid, AWS SES, etc.)
 *   → Requires SMTP_* env vars to be set
 *
 * NO CODE CHANGES needed when switching environments — it's all
 * driven by NODE_ENV and the SMTP_* environment variables.
 * ============================================================================
 */

const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../config/logger');
const { LOG } = require('../config/constants');

// ============================================================================
// CREATE TRANSPORTER (once at module load)
// ============================================================================

let transporter;

if (config.isProd) {
    // -----------------------------------------------------------------
    // PRODUCTION: Real SMTP transporter
    // -----------------------------------------------------------------
    transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465, // true for port 465, false for 587
        auth: {
            user: config.smtpUser,
            pass: config.smtpPass,
        },
    });

    // Verify SMTP connection on startup
    transporter.verify()
        .then(() => logger.info(`${LOG.STARTUP} ✅ SMTP connection verified`))
        .catch((err) => logger.error(`${LOG.STARTUP} ❌ SMTP verification failed`, {
            error: err.message,
        }));
} else {
    // -----------------------------------------------------------------
    // DEVELOPMENT: No real SMTP — just log emails to console
    // -----------------------------------------------------------------
    transporter = {
        sendMail: async (mailOptions) => {
            logger.info(`${LOG.AUTH} 📧 [DEV EMAIL] — Not actually sent`, {
                to: mailOptions.to,
                subject: mailOptions.subject,
            });

            console.log('\n' + '='.repeat(60));
            console.log('📧  DEV EMAIL (not actually sent)');
            console.log('='.repeat(60));
            console.log(`  To:      ${mailOptions.to}`);
            console.log(`  Subject: ${mailOptions.subject}`);
            console.log(`  Body:`);
            console.log('  ' + '-'.repeat(56));
            // Show text version for readability
            if (mailOptions.text) {
                console.log(`  ${mailOptions.text}`);
            }
            console.log('='.repeat(60) + '\n');

            return { messageId: `dev-${Date.now()}@localhost` };
        },
    };
}

// ============================================================================
// sendEmail() — The only function consumers need
// ============================================================================

/**
 * Send an email.
 * In dev: logs to console. In prod: sends via SMTP.
 *
 * @param {{ to: string, subject: string, text?: string, html?: string }} options
 * @returns {Promise<{ messageId: string }>}
 */
async function sendEmail({ to, subject, text, html }) {
    try {
        const result = await transporter.sendMail({
            from: config.smtpFrom || `"Placement CRM" <noreply@placementcrm.com>`,
            to,
            subject,
            text,
            html,
        });

        logger.info(`${LOG.AUTH} Email sent`, {
            to,
            subject,
            messageId: result.messageId,
            mode: config.isProd ? 'production' : 'development',
        });

        return result;
    } catch (err) {
        logger.error(`${LOG.AUTH} Email send failed`, {
            to,
            subject,
            error: err.message,
        });
        throw err;
    }
}

module.exports = { sendEmail };
