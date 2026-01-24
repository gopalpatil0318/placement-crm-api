/**
 * ============================================================================
 * COLLEGE CONTROLLER - College Management (SIMPLIFIED)
 * ============================================================================
 * Single Database Architecture
 * - All colleges in one database
 * - Only college admin/sysadmin can manage
 * - No tenant creation/management needed
 * - Dynamic feature management via enabled_features JSONB
 */

const collegeService = require('../services/collegeService');
const logger = require('../config/logger');
const { success, error } = require('../utils/responseHelper');
const {
  LOG,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  ROLES
} = require('../config/constants');
const { Logform } = require('winston');

/**
 * POST /api/v1/colleges
 * Create new college
 * Sets default enabled_features to ["core"]
 */
async function createCollege(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/sysadmin/create-college`, {
    user_id: req.user?.id,
    user_role: req.user?.role,
    ip: req.ip
  });

  try {
    // Authorization: Only sysadmin can create colleges
    if (req.user?.role !== ROLES.SYSADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized college creation attempt`,
        {
          user_id: req.user?.id,
          user_role: req.user?.role,
          ip: req.ip
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const {
      college_name,
      college_subdomain,
      admin_name,
      admin_email,
      admin_password
    } = req.validated;

    const newCollege = await collegeService.create({
      college_name,
      college_subdomain,
      admin_name,
      admin_email,
      admin_password
    });

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} POST /api/sysadmin/create-college`,
      {
        college_id: newCollege.college.college_id,
        admin_user_id: newCollege.admin.user_id,
        created_by: req.user.id,
        enabled_features: newCollege.college.enabled_features,
        duration_ms: duration
      }
    );

    return success(
      res,
      newCollege,
      SUCCESS_MESSAGES.COLLEGE_CREATED,
      HTTP_STATUS.CREATED
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} POST /api/sysadmin/create-college`,
      {
        error: err.message,
        user_id: req.user?.id,
        duration_ms: duration
      }
    );

    if (err.message.includes('already exists')) {
      return error(res, err.message, HTTP_STATUS.CONFLICT);
    }

    if (err.message.includes('Invalid')) {
      return error(res, err.message, HTTP_STATUS.BAD_REQUEST);
    }

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

//forget password function
async function forgotCollegeAdminPassword(req,res){
  const startTime = Date.now()

  logger.info(
    `${LOG.API_START_PREFIX} PUT /api/sysadmin/colleges/forgot-password`,
    {
      user_id:req.user.id,
      college_id:req.user.college_id,
    }
  )
  try{
    const {new_password} = req.validated;

    await collegeService.resetCollegeAdminPassword(
      req.user.id,
      req.user.college_id,
      new_password
    )
    const duration = Date.now() - startTime

    logger.info(
      `${LOG.API_END_PREFIX} PUT /api/sysadmin/colleges/forgot-password`,
      {duration_ms:duration}
    )

    return success(
      res,
      null,
      'Password updated successfully',
      HTTP_STATUS.OK
    )
  }
  catch(err){
    const duration = Date.now() - startTime

    logger.error(
      `${LOG.API_ERROR_PREFIX} PUT /api/sysadmin/colleges/forgot-password`,
      {
        error: err.message, duration_ms: duration
      }
    )

    if (err.message.includes('not found')) {
      return error(res, err.message, HTTP_STATUS.NOT_FOUND);
    }

    return error(
      res,
      ERROR_MESSAGES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * GET /api/v1/colleges
 * List all colleges with pagination
 */
async function listColleges(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} GET /api/sysadmin/colleges`, {
    user_id: req.user?.id,
    user_role: req.user?.role,
    query_params: req.query
  });

  try {
    // Authorization: Only sysadmin can list colleges
    if (req.user?.role !== ROLES.SYSADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized college list attempt`,
        { user_id: req.user?.id }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const page = req.validated?.page || 1;
    const limit = req.validated?.limit || 20;

    const result = await collegeService.list(page, limit);

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} GET /api/sysadmin/colleges`,
      {
        total: result.pagination.total,
        page: page,
        limit: limit,
        duration_ms: duration
      }
    );

    return success(res, result.data, 'Colleges retrieved', HTTP_STATUS.OK);

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} GET /api/sysadmin/colleges`,
      {
        error: err.message,
        duration_ms: duration
      }
    );

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * GET /api/v1/colleges/:collegeId
 * Get single college by ID
 */
async function getCollege(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} GET /api/sysadmin/colleges/:collegeId`, {
    college_id: req.params.collegeId,
    user_id: req.user?.id
  });

  try {
    // Authorization: Only sysadmin can view college details
    if (req.user?.role !== ROLES.SYSADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized college access attempt`,
        {
          user_id: req.user?.id,
          college_id: req.params.collegeId
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const college = await collegeService.getById(req.params.collegeId);

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} GET /api/sysadmin/colleges/:collegeId`,
      {
        college_id: college.college_id,
        duration_ms: duration
      }
    );

    return success(res, college, 'College retrieved', HTTP_STATUS.OK);

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} GET /api/sysadmin/colleges/:collegeId`,
      {
        error: err.message,
        college_id: req.params.collegeId,
        duration_ms: duration
      }
    );

    if (err.message.includes('not found')) {
      return error(res, ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * PUT /api/v1/colleges/:collegeId
 * Update college (name, subdomain, status)
 */
async function updateCollege(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} PUT /api/sysadmin/update-college/:collegeId`, {
    college_id: req.params.collegeId,
    user_id: req.user?.id,
    updated_fields: Object.keys(req.validated)
  });

  try {
    // Authorization: Only sysadmin can update colleges
    if (req.user?.role !== ROLES.SYSADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized college update attempt`,
        {
          user_id: req.user?.id,
          college_id: req.params.collegeId
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const updatedCollege = await collegeService.update(
      req.params.collegeId,
      req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} PUT /api/sysadmin/update-college/:collegeId`,
      {
        college_id: updatedCollege.college_id,
        updated_by: req.user.id,
        duration_ms: duration
      }
    );

    return success(res, updatedCollege, SUCCESS_MESSAGES.COLLEGE_UPDATED, HTTP_STATUS.OK);

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} PUT /api/sysadmin/update-college/:collegeId`,
      {
        error: err.message,
        college_id: req.params.collegeId,
        duration_ms: duration
      }
    );

    if (err.message.includes('not found')) {
      return error(res, ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    if (err.message.includes('already exists')) {
      return error(res, err.message, HTTP_STATUS.CONFLICT);
    }

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * PUT /api/v1/colleges/:collegeId/features
 * Update college enabled features
 * - Core feature cannot be removed
 * - Frontend sends complete feature list including "core"
 */
async function updateCollegeFeatures(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} PUT /api/sysadmin/colleges/:collegeId/features`, {
    college_id: req.params.collegeId,
    user_id: req.user?.id,
    enabled_features: req.validated?.enabled_features
  });

  try {
    // Authorization: Only sysadmin can update features
    if (req.user?.role !== ROLES.SYSADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized feature update attempt`,
        {
          user_id: req.user?.id,
          college_id: req.params.collegeId
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const { enabled_features } = req.validated;

    // Validate core feature is always included
    if (!Array.isArray(enabled_features) || !enabled_features.includes('core')) {
      return error(
        res,
        'Core feature must always be included in enabled features',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const updatedCollege = await collegeService.updateFeatures(
      req.params.collegeId,
      enabled_features
    );

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} PUT /api/sysadmin/colleges/:collegeId/features`,
      {
        college_id: updatedCollege.college_id,
        enabled_features: updatedCollege.enabled_features,
        updated_by: req.user.id,
        duration_ms: duration
      }
    );

    return success(
      res,
      updatedCollege,
      'College features updated successfully',
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} PUT /api/sysadmin/colleges/:collegeId/features`,
      {
        error: err.message,
        college_id: req.params.collegeId,
        duration_ms: duration
      }
    );

    if (err.message.includes('not found')) {
      return error(res, ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  createCollege,
  forgotCollegeAdminPassword,
  listColleges,
  getCollege,
  updateCollege,
  updateCollegeFeatures
};