/**
 * ============================================================================
 * SERVER.JS — Application Entry Point
 * ============================================================================
 * - Tests DB connectivity before accepting traffic
 * - Logs startup banner with app info
 * - Handles uncaught exceptions and unhandled rejections
 * - Graceful shutdown with 10-second timeout
 * ============================================================================
 */

const http = require('node:http');
const app = require('./app');
const config = require('./config/env');
const logger = require('./config/logger');
const { closeAllPools, testConnectivity, query, getClient } = require('./config/db');
const { APP, LOG } = require('./config/constants');
const { sweepExpiredOffers } = require('./utils/policyHelper');
const { notifyExpiringOffers } = require('./utils/placementNotifier');
const { sendEmail } = require('./utils/emailHelper');
const { STATUS } = require('./config/constants');

const server = http.createServer(app);

// ============================================================================
// GRACEFUL SHUTDOWN (shared handler)
// ============================================================================

const SHUTDOWN_TIMEOUT_MS = 10000;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${LOG.SHUTDOWN} ${signal} received — shutting down gracefully...`);

  // Force exit if shutdown takes too long
  const forceTimer = setTimeout(() => {
    logger.error(`${LOG.SHUTDOWN} Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms — forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Don't keep the process alive just for the timer
  forceTimer.unref();

  server.close(async () => {
    try {
      await closeAllPools();
      logger.info(`${LOG.SHUTDOWN} Cleanup complete. Goodbye 👋`);
      process.exit(0);
    } catch (err) {
      logger.error(`${LOG.SHUTDOWN} Error during cleanup`, {
        error: err.message,
        stack: err.stack,
      });
      process.exit(1);
    }
  });
}

// ============================================================================
// PROCESS-LEVEL ERROR HANDLERS
// ============================================================================

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  let errorMessage;
  if (reason instanceof Error) {
    errorMessage = reason.message;
  } else if (typeof reason === 'object' && reason !== null) {
    errorMessage = JSON.stringify(reason);
  } else {
    errorMessage = String(reason); // NOSONAR - reason is a primitive here (Error and object cases handled above)
  }
  logger.error(`${LOG.STARTUP} Unhandled Promise Rejection`, {
    error: errorMessage,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // In production, prefer shutting down after unhandled rejections
  if (config.isProd) {
    gracefulShutdown('UNHANDLED_REJECTION');
  }
});

process.on('uncaughtException', (err) => {
  logger.error(`${LOG.STARTUP} Uncaught Exception — shutting down`, {
    error: err.message,
    stack: err.stack,
  });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// ============================================================================
// START SERVER
// ============================================================================

async function startServer() {
  // 1. Test database connectivity
  const db = await testConnectivity();

  if (!db.connected) {
    logger.error(`${LOG.STARTUP} ❌ Cannot start — database unreachable`);
    process.exit(1);
  }

  // 2. Start listening
  server.listen(config.port, () => {
    logger.info(`${LOG.STARTUP} ====================================`);
    logger.info(`${LOG.STARTUP} 🚀 ${APP.NAME} v${APP.VERSION}`);
    logger.info(`${LOG.STARTUP}    Port:        ${config.port}`);
    logger.info(`${LOG.STARTUP}    Environment: ${config.nodeEnv}`);
    logger.info(`${LOG.STARTUP}    Database:    ✅ Connected (${db.latency}ms)`);
    logger.info(`${LOG.STARTUP}    PG Version:  ${db.version}`);
    logger.info(`${LOG.STARTUP} ====================================`);

    // 3. Background job: sweep expired offers every hour
    //    Processes all active colleges, then sends 24-hour expiry reminders.
    const SWEEP_INTERVAL = 3_600_000; // 1 hour

    async function runExpirySweep() {
      try {
        const colleges = await query(
          `SELECT college_id FROM colleges WHERE college_status = 'active'`
        );
        let totalExpired = 0;
        for (const { college_id } of colleges.rows) {
          totalExpired += await sweepExpiredOffers(college_id);
          await notifyExpiringOffers(college_id);
        }
        if (totalExpired > 0) {
          logger.info(`${LOG.STARTUP} Expiry sweep: ${totalExpired} offers expired across ${colleges.rowCount} colleges`);
        }
      } catch (err) {
        logger.error(`${LOG.STARTUP} Expiry sweep failed`, { error: err.message });
      }
    }

    // Run once at startup (after 30s delay to let things settle)
    setTimeout(runExpirySweep, 30_000).unref();
    // Then run every hour
    setInterval(runExpirySweep, SWEEP_INTERVAL).unref();

    // ----------------------------------------------------------------
    // 4. Background job: subscription expiry sweep — once per day
    //    Expires stale trials/subscriptions and sends reminder emails.
    // ----------------------------------------------------------------
    const SUBSCRIPTION_SWEEP_INTERVAL = 86_400_000; // 24 hours

    async function runSubscriptionSweep() {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // --- Step 1: Expire trials past trial_ends_at ---
        const expiredTrials = await client.query(
          `UPDATE college_subscriptions
           SET subscription_status = $1, updated_at = NOW()
           WHERE subscription_status = $2
             AND trial_ends_at IS NOT NULL
             AND trial_ends_at::date < CURRENT_DATE
           RETURNING college_id`,
          [STATUS.SUBSCRIPTION.EXPIRED, STATUS.SUBSCRIPTION.TRIAL]
        );

        // --- Step 2: Expire active subscriptions past valid_to + grace ---
        const expiredActive = await client.query(
          `UPDATE college_subscriptions
           SET subscription_status = $1, updated_at = NOW()
           WHERE subscription_status = $2
             AND (valid_to + (COALESCE(grace_period_days, 0) * INTERVAL '1 day'))::date < CURRENT_DATE
           RETURNING college_id`,
          [STATUS.SUBSCRIPTION.EXPIRED, STATUS.SUBSCRIPTION.ACTIVE]
        );

        // --- Step 3: Sync denormalized colleges.subscription_status ---
        // Only set to 'expired' if the college has NO remaining active/trial subscriptions
        const expiredCollegeIds = [
          ...expiredTrials.rows.map(r => r.college_id),
          ...expiredActive.rows.map(r => r.college_id),
        ];

        if (expiredCollegeIds.length > 0) {
          const uniqueIds = [...new Set(expiredCollegeIds)];
          await client.query(
            `UPDATE colleges SET subscription_status = $1, updated_at = NOW()
             WHERE college_id = ANY($2::uuid[])
               AND NOT EXISTS (
                 SELECT 1 FROM college_subscriptions cs
                 WHERE cs.college_id = colleges.college_id
                   AND cs.subscription_status IN ($3, $4)
               )`,
            [STATUS.SUBSCRIPTION.EXPIRED, uniqueIds, STATUS.SUBSCRIPTION.ACTIVE, STATUS.SUBSCRIPTION.TRIAL]
          );
          logger.info(`${LOG.STARTUP} Subscription sweep: ${uniqueIds.length} college(s) expired`);
        }

        await client.query('COMMIT');

        // --- Step 4: Send reminder emails at 7, 3, 1 days before expiry ---
        await sendSubscriptionReminders();

      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        logger.error(`${LOG.STARTUP} Subscription sweep failed`, { error: err.message });
      } finally {
        client.release();
      }
    }

    async function sendSubscriptionReminders() {
      const REMINDER_DAYS = [7, 3, 1];

      for (const days of REMINDER_DAYS) {
        try {
          await sendTrialReminders(days);
          await sendActiveReminders(days);
        } catch (err) {
          logger.error(`${LOG.STARTUP} Reminder emails (${days}d) failed`, { error: err.message });
        }
      }
    }

    async function sendTrialReminders(days) {
      const plural = days > 1 ? 's' : '';
      const result = await query(
        `SELECT DISTINCT ON (cs.college_id)
                cs.college_id, cs.trial_ends_at, cs.student_quota,
                c.college_name, u.user_email, u.user_name
         FROM college_subscriptions cs
         JOIN colleges c ON cs.college_id = c.college_id
         JOIN users u ON u.college_id = c.college_id AND u.user_role = 'collegeadmin'
         WHERE cs.subscription_status = $1
           AND cs.trial_ends_at IS NOT NULL
           AND cs.trial_ends_at::date = CURRENT_DATE + $2::int
         ORDER BY cs.college_id, cs.valid_from DESC`,
        [STATUS.SUBSCRIPTION.TRIAL, days]
      );

      for (const row of result.rows) {
        sendEmail({
          to: row.user_email,
          subject: `Placenex Trial Expiring in ${days} Day${plural} — ${row.college_name}`,
          text: `Hi ${row.user_name},\n\nYour Placenex free trial for ${row.college_name} will expire in ${days} day${plural}.\n\nAfter expiry, new student registrations will be paused. All existing data remains safe.\n\nTo continue, please contact the Placenex team to upgrade your subscription.\n\nRegards,\nPlacenex Team`,
        }).catch(e => logger.error(`${LOG.STARTUP} Trial reminder email failed`, { error: e.message, collegeId: row.college_id }));
      }
    }

    async function sendActiveReminders(days) {
      const plural = days > 1 ? 's' : '';
      const result = await query(
        `SELECT DISTINCT ON (cs.college_id)
                cs.college_id, cs.valid_to, cs.grace_period_days, cs.student_quota,
                c.college_name, u.user_email, u.user_name
         FROM college_subscriptions cs
         JOIN colleges c ON cs.college_id = c.college_id
         JOIN users u ON u.college_id = c.college_id AND u.user_role = 'collegeadmin'
         WHERE cs.subscription_status = $1
           AND cs.valid_to::date = CURRENT_DATE + $2::int
         ORDER BY cs.college_id, cs.valid_from DESC`,
        [STATUS.SUBSCRIPTION.ACTIVE, days]
      );

      for (const row of result.rows) {
        const graceNote = row.grace_period_days > 0
          ? ' (with a ' + row.grace_period_days + '-day grace period)'
          : '';
        sendEmail({
          to: row.user_email,
          subject: `Placenex Subscription Expiring in ${days} Day${plural} — ${row.college_name}`,
          text: `Hi ${row.user_name},\n\nYour Placenex subscription for ${row.college_name} will expire in ${days} day${plural}${graceNote}.\n\nAfter expiry, new student registrations will be paused. All existing data remains safe.\n\nPlease contact the Placenex team to renew your subscription.\n\nRegards,\nPlacenex Team`,
        }).catch(e => logger.error(`${LOG.STARTUP} Subscription reminder email failed`, { error: e.message, collegeId: row.college_id }));
      }
    }

    // Run subscription sweep once at startup (after 60s), then daily
    setTimeout(runSubscriptionSweep, 60_000).unref();
    setInterval(runSubscriptionSweep, SUBSCRIPTION_SWEEP_INTERVAL).unref();
  });
}

startServer();