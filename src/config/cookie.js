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
  maxAge: 2 * 60 * 60 * 1000, // 2 hours (matches access token expiry)
});

/**
 * Cookie options for refresh token — longer-lived, httpOnly, same security.
 */
const REFRESH_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  domain: COOKIE_DOMAIN,
  path: '/',
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

/**
 * Options for clearing the refresh token cookie.
 */
const CLEAR_REFRESH_COOKIE_OPTIONS = Object.freeze({
  httpOnly: REFRESH_COOKIE_OPTIONS.httpOnly,
  secure: REFRESH_COOKIE_OPTIONS.secure,
  sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
  domain: REFRESH_COOKIE_OPTIONS.domain,
  path: REFRESH_COOKIE_OPTIONS.path,
});

module.exports = { COOKIE_OPTIONS, CLEAR_COOKIE_OPTIONS, REFRESH_COOKIE_OPTIONS, CLEAR_REFRESH_COOKIE_OPTIONS };
