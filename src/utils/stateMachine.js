/**
 * ============================================================================
 * STATE MACHINE — Centralized Status Transition Validation
 * ============================================================================
 * Single source of truth for ALL entity status transitions.
 * All services MUST use these functions instead of inline transition maps.
 *
 *   validateTransition(entityType, fromStatus, toStatus) → boolean
 *   getValidTransitions(entityType, fromStatus)          → string[]
 *   assertTransition(entityType, fromStatus, toStatus)   → throws on invalid
 * ============================================================================
 */

const { STATUS, ERROR_MESSAGES } = require('../config/constants');

// ============================================================================
// TRANSITION MAPS — Authoritative definitions for every entity type
// ============================================================================

/**
 * Job Status Transitions
 *   draft → published, cancelled
 *   published → closed, cancelled
 *   closed → published (reopen)
 *   cancelled → (terminal)
 */
const JOB_TRANSITIONS = Object.freeze({
    [STATUS.JOB.DRAFT]: [STATUS.JOB.PUBLISHED, STATUS.JOB.CANCELLED],
    [STATUS.JOB.PUBLISHED]: [STATUS.JOB.CLOSED, STATUS.JOB.CANCELLED],
    [STATUS.JOB.CLOSED]: [STATUS.JOB.PUBLISHED],
    [STATUS.JOB.CANCELLED]: [],
});

/**
 * Application Status Transitions (Admin-initiated)
 *   pending → under_review, shortlisted, rejected
 *   under_review → shortlisted, rejected
 *   shortlisted → selected, rejected
 *   selected → offered, rejected
 *   offered → rejected
 *   rejected, withdrawn, auto_withdrawn, waitlisted → (see below)
 *
 * Note: 'withdrawn' and 'auto_withdrawn' are student/system initiated (not admin).
 * 'offered' is set automatically when a placement (offer) is created.
 * 'waitlisted' can transition back to shortlisted/selected by admin.
 */
const APPLICATION_ADMIN_TRANSITIONS = Object.freeze({
    [STATUS.APPLICATION.PENDING]: [STATUS.APPLICATION.UNDER_REVIEW, STATUS.APPLICATION.SHORTLISTED, STATUS.APPLICATION.REJECTED],
    [STATUS.APPLICATION.UNDER_REVIEW]: [STATUS.APPLICATION.SHORTLISTED, STATUS.APPLICATION.REJECTED],
    [STATUS.APPLICATION.SHORTLISTED]: [STATUS.APPLICATION.SELECTED, STATUS.APPLICATION.WAITLISTED, STATUS.APPLICATION.REJECTED],
    [STATUS.APPLICATION.SELECTED]: [STATUS.APPLICATION.OFFERED, STATUS.APPLICATION.WAITLISTED, STATUS.APPLICATION.REJECTED],
    [STATUS.APPLICATION.OFFERED]: [STATUS.APPLICATION.REJECTED],
    [STATUS.APPLICATION.REJECTED]: [STATUS.APPLICATION.SHORTLISTED, STATUS.APPLICATION.UNDER_REVIEW],
    [STATUS.APPLICATION.WITHDRAWN]: [],
    [STATUS.APPLICATION.AUTO_WITHDRAWN]: [],
    [STATUS.APPLICATION.WAITLISTED]: [STATUS.APPLICATION.SHORTLISTED, STATUS.APPLICATION.SELECTED, STATUS.APPLICATION.REJECTED],
});

/**
 * Application Status Transitions (System-initiated — round processing, cascades)
 * These transitions are allowed ONLY via system/round-processing code paths,
 * not direct admin action.
 *
 *   shortlisted → selected (passed final round)
 *   shortlisted → rejected (failed round + auto_reject_on_round_fail)
 *   pending → rejected (job close cascade)
 *   under_review → rejected (job close cascade)
 *   selected → offered (placement created)
 *   any active → auto_withdrawn (auto-withdrawal cascade)
 */
const APPLICATION_SYSTEM_TRANSITIONS = Object.freeze({
    [STATUS.APPLICATION.PENDING]: [STATUS.APPLICATION.REJECTED, STATUS.APPLICATION.AUTO_WITHDRAWN],
    [STATUS.APPLICATION.UNDER_REVIEW]: [STATUS.APPLICATION.REJECTED, STATUS.APPLICATION.AUTO_WITHDRAWN],
    [STATUS.APPLICATION.SHORTLISTED]: [STATUS.APPLICATION.SELECTED, STATUS.APPLICATION.REJECTED, STATUS.APPLICATION.AUTO_WITHDRAWN],
    [STATUS.APPLICATION.SELECTED]: [STATUS.APPLICATION.OFFERED, STATUS.APPLICATION.AUTO_WITHDRAWN],
    [STATUS.APPLICATION.OFFERED]: [STATUS.APPLICATION.AUTO_WITHDRAWN],
    [STATUS.APPLICATION.WAITLISTED]: [STATUS.APPLICATION.SELECTED, STATUS.APPLICATION.AUTO_WITHDRAWN, STATUS.APPLICATION.REJECTED],
    [STATUS.APPLICATION.REJECTED]: [],
    [STATUS.APPLICATION.WITHDRAWN]: [],
    [STATUS.APPLICATION.AUTO_WITHDRAWN]: [],
});

/**
 * Placement Status Transitions
 *   offered → accepted, declined, revoked, expired, cancelled
 *   accepted → joined, cancelled
 *   declined, revoked, expired → (terminal)
 *   joined → cancelled (if student leaves)
 *   cancelled → (terminal)
 */
const PLACEMENT_TRANSITIONS = Object.freeze({
    [STATUS.PLACEMENT.OFFERED]: [STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.DECLINED, STATUS.PLACEMENT.REVOKED, STATUS.PLACEMENT.EXPIRED, STATUS.PLACEMENT.CANCELLED],
    [STATUS.PLACEMENT.ACCEPTED]: [STATUS.PLACEMENT.JOINED, STATUS.PLACEMENT.CANCELLED],
    [STATUS.PLACEMENT.DECLINED]: [],
    [STATUS.PLACEMENT.REVOKED]: [],
    [STATUS.PLACEMENT.EXPIRED]: [],
    [STATUS.PLACEMENT.JOINED]: [STATUS.PLACEMENT.CANCELLED],
    [STATUS.PLACEMENT.CANCELLED]: [],
});

/**
 * Round Status Transitions
 *   pending → in_progress, cancelled
 *   in_progress → completed, cancelled
 *   completed, cancelled → (terminal)
 */
const ROUND_TRANSITIONS = Object.freeze({
    [STATUS.ROUND.PENDING]: [STATUS.ROUND.IN_PROGRESS, STATUS.ROUND.CANCELLED],
    [STATUS.ROUND.IN_PROGRESS]: [STATUS.ROUND.COMPLETED, STATUS.ROUND.CANCELLED],
    [STATUS.ROUND.COMPLETED]: [],
    [STATUS.ROUND.CANCELLED]: [],
});

// ============================================================================
// ENTITY TYPE → TRANSITION MAP REGISTRY
// ============================================================================

const TRANSITION_MAPS = Object.freeze({
    job: JOB_TRANSITIONS,
    application: APPLICATION_ADMIN_TRANSITIONS,
    application_system: APPLICATION_SYSTEM_TRANSITIONS,
    placement: PLACEMENT_TRANSITIONS,
    round: ROUND_TRANSITIONS,
});

// Error messages per entity type
const ERROR_MAP = Object.freeze({
    job: ERROR_MESSAGES.INVALID_JOB_STATUS_TRANSITION,
    application: ERROR_MESSAGES.INVALID_APPLICATION_TRANSITION,
    application_system: ERROR_MESSAGES.INVALID_APPLICATION_TRANSITION,
    placement: ERROR_MESSAGES.INVALID_PLACEMENT_TRANSITION,
    round: ERROR_MESSAGES.INVALID_ROUND_STATUS_TRANSITION,
});

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a status transition is valid for a given entity type.
 *
 * @param {'job'|'application'|'application_system'|'placement'|'round'} entityType
 * @param {string} fromStatus — current status
 * @param {string} toStatus — desired new status
 * @returns {boolean} true if the transition is valid
 */
function validateTransition(entityType, fromStatus, toStatus) {
    const map = TRANSITION_MAPS[entityType];
    if (!map) return false;
    const allowed = map[fromStatus];
    if (!allowed) return false;
    return allowed.includes(toStatus);
}

/**
 * Get the list of valid next statuses for a given entity+status.
 *
 * @param {'job'|'application'|'application_system'|'placement'|'round'} entityType
 * @param {string} fromStatus — current status
 * @returns {string[]} array of valid target statuses (may be empty)
 */
function getValidTransitions(entityType, fromStatus) {
    const map = TRANSITION_MAPS[entityType];
    if (!map) return [];
    return map[fromStatus] ?? [];
}

/**
 * Assert that a transition is valid, throwing a structured error if not.
 * Also rejects same-status transitions.
 *
 * @param {'job'|'application'|'application_system'|'placement'|'round'} entityType
 * @param {string} fromStatus
 * @param {string} toStatus
 * @throws {Error} with status 400 if transition is invalid or same-status
 */
function assertTransition(entityType, fromStatus, toStatus) {
    if (fromStatus === toStatus) {
        throw Object.assign(
            new Error(`Status is already '${fromStatus}'`),
            { status: 400 }
        );
    }

    if (!validateTransition(entityType, fromStatus, toStatus)) {
        const allowed = getValidTransitions(entityType, fromStatus);
        const msg = allowed.length
            ? `${ERROR_MAP[entityType] ?? 'Invalid status transition'}. Allowed from '${fromStatus}': ${allowed.join(', ')}`
            : `${ERROR_MAP[entityType] ?? 'Invalid status transition'}. '${fromStatus}' is a terminal status`;
        throw Object.assign(new Error(msg), { status: 400 });
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    validateTransition,
    getValidTransitions,
    assertTransition,
    // Export maps for testing/introspection
    JOB_TRANSITIONS,
    APPLICATION_ADMIN_TRANSITIONS,
    APPLICATION_SYSTEM_TRANSITIONS,
    PLACEMENT_TRANSITIONS,
    ROUND_TRANSITIONS,
};
