/**
 * ============================================================================
 * USER CONTROLLER - User Management (SIMPLIFIED)
 * ============================================================================
 * Single Database Architecture
 * - Create user (admin only)
 * - List users (admin/teacher)
 * - Get user by ID
 * - Update user (admin only)
 * - Delete user (soft delete - admin only)
 */

const userService = require('../services/userService');
const logger = require('../config/logger');
const { success, error } = require('../utils/responseHelper');
const {
  LOG,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  ROLES
} = require('../config/constants');

/**
 * POST /api/v1/users
 * Create new user (admin only)
 */
async function createUser(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/create-user`, {
    user_id: req.user?.id,
    user_role: req.user?.role,
    college_id: req.user?.college_id,
    ip: req.ip
  });

  try {
    // Authorization check
    if (req.user?.role !== ROLES.ADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized user creation attempt`,
        {
          user_id: req.user?.id,
          user_role: req.user?.role,
          college_id: req.user?.college_id
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const {
      user_name,
      user_email,
      user_password,
      user_role
    } = req.validated;

    // Create user
    const newUser = await userService.create({
      college_id: req.user.college_id,
      user_name,
      user_email,
      user_password,
      user_role
    });

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} POST /api/create-user`,
      {
        user_id: newUser.user_id,
        user_email: newUser.user_email,
        user_role: newUser.user_role,
        college_id: req.user.college_id,
        created_by: req.user.id,
        duration_ms: duration
      }
    );

    return success(
      res,
      newUser,
      SUCCESS_MESSAGES.USER_CREATED,
      HTTP_STATUS.CREATED
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} POST /api/create-user`,
      {
        error: err.message,
        user_id: req.user?.id,
        college_id: req.user?.college_id,
        duration_ms: duration
      }
    );

    if (err.message.includes('already exists')) {
      return error(res, err.message, HTTP_STATUS.CONFLICT);
    }

    if (err.message.includes('Invalid role') || err.message.includes('inactive')) {
      return error(res, err.message, HTTP_STATUS.BAD_REQUEST);
    }

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * GET /api/v1/users
 * List all users in college with pagination
 */
async function listUsers(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} GET /api/users`, {
    user_id: req.user?.id,
    user_role: req.user?.role,
    college_id: req.user?.college_id,
    query_params: req.query
  });

  try {
    // Authorization check
    if (![ROLES.ADMIN, ROLES.TEACHER].includes(req.user?.role)) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized user list attempt`,
        {
          user_id: req.user?.id,
          user_role: req.user?.role
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const page = req.validated?.page || 1;
    const limit = req.validated?.limit || 20;

    const result = await userService.list(
      req.user.college_id,
      page,
      limit
    );

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} GET /api/users`,
      {
        total: result.pagination.total,
        page: page,
        limit: limit,
        college_id: req.user.college_id,
        duration_ms: duration
      }
    );

    return success(
      res,
      result.data,
      'Users retrieved',
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} GET /api/users`,
      {
        error: err.message,
        college_id: req.user?.college_id,
        duration_ms: duration
      }
    );

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * GET /api/v1/users/:userId
 * Get single user by ID
 */
async function getUser(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} GET /api/users/:userId`, {
    user_id: req.params.userId,
    requested_by: req.user?.id,
    college_id: req.user?.college_id
  });

  try {
    // Authorization check
    if (![ROLES.ADMIN, ROLES.TEACHER].includes(req.user?.role)) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized user access attempt`,
        {
          user_id: req.user?.id,
          target_user: req.params.userId
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const user = await userService.getById(
      req.params.userId,
      req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} GET /api/users/:userId`,
      {
        user_id: user.user_id,
        college_id: req.user.college_id,
        duration_ms: duration
      }
    );

    return success(res, user, 'User retrieved', HTTP_STATUS.OK);

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} GET /api/users/:userId`,
      {
        error: err.message,
        target_user: req.params.userId,
        college_id: req.user?.college_id,
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
 * PUT /api/v1/users/:userId
 * Update user (admin only)
 */
async function updateUser(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} PUT /api/users/:userId`, {
    user_id: req.params.userId,
    updated_by: req.user?.id,
    college_id: req.user?.college_id,
    updated_fields: Object.keys(req.validated)
  });

  try {
    // Authorization check
    if (req.user?.role !== ROLES.ADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized user update attempt`,
        {
          user_id: req.user?.id,
          target_user: req.params.userId
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const updatedUser = await userService.update(
      req.params.userId,
      req.user.college_id,
      req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} PUT /api/users/:userId`,
      {
        user_id: updatedUser.user_id,
        college_id: req.user.college_id,
        updated_by: req.user.id,
        duration_ms: duration
      }
    );

    return success(res, updatedUser, SUCCESS_MESSAGES.USER_UPDATED, HTTP_STATUS.OK);

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} PUT /api/users/:userId`,
      {
        error: err.message,
        target_user: req.params.userId,
        college_id: req.user?.college_id,
        duration_ms: duration
      }
    );

    if (err.message.includes('not found')) {
      return error(res, ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    if (err.message.includes('Access denied')) {
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * DELETE /api/v1/users/:userId
 * Soft delete user (set status to inactive - admin only)
 */
async function deleteUser(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} DELETE /api/users/:userId`, {
    user_id: req.params.userId,
    deleted_by: req.user?.id,
    college_id: req.user?.college_id
  });

  try {
    // Authorization check
    if (req.user?.role !== ROLES.ADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized user deletion attempt`,
        {
          user_id: req.user?.id,
          target_user: req.params.userId
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    await userService.delete(
      req.params.userId,
      req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} DELETE /api/users/:userId`,
      {
        user_id: req.params.userId,
        college_id: req.user.college_id,
        deleted_by: req.user.id,
        duration_ms: duration
      }
    );

    return success(res, {}, SUCCESS_MESSAGES.USER_DELETED, HTTP_STATUS.OK);

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} DELETE /api/users/:userId`,
      {
        error: err.message,
        target_user: req.params.userId,
        college_id: req.user?.college_id,
        duration_ms: duration
      }
    );

    if (err.message.includes('not found')) {
      return error(res, ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    if (err.message.includes('Access denied')) {
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser
};