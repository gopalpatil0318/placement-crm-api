/**
 * ============================================================================
 * DEPARTMENT SCOPING — Unit Tests
 * ============================================================================
 * Tests the dept_scoped logic in authenticate middleware and how it sets
 * req.deptScope for downstream service layer consumption.
 *
 * The authenticate middleware flow for a college staff user:
 *   1. Read token from cookies
 *   2. verifyToken(token) → { id, role, college_id }
 *   3. queryUserByRole → pool.query (users + colleges JOIN) — 1 DB call
 *   4. permissionCache.get (cache hit) or pool.query (cache miss) — 0 or 1 call
 *   5. If dept_scoped → loadUserDeptIds → pool.query — 1 call
 *   6. Sets req.deptScope
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

const mockPoolQuery = jest.fn();
jest.mock('../../src/config/db', () => ({
  getMainPool: jest.fn(() => ({ query: mockPoolQuery })),
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

const { verifyToken } = require('../../src/utils/jwtHelper');
const permissionCache = require('../../src/utils/permissionCache');
const { authenticate } = require('../../src/middleware/authMiddleware');

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(cookies = {}) {
  return {
    cookies,
    headers: {},
    ip: '127.0.0.1',
    path: '/test',
    method: 'GET',
  };
}

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Set up all mocks for a configurable-role user.
 * Uses permission cache hit (no extra DB query for permissions).
 */
function setupUser({ role = 'tpo', permissions, deptScoped, deptIds = [] }) {
  // 1. verifyToken returns decoded JWT
  verifyToken.mockReturnValue({
    id: 'user-1',
    role,
    college_id: 'college-1',
  });

  // Build sequential pool.query responses
  const queryResponses = [
    // Query 1: queryUserByRole → user+college JOIN
    {
      rows: [{
        id: 'user-1',
        user_name: 'Test User',
        user_status: 'active',
        college_id: 'college-1',
        dept_id: null,
        user_role: role,
        college_status: 'active',
        subscription_status: 'active',
      }],
    },
  ];

  // Permission cache returns our config (cache hit — no DB query)
  permissionCache.get.mockReturnValue({
    permissions,
    dept_scoped: deptScoped,
  });

  // If dept_scoped, loadUserDeptIds makes another pool.query
  if (deptScoped) {
    queryResponses.push({
      rows: deptIds.map((id) => ({ dept_id: id })),
    });
  }

  // Set up sequential responses
  let callIndex = 0;
  mockPoolQuery.mockImplementation(() => {
    const result = queryResponses[callIndex] || { rows: [] };
    callIndex++;
    return Promise.resolve(result);
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Department scoping in authenticate middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('non-scoped role (dept_scoped=false) → req.deptScope = null', async () => {
    setupUser({
      permissions: ['students.view'],
      deptScoped: false,
    });

    const req = mockReq({ token: 'valid-jwt' });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.deptScope).toBeNull();
    expect(req.user.dept_scoped).toBe(false);
    expect(req.user.permissions).toEqual(['students.view']);
  });

  test('dept-scoped role with assigned depts → req.deptScope = [dept_ids]', async () => {
    setupUser({
      permissions: ['students.view'],
      deptScoped: true,
      deptIds: ['dept-1', 'dept-2'],
    });

    const req = mockReq({ token: 'valid-jwt' });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.deptScope).toEqual(['dept-1', 'dept-2']);
    expect(req.user.dept_scoped).toBe(true);
    expect(req.user.dept_ids).toEqual(['dept-1', 'dept-2']);
  });

  test('dept-scoped role with NO assigned depts → req.deptScope = []', async () => {
    setupUser({
      permissions: ['students.view'],
      deptScoped: true,
      deptIds: [],
    });

    const req = mockReq({ token: 'valid-jwt' });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.deptScope).toEqual([]);
    expect(req.user.dept_ids).toEqual([]);
  });

  test('dept-scoped role with single dept → req.deptScope = [dept_id]', async () => {
    setupUser({
      permissions: ['students.view'],
      deptScoped: true,
      deptIds: ['dept-only-1'],
    });

    const req = mockReq({ token: 'valid-jwt' });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.deptScope).toEqual(['dept-only-1']);
  });

  test('HOD with 3 depts → req.deptScope has all 3', async () => {
    setupUser({
      role: 'hod',
      permissions: ['students.view', 'students.approve'],
      deptScoped: true,
      deptIds: ['dept-a', 'dept-b', 'dept-c'],
    });

    const req = mockReq({ token: 'valid-jwt' });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.deptScope).toEqual(['dept-a', 'dept-b', 'dept-c']);
    expect(req.user.role).toBe('hod');
  });

  test('collegeadmin → req.deptScope = null (bypass role, no permission loading)', async () => {
    verifyToken.mockReturnValue({
      id: 'admin-1',
      role: 'collegeadmin',
      college_id: 'college-1',
    });

    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: 'admin-1',
        user_name: 'Admin',
        user_status: 'active',
        college_id: 'college-1',
        dept_id: null,
        user_role: 'collegeadmin',
        college_status: 'active',
        subscription_status: 'active',
      }],
    });

    // Cache should NOT be called for collegeadmin
    permissionCache.get.mockReturnValue(null);

    const req = mockReq({ token: 'valid-jwt' });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.deptScope).toBeNull();
    expect(req.user.permissions).toBeNull(); // bypass roles don't load permissions
    expect(req.user.dept_scoped).toBe(false);
  });
});
