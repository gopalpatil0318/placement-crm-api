/**
 * ============================================================================
 * COOKIE.JS — Shared Cookie Configuration
 * ============================================================================
 * Central place for JWT cookie options so every controller uses consistent
 * settings (httpOnly, secure, sameSite, domain, maxAge).
 *
 * Domain logic:
 *   - Production  → '.placenex.in'  (shared across all subdomains)
 *   - Development → '.lvh.me'       (shared across *.lvh.me subdomains)
 * ============================================================================
 */

const config = require('./env');

const COOKIE_DOMAIN = config.isProd ? '.placenex.in' : '.lvh.me';

const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  domain: COOKIE_DOMAIN,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

/**
 * Options for clearCookie — must match the options used when setting,
 * minus maxAge (which is irrelevant for deletion).
 */
const CLEAR_COOKIE_OPTIONS = Object.freeze({
  httpOnly: COOKIE_OPTIONS.httpOnly,
  secure: COOKIE_OPTIONS.secure,
  sameSite: COOKIE_OPTIONS.sameSite,
  domain: COOKIE_OPTIONS.domain,
});

module.exports = { COOKIE_OPTIONS, CLEAR_COOKIE_OPTIONS };
