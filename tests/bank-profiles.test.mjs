import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import {
  BANK_ICONS,
  BANK_PROFILE_STORAGE_KEY,
  DEFAULT_BANK_PROFILES,
  MANUAL_PROFILE_ID,
  getEffectiveSelectedBankProfile,
  getBankProfile,
  getBankProfiles,
  getSelectedBankProfile,
  groupBankProfiles,
  loadBankProfileState,
  removeCustomProfile,
  restorePresetFee,
  saveBankProfileState,
  sanitizeBankProfileState,
  selectBankProfile,
  updatePresetFee,
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

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test('includes every initial bank profile and reported percentage', () => {
  assert.equal(DEFAULT_BANK_PROFILES.length, 8);
  assert.deepEqual(
    Object.fromEntries(DEFAULT_BANK_PROFILES.map(profile => [profile.id, profile.defaultFee])),
    EXPECTED_PRESETS
  );

  const profiles = getBankProfiles({});
  assert.equal(getBankProfile({}, 'bbva-provincial').fee, 0);
  assert.equal(getBankProfile({}, 'bdv-fisica').fee, 1.5);
  assert.equal(getBankProfile({}, 'bdv-virtual').fee, 2.5);
  assert.equal(getBankProfile({}, 'bdv-virtual').status, 'Pendiente de confirmar');
  assert.equal(getBankProfile({}, 'banesco-fisica').fee, 1.5);
  assert.equal(getBankProfile({}, 'banesco-virtual').fee, 2.5);
  assert.ok(profiles.every(profile => profile.icon?.startsWith('/assets/banks/')));
  assert.ok(profiles.every(profile => profile.iconScale > 0 && profile.iconScale <= 1));
});

test('uses one icon map for every preset and a neutral manual symbol', () => {
  const profiles = getBankProfiles({});
  const iconPaths = new Set(Object.values(BANK_ICONS).map(icon => icon.src).filter(Boolean));

  assert.equal(iconPaths.size, 6);
  for (const iconPath of iconPaths) {
    assert.equal(existsSync(new URL(`..${iconPath}`, import.meta.url)), true, iconPath);
  }
  assert.deepEqual(
    new Set(profiles.map(profile => profile.icon)),
    iconPaths
  );
  assert.equal(getBankProfile({}, MANUAL_PROFILE_ID).icon, null);
  assert.equal(getBankProfile({}, MANUAL_PROFILE_ID).iconSymbol, 'account_balance');
  assert.equal(getBankProfile({}, 'bnc').iconDarkFilter, 'brightness(0) invert(1)');
});

test('groups multimodality banks while keeping single-modality banks direct', () => {
  const profiles = [
    ...getBankProfiles({}),
    getBankProfile({}, MANUAL_PROFILE_ID, 2.75)
  ];
  const groups = groupBankProfiles(profiles);
  const bdv = groups.find(group => group.name === 'Banco de Venezuela');
  const banesco = groups.find(group => group.name === 'Banesco');
  const bbva = groups.find(group => group.name === 'BBVA Provincial');
  const manual = groups.find(group => group.name === 'Otro banco / Manual');

  assert.equal(groups.length, 7);
  assert.deepEqual(bdv.profiles.map(profile => profile.id), ['bdv-fisica', 'bdv-virtual']);
  assert.deepEqual(banesco.profiles.map(profile => profile.id), ['banesco-fisica', 'banesco-virtual']);
  assert.deepEqual(bbva.profiles.map(profile => profile.id), ['bbva-provincial']);
  assert.deepEqual(manual.profiles.map(profile => profile.id), [MANUAL_PROFILE_ID]);
});

test('modifies a preset, marks it custom, and restores its reported value', () => {
  let state = sanitizeBankProfileState({});
  state = updatePresetFee(state, 'bdv-fisica', '2,75');

  const modified = getBankProfile(state, 'bdv-fisica');
  assert.equal(modified.fee, 2.75);
  assert.equal(modified.status, 'Personalizado');
  assert.equal(modified.isModified, true);

  state = restorePresetFee(state, 'bdv-fisica');
  const restored = getBankProfile(state, 'bdv-fisica');
  assert.equal(restored.fee, 1.5);
  assert.equal(restored.status, 'Comisión reportada');
  assert.equal(restored.isModified, false);
});

test('creates, edits, selects, and removes a custom profile', () => {
  let state = sanitizeBankProfileState({});
  state = upsertCustomProfile(state, {
    name: 'Mi Banco',
    cardType: 'Débito virtual',
    fee: '3.25'
  }, 'custom-mi-banco');
  state = selectBankProfile(state, 'custom-mi-banco');

  assert.equal(getSelectedBankProfile(state).name, 'Mi Banco');
  assert.equal(getSelectedBankProfile(state).fee, 3.25);
  assert.equal(getSelectedBankProfile(state).status, 'Personalizado');

  state = upsertCustomProfile(state, {
    id: 'custom-mi-banco',
    name: 'Mi Banco Editado',
    cardType: '',
    fee: 4
  });
  assert.equal(getSelectedBankProfile(state).name, 'Mi Banco Editado');
  assert.equal(getSelectedBankProfile(state).fee, 4);

  state = removeCustomProfile(state, 'custom-mi-banco');
  assert.equal(state.customProfiles.length, 0);
  assert.equal(state.selectedId, MANUAL_PROFILE_ID);
});

test('sanitizes corrupted saved profiles and unsafe icon paths', () => {
  const state = sanitizeBankProfileState({
    version: 999,
    selectedId: 'custom-valid',
    presetFees: {
      'bdv-fisica': '3,5',
      'bbva-provincial': -1,
      unknown: 8
    },
    customProfiles: [
      {
        id: 'custom-valid',
        name: '  Banco   Seguro  ',
        cardType: ' Virtual ',
        fee: '2.25',
        icon: 'javascript:alert(1)'
      },
      { id: 'custom-valid', name: 'Duplicado', fee: 7 },
      { id: 'custom-bad-fee', name: 'Inválido', fee: 'Infinity' },
      { id: 'bdv-fisica', name: 'Colisión', fee: 1 }
    ]
  });

  assert.deepEqual(state.presetFees, { 'bdv-fisica': 3.5 });
  assert.equal(state.customProfiles.length, 1);
  assert.deepEqual(state.customProfiles[0], {
    id: 'custom-valid',
    name: 'Banco Seguro',
    cardType: 'Virtual',
    fee: 2.25,
    initials: 'BS',
    icon: null
  });
  assert.equal(state.selectedId, 'custom-valid');
});

test('preserves the legacy manual commission when no profile state exists', () => {
  const storage = memoryStorage();
  const state = loadBankProfileState(storage, { hasLegacyCardFee: true });
  assert.equal(state.selectedId, MANUAL_PROFILE_ID);
  assert.equal(getSelectedBankProfile(state, 6.75).fee, 6.75);

  const saved = memoryStorage({
    [BANK_PROFILE_STORAGE_KEY]: '{invalid json'
  });
  assert.equal(loadBankProfileState(saved, { hasLegacyCardFee: true }).selectedId, MANUAL_PROFILE_ID);
});

test('persists the selected profile, edited defaults, and custom profiles across reloads', () => {
  const storage = memoryStorage();
  let state = sanitizeBankProfileState({});
  state = updatePresetFee(state, 'bancamiga', 4.5);
  state = upsertCustomProfile(state, {
    name: 'Banco Familiar',
    cardType: 'Débito',
    fee: 1.25
  }, 'custom-banco-familiar');
  state = selectBankProfile(state, 'custom-banco-familiar');

  saveBankProfileState(storage, state);
  const reloaded = loadBankProfileState(storage);

  assert.equal(reloaded.selectedId, 'custom-banco-familiar');
  assert.equal(getBankProfile(reloaded, 'bancamiga').fee, 4.5);
  assert.equal(getSelectedBankProfile(reloaded).name, 'Banco Familiar');
  assert.equal(getSelectedBankProfile(reloaded).cardType, 'Débito');
  assert.equal(getSelectedBankProfile(reloaded).fee, 1.25);
});

test('applies a temporary fee without changing the selected profile or its saved value', () => {
  const state = selectBankProfile(sanitizeBankProfileState({}), 'bdv-fisica');
  const temporary = getEffectiveSelectedBankProfile(state, 0, '2,2');
  const saved = getSelectedBankProfile(state);

  assert.equal(temporary.id, 'bdv-fisica');
  assert.equal(temporary.fee, 2.2);
  assert.equal(temporary.status, 'Temporal');
  assert.equal(temporary.isTemporary, true);
  assert.equal(saved.fee, 1.5);
  assert.equal(saved.status, 'Comisión reportada');
  assert.deepEqual(state.presetFees, {});
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
