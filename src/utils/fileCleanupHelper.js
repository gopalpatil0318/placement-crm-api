/**
 * ============================================================================
 * FILE CLEANUP HELPER — Delete Old Files on Update / Record Deletion
 * ============================================================================
 *
 * All operations are fire-and-forget: they log errors but never throw,
 * so they never block the user-facing transaction.
 *
 * Usage:
 *   const { cleanupOldFile, cleanupRecordFiles } = require('../utils/fileCleanupHelper');
 *
 *   // After UPDATE — delete replaced file
 *   cleanupOldFile(BUCKETS.PRIVATE, oldRow.resume_url, newPath);
 *
 *   // After DELETE — remove all files from a deleted record
 *   cleanupRecordFiles(BUCKETS.PRIVATE, oldRow, ['certificate_url', 'proof_url']);
 *
 * ============================================================================
 */

const { deleteFile, deleteFiles, isStoragePath } = require('./storageHelper');
const logger = require('../config/logger');

// ============================================================================
// SINGLE FILE CLEANUP (for UPDATE operations)
// ============================================================================

/**
 * Delete the old file if it changed and is a storage path.
 * Safe to call with null/undefined — no-ops silently.
 *
 * @param {string} bucket - BUCKETS.PUBLIC or BUCKETS.PRIVATE
 * @param {string|null} oldPath - Previous storage path from DB
 * @param {string|null} newPath - New storage path being saved
 */
function cleanupOldFile(bucket, oldPath, newPath) {
  if (!oldPath || !isStoragePath(oldPath)) return;
  if (oldPath === newPath) return;

  // Fire-and-forget — don't await, don't block
  deleteFile(bucket, oldPath).catch((err) => {
    logger.error('[FILE_CLEANUP] Failed to cleanup old file', {
      bucket,
      oldPath,
      error: err.message,
    });
  });
}

// ============================================================================
// ARRAY CLEANUP (for fields like proof_urls[])
// ============================================================================

/**
 * Compare old and new arrays of storage paths, delete removed entries.
 *
 * @param {string} bucket
 * @param {string[]} oldPaths - Previous array from DB
 * @param {string[]} newPaths - New array being saved
 */
function cleanupOldFiles(bucket, oldPaths, newPaths) {
  if (!Array.isArray(oldPaths) || oldPaths.length === 0) return;

  const newSet = new Set(newPaths || []);
  const removed = oldPaths.filter((p) => isStoragePath(p) && !newSet.has(p));

  if (removed.length === 0) return;

  deleteFiles(bucket, removed).catch((err) => {
    logger.error('[FILE_CLEANUP] Failed to cleanup old file array', {
      bucket,
      removedCount: removed.length,
      error: err.message,
    });
  });
}

// ============================================================================
// RECORD DELETION CLEANUP (for DELETE operations)
// ============================================================================

/**
 * Delete all storage files referenced by a database record.
 * Used when a record is permanently deleted.
 *
 * @param {string} bucket
 * @param {Object} record - Database row being deleted
 * @param {string[]} fileFields - Column names that hold storage paths
 *
 * @example
 *   // After deleting an achievement record:
 *   cleanupRecordFiles(BUCKETS.PRIVATE, deletedRow, ['certificate_url', 'proof_url']);
 */
function cleanupRecordFiles(bucket, record, fileFields) {
  if (!record || !Array.isArray(fileFields)) return;

  const paths = [];

  for (const field of fileFields) {
    const value = record[field];

    if (Array.isArray(value)) {
      // Handle array fields like proof_urls
      for (const item of value) {
        if (isStoragePath(item)) paths.push(item);
      }
    } else if (isStoragePath(value)) {
      paths.push(value);
    }
  }

  if (paths.length === 0) return;

  deleteFiles(bucket, paths).catch((err) => {
    logger.error('[FILE_CLEANUP] Failed to cleanup record files', {
      bucket,
      pathCount: paths.length,
      error: err.message,
    });
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  cleanupOldFile,
  cleanupOldFiles,
  cleanupRecordFiles,
};
