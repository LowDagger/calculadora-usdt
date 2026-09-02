import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TELEGRAM_CAMPAIGN,
  getPromoDismissalKey,
  isCampaignDismissed,
  dismissCampaign,
  isCampaignEligible,
  createCommunityPromoController
} from '../js/community-promo.js';
import {
  DEFAULT_OPERATIONAL_CONFIG,
  DEFAULT_TELEGRAM_COMMUNITY_PROMO,
  validateRemoteConfig
} from '../api/config.mjs';
import { validateOperationalConfig } from '../js/api.js';
import { calculateValues } from '../js/calculator.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPAIGN DURATION & LOGIC TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('DEFAULT_TELEGRAM_CAMPAIGN has exact 45-day duration and required properties', () => {
  assert.equal(DEFAULT_TELEGRAM_CAMPAIGN.enabled, true);
  assert.equal(DEFAULT_TELEGRAM_CAMPAIGN.campaignId, 'telegram-community-2026-09');
  assert.equal(DEFAULT_TELEGRAM_CAMPAIGN.endsAt, '2026-10-17T00:00:00.000Z');

  // Exact 45-day calculation from 2026-09-02T00:00:00.000Z
  const startDate = new Date('2026-09-02T00:00:00.000Z');
  const endDate = new Date(DEFAULT_TELEGRAM_CAMPAIGN.endsAt);
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationDays = durationMs / (1000 * 60 * 60 * 24);
  assert.equal(durationDays, 45);
});

test('getPromoDismissalKey scopes correctly by campaignId', () => {
  assert.equal(getPromoDismissalKey('telegram-community-2026-09'), 'calcuflow.telegramCommunityPromo.telegram-community-2026-09');
  assert.equal(getPromoDismissalKey('other-campaign'), 'calcuflow.telegramCommunityPromo.other-campaign');
  assert.equal(getPromoDismissalKey(''), '');
  assert.equal(getPromoDismissalKey(null), '');
});

test('isCampaignDismissed and dismissCampaign interact with storage correctly', () => {
  const storage = createMockStorage();
  const id = 'telegram-community-2026-09';

  assert.equal(isCampaignDismissed(id, storage), false);
  dismissCampaign(id, storage);
  assert.equal(isCampaignDismissed(id, storage), true);
  assert.ok(storage.getItem('calcuflow.telegramCommunityPromo.telegram-community-2026-09'));

  // Another campaign is not dismissed
  assert.equal(isCampaignDismissed('future-campaign', storage), false);
});

test('campaign ID scopes dismissal correctly without cross-campaign pollution', () => {
  const storage = createMockStorage();
  dismissCampaign('campaign-a', storage);

  assert.equal(isCampaignDismissed('campaign-a', storage), true);
  assert.equal(isCampaignDismissed('campaign-b', storage), false);

  const eligibleB = isCampaignEligible({
    promoConfig: { enabled: true, campaignId: 'campaign-b', endsAt: '2026-10-17T00:00:00.000Z' },
    now: new Date('2026-09-15T00:00:00.000Z'),
    storage
  });
  assert.equal(eligibleB, true);
});

test('qualifying first visitor before campaign end is eligible', () => {
  const storage = createMockStorage();
  const eligible = isCampaignEligible({
    promoConfig: DEFAULT_TELEGRAM_CAMPAIGN,
    now: new Date('2026-09-02T12:00:00.000Z'),
    storage
  });
  assert.equal(eligible, true);
});

test('at campaign end -> hidden', () => {
  const storage = createMockStorage();
  const eligible = isCampaignEligible({
    promoConfig: DEFAULT_TELEGRAM_CAMPAIGN,
    now: new Date('2026-10-17T00:00:00.000Z'),
    storage
  });
  assert.equal(eligible, false);
});

test('after campaign end -> hidden', () => {
  const storage = createMockStorage();
  const eligible = isCampaignEligible({
    promoConfig: DEFAULT_TELEGRAM_CAMPAIGN,
    now: new Date('2026-10-17T00:00:01.000Z'),
    storage
  });
  assert.equal(eligible, false);
});

test('dismissed campaign does not reappear', () => {
  const storage = createMockStorage();
  dismissCampaign(DEFAULT_TELEGRAM_CAMPAIGN.campaignId, storage);

  const eligible = isCampaignEligible({
    promoConfig: DEFAULT_TELEGRAM_CAMPAIGN,
    now: new Date('2026-09-05T00:00:00.000Z'),
    storage
  });
  assert.equal(eligible, false);
});

test('disabled campaign -> hidden', () => {
  const storage = createMockStorage();
  const disabledConfig = {
    ...DEFAULT_TELEGRAM_CAMPAIGN,
    enabled: false
  };
  const eligible = isCampaignEligible({
    promoConfig: disabledConfig,
    now: new Date('2026-09-05T00:00:00.000Z'),
    storage
  });
  assert.equal(eligible, false);
});

test('invalid campaign config -> hidden (fail closed)', () => {
  const storage = createMockStorage();
  const now = new Date('2026-09-05T00:00:00.000Z');

  assert.equal(isCampaignEligible({ promoConfig: null, now, storage }), false);
  assert.equal(isCampaignEligible({ promoConfig: undefined, now, storage }), false);
  assert.equal(isCampaignEligible({ promoConfig: 'invalid', now, storage }), false);
  assert.equal(isCampaignEligible({ promoConfig: {}, now, storage }), false);
  assert.equal(isCampaignEligible({ promoConfig: { enabled: true, campaignId: '' }, now, storage }), false);
  assert.equal(isCampaignEligible({ promoConfig: { enabled: true, campaignId: 'c1', endsAt: 'invalid' }, now, storage }), false);
  assert.equal(isCampaignEligible({ promoConfig: { enabled: true, campaignId: 'c1' }, now, storage }), false);
});

test('does not show popup if another modal is active or user is actively typing', () => {
  const storage = createMockStorage();
  const now = new Date('2026-09-05T00:00:00.000Z');

  assert.equal(isCampaignEligible({
    promoConfig: DEFAULT_TELEGRAM_CAMPAIGN,
    now,
    storage,
    hasActiveModal: true,
    isInputFocused: false
  }), false);

  assert.equal(isCampaignEligible({
    promoConfig: DEFAULT_TELEGRAM_CAMPAIGN,
    now,
    storage,
    hasActiveModal: false,
    isInputFocused: true
  }), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// REMOTE OPERATIONAL CONFIG TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('DEFAULT_OPERATIONAL_CONFIG includes valid telegramCommunityPromo', () => {
  assert.ok(DEFAULT_OPERATIONAL_CONFIG.telegramCommunityPromo);
  assert.equal(DEFAULT_OPERATIONAL_CONFIG.telegramCommunityPromo.enabled, true);
  assert.equal(DEFAULT_OPERATIONAL_CONFIG.telegramCommunityPromo.campaignId, 'telegram-community-2026-09');
  assert.equal(DEFAULT_OPERATIONAL_CONFIG.telegramCommunityPromo.endsAt, '2026-10-17T00:00:00.000Z');
  assert.deepEqual(DEFAULT_OPERATIONAL_CONFIG.telegramCommunityPromo, DEFAULT_TELEGRAM_COMMUNITY_PROMO);
});

test('validateRemoteConfig validates and sanitizes telegramCommunityPromo', () => {
  const raw = {
    configVersion: 1,
    telegramCommunityPromo: {
      enabled: true,
      campaignId: 'remote-campaign-1',
      endsAt: '2026-10-30T00:00:00.000Z'
    }
  };
  const validated = validateRemoteConfig(raw);
  assert.ok(validated);
  assert.deepEqual(validated.telegramCommunityPromo, {
    enabled: true,
    campaignId: 'remote-campaign-1',
    endsAt: '2026-10-30T00:00:00.000Z'
  });
});

test('validateRemoteConfig allows remote disablement of promo', () => {
  const raw = {
    configVersion: 1,
    telegramCommunityPromo: {
      enabled: false,
      campaignId: 'remote-campaign-1',
      endsAt: '2026-10-30T00:00:00.000Z'
    }
  };
  const validated = validateRemoteConfig(raw);
  assert.ok(validated);
  assert.equal(validated.telegramCommunityPromo.enabled, false);
});

test('validateOperationalConfig in js/api.js validates telegramCommunityPromo', () => {
  const raw = {
    configVersion: 1,
    telegramCommunityPromo: {
      enabled: true,
      campaignId: 'client-promo',
      endsAt: '2026-10-15T00:00:00.000Z'
    }
  };
  const validated = validateOperationalConfig(raw);
  assert.ok(validated);
  assert.deepEqual(validated.telegramCommunityPromo, {
    enabled: true,
    campaignId: 'client-promo',
    endsAt: '2026-10-15T00:00:00.000Z'
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER INTERACTION & DISMISSAL TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('controller show, dismiss, and dismissal persistence on close and CTA', () => {
  const storage = createMockStorage();
  let opened = false;
  let closed = false;

  const mockModal = {
    classList: {
      _classes: new Set(),
      contains(c) { return this._classes.has(c); },
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); }
    }
  };

  const closeListeners = [];
  const mockCloseBtn = {
    addEventListener: (type, fn) => { if (type === 'click') closeListeners.push(fn); }
  };

  const ctaListeners = [];
  const mockCta = {
    addEventListener: (type, fn) => { if (type === 'click') ctaListeners.push(fn); }
  };

  const controller = createCommunityPromoController({
    modal: mockModal,
    closeButton: mockCloseBtn,
    ctaButton: mockCta,
    getPromoConfig: () => DEFAULT_TELEGRAM_CAMPAIGN,
    getStorage: () => storage,
    openModal: () => { opened = true; mockModal.classList.add('open'); },
    closeModal: () => { closed = true; mockModal.classList.remove('open'); },
    hasActiveModal: () => false,
    isInputFocused: () => false
  });

  // First show succeeds
  assert.equal(controller.show(), true);
  assert.equal(opened, true);

  // Close click dismisses and persists to storage
  assert.equal(isCampaignDismissed(DEFAULT_TELEGRAM_CAMPAIGN.campaignId, storage), false);
  closeListeners.forEach(fn => fn());
  assert.equal(closed, true);
  assert.equal(isCampaignDismissed(DEFAULT_TELEGRAM_CAMPAIGN.campaignId, storage), true);

  // Subsequent show attempt fails because campaign is dismissed
  assert.equal(controller.show(), false);
});

test('CTA click triggers dismissal persistence', () => {
  const storage = createMockStorage();
  let closed = false;

  const mockModal = {
    classList: {
      _classes: new Set(['open']),
      contains(c) { return this._classes.has(c); },
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); }
    }
  };

  const ctaListeners = [];
  const mockCta = {
    addEventListener: (type, fn) => { if (type === 'click') ctaListeners.push(fn); }
  };

  createCommunityPromoController({
    modal: mockModal,
    ctaButton: mockCta,
    getPromoConfig: () => DEFAULT_TELEGRAM_CAMPAIGN,
    getStorage: () => storage,
    openModal: () => {},
    closeModal: () => { closed = true; },
    hasActiveModal: () => false,
    isInputFocused: () => false
  });

  ctaListeners.forEach(fn => fn());
  assert.equal(closed, true);
  assert.equal(isCampaignDismissed(DEFAULT_TELEGRAM_CAMPAIGN.campaignId, storage), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// UI & MARKUP SPECIFICATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('centered community promo modal markup exists with exact specifications', () => {
  assert.match(html, /<section class="modal-shell community-promo-shell" id="communityPromoModal" role="dialog" aria-modal="true"/);
  assert.match(html, /aria-labelledby="communityPromoTitle"/);
  assert.match(html, /aria-describedby="communityPromoDesc"/);
  assert.match(html, /id="closeCommunityPromoBtn"[^>]*aria-label="Cerrar invitación a la comunidad"/);
  assert.match(html, /id="communityPromoTitle">Únete a la comunidad CalcuFlow<\/h2>/);
  assert.match(html, /id="communityPromoDesc">Habla con otros usuarios sobre bancos, compra de divisas, comisiones, oportunidades, experiencias, ideas y operaciones Banco → USDT\.<\/p>/);
  assert.match(html, /class="community-promo-subtext">Comparte información y mantente al día con lo que está pasando entre los bancos\.<\/p>/);
  assert.match(html, /id="communityPromoCta"[^>]*href="https:\/\/t\.me\/CalcuFlow"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /id="communityPromoCta"[\s\S]*?<span>Unirme al grupo<\/span>/);
  assert.match(html, /class="community-promo-badge"[\s\S]*?class="community-telegram-icon"/);
});

test('does NOT reintroduce old Novedades or top banners', () => {
  assert.doesNotMatch(html, /class="[^"]*novedades[^"]*banner/i);
  assert.doesNotMatch(html, /class="[^"]*top-banner[^"]*"/i);
  assert.doesNotMatch(html, /class="[^"]*announcement-strip[^"]*"/i);
  assert.doesNotMatch(css, /\.top-banner/);
  assert.doesNotMatch(css, /\.announcement-strip/);
});

test('CSS enforces centered compact modal presentation on mobile viewports', () => {
  assert.match(css, /\.community-promo-shell\s*\{[\s\S]*?z-index:\s*120/);
  assert.match(css, /\.community-promo-card\s*\{[\s\S]*?max-width:\s*380px[\s\S]*?border-radius:\s*20px/);
  // Mobile override ensures display: grid place-items: center
  assert.match(css, /@media \(max-width:\s*600px\)\s*\{[\s\S]*?\.community-promo-shell\.open[\s\S]*?display:\s*grid\s*!important/);
  assert.match(css, /@media \(max-width:\s*600px\)\s*\{[\s\S]*?\.community-promo-shell \.community-promo-card[\s\S]*?border-radius:\s*20px\s*!important/);
});

// ─────────────────────────────────────────────────────────────────────────────
// PERMANENT COMMUNITY POSITIONING TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('permanent community entry points position group as broader banking and operations community', () => {
  // QR modal description is updated and no longer merely "ideas, novedades"
  assert.doesNotMatch(html, /compartir ideas, novedades/);
  assert.match(html, /id="qrTitle">Comunidad CalcuFlow<\/h2>\s*<p class="modal-description subtitle">Habla con otros usuarios sobre bancos, compra de divisas, comisiones, oportunidades y operaciones Banco → USDT\.<\/p>/);

  // QR modal preserves handle, QR image, and primary action
  assert.match(html, /class="community-handle" href="https:\/\/t\.me\/CalcuFlow"/);
  assert.match(html, /<span>t\.me\/CalcuFlow<\/span>/);
  assert.match(html, /<img[^>]*src="assets\/telegram-qr\.webp"/);
  assert.match(html, /class="bank-profile-action bank-profile-action--primary community-primary-action"[\s\S]*?<span>Abrir en Telegram<\/span>/);

  // Lightweight safety note exists in QR modal
  assert.match(html, /class="community-safety-note"[\s\S]*?La información compartida por usuarios puede variar; verifica siempre las condiciones de tu banco\./);

  // Main page Community trigger has banking/operations subtitle
  assert.match(html, /id="openCommunityBtn"[\s\S]*?<strong>Unirme al grupo<\/strong>\s*<span>Bancos, operaciones y comunidad<\/span>/);

  // Settings Community trigger has broader community subtitle
  assert.match(html, /id="openCommunitySettingsBtn"[\s\S]*?<strong>Comunidad CalcuFlow<\/strong>\s*<span>Bancos, operaciones, experiencias e ideas<\/span>/);

  // Header community button remains community-labeled
  assert.match(html, /id="openCommunityHeaderBtn"[^>]*title="Comunidad CalcuFlow"[^>]*aria-label="Abrir Comunidad CalcuFlow"/);
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION & ARCHITECTURE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('calculator formulas and calculations remain unchanged', () => {
  const result = calculateValues({
    requestedUsd: '100',
    bcvRate: '50',
    p2pRate: '60',
    bankMargin: '0.5',
    cardFee: '1.5',
    bpayFee: '4.1'
  });

  assert.ok(result);
  assert.equal(result.requestedUsd, 100);
  assert.ok(result.vesNeeded > 0);
  assert.ok(result.usdtFinal > 0);
  assert.ok(Number.isFinite(result.profitVes));
});

test('service-worker pre-caches community-promo.js and bumps APP_VERSION to 66', () => {
  assert.match(serviceWorker, /const APP_VERSION\s+= '66';/);
  assert.match(serviceWorker, /'\/js\/community-promo\.js'/);
});

test('escape key dismisses community promo and modal focus trap includes it', () => {
  assert.match(app, /else if \(els\.communityPromoModal\?\.classList\.contains\('open'\)\) promoController\?\.dismiss\(\);/);
  assert.match(app, /initCommunityPromoLifecycle/);
});
