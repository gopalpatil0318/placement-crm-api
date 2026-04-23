/**
 * ============================================================================
 * STORAGE HELPER — Supabase Storage Client & Utilities
 * ============================================================================
 *
 * Provides a centralized interface to Supabase Storage for file uploads,
 * downloads, deletions, and URL resolution.
 *
 * Two buckets:
 *   placenex-public   — college logos, company logos, profile photos (CDN-cached)
 *   placenex-private   — resumes, certificates, offer letters (signed URLs)
 *
 * Storage path convention:
 *   c_{collegeId}/{category}/{entityId}_{timestamp}_{random}.{ext}
 *
 * ============================================================================
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../config/env');
const logger = require('../config/logger');

// ============================================================================
// SUPABASE CLIENT (initialized once, reused across all requests)
// ============================================================================

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// CONSTANTS
// ============================================================================

const BUCKETS = Object.freeze({
  PUBLIC: 'placenex-public',
  PRIVATE: 'placenex-private',
});

const ALLOWED_MIME_TYPES = Object.freeze({
  IMAGES: ['image/jpeg', 'image/png', 'image/webp'],
  DOCUMENTS: ['application/pdf'],
  ALL: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
});

const SIZE_LIMITS = Object.freeze({
  IMAGE_MAX_BYTES: 2 * 1024 * 1024,   // 2 MB
  DOCUMENT_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
});

const CATEGORIES = Object.freeze({
  LOGOS: 'logos',
  COMPANY_LOGOS: 'company-logos',
  PHOTOS: 'photos',
  RESUMES: 'resumes',
  CERTIFICATES: 'certs',
  PLACEMENT_DOCS: 'placement-docs',
  TRAINING_CERTS: 'training-certs',
});

const SIGNED_URL_EXPIRY = Object.freeze({
  UPLOAD: 120,        // 2 minutes for upload
  DOWNLOAD: 3600,     // 1 hour for viewing
});

// ============================================================================
// PATH BUILDING
// ============================================================================

/**
 * Build a storage path following the convention:
 *   c_{collegeId}/{category}/{entityId}_{timestamp}_{random}.{ext}
 *
 * @param {string|number} collegeId
 * @param {string} category - One of CATEGORIES values
 * @param {string} entityId - e.g. "stu_123", "comp_456", "college"
 * @param {string} fileName - Original file name (used for extension only)
 * @returns {string} Storage path
 */
function buildStoragePath(collegeId, category, entityId, fileName) {
  const ext = path.extname(fileName).toLowerCase().replaceAll('.', '') || 'bin';
  const timestamp = Math.floor(Date.now() / 1000);
  const random = crypto.randomBytes(4).toString('hex'); // 8 chars
  return `c_${collegeId}/${category}/${entityId}_${timestamp}_${random}.${ext}`;
}

// ============================================================================
// SIGNED UPLOAD URL
// ============================================================================

/**
 * Generate a signed URL for the client to upload directly to Supabase.
 *
 * @param {string} bucket - BUCKETS.PUBLIC or BUCKETS.PRIVATE
 * @param {string} storagePath - Full path within the bucket
 * @param {number} [expiresIn=120] - Seconds until the signed URL expires
 * @returns {Promise<{signedUrl: string, token: string}>}
 * @throws {Error} If Supabase returns an error
 */
async function getSignedUploadUrl(bucket, storagePath, expiresIn = SIGNED_URL_EXPIRY.UPLOAD) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath, { expiresIn });

  if (error) {
    logger.error('[STORAGE] Failed to create signed upload URL', {
      bucket,
      storagePath,
      error: error.message,
    });
    throw new Error('Failed to generate upload URL');
  }

  return { signedUrl: data.signedUrl, token: data.token };
}

// ============================================================================
// SIGNED DOWNLOAD URL (for private bucket)
// ============================================================================

/**
 * Generate a short-lived signed URL for downloading a private file.
 *
 * @param {string} bucket - Usually BUCKETS.PRIVATE
 * @param {string} storagePath
 * @param {number} [expiresIn=3600] - Seconds (default 1 hour)
 * @returns {Promise<string>} Signed download URL
 */
async function getSignedDownloadUrl(bucket, storagePath, expiresIn = SIGNED_URL_EXPIRY.DOWNLOAD) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    logger.error('[STORAGE] Failed to create signed download URL', {
      bucket,
      storagePath,
      error: error.message,
    });
    return null;
  }

  return data.signedUrl;
}

// ============================================================================
// PUBLIC URL (for public bucket — CDN-cached, no expiry)
// ============================================================================

/**
 * Get the permanent public URL for a file in the public bucket.
 *
 * @param {string} bucket - Usually BUCKETS.PUBLIC
 * @param {string} storagePath
 * @returns {string} Public URL
 */
function getPublicUrl(bucket, storagePath) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

// ============================================================================
// DETECTION — Is this a storage path or a legacy external URL?
// ============================================================================

/**
 * Check if a value is a Supabase storage path (vs a legacy http URL).
 * Storage paths start with "c_" and never with "http".
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
function isStoragePath(value) {
  if (!value || typeof value !== 'string') return false;
  return /^c_\w+\/[a-z-]+\/\w+_\d+_[a-f0-9]+\.\w+$/.test(value);
}

// ============================================================================
// RESOLVE — Convert storage paths to accessible URLs
// ============================================================================

/**
 * Resolve a single file field to an accessible URL.
 * - Storage path in public bucket → permanent public URL
 * - Storage path in private bucket → signed download URL (1 hour)
 * - Legacy http URL → returned as-is
 * - Null/empty → null
 *
 * @param {string|null} value - Storage path or legacy URL
 * @param {string} bucket - Which bucket this field belongs to
 * @returns {Promise<string|null>}
 */
async function resolveFileUrl(value, bucket) {
  if (!value) return null;

  // Legacy external URL — pass through
  if (!isStoragePath(value)) return value;

  if (bucket === BUCKETS.PUBLIC) {
    return getPublicUrl(bucket, value);
  }

  return getSignedDownloadUrl(bucket, value);
}

/**
 * Batch-resolve file fields on an array of rows.
 * Efficient: public URLs are synchronous (no API call), private URLs
 * are batched with Promise.all.
 *
 * @param {Object[]} rows - Array of database rows
 * @param {Array<{field: string, bucket: string}>} fieldMap - Fields to resolve
 * @returns {Promise<Object[]>} Rows with resolved URLs
 *
 * @example
 *   const resolved = await resolveFileUrls(companies, [
 *     { field: 'company_logo', bucket: BUCKETS.PUBLIC },
 *   ]);
 */
async function resolveFileUrls(rows, fieldMap) {
  if (!rows || rows.length === 0) return rows;

  // Separate sync (public) and async (private) resolutions
  const asyncTasks = [];

  for (const row of rows) {
    for (const { field, bucket } of fieldMap) {
      const value = row[field];
      if (!value || !isStoragePath(value)) continue;

      if (bucket === BUCKETS.PUBLIC) {
        row[field] = getPublicUrl(bucket, value);
      } else {
        // Queue async resolution, capture row + field for assignment
        asyncTasks.push(
          getSignedDownloadUrl(bucket, value).then((url) => {
            row[field] = url ?? value; // fallback to raw path if signing fails
          })
        );
      }
    }
  }

  if (asyncTasks.length > 0) {
    await Promise.all(asyncTasks);
  }

  return rows;
}

// ============================================================================
// DELETE — Remove files from storage
// ============================================================================

/**
 * Delete a single file from storage. Fire-and-forget safe — logs errors
 * but never throws.
 *
 * @param {string} bucket
 * @param {string} storagePath
 * @returns {Promise<boolean>} true if deleted, false if error
 */
async function deleteFile(bucket, storagePath) {
  if (!storagePath || !isStoragePath(storagePath)) return false;

  try {
    const { error } = await supabase.storage.from(bucket).remove([storagePath]);

    if (error) {
      logger.error('[STORAGE] Failed to delete file', {
        bucket,
        storagePath,
        error: error.message,
      });
      return false;
    }

    logger.info('[STORAGE] File deleted', { bucket, storagePath });
    return true;
  } catch (err) {
    logger.error('[STORAGE] Unexpected error deleting file', {
      bucket,
      storagePath,
      error: err.message,
    });
    return false;
  }
}

/**
 * Delete multiple files from storage in a single API call.
 * Fire-and-forget safe.
 *
 * @param {string} bucket
 * @param {string[]} paths - Array of storage paths
 * @returns {Promise<boolean>}
 */
async function deleteFiles(bucket, paths) {
  const validPaths = (paths || []).filter(isStoragePath);
  if (validPaths.length === 0) return true;

  try {
    const { error } = await supabase.storage.from(bucket).remove(validPaths);

    if (error) {
      logger.error('[STORAGE] Failed to bulk delete files', {
        bucket,
        count: validPaths.length,
        error: error.message,
      });
      return false;
    }

    logger.info('[STORAGE] Bulk delete completed', {
      bucket,
      count: validPaths.length,
    });
    return true;
  } catch (err) {
    logger.error('[STORAGE] Unexpected error in bulk delete', {
      bucket,
      count: validPaths.length,
      error: err.message,
    });
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  BUCKETS,
  ALLOWED_MIME_TYPES,
  SIZE_LIMITS,
  CATEGORIES,
  SIGNED_URL_EXPIRY,
  buildStoragePath,
  getSignedUploadUrl,
  getSignedDownloadUrl,
  getPublicUrl,
  isStoragePath,
  resolveFileUrl,
  resolveFileUrls,
  deleteFile,
  deleteFiles,
};
