/**
 * ============================================================================
 * APPLICATION QUESTION ROUTES — Question Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST   /add_job_question/:jobId              Add question + validate
 *   GET    /get_job_questions/:jobId              List all questions for job
 *   PUT    /update_question/:questionId           Update question + validate
 *   DELETE /delete_question/:questionId           Hard delete question
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/jobQuestion.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    addQuestionSchema,
    listQuestionsSchema,
    updateQuestionSchema,
    jobIdParamSchema,
    questionIdParamSchema,
} = require('../../validators/college/jobQuestion.validator');

// All question routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/add_job_question/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(addQuestionSchema),
    asyncHandler(controller.addQuestion)
);

router.get(
    '/get_job_questions/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(listQuestionsSchema, 'query'),
    asyncHandler(controller.getJobQuestions)
);

router.put(
    '/update_question/:questionId',
    validate(questionIdParamSchema, 'params'),
    validate(updateQuestionSchema),
    asyncHandler(controller.updateQuestion)
);

router.delete(
    '/delete_question/:questionId',
    validate(questionIdParamSchema, 'params'),
    asyncHandler(controller.deleteQuestion)
);

module.exports = router;
