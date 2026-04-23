/**
 * ============================================================================
 * STORAGE VALIDATOR — Joi Schemas for File Upload/Download Endpoints
 * ============================================================================
 *
 * Schemas:
 *   - uploadUrlSchema     POST /api/storage/upload-url
 *   - downloadUrlSchema   POST /api/storage/download-url
 * ============================================================================
 */

const Joi = require('joi');
const { ALLOWED_MIME_TYPES, CATEGORIES, BUCKETS, SIZE_LIMITS } = require('../utils/storageHelper');

// Shared pattern — must match isStoragePath() in storageHelper.js
const STORAGE_PATH_PATTERN = /^c_\w+\/[a-z-]+\/\w+_\d+_[a-f0-9]+\.\w+$/;

// ============================================================================
// UPLOAD URL REQUEST
// ============================================================================

const uploadUrlSchema = Joi.object({
  bucket: Joi.string()
    .valid(BUCKETS.PUBLIC, BUCKETS.PRIVATE)
    .required()
    .messages({
      'any.only': `Bucket must be either "${BUCKETS.PUBLIC}" or "${BUCKETS.PRIVATE}"`,
      'any.required': 'Bucket is required',
    }),

  category: Joi.string()
    .valid(...Object.values(CATEGORIES))
    .required()
    .messages({
      'any.only': `Category must be one of: ${Object.values(CATEGORIES).join(', ')}`,
      'any.required': 'Category is required',
    }),

  fileName: Joi.string()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9._\-() ]+$/)
    .required()
    .messages({
      'string.empty': 'File name is required',
      'string.max': 'File name cannot exceed 255 characters',
      'string.pattern.base': 'File name contains invalid characters',
      'any.required': 'File name is required',
    }),

  contentType: Joi.string()
    .valid(...ALLOWED_MIME_TYPES.ALL)
    .required()
    .messages({
      'any.only': 'File type must be JPEG, PNG, WebP, or PDF',
      'any.required': 'Content type is required',
    }),

  fileSize: Joi.number()
    .integer()
    .min(1)
    .max(SIZE_LIMITS.DOCUMENT_MAX_BYTES) // 5 MB absolute max — controller enforces stricter per-type limits
    .required()
    .messages({
      'number.min': 'File size must be greater than 0',
      'number.max': `File size cannot exceed ${SIZE_LIMITS.DOCUMENT_MAX_BYTES / (1024 * 1024)} MB`,
      'any.required': 'File size is required',
    }),

  entityId: Joi.string()
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .allow(null, '')
    .messages({
      'string.max': 'Entity ID cannot exceed 100 characters',
      'string.pattern.base': 'Entity ID contains invalid characters',
    }),
});

// ============================================================================
// DOWNLOAD URL REQUEST
// ============================================================================

const downloadUrlSchema = Joi.object({
  bucket: Joi.string()
    .valid(BUCKETS.PRIVATE)
    .required()
    .messages({
      'any.only': `Bucket must be "${BUCKETS.PRIVATE}" for download URLs`,
      'any.required': 'Bucket is required',
    }),

  storagePath: Joi.string()
    .min(5)
    .max(500)
    .pattern(STORAGE_PATH_PATTERN)
    .required()
    .messages({
      'string.empty': 'Storage path is required',
      'string.pattern.base': 'Invalid storage path format',
      'any.required': 'Storage path is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  uploadUrlSchema,
  downloadUrlSchema,
};
