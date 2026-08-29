import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OPERATIONAL_CONFIG,
  KNOWN_BANK_IDS,
  validateRemoteConfig,
  resolveServerConfig,
  createConfigHandler
} from '../api/config.mjs';
import {
  DEFAULT_BANK_PROFILES,
  getBankProfile,
  getBankProfiles,
  getPresetDefaultFee,
  readBankProfileState,
  restoreBankProfile,
  sanitizeBankProfileState,
  setRemoteBankDefaults,
  updateBankProfile
} from '../js/bank-profiles.js';
import { fetchRemoteConfig, validateOperationalConfig } from '../js/api.js';

function mockFetchResponse(body, { status = 200, headers = {} } = {}) {
  const allHeaders = new Headers(headers);
  if (!allHeaders.has('content-type')) {
    allHeaders.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: allHeaders
  });
}

test('DEFAULT_OPERATIONAL_CONFIG contains expected default structure and known banks', () => {
  assert.equal(DEFAULT_OPERATIONAL_CONFIG.configVersion, 1);
  assert.equal(DEFAULT_OPERATIONAL_CONFIG.defaults.bpayFee, 4.1);
  assert.equal(Object.keys(DEFAULT_OPERATIONAL_CONFIG.bankFees).length, 9);
  assert.equal(KNOWN_BANK_IDS.size, 9);
  for (const profile of DEFAULT_BANK_PROFILES) {
    assert.ok(KNOWN_BANK_IDS.has(profile.id));
    assert.equal(DEFAULT_OPERATIONAL_CONFIG.bankFees[profile.id], profile.defaultFee);
  }
});

test('validateRemoteConfig validates valid configuration object', () => {
  const valid = {
    configVersion: 1,
    updatedAt: '2026-08-29T12:00:00Z',
    defaults: { bpayFee: 4.25 },
    bankFees: {
      'bdv-fisica': 3.0,
      'bbva-provincial': 1.8
    }
  };
  const result = validateRemoteConfig(valid);
  assert.ok(result);
  assert.equal(result.configVersion, 1);
  assert.equal(result.updatedAt, '2026-08-29T12:00:00Z');
  assert.equal(result.defaults.bpayFee, 4.25);
  assert.deepEqual(result.bankFees, {
    'bdv-fisica': 3.0,
    'bbva-provincial': 1.8
  });
});

test('validateRemoteConfig rejects unsupported configVersion or invalid root type', () => {
  assert.equal(validateRemoteConfig(null), null);
  assert.equal(validateRemoteConfig('invalid'), null);
  assert.equal(validateRemoteConfig([]), null);
  assert.equal(validateRemoteConfig({ configVersion: 2 }), null);
  assert.equal(validateRemoteConfig({ configVersion: '1' }), null);
});

test('validateRemoteConfig ignores unknown bank IDs and invalid fee numbers', () => {
  const mixed = {
    configVersion: 1,
    defaults: { bpayFee: 'invalid-string' },
    bankFees: {
      'bdv-fisica': 3.0,
      'unknown-bank-id': 2.5,
      'banco-tesoro': -1,
      'bancamiga': 150,
      'bnc': NaN,
      'bdt': '2.5'
    }
  };
  const result = validateRemoteConfig(mixed);
  assert.ok(result);
  assert.equal(result.defaults, undefined);
  assert.deepEqual(result.bankFees, {
    'bdv-fisica': 3.0
  });
});

test('resolveServerConfig falls back cleanly when EDGE_CONFIG is unconfigured or empty', async () => {
  const resultNoEnv = await resolveServerConfig({ edgeConfigUrl: '' });
  assert.equal(resultNoEnv.source, 'default');
  assert.equal(resultNoEnv.cacheable, false);
  assert.deepEqual(resultNoEnv.config, DEFAULT_OPERATIONAL_CONFIG);

  const resultNullEnv = await resolveServerConfig({ edgeConfigUrl: null });
  assert.equal(resultNullEnv.source, 'default');
  assert.equal(resultNullEnv.cacheable, false);
  assert.deepEqual(resultNullEnv.config, DEFAULT_OPERATIONAL_CONFIG);
});

test('resolveServerConfig fetches from Edge Config URL and returns validated merged config', async () => {
  const mockEdgeConfigUrl = 'https://edge-config.vercel.com/ecfg_test123?token=secret_token';
  const remotePayload = {
    config: {
      configVersion: 1,
      updatedAt: '2026-08-29T12:00:00Z',
      defaults: { bpayFee: 4.5 },
      bankFees: {
        'bdv-fisica': 3.0
      }
    }
  };

  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://edge-config.vercel.com/ecfg_test123/items?token=secret_token');
    return mockFetchResponse(remotePayload);
  };

  const result = await resolveServerConfig({ edgeConfigUrl: mockEdgeConfigUrl, fetchImpl });
  assert.equal(result.source, 'edge-config');
  assert.equal(result.cacheable, true);
  assert.equal(result.config.configVersion, 1);
  assert.equal(result.config.defaults.bpayFee, 4.5);
  assert.equal(result.config.bankFees['bdv-fisica'], 3.0);
  assert.equal(result.config.bankFees['bbva-provincial'], 1.5); // Fallback from default
});

test('resolveServerConfig handles top-level items format in Edge Config', async () => {
  const mockEdgeConfigUrl = 'https://edge-config.vercel.com/ecfg_test456?token=secret_token';
  const remotePayload = {
    configVersion: 1,
    defaults: { bpayFee: 3.8 },
    bankFees: {
      'bbva-provincial': 2.0
    }
  };

  const fetchImpl = async () => mockFetchResponse(remotePayload);
  const result = await resolveServerConfig({ edgeConfigUrl: mockEdgeConfigUrl, fetchImpl });
  assert.equal(result.source, 'edge-config');
  assert.equal(result.cacheable, true);
  assert.equal(result.config.defaults.bpayFee, 3.8);
  assert.equal(result.config.bankFees['bbva-provincial'], 2.0);
});

test('resolveServerConfig falls back safely on HTTP or network failure', async () => {
  const mockEdgeConfigUrl = 'https://edge-config.vercel.com/ecfg_test123?token=secret_token';

  // HTTP 500
  const fetch500 = async () => mockFetchResponse({ error: 'Server error' }, { status: 500 });
  const result500 = await resolveServerConfig({ edgeConfigUrl: mockEdgeConfigUrl, fetchImpl: fetch500 });
  assert.equal(result500.source, 'default');
  assert.equal(result500.cacheable, false);
  assert.deepEqual(result500.config, DEFAULT_OPERATIONAL_CONFIG);

  // Network throw
  const fetchThrow = async () => { throw new Error('Network connection failure'); };
  const resultThrow = await resolveServerConfig({ edgeConfigUrl: mockEdgeConfigUrl, fetchImpl: fetchThrow });
  assert.equal(resultThrow.source, 'default');
  assert.equal(resultThrow.cacheable, false);
  assert.deepEqual(resultThrow.config, DEFAULT_OPERATIONAL_CONFIG);
});

test('createConfigHandler serves GET /api/config and rejects non-GET methods', async () => {
  const handler = createConfigHandler({
    getEdgeConfigUrl: () => '',
    fetchImpl: globalThis.fetch
  });

  const getResponse = await handler.fetch(new Request('https://example.com/api/config', { method: 'GET' }));
  assert.equal(getResponse.status, 200);
  const getBody = await getResponse.json();
  assert.equal(getBody.configVersion, 1);
  assert.equal(getResponse.headers.get('content-type'), 'application/json; charset=utf-8');

  const postResponse = await handler.fetch(new Request('https://example.com/api/config', { method: 'POST' }));
  assert.equal(postResponse.status, 405);
});

test('fetchRemoteConfig fetches and validates configuration on client', async () => {
  const mockFetch = async (url) => {
    assert.equal(url, '/api/config');
    return mockFetchResponse({
      configVersion: 1,
      defaults: { bpayFee: 4.2 },
      bankFees: { 'bdv-fisica': 2.8 }
    });
  };

  const config = await fetchRemoteConfig({ fetchImpl: mockFetch });
  assert.ok(config);
  assert.equal(config.configVersion, 1);
  assert.equal(config.defaults.bpayFee, 4.2);
  assert.equal(config.bankFees['bdv-fisica'], 2.8);
});

test('valid remote bank fee applies to uncustomized bank profile', () => {
  // Reset remote bank defaults first
  setRemoteBankDefaults(null);

  let state = sanitizeBankProfileState({});
  const bdvInitial = getBankProfile(state, 'bdv-fisica');
  assert.equal(bdvInitial.fee, 2.5);
  assert.equal(bdvInitial.isModified, false);

  // Apply remote default BDV 2.5 -> 3.0
  setRemoteBankDefaults({ 'bdv-fisica': 3.0 });
  assert.equal(getPresetDefaultFee('bdv-fisica'), 3.0);

  state = sanitizeBankProfileState(state);
  const bdvUpdated = getBankProfile(state, 'bdv-fisica');
  assert.equal(bdvUpdated.fee, 3.0);
  assert.equal(bdvUpdated.defaultFee, 3.0);
  assert.equal(bdvUpdated.isModified, false);

  // Cleanup
  setRemoteBankDefaults(null);
});

test('explicit bank profile override wins over remote default', () => {
  setRemoteBankDefaults(null);

  let state = sanitizeBankProfileState({});
  // User explicitly sets BDV to 2.2%
  state = updateBankProfile(state, {
    ...getBankProfile(state, 'bdv-fisica'),
    fee: 2.2
  });

  const bdvCustom = getBankProfile(state, 'bdv-fisica');
  assert.equal(bdvCustom.fee, 2.2);
  assert.equal(bdvCustom.isModified, true);
  assert.deepEqual(bdvCustom.overrides, ['fee']);

  // Remote default changes to 3.0%
  setRemoteBankDefaults({ 'bdv-fisica': 3.0 });
  assert.equal(getPresetDefaultFee('bdv-fisica'), 3.0);

  state = sanitizeBankProfileState(state);
  const bdvPreserved = getBankProfile(state, 'bdv-fisica');
  assert.equal(bdvPreserved.fee, 2.2); // User override preserved!
  assert.equal(bdvPreserved.defaultFee, 3.0);
  assert.equal(bdvPreserved.isModified, true);

  // When user restores this bank, it resets to the active remote default (3.0%)
  state = restoreBankProfile(state, 'bdv-fisica');
  const bdvRestored = getBankProfile(state, 'bdv-fisica');
  assert.equal(bdvRestored.fee, 3.0);
  assert.equal(bdvRestored.isModified, false);

  // Cleanup
  setRemoteBankDefaults(null);
});
