/**
 * ============================================================================
 * PLACEMENT POLICY ROUTES — Policy Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST   /create_policy                       Add a policy rule
 *   GET    /get_all_policies                    List all policies
 *   GET    /get_policy/:policyId                Get single policy
 *   PUT    /update_policy/:policyId             Update policy rule
 *   PATCH  /toggle_policy_status/:policyId      Activate / Deactivate
 *   DELETE /delete_policy/:policyId             Delete policy rule
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/placementPolicy.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    createPolicySchema,
    listPoliciesSchema,
    updatePolicySchema,
    togglePolicyStatusSchema,
    policyIdParamSchema,
} = require('../../validators/college/placementPolicy.validator');

// All routes require authentication
router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/create_policy',
    requirePermission(PERMISSIONS.POLICIES_MANAGE),
    validate(createPolicySchema),
    asyncHandler(controller.createPolicy)
);

router.get(
    '/get_all_policies',
    requirePermission(PERMISSIONS.POLICIES_VIEW),
    validate(listPoliciesSchema, 'query'),
    asyncHandler(controller.getAllPolicies)
);

router.get(
    '/get_policy/:policyId',
    requirePermission(PERMISSIONS.POLICIES_VIEW),
    validate(policyIdParamSchema, 'params'),
    asyncHandler(controller.getPolicy)
);

router.put(
    '/update_policy/:policyId',
    requirePermission(PERMISSIONS.POLICIES_MANAGE),
    validate(policyIdParamSchema, 'params'),
    validate(updatePolicySchema),
    asyncHandler(controller.updatePolicy)
);

router.patch(
    '/toggle_policy_status/:policyId',
    requirePermission(PERMISSIONS.POLICIES_MANAGE),
    validate(policyIdParamSchema, 'params'),
    validate(togglePolicyStatusSchema),
    asyncHandler(controller.togglePolicyStatus)
);

router.delete(
    '/delete_policy/:policyId',
    requirePermission(PERMISSIONS.POLICIES_MANAGE),
    validate(policyIdParamSchema, 'params'),
    asyncHandler(controller.deletePolicy)
);

module.exports = router;
