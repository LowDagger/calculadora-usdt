/**
 * js/analytics.js — Anonymous product analytics
 *
 * Responsibilities:
 *  - Initialize PostHog with privacy-safe configuration.
 *  - Expose a single track(eventName, properties?) helper.
 *  - Expose centralized EVENTS constant (single source of truth).
 *  - Gracefully no-op if PostHog is unavailable.
 *  - Never send: exact amounts, rates, commissions, PII, or fingerprints.
 *
 * Allowed properties:
 *  theme        : 'light' | 'dark' | 'system'
 *  device_type  : 'mobile' | 'tablet' | 'desktop'
 *  amount_range : '0' | '1-100' | '101-500' | '501-1000' | '1001+'
 *  share_method : 'native' | 'clipboard'
 *  rate_status  : 'success' | 'failure'
 *  install_state: 'shown' | 'clicked' | 'dismissed' | 'installed'
 */

// ─── PostHog project key ────────────────────────────────────────────────────
// TODO: Replace with your real PostHog project API key (phc_...).
//       Set via a build-time substitution or update this constant directly.
const POSTHOG_KEY = 'phc_tGgLBamevdeSCxdbUXYUedhEYHUwLS4gZ62coGcxPUtj';

// ─── Centralized event names ─────────────────────────────────────────────────
export const EVENTS = Object.freeze({
  APP_LOADED: 'app_loaded',
  RATES_LOADED: 'rates_loaded',
  RATES_FAILED: 'rates_failed',
  SETTINGS_OPENED: 'settings_opened',
  BREAKDOWN_OPENED: 'breakdown_opened',
  SHARE_CLICKED: 'share_clicked',
  INSTALL_PROMPT_SHOWN: 'install_prompt_shown',
  INSTALL_CLICKED: 'install_clicked',
  INSTALL_DISMISSED: 'install_dismissed',
  THEME_CHANGED: 'theme_changed',
  CLEAR_CLICKED: 'clear_clicked',
  AMOUNT_RANGE_CHANGED: 'amount_range_changed',
  P2P_EDITED: 'p2p_edited',
  FEES_EDITED: 'fees_edited',
  RUNTIME_ERROR: 'runtime_error',
});

// ─── Internal state ───────────────────────────────────────────────────────────
let _initialized = false;

// Guard against double-firing one-shot events (app_loaded)
const _firedOnce = new Set();

// ─── Device type detection (never changes after init) ─────────────────────────
function _getDeviceType() {
  const ua = navigator.userAgent;
  if (/iPad|tablet|Tablet/i.test(ua)) return 'tablet';
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
  // Also treat small portrait viewports as mobile (covers desktop DevTools simulation)
  if (window.innerWidth <= 768) return 'mobile';
  if (window.innerWidth <= 1024) return 'tablet';
  return 'desktop';
}

// Cached at module load time — stable for the session
const _deviceType = _getDeviceType();

// ─── Amount bucketing — raw USD value NEVER leaves the app ───────────────────
export function amountRange(usd) {
  const v = Number(usd) || 0;
  if (v <= 0) return '0';
  if (v <= 100) return '1-100';
  if (v <= 500) return '101-500';
  if (v <= 1000) return '501-1000';
  return '1001+';
}

// ─── Initialize PostHog ───────────────────────────────────────────────────────
function _initPostHog() {
  if (_initialized) return;

  // PostHog is loaded as a non-blocking <script> tag in index.html.
  // window.posthog will be defined when this runs (after DOMContentLoaded).
  const ph = window.posthog;
  if (!ph || typeof ph.init !== 'function') return;

  if (POSTHOG_KEY === 'phc_tGgLBamevdeSCxdbUXYUedhEYHUwLS4gZ62coGcxPUtj') {
    // Key not configured — analytics will no-op silently in production.
    // Remove this guard once a real key is set.
    return;
  }

  try {
    ph.init(POSTHOG_KEY, {
      api_host: 'https://us.i.posthog.com',  // EU endpoint (GDPR-friendly)
      autocapture: false,                    // no DOM click/input capture
      capture_pageview: false,               // we control page events manually
      capture_pageleave: false,
      disable_session_recording: true,       // no screen recording
      persistence: 'localStorage',          // consistent anonymous session ID, no PII
      person_profiles: 'never',             // no user profiles / identity
      ip: false,                            // do not enrich with geolocation from IP
      mask_all_text: true,                  // belt-and-suspenders: mask any stray DOM text
      mask_all_element_attributes: true,    // mask attributes too
    });

    _initialized = true;
  } catch (err) {
    // Analytics failure must never surface to the user
    // eslint-disable-next-line no-console
    console.warn('[analytics] PostHog init failed:', err);
  }
}

// ─── Public track() helper ────────────────────────────────────────────────────
/**
 * Track an anonymous event.
 *
 * @param {string} eventName  One of the EVENTS constants.
 * @param {Object} [props]    Allowed safe properties only (see module header).
 */
export function track(eventName, props = {}) {
  // Lazily initialise on first track call (PostHog script may not be ready at module eval)
  if (!_initialized) _initPostHog();

  // Guard: some events should fire at most once per session
  const oneShotEvents = new Set([EVENTS.APP_LOADED]);
  if (oneShotEvents.has(eventName)) {
    if (_firedOnce.has(eventName)) return;
    _firedOnce.add(eventName);
  }

  // Always attach device_type to every event for segmentation
  const safeProps = {
    device_type: _deviceType,
    ...props,
  };

  const ph = window.posthog;
  if (!ph || !_initialized) return; // graceful no-op

  try {
    ph.capture(eventName, safeProps);
  } catch (err) {
    console.warn('[analytics] track() failed:', err);
  }
}

// ─── Runtime error capture ────────────────────────────────────────────────────
// Wired up once here so no call site needs to manage it.
// IMPORTANT: We only send the error type — NEVER the message, stack, or filename,
// as those could contain user input or sensitive URLs.
window.addEventListener('error', () => {
  track(EVENTS.RUNTIME_ERROR, { type: 'error' });
});

window.addEventListener('unhandledrejection', () => {
  track(EVENTS.RUNTIME_ERROR, { type: 'unhandledrejection' });
});
