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
  MAX_CUSTOM_PROFILES,
  MAX_TOTAL_PROFILES,
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
  'bbva-provincial': 1.5,
  'banco-tesoro': 2.5,
  bancamiga: 5,
  'banesco-fisica': 1.5,
  'banesco-virtual': 2.5,
  bnc: 1.5,
  bdt: 2.5
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
  assert.equal(BANK_PROFILE_STATE_VERSION, 5);
  assert.equal(DEFAULT_BANK_PROFILES.length, 9);
  assert.deepEqual(
    Object.fromEntries(DEFAULT_BANK_PROFILES.map(profile => [profile.id, profile.defaultFee])),
    EXPECTED_PRESETS
  );

  const profiles = getBankProfiles({});
  const bbvaDefault = DEFAULT_BANK_PROFILES.find(profile => profile.id === 'bbva-provincial');
  assert.equal(bbvaDefault.defaultFee, 1.5);
  assert.equal(bbvaDefault.initials, 'BBVA');
  assert.equal(bbvaDefault.iconKey, 'bbva');

  const bdtDefault = DEFAULT_BANK_PROFILES.find(profile => profile.id === 'bdt');
  assert.equal(bdtDefault.name, 'Banco Digital de los Trabajadores');
  assert.equal(bdtDefault.defaultFee, 2.5);
  assert.equal(bdtDefault.initials, 'BDT');
  assert.equal(bdtDefault.iconKey, 'bdt');
  assert.equal(bdtDefault.defaultStatus, 'Comisión reportada');

  const bbvaProfile = getBankProfile({}, 'bbva-provincial');
  assert.equal(bbvaProfile.fee, 1.5);
  assert.equal(bbvaProfile.defaultFee, 1.5);
  assert.equal(bbvaProfile.name, 'BBVA Provincial');

  const bdtProfile = getBankProfile({}, 'bdt');
  assert.equal(bdtProfile.fee, 2.5);
  assert.equal(bdtProfile.defaultFee, 2.5);
  assert.equal(bdtProfile.name, 'Banco Digital de los Trabajadores');
  assert.equal(bdtProfile.cardType, '');
  assert.equal(bdtProfile.icon, '/assets/banks/bdt.png');
  assert.equal(bdtProfile.status, 'Comisión reportada');

  assert.equal(getBankProfile({}, 'bdv-virtual').status, 'Pendiente de confirmar');
  assert.ok(profiles.every(profile => profile.icon?.startsWith('/assets/banks/')));
  assert.ok(profiles.every(profile => profile.iconScale > 0 && profile.iconScale <= 1));
  assert.equal(Object.isFrozen(DEFAULT_BANK_PROFILES), true);
  assert.ok(DEFAULT_BANK_PROFILES.every(Object.isFrozen));
});

test('uses one icon map for every preset and a neutral manual symbol', () => {
  const profiles = getBankProfiles({});
  const iconPaths = new Set(Object.values(BANK_ICONS).map(icon => icon.src).filter(Boolean));

  assert.equal(iconPaths.size, 7);
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

  assert.equal(groups.length, 8);
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

test('manages custom profile creation with general and personalized quick amounts', () => {
  let state = sanitizeBankProfileState({});

  state = upsertCustomProfile(state, {
    name: 'Banco General',
    fee: 2
  }, 'custom-general');
  assert.equal(getBankProfile(state, 'custom-general').quickAmounts, undefined);
  assert.deepEqual(getProfileQuickAmounts(state, 'custom-general'), [...DEFAULT_QUICK_AMOUNTS]);

  state = updateGeneralQuickAmounts(state, [50, 150, 300, 600]);
  assert.deepEqual(getProfileQuickAmounts(state, 'custom-general'), [50, 150, 300, 600]);

  state = upsertCustomProfile(state, {
    name: 'Banco Personalizado',
    fee: 3,
    quickAmounts: [25, 75, 125]
  }, 'custom-personalized');
  assert.deepEqual(getProfileQuickAmounts(state, 'custom-personalized'), [25, 75, 125]);

  state = updateGeneralQuickAmounts(state, [100, 200, 500, 1000]);
  assert.deepEqual(getProfileQuickAmounts(state, 'custom-personalized'), [25, 75, 125]);
  assert.deepEqual(getProfileQuickAmounts(state, 'custom-general'), [100, 200, 500, 1000]);

  state = useGeneralQuickAmountsForProfile(state, 'custom-personalized');
  assert.equal(getBankProfile(state, 'custom-personalized').quickAmounts, undefined);
  assert.deepEqual(getProfileQuickAmounts(state, 'custom-personalized'), [100, 200, 500, 1000]);
});

test('rejects invalid personalized quick amounts strictly across edge cases', () => {
  assert.equal(sanitizeQuickAmounts([]), null);
  assert.equal(sanitizeQuickAmounts(['']), null);
  assert.equal(sanitizeQuickAmounts(['   ']), null);
  assert.equal(sanitizeQuickAmounts([0]), null);
  assert.equal(sanitizeQuickAmounts([-1]), null);
  assert.equal(sanitizeQuickAmounts([-500]), null);
  assert.equal(sanitizeQuickAmounts([100.5]), null);
  assert.equal(sanitizeQuickAmounts(['99.9']), null);
  assert.equal(sanitizeQuickAmounts([100, 100]), null);
  assert.equal(sanitizeQuickAmounts([50, 100, 50]), null);
  assert.equal(sanitizeQuickAmounts([10001]), null);
  assert.equal(sanitizeQuickAmounts([100, 200, 300, 400, 500]), null);
  assert.equal(sanitizeQuickAmounts([null]), null);
  assert.equal(sanitizeQuickAmounts([undefined]), null);
  assert.equal(sanitizeQuickAmounts(['abc']), null);
  assert.equal(sanitizeQuickAmounts([NaN]), null);
  assert.equal(sanitizeQuickAmounts([Infinity]), null);

  assert.deepEqual(sanitizeQuickAmounts([1]), [1]);
  assert.deepEqual(sanitizeQuickAmounts([10000]), [10000]);
  assert.deepEqual(sanitizeQuickAmounts(['1', '10000']), [1, 10000]);
  assert.deepEqual(sanitizeQuickAmounts([10, 20, 30, 40]), [10, 20, 30, 40]);

  let state = sanitizeBankProfileState({});
  state = updateProfileQuickAmounts(state, 'bnc', [100, 300]);
  assert.deepEqual(getProfileQuickAmounts(state, 'bnc'), [100, 300]);

  const stateBefore = structuredClone(state);
  assert.deepEqual(updateProfileQuickAmounts(state, 'bnc', [0]), stateBefore);
  assert.deepEqual(updateProfileQuickAmounts(state, 'bnc', [-100]), stateBefore);
  assert.deepEqual(updateProfileQuickAmounts(state, 'bnc', [100.5]), stateBefore);
  assert.deepEqual(updateProfileQuickAmounts(state, 'bnc', [100, 100]), stateBefore);
  assert.deepEqual(updateProfileQuickAmounts(state, 'bnc', [10001]), stateBefore);
  assert.deepEqual(updateProfileQuickAmounts(state, 'bnc', []), stateBefore);
});


test('detects duplicate names case-insensitively while supporting stable-id edits', () => {
  const state = sanitizeBankProfileState({});
  assert.equal(hasDuplicateProfileName(state, '  bAnCaMiGa  '), true);
  assert.equal(hasDuplicateProfileName(state, 'Bancamiga', 'bancamiga'), false);
  assert.equal(hasDuplicateProfileName(state, 'Banco Nuevo'), false);
});

test('sanitizes invalid custom records, duplicate ids, unknown ids, fees, and logos', () => {
  const state = sanitizeBankProfileState({
    version: BANK_PROFILE_STATE_VERSION,
    selectedId: 'custom-valid',
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

  const customProfile = state.profiles.find(p => p.id === 'custom-valid');
  assert.deepEqual(customProfile, {
    id: 'custom-valid',
    name: 'Banco Seguro',
    cardType: 'Virtual',
    fee: 2.25,
    icon: null
  });
  assert.equal(state.profiles.some(p => p.id === 'custom-bad-fee' || p.id === 'unknown-id'), false);
  assert.equal(state.selectedId, 'custom-valid');
  assert.equal(state.profiles.length, 10);
});

test('v4 to v5 migration adopts historical defaults and marks deliberate overrides', () => {
  const v4Untouched = {
    version: 4,
    selectedId: 'bdv-virtual',
    quickAmounts: [100, 200, 500, 1000],
    profiles: [
      { id: 'bdv-fisica', name: 'Banco de Venezuela', cardType: 'Física', fee: 1.5, icon: '/assets/banks/banco-de-venezuela.png' },
      { id: 'bdv-virtual', name: 'Banco de Venezuela', cardType: 'Virtual / otra modalidad', fee: 2.5, icon: '/assets/banks/banco-de-venezuela.png' },
      { id: 'bbva-provincial', name: 'BBVA Provincial', cardType: '', fee: 0, icon: '/assets/banks/bbva-provisional.png' },
      { id: 'banco-tesoro', name: 'Banco del Tesoro', cardType: '', fee: 2.5, icon: '/assets/banks/banco-del-tesoro.png' },
      { id: 'bancamiga', name: 'Bancamiga', cardType: '', fee: 5, icon: '/assets/banks/bancamiga.png' },
      { id: 'banesco-fisica', name: 'Banesco', cardType: 'Física', fee: 1.5, icon: '/assets/banks/banesco-provisional.png' },
      { id: 'banesco-virtual', name: 'Banesco', cardType: 'Virtual', fee: 2.5, icon: '/assets/banks/banesco-provisional.png' },
      { id: 'bnc', name: 'BNC', cardType: '', fee: 1.5, icon: '/assets/banks/bnc.png' }
    ]
  };

  const migrated = sanitizeBankProfileState(v4Untouched);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.profiles.length, 9);

  const bbva = getBankProfile(migrated, 'bbva-provincial');
  assert.equal(bbva.fee, 1.5);
  assert.equal(bbva.isModified, false);
  assert.equal(bbva.overrides, undefined);

  const bdt = getBankProfile(migrated, 'bdt');
  assert.ok(bdt);
  assert.equal(bdt.fee, 2.5);
  assert.equal(bdt.name, 'Banco Digital de los Trabajadores');
  assert.equal(bdt.isModified, false);

  const v4Customized = {
    version: 4,
    selectedId: 'custom-negocio',
    quickAmounts: [50, 100, 200],
    profiles: [
      { id: 'bbva-provincial', name: 'BBVA Provincial', cardType: '', fee: 3.5, icon: '/assets/banks/bbva-provisional.png' },
      { id: 'bdt', name: 'BDT', cardType: 'Virtual', fee: 0, icon: '/assets/banks/bdt.png' },
      {
        id: 'custom-negocio',
        name: 'Banco Negocio',
        cardType: 'Corriente',
        fee: 2.1,
        icon: null,
        quickAmounts: [500, 1000]
      }
    ]
  };

  const migratedCustomized = sanitizeBankProfileState(v4Customized);
  const bbvaCustom = getBankProfile(migratedCustomized, 'bbva-provincial');
  assert.equal(bbvaCustom.fee, 3.5);
  assert.deepEqual(bbvaCustom.overrides, ['fee']);
  assert.equal(bbvaCustom.isModified, true);

  const bdtMigrated = getBankProfile(migratedCustomized, 'bdt');
  assert.equal(bdtMigrated.fee, 2.5);
  assert.equal(bdtMigrated.name, 'BDT');
  assert.equal(bdtMigrated.cardType, 'Virtual');
  assert.deepEqual(new Set(bdtMigrated.overrides), new Set(['name', 'cardType']));

  const customProfile = getBankProfile(migratedCustomized, 'custom-negocio');
  assert.equal(customProfile.name, 'Banco Negocio');
  assert.equal(customProfile.fee, 2.1);
  assert.deepEqual(customProfile.quickAmounts, [500, 1000]);
  assert.equal(customProfile.overrides, undefined);

  assert.equal(migratedCustomized.selectedId, 'custom-negocio');
  assert.deepEqual(migratedCustomized.quickAmounts, [50, 100, 200]);

  const repeated = sanitizeBankProfileState(migratedCustomized);
  assert.deepEqual(repeated, migratedCustomized);
});

test('v5 reconciliation tracks explicit overrides and inherits updated defaults', () => {
  let state = sanitizeBankProfileState({});

  state = updateBankProfile(state, {
    ...getBankProfile(state, 'bnc'),
    fee: 2.75
  });
  const bncWithFeeOverride = getBankProfile(state, 'bnc');
  assert.equal(bncWithFeeOverride.fee, 2.75);
  assert.deepEqual(bncWithFeeOverride.overrides, ['fee']);

  state = updateBankProfile(state, {
    ...getBankProfile(state, 'bnc'),
    name: 'BNC Personal',
    cardType: 'Crédito'
  });
  const bncFullOverride = getBankProfile(state, 'bnc');
  assert.equal(bncFullOverride.name, 'BNC Personal');
  assert.equal(bncFullOverride.cardType, 'Crédito');
  assert.equal(bncFullOverride.fee, 2.75);
  assert.deepEqual(new Set(bncFullOverride.overrides), new Set(['name', 'cardType', 'fee']));

  state = updateBankProfile(state, {
    ...getBankProfile(state, 'bnc'),
    name: 'BNC',
    cardType: ''
  });
  const bncFeeOnly = getBankProfile(state, 'bnc');
  assert.deepEqual(bncFeeOnly.overrides, ['fee']);

  state = restoreBankProfile(state, 'bnc');
  const restoredBnc = getBankProfile(state, 'bnc');
  assert.equal(restoredBnc.fee, 1.5);
  assert.equal(restoredBnc.name, 'BNC');
  assert.equal(restoredBnc.overrides, undefined);
  assert.equal(restoredBnc.isModified, false);
});

test('handles deleted presets with tombstones without resurrecting them across reloads', () => {
  let state = sanitizeBankProfileState({});
  assert.equal(state.profiles.length, 9);

  state = removeBankProfile(state, 'bnc');
  assert.equal(getBankProfile(state, 'bnc'), null);
  assert.equal(state.removedPresetIds.includes('bnc'), true);

  const reloadedState = sanitizeBankProfileState(state);
  assert.equal(getBankProfile(reloadedState, 'bnc'), null);
  assert.equal(reloadedState.profiles.length, 8);

  const restoredSingle = restoreBankProfile(reloadedState, 'bnc');
  assert.ok(getBankProfile(restoredSingle, 'bnc'));
  assert.equal(restoredSingle.removedPresetIds.includes('bnc'), false);
  assert.equal(restoredSingle.profiles.length, 9);

  let stateAfterDelete = removeBankProfile(sanitizeBankProfileState({}), 'bancamiga');
  assert.equal(getBankProfile(stateAfterDelete, 'bancamiga'), null);

  const restoredAll = restoreDefaultBankProfiles();
  assert.equal(restoredAll.profiles.length, 9);
  assert.deepEqual(restoredAll.removedPresetIds, []);
  assert.ok(getBankProfile(restoredAll, 'bancamiga'));
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

test('readBankProfileState prompts persistence on version upgrade and skips on stable state', () => {
  const v4UntouchedRaw = JSON.stringify({
    version: 4,
    selectedId: 'bdv-virtual',
    quickAmounts: [100, 200, 500, 1000],
    profiles: [
      { id: 'bdv-fisica', name: 'Banco de Venezuela', cardType: 'Física', fee: 1.5, icon: '/assets/banks/banco-de-venezuela.png' },
      { id: 'bdv-virtual', name: 'Banco de Venezuela', cardType: 'Virtual / otra modalidad', fee: 2.5, icon: '/assets/banks/banco-de-venezuela.png' },
      { id: 'bbva-provincial', name: 'BBVA Provincial', cardType: '', fee: 0, icon: '/assets/banks/bbva-provisional.png' },
      { id: 'banco-tesoro', name: 'Banco del Tesoro', cardType: '', fee: 2.5, icon: '/assets/banks/banco-del-tesoro.png' },
      { id: 'bancamiga', name: 'Bancamiga', cardType: '', fee: 5, icon: '/assets/banks/bancamiga.png' },
      { id: 'banesco-fisica', name: 'Banesco', cardType: 'Física', fee: 1.5, icon: '/assets/banks/banesco-provisional.png' },
      { id: 'banesco-virtual', name: 'Banesco', cardType: 'Virtual', fee: 2.5, icon: '/assets/banks/banesco-provisional.png' },
      { id: 'bnc', name: 'BNC', cardType: '', fee: 1.5, icon: '/assets/banks/bnc.png' }
    ]
  });
  const v4Storage = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: v4UntouchedRaw });
  const v4Read = readBankProfileState(v4Storage);
  assert.equal(v4Read.shouldPersist, true);
  assert.equal(v4Read.state.version, 5);
  assert.equal(v4Read.state.profiles.length, 9);
  assert.equal(v4Read.state.removedPresetIds.length, 0);

  const v4PartialRaw = JSON.stringify({
    version: 4,
    selectedId: 'bdv-virtual',
    quickAmounts: [100, 200, 500, 1000],
    profiles: [
      { id: 'bdv-virtual', name: 'Banco de Venezuela', cardType: 'Virtual / otra modalidad', fee: 2.5, icon: '/assets/banks/banco-de-venezuela.png' }
    ]
  });
  const v4PartialStorage = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: v4PartialRaw });
  const v4PartialRead = readBankProfileState(v4PartialStorage);
  assert.equal(v4PartialRead.shouldPersist, true);
  assert.equal(v4PartialRead.state.version, 5);
  assert.equal(v4PartialRead.state.profiles.length, 2); // bdv-virtual + bdt
  assert.equal(v4PartialRead.state.removedPresetIds.length, 7);

  const v5State = sanitizeBankProfileState({});
  const v5Raw = JSON.stringify(v5State);
  const v5Storage = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: v5Raw });
  const v5Read = readBankProfileState(v5Storage);
  assert.equal(v5Read.shouldPersist, false);
  assert.equal(v5Read.warning, null);
  assert.deepEqual(v5Read.state, v5State);
});

test('simulates realistic localStorage migrations across Scenarios A through F', () => {
  // Scenario A — Pre-BDT normal user
  const scenarioARaw = JSON.stringify({
    version: 4,
    selectedId: 'banesco-fisica',
    quickAmounts: [50, 150, 300, 600],
    profiles: [
      { id: 'bdv-fisica', name: 'Banco de Venezuela', cardType: 'Física', fee: 1.5, icon: '/assets/banks/banco-de-venezuela.png' },
      { id: 'bdv-virtual', name: 'Banco de Venezuela', cardType: 'Virtual / otra modalidad', fee: 2.5, icon: '/assets/banks/banco-de-venezuela.png' },
      { id: 'bbva-provincial', name: 'BBVA Provincial', cardType: '', fee: 0, icon: '/assets/banks/bbva-provisional.png' },
      { id: 'banco-tesoro', name: 'Banco del Tesoro', cardType: '', fee: 2.5, icon: '/assets/banks/banco-del-tesoro.png' },
      { id: 'bancamiga', name: 'Bancamiga', cardType: '', fee: 5, icon: '/assets/banks/bancamiga.png' },
      { id: 'banesco-fisica', name: 'Banesco', cardType: 'Física', fee: 1.5, icon: '/assets/banks/banesco-provisional.png' },
      { id: 'banesco-virtual', name: 'Banesco', cardType: 'Virtual', fee: 2.5, icon: '/assets/banks/banesco-provisional.png' },
      { id: 'bnc', name: 'BNC', cardType: '', fee: 1.5, icon: '/assets/banks/bnc.png' }
    ]
  });
  const storageA = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: scenarioARaw });
  const loadA = readBankProfileState(storageA);
  assert.equal(loadA.shouldPersist, true);
  assert.equal(loadA.state.version, 5);
  assert.equal(getBankProfile(loadA.state, 'bbva-provincial').fee, 1.5);
  assert.equal(getBankProfile(loadA.state, 'bdt').fee, 2.5);
  assert.equal(loadA.state.selectedId, 'banesco-fisica');
  assert.deepEqual(loadA.state.quickAmounts, [50, 150, 300, 600]);

  // Persist state and reload -> stable
  saveBankProfileState(storageA, loadA.state);
  const reloadA = readBankProfileState(storageA);
  assert.equal(reloadA.shouldPersist, false);
  assert.deepEqual(reloadA.state, loadA.state);

  // Scenario B — Customized BBVA
  const scenarioBRaw = JSON.stringify({
    version: 4,
    selectedId: 'bbva-provincial',
    quickAmounts: [100, 200, 500, 1000],
    profiles: [
      { id: 'bbva-provincial', name: 'BBVA Provincial', cardType: '', fee: 3, icon: '/assets/banks/bbva-provisional.png' }
    ]
  });
  const storageB = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: scenarioBRaw });
  const loadB = readBankProfileState(storageB);
  assert.equal(loadB.shouldPersist, true);
  assert.equal(getBankProfile(loadB.state, 'bbva-provincial').fee, 3);
  assert.deepEqual(getBankProfile(loadB.state, 'bbva-provincial').overrides, ['fee']);
  assert.ok(getBankProfile(loadB.state, 'bdt'));

  saveBankProfileState(storageB, loadB.state);
  const reloadB = readBankProfileState(storageB);
  assert.equal(reloadB.shouldPersist, false);
  assert.deepEqual(reloadB.state, loadB.state);

  // Scenario C — Custom profile with custom logo and amounts
  const scenarioCRaw = JSON.stringify({
    version: 4,
    selectedId: 'custom-comercio',
    quickAmounts: [100, 200, 500, 1000],
    profiles: [
      {
        id: 'custom-comercio',
        name: 'Banco Comercio',
        cardType: 'Jurídica',
        fee: 2.1,
        icon: 'data:image/png;base64,AAAA',
        quickAmounts: [50, 100]
      }
    ]
  });
  const storageC = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: scenarioCRaw });
  const loadC = readBankProfileState(storageC);
  assert.equal(loadC.state.selectedId, 'custom-comercio');
  const customProfile = getBankProfile(loadC.state, 'custom-comercio');
  assert.equal(customProfile.name, 'Banco Comercio');
  assert.equal(customProfile.cardType, 'Jurídica');
  assert.equal(customProfile.fee, 2.1);
  assert.equal(customProfile.icon, 'data:image/png;base64,AAAA');
  assert.deepEqual(customProfile.quickAmounts, [50, 100]);
  assert.equal(customProfile.overrides, undefined);

  // Scenario D — Deleted old preset (e.g. BNC was deleted before v5)
  const scenarioDRaw = JSON.stringify({
    version: 4,
    selectedId: 'bdv-fisica',
    quickAmounts: [100, 200, 500, 1000],
    profiles: [
      { id: 'bdv-fisica', name: 'Banco de Venezuela', cardType: 'Física', fee: 1.5, icon: '/assets/banks/banco-de-venezuela.png' }
    ]
  });
  const storageD = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: scenarioDRaw });
  const loadD = readBankProfileState(storageD);
  assert.equal(loadD.state.removedPresetIds.includes('bnc'), true);
  assert.equal(getBankProfile(loadD.state, 'bnc'), null);

  saveBankProfileState(storageD, loadD.state);
  const reloadD = readBankProfileState(storageD);
  assert.equal(getBankProfile(reloadD.state, 'bnc'), null);

  // Scenario E — Corrupt state
  const scenarioERaw = '{bad json';
  const storageE = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: scenarioERaw });
  const loadE = readBankProfileState(storageE);
  assert.equal(loadE.warning, 'corrupt');
  assert.equal(loadE.shouldPersist, false);
  assert.equal(storageE.value(BANK_PROFILE_STORAGE_KEY), scenarioERaw);

  // Scenario F — Future version
  const scenarioFRaw = JSON.stringify({ version: 999, profiles: [] });
  const storageF = memoryStorage({ [BANK_PROFILE_STORAGE_KEY]: scenarioFRaw });
  const loadF = readBankProfileState(storageF);
  assert.equal(loadF.warning, 'unsupported-version');
  assert.equal(loadF.shouldPersist, false);
  assert.equal(storageF.value(BANK_PROFILE_STORAGE_KEY), scenarioFRaw);
});

test('cleans dirty override metadata and never attaches overrides to custom profiles', () => {
  const stateWithDirtyOverrides = sanitizeBankProfileState({
    version: BANK_PROFILE_STATE_VERSION,
    selectedId: 'custom-seguro',
    profiles: [
      {
        id: 'bdv-fisica',
        name: 'Banco Personal BDV',
        cardType: 'Física',
        fee: 1.5,
        icon: '/assets/banks/banco-de-venezuela.png',
        overrides: ['name', 'invalid-field', 'name', 123, null]
      },
      {
        id: 'custom-seguro',
        name: 'Banco Seguro',
        cardType: 'Virtual',
        fee: 3.5,
        icon: null,
        overrides: ['fee', 'name']
      }
    ]
  });

  const bdv = getBankProfile(stateWithDirtyOverrides, 'bdv-fisica');
  assert.equal(bdv.name, 'Banco Personal BDV');
  assert.deepEqual(bdv.overrides, ['name']);

  const custom = getBankProfile(stateWithDirtyOverrides, 'custom-seguro');
  assert.equal(custom.name, 'Banco Seguro');
  assert.equal(custom.fee, 3.5);
  assert.equal(custom.overrides, undefined);
});

test('supports up to MAX_CUSTOM_PROFILES custom profiles without reducing capacity as presets grow', () => {
  assert.equal(MAX_CUSTOM_PROFILES, 50);
  assert.equal(MAX_TOTAL_PROFILES, DEFAULT_BANK_PROFILES.length + 50);

  let state = sanitizeBankProfileState({});
  for (let i = 1; i <= 50; i++) {
    state = upsertCustomProfile(state, {
      name: `Custom Bank ${i}`,
      cardType: 'Virtual',
      fee: 2.5
    }, `custom-bank-${i}`);
  }

  assert.equal(state.profiles.length, DEFAULT_BANK_PROFILES.length + 50);
  assert.ok(state.profiles.some(p => p.id === 'custom-bank-1'));
  assert.ok(state.profiles.some(p => p.id === 'custom-bank-50'));

  const sanitized = sanitizeBankProfileState(state);
  assert.equal(sanitized.profiles.length, DEFAULT_BANK_PROFILES.length + 50);
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
