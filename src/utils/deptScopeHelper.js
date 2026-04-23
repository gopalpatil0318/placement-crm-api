/**
 * ============================================================================
 * DEPARTMENT SCOPE HELPER — Utility for enforcing department-level access
 * ============================================================================
 *
 * req.deptScope (set in authMiddleware):
 *   - null     → user sees ALL departments (admin, or no dept assignments)
 *   - [uuid…]  → user is restricted to these departments
 *
 * Usage in services:
 *   const { clause, params, nextIndex } = buildDeptFilter(deptScope, paramIndex, 'd', 'dept_id');
 *   if (clause) conditions.push(clause);
 *
 *   assertInScope(deptScope, entity.dept_id);   // throws 403 if out of scope
 * ============================================================================
 */

const { ERROR_MESSAGES } = require('../config/constants');

/**
 * Build a SQL WHERE fragment that restricts rows to the caller's departments.
 *
 * @param {string[]|null} deptScope  - req.deptScope (null = no filter)
 * @param {number}        paramIndex - current $N index for parameterised query
 * @param {string}        alias      - table alias, e.g. 'd', 's', 'u'
 * @param {string}        column     - column name, e.g. 'dept_id'
 * @returns {{ clause: string|null, params: any[], nextIndex: number }}
 */
function buildDeptFilter(deptScope, paramIndex, alias = 'd', column = 'dept_id') {
    if (!deptScope) {
        return { clause: null, params: [], nextIndex: paramIndex };
    }

    return {
        clause: `${alias}.${column} = ANY($${paramIndex}::uuid[])`,
        params: [deptScope],
        nextIndex: paramIndex + 1,
    };
}

/**
 * Assert that a single department ID falls within the caller's scope.
 * No-op when deptScope is null (admin / unscoped user).
 *
 * @param {string[]|null} deptScope - req.deptScope
 * @param {string}        deptId    - the department ID to check
 * @throws {Error} with status 403 and code DEPT_SCOPE_DENIED
 */
function assertInScope(deptScope, deptId) {
    if (!deptScope) return;                       // unscoped — allow
    if (deptScope.includes(deptId)) return;       // in scope — allow

    const err = new Error(ERROR_MESSAGES.DEPT_SCOPE_DENIED);
    err.status = 403;
    err.code = 'DEPT_SCOPE_DENIED';
    throw err;
}

/**
 * Check whether a user shares at least one department with the requester.
 * Used for user-management scoping where users link via user_departments.
 *
 * @param {string[]|null} deptScope     - req.deptScope
 * @param {string[]}      targetDeptIds - dept_ids of the target user
 * @throws {Error} with status 403 and code DEPT_SCOPE_DENIED
 */
function assertSharesDept(deptScope, targetDeptIds) {
    if (!deptScope) return;                       // unscoped — allow

    const overlap = targetDeptIds.some(id => deptScope.includes(id));
    if (overlap) return;

    const err = new Error(ERROR_MESSAGES.DEPT_SCOPE_DENIED);
    err.status = 403;
    err.code = 'DEPT_SCOPE_DENIED';
    throw err;
}

module.exports = { buildDeptFilter, assertInScope, assertSharesDept };
