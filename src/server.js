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
const { closeAllPools, testConnectivity } = require('./config/db');
const { APP, LOG } = require('./config/constants');

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
  });
}

startServer();