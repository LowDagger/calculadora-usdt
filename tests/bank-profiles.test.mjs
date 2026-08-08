import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import {
  BANK_ICONS,
  BANK_PROFILE_STATE_VERSION,
  BANK_PROFILE_STORAGE_KEY,
  DEFAULT_BANK_PROFILES,
  DEFAULT_QUICK_AMOUNTS,
  DEFAULT_PROFILE_ID,
  MANUAL_PROFILE_ID,
  getGeneralQuickAmounts,
  getEffectiveSelectedBankProfile,
  getBankProfile,
  getBankProfiles,
  getProfileQuickAmounts,
  getSelectedBankProfile,
  groupBankProfiles,
  hasDuplicateProfileName,
  loadBankProfileState,
  readBankProfileState,
  removeBankProfile,
  restoreGeneralQuickAmounts,
  restoreBankProfile,
  restoreDefaultBankProfiles,
  saveBankProfileState,
  sanitizeBankProfileState,
  sanitizeQuickAmounts,
  sanitizeProfileLogo,
  selectBankProfile,
  updateBankProfile,
  updateGeneralQuickAmounts,
  updateProfileQuickAmounts,
  useGeneralQuickAmountsForProfile,
  upsertCustomProfile
} from '../js/bank-profiles.js';
import { calculateValues } from '../js/calculator.js';

const EXPECTED_PRESETS = {
  'bdv-fisica': 1.5,
  'bdv-virtual': 2.5,
  'bbva-provincial': 0,
  'banco-tesoro': 2.5,
  bancamiga: 5,
  'banesco-fisica': 1.5,
  'banesco-virtual': 2.5,
  bnc: 1.5
};

function memoryStorage(initial = {}, { quotaError = false } = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (quotaError) {
        const error = new Error('Quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(key, String(value));
    },
    value(key) {
      return values.get(key);
    }
  };
}

test('includes every immutable initial bank profile and reported percentage', () => {
  assert.equal(BANK_PROFILE_STATE_VERSION, 4);
  assert.equal(DEFAULT_BANK_PROFILES.length, 8);
  assert.deepEqual(
    Object.fromEntries(DEFAULT_BANK_PROFILES.map(profile => [profile.id, profile.defaultFee])),
    EXPECTED_PRESETS
  );

  const profiles = getBankProfiles({});
  assert.equal(getBankProfile({}, 'bbva-provincial').fee, 0);
  assert.equal(getBankProfile({}, 'bdv-virtual').status, 'Pendiente de confirmar');
  assert.ok(profiles.every(profile => profile.icon?.startsWith('/assets/banks/')));
  assert.ok(profiles.every(profile => profile.iconScale > 0 && profile.iconScale <= 1));
  assert.equal(Object.isFrozen(DEFAULT_BANK_PROFILES), true);
  assert.ok(DEFAULT_BANK_PROFILES.every(Object.isFrozen));
});

test('uses one icon map for every preset and a neutral manual symbol', () => {
  const profiles = getBankProfiles({});
  const iconPaths = new Set(Object.values(BANK_ICONS).map(icon => icon.src).filter(Boolean));

  assert.equal(iconPaths.size, 6);
  for (const iconPath of iconPaths) {
    assert.equal(existsSync(new URL(`..${iconPath}`, import.meta.url)), true, iconPath);
  }
  assert.deepEqual(new Set(profiles.map(profile => profile.icon)), iconPaths);
  assert.equal(getBankProfile({}, MANUAL_PROFILE_ID).icon, null);
  assert.equal(getBankProfile({}, MANUAL_PROFILE_ID).iconSymbol, 'account_balance');
  assert.equal(getBankProfile({}, 'bnc').iconDarkFilter, 'brightness(0) invert(1)');
});

test('groups multimodality banks while keeping single-modality banks direct', () => {
  const profiles = [...getBankProfiles({}), getBankProfile({}, MANUAL_PROFILE_ID, 2.75)];
  const groups = groupBankProfiles(profiles);
  const bdv = groups.find(group => group.name === 'Banco de Venezuela');
  const banesco = groups.find(group => group.name === 'Banesco');

  assert.equal(groups.length, 7);
  assert.deepEqual(bdv.profiles.map(profile => profile.id), ['bdv-fisica', 'bdv-virtual']);
  assert.deepEqual(banesco.profiles.map(profile => profile.id), ['banesco-fisica', 'banesco-virtual']);
});

test('edits every field of a default profile without changing its stable id and restores it', () => {
  let state = sanitizeBankProfileState({});
  state = updateBankProfile(state, {
    ...getBankProfile(state, 'bdv-fisica'),
    name: 'Banco Principal',
    cardType: 'Virtual',
    fee: '2,75',
    icon: null
  });

  const modified = getBankProfile(state, 'bdv-fisica');
  assert.equal(modified.id, 'bdv-fisica');
  assert.equal(modified.name, 'Banco Principal');
  assert.equal(modified.cardType, 'Virtual');
  assert.equal(modified.fee, 2.75);
  assert.equal(modified.icon, null);
  assert.equal(modified.isModified, true);

  state = restoreBankProfile(state, 'bdv-fisica');
  const restored = getBankProfile(state, 'bdv-fisica');
  assert.equal(restored.name, 'Banco de Venezuela');
  assert.equal(restored.cardType, 'Física');
  assert.equal(restored.fee, 1.5);
  assert.equal(restored.icon, BANK_ICONS.bdv.src);
  assert.equal(restored.isModified, false);
});

test('creates, edits, selects, and removes a custom profile with a safe selection fallback', () => {
  let state = sanitizeBankProfileState({});
  state = upsertCustomProfile(state, {
    name: 'Mi Banco',
    cardType: 'Débito virtual',
    fee: '3.25',
    icon: 'data:image/png;base64,AAAA'
  }, 'custom-mi-banco');
  state = selectBankProfile(state, 'custom-mi-banco');

  assert.equal(getSelectedBankProfile(state).name, 'Mi Banco');
  assert.equal(getSelectedBankProfile(state).fee, 3.25);

  state = updateBankProfile(state, {
    ...getSelectedBankProfile(state),
    name: 'Mi Banco Editado',
    cardType: '',
    fee: 4
  });
  assert.equal(getSelectedBankProfile(state).name, 'Mi Banco Editado');

  state = removeBankProfile(state, 'custom-mi-banco');
  assert.equal(getBankProfile(state, 'custom-mi-banco'), null);
  assert.equal(state.selectedId, DEFAULT_PROFILE_ID);
});

test('allows deleting defaults but never the final remaining profile', () => {
  let state = selectBankProfile(sanitizeBankProfileState({}), 'bdv-fisica');
  state = removeBankProfile(state, 'bdv-fisica');
  assert.equal(getBankProfile(state, 'bdv-fisica'), null);
  assert.notEqual(state.selectedId, 'bdv-fisica');

  while (state.profiles.length > 1) {
    state = removeBankProfile(state, state.profiles[0].id);
  }
  const finalId = state.profiles[0].id;
  const unchanged = removeBankProfile(state, finalId);
  assert.equal(unchanged.profiles.length, 1);
  assert.equal(unchanged.profiles[0].id, finalId);
});

test('manages general and bank-specific quick amounts without cross-profile leakage', () => {
  let state = sanitizeBankProfileState({});
  assert.equal(state.version, BANK_PROFILE_STATE_VERSION);
  assert.deepEqual(getGeneralQuickAmounts(state), [...DEFAULT_QUICK_AMOUNTS]);
  assert.deepEqual(getProfileQuickAmounts(state, 'bdv-fisica'), [...DEFAULT_QUICK_AMOUNTS]);

  state = updateGeneralQuickAmounts(state, [100, '250', 500, 2000]);
  assert.deepEqual(getProfileQuickAmounts(state, 'bdv-fisica'), [100, 250, 500, 2000]);
  assert.deepEqual(getProfileQuickAmounts(state, 'banesco-fisica'), [100, 250, 500, 2000]);

  state = updateProfileQuickAmounts(state, 'bdv-fisica', [200, 750]);
  assert.deepEqual(getProfileQuickAmounts(state, 'bdv-fisica'), [200, 750]);
  assert.deepEqual(getProfileQuickAmounts(state, 'banesco-fisica'), [100, 250, 500, 2000]);

  state = updateGeneralQuickAmounts(state, [300, 600]);
  assert.deepEqual(getProfileQuickAmounts(state, 'bdv-fisica'), [200, 750]);
  assert.deepEqual(getProfileQuickAmounts(state, 'banesco-fisica'), [300, 600]);

  state = useGeneralQuickAmountsForProfile(state, 'bdv-fisica');
  assert.deepEqual(getProfileQuickAmounts(state, 'bdv-fisica'), [300, 600]);

  state = restoreGeneralQuickAmounts(state);
  assert.deepEqual(getGeneralQuickAmounts(state), [...DEFAULT_QUICK_AMOUNTS]);
});

test('migrates only the V3 general defaults while preserving custom and profile-specific amounts', () => {
  const profiles = sanitizeBankProfileState({}).profiles;
  const target = profiles.find(profile => profile.id === 'bdv-fisica');
  target.quickAmounts = [100, 500, 1000];

  const migratedDefaults = sanitizeBankProfileState({
    version: 3,
    selectedId: 'bdv-fisica',
    quickAmounts: [100, 500, 1000],
    profiles
  });
  assert.deepEqual(getGeneralQuickAmounts(migratedDefaults), [100, 200, 500, 1000]);
  assert.deepEqual(getProfileQuickAmounts(migratedDefaults, 'bdv-fisica'), [100, 500, 1000]);

  const migratedCustom = sanitizeBankProfileState({
    version: 3,
    selectedId: 'bdv-fisica',
    quickAmounts: [150, 350],
    profiles
  });
  assert.deepEqual(getGeneralQuickAmounts(migratedCustom), [150, 350]);
});

test('validates quick amounts and supports add, edit, delete, and numeric sorting', () => {
  assert.deepEqual(sanitizeQuickAmounts([100]), [100]);
  assert.deepEqual(sanitizeQuickAmounts(['200', 250, 500, 10000]), [200, 250, 500, 10000]);
  assert.equal(sanitizeQuickAmounts([]), null);
  assert.equal(sanitizeQuickAmounts([100, 100]), null);
  assert.equal(sanitizeQuickAmounts([0]), null);
  assert.equal(sanitizeQuickAmounts([-100]), null);
  assert.equal(sanitizeQuickAmounts(['abc']), null);
  assert.equal(sanitizeQuickAmounts([Infinity]), null);
  assert.equal(sanitizeQuickAmounts([NaN]), null);
  assert.equal(sanitizeQuickAmounts([10001]), null);
  assert.equal(sanitizeQuickAmounts([1, 2, 3, 4, 5]), null);

  let state = sanitizeBankProfileState({});
  state = updateProfileQuickAmounts(state, 'bnc', [100, 200, 500]);
  state = updateProfileQuickAmounts(state, 'bnc', [200, 100, 500]);
  assert.deepEqual(getProfileQuickAmounts(state, 'bnc'), [100, 200, 500]);
  state = updateProfileQuickAmounts(state, 'bnc', [200, 500]);
  assert.deepEqual(getProfileQuickAmounts(state, 'bnc'), [200, 500]);
});

test('detects duplicate names case-insensitively while supporting stable-id edits', () => {
  const state = sanitizeBankProfileState({});
  assert.equal(hasDuplicateProfileName(state, '  bAnCaMiGa  '), true);
  assert.equal(hasDuplicateProfileName(state, 'Bancamiga', 'bancamiga'), false);
  assert.equal(hasDuplicateProfileName(state, 'Banco Nuevo'), false);
});

test('sanitizes invalid V2 records, duplicate ids, unknown ids, fees, and logos', () => {
  const state = sanitizeBankProfileState({
    version: BANK_PROFILE_STATE_VERSION,
    selectedId: 'unknown',
    profiles: [
      {
        id: 'custom-valid',
        name: '  Banco   Seguro  ',
        cardType: ' Virtual ',
        fee: '2.25',
        icon: 'javascript:alert(1)'
      },
      { id: 'custom-valid', name: 'Duplicado', fee: 7 },
      { id: 'custom-bad-fee', name: 'Inválido', fee: 'Infinity' },
      { id: 'unknown-id', name: 'Desconocido', fee: 1 }
    ]
  });

  assert.deepEqual(state.profiles, [{
    id: 'custom-valid',
    name: 'Banco Seguro',
    cardType: 'Virtual',
    fee: 2.25,
    icon: null
  }]);
  assert.equal(state.selectedId, 'custom-valid');
});

test('migrates valid V1 data idempotently and preserves selection, edits, and custom profiles', () => {
  const oldState = {
    version: 1,
    selectedId: 'custom-familiar',
    presetFees: { bancamiga: 4.5, unknown: 12 },
    customProfiles: [{
      id: 'custom-familiar',
      name: 'Banco Familiar',
      cardType: 'Débito',
      fee: 1.25,
      icon: null
    }]
  };
  const migrated = sanitizeBankProfileState(oldState);
  const repeated = sanitizeBankProfileState(migrated);

  assert.equal(migrated.version, BANK_PROFILE_STATE_VERSION);
  assert.equal(migrated.selectedId, 'custom-familiar');
  assert.equal(getBankProfile(migrated, 'bancamiga').fee, 4.5);
  assert.equal(getSelectedBankProfile(migrated).name, 'Banco Familiar');
  assert.deepEqual(repeated, migrated);
});

test('migrates existing V2 users to general quick amounts without data loss', () => {
  const oldState = {
    version: 2,
    selectedId: 'custom-familiar',
    profiles: [
      { id: 'bdv-fisica', name: 'Banco Principal', cardType: 'Física', fee: 2.75, icon: null },
      { id: 'custom-familiar', name: 'Banco Familiar', cardType: 'Débito', fee: 1.25, icon: null }
    ]
  };
  const migrated = sanitizeBankProfileState(oldState);

  assert.equal(migrated.version, BANK_PROFILE_STATE_VERSION);
  assert.equal(migrated.selectedId, 'custom-familiar');
  assert.equal(getBankProfile(migrated, 'bdv-fisica').name, 'Banco Principal');
  assert.equal(getBankProfile(migrated, 'custom-familiar').fee, 1.25);
  assert.deepEqual(getGeneralQuickAmounts(migrated), [...DEFAULT_QUICK_AMOUNTS]);
  assert.deepEqual(getProfileQuickAmounts(migrated, 'custom-familiar'), [...DEFAULT_QUICK_AMOUNTS]);
});

test('handles missing, unknown, and corrupt storage without silently overwriting it', () => {
  const missing = memoryStorage();
  assert.equal(loadBankProfileState(missing, { hasLegacyCardFee: true }).selectedId, MANUAL_PROFILE_ID);

  const corruptRaw = '{invalid json';
  const corrupt = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: corruptRaw });
  const read = readBankProfileState(corrupt, { hasLegacyCardFee: true });
  assert.equal(read.state.selectedId, MANUAL_PROFILE_ID);
  assert.equal(read.shouldPersist, false);
  assert.equal(read.warning, 'corrupt');
  assert.equal(corrupt.value(BANK_PROFILE_STORAGE_KEY), corruptRaw);

  const unusableRaw = JSON.stringify({ version: BANK_PROFILE_STATE_VERSION, selectedId: 'gone', profiles: [] });
  const unusable = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: unusableRaw });
  const unusableRead = readBankProfileState(unusable);
  assert.equal(unusableRead.warning, 'profiles-invalid');
  assert.equal(unusableRead.shouldPersist, false);
  assert.equal(unusable.value(BANK_PROFILE_STORAGE_KEY), unusableRaw);

  const futureRaw = JSON.stringify({ version: 999, selectedId: 'future', profiles: [] });
  const future = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: futureRaw });
  const futureRead = readBankProfileState(future);
  assert.equal(futureRead.warning, 'unsupported-version');
  assert.equal(futureRead.shouldPersist, false);
  assert.equal(future.value(BANK_PROFILE_STORAGE_KEY), futureRaw);

  const unknownSelection = sanitizeBankProfileState({
    version: BANK_PROFILE_STATE_VERSION,
    selectedId: 'missing-profile',
    profiles: sanitizeBankProfileState({}).profiles
  });
  assert.equal(unknownSelection.selectedId, DEFAULT_PROFILE_ID);
});

test('surfaces quota failures without changing the previously saved state', () => {
  const previousRaw = JSON.stringify(sanitizeBankProfileState({}));
  const storage = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: previousRaw }, { quotaError: true });
  const next = upsertCustomProfile(sanitizeBankProfileState({}), {
    name: 'Banco Sin Espacio',
    fee: 2
  }, 'custom-sin-espacio');

  assert.throws(
    () => saveBankProfileState(storage, next),
    error => error.name === 'QuotaExceededError' && error.message === 'Quota exceeded'
  );
  assert.equal(storage.value(BANK_PROFILE_STORAGE_KEY), previousRaw);
});

test('accepts only safe local assets or bounded PNG, JPEG, and WebP data URLs', () => {
  assert.equal(sanitizeProfileLogo('/assets/banks/bnc.png'), '/assets/banks/bnc.png');
  assert.equal(sanitizeProfileLogo('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(sanitizeProfileLogo('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  assert.equal(sanitizeProfileLogo('data:image/webp;base64,AAAA'), 'data:image/webp;base64,AAAA');
  assert.equal(sanitizeProfileLogo('data:image/svg+xml;base64,AAAA'), null);
  assert.equal(sanitizeProfileLogo('data:image/png;base64,***'), null);
  assert.equal(
    sanitizeProfileLogo(`data:image/webp;base64,${Buffer.alloc(100 * 1024 + 1).toString('base64')}`),
    null
  );
});

test('restores the exact immutable defaults and removes every custom or modified profile', () => {
  let state = sanitizeBankProfileState({});
  state = updateBankProfile(state, { ...getBankProfile(state, 'bnc'), name: 'BNC Editado', fee: 9 });
  state = upsertCustomProfile(state, { name: 'Banco Extra', fee: 3 }, 'custom-extra');
  state = selectBankProfile(state, 'custom-extra');

  const restored = restoreDefaultBankProfiles();
  assert.equal(restored.selectedId, DEFAULT_PROFILE_ID);
  assert.equal(restored.profiles.length, DEFAULT_BANK_PROFILES.length);
  assert.equal(getBankProfile(restored, 'bnc').name, 'BNC');
  assert.equal(getBankProfile(restored, 'bnc').fee, 1.5);
  assert.equal(getBankProfile(restored, 'custom-extra'), null);
  assert.ok(getBankProfiles(restored).every(profile => profile.isModified === false));
});

test('persists the current profile collection across reloads', () => {
  const storage = memoryStorage();
  let state = sanitizeBankProfileState({});
  state = updateBankProfile(state, { ...getBankProfile(state, 'bancamiga'), fee: 4.5 });
  state = upsertCustomProfile(state, {
    name: 'Banco Familiar',
    cardType: 'Débito',
    fee: 1.25
  }, 'custom-banco-familiar');
  state = selectBankProfile(state, 'custom-banco-familiar');

  saveBankProfileState(storage, state);
  const reloaded = loadBankProfileState(storage);

  assert.equal(reloaded.version, BANK_PROFILE_STATE_VERSION);
  assert.equal(reloaded.selectedId, 'custom-banco-familiar');
  assert.equal(getBankProfile(reloaded, 'bancamiga').fee, 4.5);
  assert.equal(getSelectedBankProfile(reloaded).name, 'Banco Familiar');
});

test('applies a temporary fee without changing the selected profile or its saved value', () => {
  const state = selectBankProfile(sanitizeBankProfileState({}), 'bdv-fisica');
  const before = structuredClone(state);
  const temporary = getEffectiveSelectedBankProfile(state, 0, '2,2');
  const saved = getSelectedBankProfile(state);

  assert.equal(temporary.id, 'bdv-fisica');
  assert.equal(temporary.fee, 2.2);
  assert.equal(temporary.status, 'Temporal');
  assert.equal(saved.fee, 1.5);
  assert.deepEqual(state, before);
});

test('bank selection changes only the card fee and keeps bank margin and BPay fixed', () => {
  const common = {
    requestedUsd: '500',
    bcvRate: '727.4512',
    bankMargin: '0.5',
    p2pRate: '849.9495',
    bpayFee: '4.1'
  };
  const expectedBankRate = calculateValues({ ...common, cardFee: '1.5' }).bank;

  for (const profile of getBankProfiles({})) {
    const result = calculateValues({ ...common, cardFee: String(profile.fee) });
    assert.ok(result, profile.id);
    assert.equal(result.cardPct, profile.fee, profile.id);
    assert.equal(result.bpayPct, 4.1, profile.id);
    assert.equal(result.bank, expectedBankRate, profile.id);
  }
});

test('profile commission continues to apply before the BPay commission', () => {
  const profile = getBankProfile({}, 'banesco-virtual');
  const result = calculateValues({
    requestedUsd: '500',
    bcvRate: '727.4512',
    bankMargin: '0.5',
    p2pRate: '849.9495',
    cardFee: String(profile.fee),
    bpayFee: '4.1'
  });

  assert.equal(result.cardPct, 2.5);
  assert.equal(result.safeGateway.expectedBankDeduction, 499.98);
  assert.equal(result.safeGateway.bpayInputAmount, result.afterCard);
  assert.equal(result.safeGateway.netToBinance, result.usdtFinal);
  assert.equal(result.bpayFeeUsd, result.afterCard - result.usdtFinal);
});
