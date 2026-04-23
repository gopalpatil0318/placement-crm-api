/**
 * ============================================================================
 * PERMISSION CACHE — In-memory LRU+TTL cache for user permissions
 * ============================================================================
 * Caches user_permissions rows to avoid a DB query on every request.
 *
 * Cache key: `user:${user_id}` (e.g. "user:abc-123-def")
 * Cache value: { permissions: string[], expiresAt: number }
 *
 * Design:
 *   - Per-user keying (not per-role) — each user has their own permissions
 *   - LRU eviction: max 50,000 entries (~5MB). Staff per college: 5-50.
 *     At 1M+ total users, only active users are cached.
 *   - TTL: 5 minutes — balances freshness vs DB load
 *   - On permission update: invalidate that user's entry immediately
 *   - Cache miss → returns null → caller does a DB query and calls setUser()
 *
 * Thread safety: Single-threaded Node.js — no race conditions on Map operations.
 * Multi-instance: Each process has its own cache. Worst case: 5 min stale after
 *                 admin changes permissions on another instance.
 *
 * LRU implementation: Uses Map insertion order. On get-hit, delete+re-insert
 * to move entry to the end (most-recently-used). On set, if size > MAX,
 * delete the first (oldest) entry.
 * ============================================================================
 */

const logger = require('../config/logger');
const { LOG } = require('../config/constants');

// ============================================================================
// CACHE STORAGE
// ============================================================================

const _cache = new Map();
const _recentInvalidations = new Map(); // key → timestamp (prevents stale set after invalidation)
const TTL_MS = 5 * 60 * 1000;          // 5 minutes
const INVALIDATION_GUARD_MS = 10 * 1000; // 10 seconds
const MAX_ENTRIES = 50_000;             // LRU cap (~5MB)

// ============================================================================
// INTERNAL — LRU eviction
// ============================================================================

function _evictIfNeeded() {
  while (_cache.size > MAX_ENTRIES) {
    // Map iterator yields in insertion order — first entry is the oldest
    const oldestKey = _cache.keys().next().value;
    _cache.delete(oldestKey);
  }
}

function _cleanupInvalidations() {
  // Periodically trim invalidation guard entries older than guard window
  if (_recentInvalidations.size > MAX_ENTRIES) {
    const cutoff = Date.now() - INVALIDATION_GUARD_MS;
    for (const [key, ts] of _recentInvalidations) {
      if (ts < cutoff) _recentInvalidations.delete(key);
      else break; // Map is in insertion order, so older entries come first
    }
  }
}

// ============================================================================
// PUBLIC API — Per-User
// ============================================================================

/**
 * Get cached permission config for a user.
 *
 * @param {string} userId - User UUID
 * @returns {{ permissions: string[] } | null}
 *          null = cache miss (caller should query DB and call setUser())
 */
function getUser(userId) {
  const key = `user:${userId}`;
  const entry = _cache.get(key);

  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    _cache.delete(key);
    return null;
  }

  // LRU: move to end (most-recently-used)
  _cache.delete(key);
  _cache.set(key, entry);

  return entry.data;
}

/**
 * Store permission config in cache for a user.
 *
 * @param {string} userId - User UUID
 * @param {string[]} permissions - Array of permission keys
 */
function setUser(userId, permissions) {
  const key = `user:${userId}`;

  // Guard: skip caching if this key was recently invalidated
  const invalidatedAt = _recentInvalidations.get(key);
  if (invalidatedAt && (Date.now() - invalidatedAt) < INVALIDATION_GUARD_MS) {
    return;
  }

  _cache.set(key, {
    data: { permissions },
    expiresAt: Date.now() + TTL_MS,
  });

  _evictIfNeeded();
}

/**
 * Invalidate a single user's cached permissions.
 * Called when admin updates that user's permissions.
 *
 * @param {string} userId - User UUID
 */
function invalidateUser(userId) {
  const key = `user:${userId}`;
  if (_cache.delete(key)) {
    logger.debug(`${LOG.AUTH} Permission cache invalidated for user`, { userId });
  }
  _recentInvalidations.set(key, Date.now());
  _cleanupInvalidations();
}

/**
 * Invalidate all cached entries for a college.
 * Called when admin updates role templates (affects all users of that role).
 * Iterates the full cache — acceptable because this is a rare admin action.
 *
 * @param {string} collegeId - College UUID (currently a no-op scan hint;
 *        we clear all entries since cache doesn't store collegeId per entry)
 */
function invalidateCollege(collegeId) {
  // Role template changes don't retroactively update users, but we clear
  // the cache to ensure consistency if any lazy-migration entries exist.
  _cache.clear();
  logger.debug(`${LOG.AUTH} Permission cache cleared for college template change`, {
    collegeId,
  });
}

/**
 * Get current cache stats (for monitoring/debugging).
 *
 * @returns {{ size: number, ttlMs: number, maxEntries: number }}
 */
function getStats() {
  return { size: _cache.size, ttlMs: TTL_MS, maxEntries: MAX_ENTRIES };
}

/**
 * Clear entire cache. Used in tests or emergency.
 */
function clearAll() {
  _cache.clear();
  _recentInvalidations.clear();
}

module.exports = {
  getUser,
  setUser,
  invalidateUser,
  invalidateCollege,
  getStats,
  clearAll,
};
