/**
 * ============================================================================
 * STORAGE CONTROLLER — File Upload & Download URL Generation
 * ============================================================================
 *
 * Endpoints:
 *   POST /api/storage/upload-url    — Generate signed upload URL for client
 *   POST /api/storage/download-url  — Generate signed download URL for private files
 * ============================================================================
 */

const {
  BUCKETS,
  ALLOWED_MIME_TYPES,
  SIZE_LIMITS,
  buildStoragePath,
  getSignedUploadUrl,
  getSignedDownloadUrl,
  isStoragePath,
  SIGNED_URL_EXPIRY,
} = require('../utils/storageHelper');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const logger = require('../config/logger');
const { LOG, HTTP_STATUS } = require('../config/constants');

// ============================================================================
// CATEGORY → ENTITY ID BUILDER
// ============================================================================

/**
 * Build a meaningful entity prefix for the storage path.
 * Falls back to 'file' if no entityId is provided.
 */
function buildEntityPrefix(req, entityId) {
  const role = req.user.role;

  if (entityId) return entityId;

  // Auto-generate entity prefix from role + user ID
  if (role === 'student') return `stu_${req.user.id}`;
  if (role === 'sysadmin') return 'college';

  // College admin roles — use college context
  return `usr_${req.user.id}`;
}

// ============================================================================
// 1. GENERATE SIGNED UPLOAD URL
// ============================================================================

async function generateUploadUrl(req, res) {
  const startTime = Date.now();
  const { bucket, category, fileName, contentType, fileSize, entityId } = req.validated;
  const collegeId = req.user.college_id;

  logger.info(`${LOG.API_START} POST /api/storage/upload-url`, {
    userId: req.user.id,
    role: req.user.role,
    bucket,
    category,
    contentType,
    fileSize,
  });

  // ------------------------------------------------------------------
  // 1. Enforce college_id — sysadmin can upload for any college via entityId
  // ------------------------------------------------------------------
  if (!collegeId && req.user.role !== 'sysadmin') {
    return sendError(res, 'College context required for file uploads', HTTP_STATUS.BAD_REQUEST);
  }

  // For sysadmin uploading college logos, extract college_id from entityId
  const effectiveCollegeId = collegeId || 'sys';

  // ------------------------------------------------------------------
  // 2. Enforce stricter size limits per bucket
  // ------------------------------------------------------------------
  const isImage = ALLOWED_MIME_TYPES.IMAGES.includes(contentType);
  const maxBytes = isImage ? SIZE_LIMITS.IMAGE_MAX_BYTES : SIZE_LIMITS.DOCUMENT_MAX_BYTES;

  if (fileSize > maxBytes) {
    const maxMB = maxBytes / (1024 * 1024);
    return sendError(
      res,
      `File too large. Maximum size for ${isImage ? 'images' : 'documents'} is ${maxMB} MB`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // ------------------------------------------------------------------
  // 3. Public bucket only accepts images
  // ------------------------------------------------------------------
  if (bucket === BUCKETS.PUBLIC && !isImage) {
    return sendError(
      res,
      'Public bucket only accepts image files (JPEG, PNG, WebP)',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // ------------------------------------------------------------------
  // 4. Build storage path
  // ------------------------------------------------------------------
  const entity = buildEntityPrefix(req, entityId);
  const storagePath = buildStoragePath(effectiveCollegeId, category, entity, fileName);

  // ------------------------------------------------------------------
  // 5. Generate signed upload URL
  // ------------------------------------------------------------------
  try {
    const { signedUrl, token } = await getSignedUploadUrl(bucket, storagePath);

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/storage/upload-url`, {
      userId: req.user.id,
      storagePath,
      duration_ms: duration,
    });

    return sendSuccess(res, {
      signedUrl,
      token,
      storagePath,
      expiresIn: SIGNED_URL_EXPIRY.UPLOAD,
    }, 'Upload URL generated');
  } catch (err) {
    logger.error(`${LOG.API_ERROR} POST /api/storage/upload-url`, {
      userId: req.user.id,
      error: err.message,
    });
    return sendError(res, 'Failed to generate upload URL', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// ============================================================================
// 2. GENERATE SIGNED DOWNLOAD URL (for private files)
// ============================================================================

async function generateDownloadUrl(req, res) {
  const startTime = Date.now();
  const { bucket, storagePath } = req.validated;

  logger.info(`${LOG.API_START} POST /api/storage/download-url`, {
    userId: req.user.id,
    role: req.user.role,
    bucket,
  });

  // Validate storage path format
  if (!isStoragePath(storagePath)) {
    return sendError(res, 'Invalid storage path', HTTP_STATUS.BAD_REQUEST);
  }

  // Authorization: ensure user can only access files from their college
  const collegeId = req.user.college_id;
  if (collegeId && !storagePath.startsWith(`c_${collegeId}/`)) {
    if (req.user.role !== 'sysadmin') {
      return sendError(res, 'Access denied — file belongs to another college', HTTP_STATUS.FORBIDDEN);
    }
  }

  try {
    const signedUrl = await getSignedDownloadUrl(bucket, storagePath);

    if (!signedUrl) {
      return sendError(res, 'File not found or access denied', HTTP_STATUS.NOT_FOUND);
    }

    logger.info(`${LOG.API_END} POST /api/storage/download-url`, {
      userId: req.user.id,
      storagePath,
      duration_ms: Date.now() - startTime,
    });

    return sendSuccess(res, {
      signedUrl,
      expiresIn: SIGNED_URL_EXPIRY.DOWNLOAD,
    }, 'Download URL generated');
  } catch (err) {
    logger.error(`${LOG.API_ERROR} POST /api/storage/download-url`, {
      userId: req.user.id,
      error: err.message,
    });
    return sendError(res, 'Failed to generate download URL', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  generateUploadUrl,
  generateDownloadUrl,
};
