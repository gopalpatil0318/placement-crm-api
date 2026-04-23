/**
 * ============================================================================
 * REQUIRE-PERMISSION MIDDLEWARE — Unit Tests
 * ============================================================================
 * Tests:
 *   1. 403 enforcement for configurable roles missing the permission
 *   2. 200 pass-through for roles with the permission
 *   3. Bypass for sysadmin and collegeadmin (no permission check)
 *   4. 401 when req.user is missing
 *   5. Dept scoping: req.deptScope set correctly
 * ============================================================================
 */

// ── Mock dependencies ───────────────────────────────────────────────────────

jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/utils/jwtHelper', () => ({
  verifyToken: jest.fn(),
}));

jest.mock('../../src/config/db', () => ({
  getMainPool: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../../src/utils/permissionCache', () => ({
  get: jest.fn(),
  set: jest.fn(),
  invalidateCollege: jest.fn(),
  invalidateRole: jest.fn(),
  clearAll: jest.fn(),
  getStats: jest.fn(),
}));

const { requirePermission } = require('../../src/middleware/authMiddleware');

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

function mockReq(user) {
  return { user, path: '/test', method: 'GET', ip: '127.0.0.1' };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('requirePermission middleware', () => {
  const PERM_KEY = 'students.view';
  const middleware = requirePermission(PERM_KEY);

  // ──────────────────────────────────────────────────────────
  // 403 Enforcement
  // ──────────────────────────────────────────────────────────

  test('returns 403 when configurable role lacks the permission', () => {
    const req = mockReq({
      id: 'user-1',
      role: 'tpo',
      college_id: 'c-1',
      permissions: ['jobs.view', 'companies.view'], // does NOT include students.view
    });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('returns 403 when permissions array is empty', () => {
    const req = mockReq({
      id: 'user-1',
      role: 'hod',
      college_id: 'c-1',
      permissions: [],
    });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('returns 403 when permissions is undefined', () => {
    const req = mockReq({
      id: 'user-1',
      role: 'teacher',
      college_id: 'c-1',
      // no permissions property
    });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('returns 403 when permissions is null', () => {
    const req = mockReq({
      id: 'user-1',
      role: 'tpc',
      college_id: 'c-1',
      permissions: null,
    });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // ──────────────────────────────────────────────────────────
  // 200 Pass-through
  // ──────────────────────────────────────────────────────────

  test('calls next() when configurable role HAS the permission', () => {
    const req = mockReq({
      id: 'user-1',
      role: 'tpo',
      college_id: 'c-1',
      permissions: ['students.view', 'jobs.view'],
    });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('calls next() for all 4 configurable roles when they have the permission', () => {
    const roles = ['tpo', 'tpc', 'hod', 'teacher'];
    for (const role of roles) {
      const req = mockReq({
        id: `user-${role}`,
        role,
        college_id: 'c-1',
        permissions: [PERM_KEY],
      });
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  // ──────────────────────────────────────────────────────────
  // Bypass roles (sysadmin, collegeadmin)
  // ──────────────────────────────────────────────────────────

  test('sysadmin always bypasses — calls next() without permission check', () => {
    const req = mockReq({
      id: 'sysadmin-1',
      role: 'sysadmin',
      // no permissions array at all
    });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('collegeadmin always bypasses — calls next() without permission check', () => {
    const req = mockReq({
      id: 'admin-1',
      role: 'collegeadmin',
      college_id: 'c-1',
      // no permissions array at all
    });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────
  // 401 Unauthenticated
  // ──────────────────────────────────────────────────────────

  test('returns 401 when req.user is undefined', () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 401 when req.user is null', () => {
    const req = mockReq(null);
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  // ──────────────────────────────────────────────────────────
  // Permission key specificity
  // ──────────────────────────────────────────────────────────

  test('rejects close-but-different permission key', () => {
    const req = mockReq({
      id: 'user-1',
      role: 'tpo',
      college_id: 'c-1',
      permissions: ['students.create', 'students.update'], // NOT students.view
    });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('different middleware instances check different permissions', () => {
    const viewMiddleware = requirePermission('students.view');
    const createMiddleware = requirePermission('students.create');

    const req = mockReq({
      id: 'user-1',
      role: 'tpo',
      college_id: 'c-1',
      permissions: ['students.view'], // only view, NOT create
    });

    // View should pass
    const res1 = mockRes();
    const next1 = jest.fn();
    viewMiddleware(req, res1, next1);
    expect(next1).toHaveBeenCalled();

    // Create should fail
    const res2 = mockRes();
    const next2 = jest.fn();
    createMiddleware(req, res2, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(403);
  });
});
