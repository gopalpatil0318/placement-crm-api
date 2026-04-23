/**
 * ============================================================================
 * PERMISSION CACHE — Unit Tests
 * ============================================================================
 * Tests: TTL expiration, get/set, invalidation (college + role), clearAll, stats
 * ============================================================================
 */

// Mock the logger and constants before requiring the module
jest.mock('../../src/config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../../src/config/constants', () => ({
  LOG: { AUTH: '[AUTH]' },
}));

const permissionCache = require('../../src/utils/permissionCache');

describe('permissionCache', () => {
  beforeEach(() => {
    permissionCache.clearAll();
  });

  // ────────────────────────────────────────────────────────────
  // get / set basics
  // ────────────────────────────────────────────────────────────

  test('returns null for cache miss', () => {
    expect(permissionCache.get('college-1', 'tpo')).toBeNull();
  });

  test('returns cached value after set', () => {
    permissionCache.set('college-1', 'tpo', ['students.view', 'jobs.view'], false);
    const result = permissionCache.get('college-1', 'tpo');
    expect(result).toEqual({
      permissions: ['students.view', 'jobs.view'],
      dept_scoped: false,
    });
  });

  test('isolates entries by college+role key', () => {
    permissionCache.set('college-1', 'tpo', ['students.view'], false);
    permissionCache.set('college-1', 'hod', ['students.approve'], true);
    permissionCache.set('college-2', 'tpo', ['jobs.create'], false);

    expect(permissionCache.get('college-1', 'tpo').permissions).toEqual(['students.view']);
    expect(permissionCache.get('college-1', 'hod').permissions).toEqual(['students.approve']);
    expect(permissionCache.get('college-2', 'tpo').permissions).toEqual(['jobs.create']);
    expect(permissionCache.get('college-2', 'hod')).toBeNull();
  });

  test('overwrites existing entry on set', () => {
    permissionCache.set('college-1', 'tpo', ['old.perm'], false);
    permissionCache.set('college-1', 'tpo', ['new.perm'], true);
    const result = permissionCache.get('college-1', 'tpo');
    expect(result).toEqual({
      permissions: ['new.perm'],
      dept_scoped: true,
    });
  });

  // ────────────────────────────────────────────────────────────
  // TTL expiration
  // ────────────────────────────────────────────────────────────

  test('returns null after TTL expires', () => {
    permissionCache.set('college-1', 'tpo', ['students.view'], false);
    expect(permissionCache.get('college-1', 'tpo')).not.toBeNull();

    // Fast-forward time past TTL (5 minutes)
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);

    expect(permissionCache.get('college-1', 'tpo')).toBeNull();

    Date.now.mockRestore();
  });

  test('returns value before TTL expires', () => {
    permissionCache.set('college-1', 'tpo', ['students.view'], false);

    // 4 minutes later — within TTL
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 4 * 60 * 1000);

    expect(permissionCache.get('college-1', 'tpo')).not.toBeNull();

    Date.now.mockRestore();
  });

  // ────────────────────────────────────────────────────────────
  // Invalidation
  // ────────────────────────────────────────────────────────────

  test('invalidateCollege removes all 4 roles for a college', () => {
    const roles = ['tpo', 'tpc', 'hod', 'teacher'];
    roles.forEach((role) => {
      permissionCache.set('college-1', role, [`${role}.perm`], false);
    });
    // Also set another college — should NOT be affected
    permissionCache.set('college-2', 'tpo', ['other.perm'], false);

    permissionCache.invalidateCollege('college-1');

    roles.forEach((role) => {
      expect(permissionCache.get('college-1', role)).toBeNull();
    });
    expect(permissionCache.get('college-2', 'tpo')).not.toBeNull();
  });

  test('invalidateRole removes only one role', () => {
    permissionCache.set('college-1', 'tpo', ['tpo.perm'], false);
    permissionCache.set('college-1', 'hod', ['hod.perm'], true);

    permissionCache.invalidateRole('college-1', 'tpo');

    expect(permissionCache.get('college-1', 'tpo')).toBeNull();
    expect(permissionCache.get('college-1', 'hod')).not.toBeNull();
  });

  test('invalidateCollege is no-op for unknown college', () => {
    permissionCache.set('college-1', 'tpo', ['perm'], false);
    permissionCache.invalidateCollege('college-unknown');
    expect(permissionCache.get('college-1', 'tpo')).not.toBeNull();
  });

  // ────────────────────────────────────────────────────────────
  // clearAll & stats
  // ────────────────────────────────────────────────────────────

  test('clearAll empties the cache', () => {
    permissionCache.set('c1', 'tpo', ['a'], false);
    permissionCache.set('c2', 'hod', ['b'], true);
    expect(permissionCache.getStats().size).toBe(2);

    permissionCache.clearAll();
    expect(permissionCache.getStats().size).toBe(0);
    expect(permissionCache.get('c1', 'tpo')).toBeNull();
  });

  test('getStats returns correct size and ttl', () => {
    permissionCache.set('c1', 'tpo', ['a'], false);
    permissionCache.set('c1', 'hod', ['b'], true);
    const stats = permissionCache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.ttlMs).toBe(5 * 60 * 1000);
  });
});
