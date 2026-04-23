/**
 * ============================================================================
 * LOAD TEST — 1000 Concurrent Users on Permission-Gated Endpoints
 * ============================================================================
 * Simulates 1000 concurrent requests to a permission-gated route.
 *
 * This test does NOT start a server — it fires the requirePermission middleware
 * directly, measuring throughput, latency, and correctness under load.
 *
 * Metrics tracked:
 *   - Total time for 1000 calls
 *   - Average / P50 / P95 / P99 latency
 *   - 100% correctness (all 403 or all 200 as expected)
 * ============================================================================
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

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
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Load test: 1000 concurrent permission checks', () => {
  const CONCURRENCY = 1000;
  const PERM_KEY = 'students.view';
  const middleware = requirePermission(PERM_KEY);

  test(`${CONCURRENCY} authorized users — all should pass (next called)`, async () => {
    const latencies = [];
    const results = [];

    const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
      return new Promise((resolve) => {
        const req = {
          user: {
            id: `user-${i}`,
            role: 'tpo',
            college_id: `college-${i % 50}`, // 50 different colleges
            permissions: ['students.view', 'jobs.view', 'companies.view'],
          },
          path: '/api/college/students',
          method: 'GET',
          ip: '127.0.0.1',
        };
        const res = mockRes();
        const start = performance.now();

        const next = jest.fn(() => {
          const elapsed = performance.now() - start;
          latencies.push(elapsed);
          results.push('pass');
          resolve();
        });

        // If middleware calls res.status instead of next
        res.status.mockImplementation((code) => {
          const elapsed = performance.now() - start;
          latencies.push(elapsed);
          results.push(`fail:${code}`);
          resolve();
          return res;
        });

        middleware(req, res, next);
      });
    });

    await Promise.all(promises);

    // All should pass
    const passes = results.filter((r) => r === 'pass').length;
    expect(passes).toBe(CONCURRENCY);

    // Latency stats
    latencies.sort((a, b) => a - b);
    const stats = {
      total: latencies.reduce((a, b) => a + b, 0).toFixed(2) + 'ms',
      avg: (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3) + 'ms',
      p50: percentile(latencies, 50).toFixed(3) + 'ms',
      p95: percentile(latencies, 95).toFixed(3) + 'ms',
      p99: percentile(latencies, 99).toFixed(3) + 'ms',
      min: latencies[0].toFixed(3) + 'ms',
      max: latencies[latencies.length - 1].toFixed(3) + 'ms',
    };
    console.log(`\n  [LOAD] ${CONCURRENCY} authorized requests:`, stats);
  });

  test(`${CONCURRENCY} unauthorized users — all should get 403`, async () => {
    const latencies = [];
    const results = [];

    const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
      return new Promise((resolve) => {
        const req = {
          user: {
            id: `user-${i}`,
            role: 'teacher',
            college_id: `college-${i % 50}`,
            permissions: ['training.view'], // does NOT include students.view
          },
          path: '/api/college/students',
          method: 'GET',
          ip: '127.0.0.1',
        };
        const res = mockRes();
        const next = jest.fn();
        const start = performance.now();

        res.status.mockImplementation((code) => {
          const elapsed = performance.now() - start;
          latencies.push(elapsed);
          results.push(code);
          resolve();
          return res;
        });

        middleware(req, res, next);
      });
    });

    await Promise.all(promises);

    // All should be 403
    const forbidden = results.filter((r) => r === 403).length;
    expect(forbidden).toBe(CONCURRENCY);
    expect(results.every((r) => r === 403)).toBe(true);

    // Latency stats
    latencies.sort((a, b) => a - b);
    const stats = {
      total: latencies.reduce((a, b) => a + b, 0).toFixed(2) + 'ms',
      avg: (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3) + 'ms',
      p50: percentile(latencies, 50).toFixed(3) + 'ms',
      p95: percentile(latencies, 95).toFixed(3) + 'ms',
      p99: percentile(latencies, 99).toFixed(3) + 'ms',
    };
    console.log(`\n  [LOAD] ${CONCURRENCY} unauthorized requests (403):`, stats);
  });

  test(`${CONCURRENCY} bypass-role users — all should pass`, async () => {
    const latencies = [];
    const results = [];

    const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
      return new Promise((resolve) => {
        const role = i % 2 === 0 ? 'sysadmin' : 'collegeadmin';
        const req = {
          user: {
            id: `admin-${i}`,
            role,
            college_id: `college-${i % 50}`,
            // No permissions array — bypass roles don't need it
          },
          path: '/api/college/students',
          method: 'GET',
          ip: '127.0.0.1',
        };
        const res = mockRes();
        const start = performance.now();

        const next = jest.fn(() => {
          const elapsed = performance.now() - start;
          latencies.push(elapsed);
          results.push('pass');
          resolve();
        });

        res.status.mockImplementation((code) => {
          const elapsed = performance.now() - start;
          latencies.push(elapsed);
          results.push(`fail:${code}`);
          resolve();
          return res;
        });

        middleware(req, res, next);
      });
    });

    await Promise.all(promises);

    const passes = results.filter((r) => r === 'pass').length;
    expect(passes).toBe(CONCURRENCY);

    latencies.sort((a, b) => a - b);
    const stats = {
      total: latencies.reduce((a, b) => a + b, 0).toFixed(2) + 'ms',
      avg: (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3) + 'ms',
      p50: percentile(latencies, 50).toFixed(3) + 'ms',
      p95: percentile(latencies, 95).toFixed(3) + 'ms',
      p99: percentile(latencies, 99).toFixed(3) + 'ms',
    };
    console.log(`\n  [LOAD] ${CONCURRENCY} bypass-role requests:`, stats);
  });

  test('mixed: 500 authorized + 500 unauthorized concurrent', async () => {
    const results = [];

    const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
      return new Promise((resolve) => {
        const isAuthorized = i < 500;
        const req = {
          user: {
            id: `user-${i}`,
            role: 'tpo',
            college_id: `college-${i % 50}`,
            permissions: isAuthorized ? ['students.view'] : ['jobs.view'],
          },
          path: '/api/college/students',
          method: 'GET',
          ip: '127.0.0.1',
        };
        const res = mockRes();
        const next = jest.fn(() => {
          results.push({ idx: i, status: 'pass', expected: isAuthorized });
          resolve();
        });
        res.status.mockImplementation((code) => {
          results.push({ idx: i, status: code, expected: isAuthorized });
          resolve();
          return res;
        });

        middleware(req, res, next);
      });
    });

    await Promise.all(promises);

    // Verify correctness
    const authorized = results.filter((r) => r.expected);
    const unauthorized = results.filter((r) => !r.expected);

    expect(authorized.every((r) => r.status === 'pass')).toBe(true);
    expect(unauthorized.every((r) => r.status === 403)).toBe(true);
    expect(authorized.length).toBe(500);
    expect(unauthorized.length).toBe(500);
  });
});
