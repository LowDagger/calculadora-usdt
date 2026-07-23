export const BANK_PROFILE_STORAGE_KEY = 'calcuflowBankProfilesV1';
export const BANK_PROFILE_STATE_VERSION = 1;
export const MANUAL_PROFILE_ID = 'manual';
export const DEFAULT_PROFILE_ID = 'bdv-fisica';
export const MAX_CARD_FEE = 100;

export const BANK_ICONS = Object.freeze({
  bdv: Object.freeze({
    src: '/assets/banks/banco-de-venezuela.png',
    scale: 0.70
  }),
  bbva: Object.freeze({
    src: '/assets/banks/bbva-provisional.png',
    scale: 0.86
  }),
  tesoro: Object.freeze({
    src: '/assets/banks/banco-del-tesoro.png',
    scale: 0.82
  }),
  bancamiga: Object.freeze({
    src: '/assets/banks/bancamiga.png',
    scale: 0.82
  }),
  banesco: Object.freeze({
    src: '/assets/banks/banesco-provisional.png',
    scale: 0.82
  }),
  bnc: Object.freeze({
    src: '/assets/banks/bnc.png',
    scale: 0.80,
    darkFilter: 'brightness(0) invert(1)'
  }),
  manual: Object.freeze({
    symbol: 'account_balance',
    scale: 0.58
  })
});

export const DEFAULT_BANK_PROFILES = Object.freeze([
  {
    id: 'bdv-fisica',
    name: 'Banco de Venezuela',
    cardType: 'Física',
    defaultFee: 1.5,
    initials: 'BDV',
    iconKey: 'bdv',
    defaultStatus: 'Comisión reportada'
  },
  {
    id: 'bdv-virtual',
    name: 'Banco de Venezuela',
    cardType: 'Virtual / otra modalidad',
    defaultFee: 2.5,
    initials: 'BDV',
    iconKey: 'bdv',
    defaultStatus: 'Pendiente de confirmar'
  },
  {
    id: 'bbva-provincial',
    name: 'BBVA Provincial',
    cardType: '',
    defaultFee: 0,
    initials: 'BBVA',
    iconKey: 'bbva',
    defaultStatus: 'Comisión reportada'
  },
  {
    id: 'banco-tesoro',
    name: 'Banco del Tesoro',
    cardType: '',
    defaultFee: 2.5,
    initials: 'BT',
    iconKey: 'tesoro',
    defaultStatus: 'Comisión reportada'
  },
  {
    id: 'bancamiga',
    name: 'Bancamiga',
    cardType: '',
    defaultFee: 5,
    initials: 'BA',
    iconKey: 'bancamiga',
    defaultStatus: 'Comisión reportada'
  },
  {
    id: 'banesco-fisica',
    name: 'Banesco',
    cardType: 'Física',
    defaultFee: 1.5,
    initials: 'B',
    iconKey: 'banesco',
    defaultStatus: 'Comisión reportada'
  },
  {
    id: 'banesco-virtual',
    name: 'Banesco',
    cardType: 'Virtual',
    defaultFee: 2.5,
    initials: 'B',
    iconKey: 'banesco',
    defaultStatus: 'Comisión reportada'
  },
  {
    id: 'bnc',
    name: 'BNC',
    cardType: '',
    defaultFee: 1.5,
    initials: 'BNC',
    iconKey: 'bnc',
    defaultStatus: 'Comisión reportada'
  }
]);

const DEFAULT_PROFILE_IDS = new Set(DEFAULT_BANK_PROFILES.map(profile => profile.id));
const CUSTOM_ID_PATTERN = /^custom-[a-z0-9-]{1,80}$/;
const ASSET_ICON_PATTERN = /^(?:\.?\/)?assets\/[a-z0-9/_-]+\.(?:png|webp)$/i;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

export function sanitizeCardFee(value) {
  if (value === '' || value === null || value === undefined) return null;
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const fee = Number(normalized);
  if (!Number.isFinite(fee) || fee < 0 || fee > MAX_CARD_FEE) return null;
  return Math.round((fee + Number.EPSILON) * 100) / 100;
}

export function createProfileInitials(name) {
  const words = cleanText(name, 64).split(' ').filter(Boolean);
  if (!words.length) return 'M';
  const initials = words.length === 1
    ? words[0].slice(0, 4)
    : words.slice(0, 4).map(word => word[0]).join('');
  return initials.toUpperCase();
}

export function sanitizeIconPath(icon) {
  const value = cleanText(icon, 180);
  if (!value || value.includes('..') || !ASSET_ICON_PATTERN.test(value)) return null;
  return value;
}

function getIconPresentation(iconKey, fallbackIcon = null) {
  const icon = BANK_ICONS[iconKey];
  return {
    icon: icon?.src || fallbackIcon,
    iconScale: icon?.scale || 0.80,
    iconSymbol: icon?.symbol || null,
    iconDarkFilter: icon?.darkFilter || null
  };
}

function sanitizeCustomProfile(profile, usedIds) {
  if (!isRecord(profile)) return null;
  const id = cleanText(profile.id, 87).toLowerCase();
  const name = cleanText(profile.name, 64);
  const cardType = cleanText(profile.cardType, 40);
  const fee = sanitizeCardFee(profile.fee);

  if (!CUSTOM_ID_PATTERN.test(id) || usedIds.has(id) || !name || fee === null) return null;
  usedIds.add(id);

  return {
    id,
    name,
    cardType,
    fee,
    initials: createProfileInitials(name),
    icon: sanitizeIconPath(profile.icon)
  };
}

export function createEmptyBankProfileState(selectedId = DEFAULT_PROFILE_ID) {
  return {
    version: BANK_PROFILE_STATE_VERSION,
    selectedId,
    presetFees: {},
    customProfiles: []
  };
}

export function sanitizeBankProfileState(value, fallbackSelectedId = DEFAULT_PROFILE_ID) {
  const source = isRecord(value) ? value : {};
  const presetFees = {};
  const sourcePresetFees = isRecord(source.presetFees) ? source.presetFees : {};

  for (const profile of DEFAULT_BANK_PROFILES) {
    if (!Object.prototype.hasOwnProperty.call(sourcePresetFees, profile.id)) continue;
    const fee = sanitizeCardFee(sourcePresetFees[profile.id]);
    if (fee !== null && fee !== profile.defaultFee) presetFees[profile.id] = fee;
  }

  const usedIds = new Set(DEFAULT_PROFILE_IDS);
  usedIds.add(MANUAL_PROFILE_ID);
  const sourceCustomProfiles = Array.isArray(source.customProfiles) ? source.customProfiles : [];
  const customProfiles = sourceCustomProfiles
    .slice(0, 50)
    .map(profile => sanitizeCustomProfile(profile, usedIds))
    .filter(Boolean);

  const validIds = new Set([
    ...DEFAULT_PROFILE_IDS,
    ...customProfiles.map(profile => profile.id),
    MANUAL_PROFILE_ID
  ]);
  const requestedSelectedId = cleanText(source.selectedId, 87).toLowerCase();
  const safeFallback = validIds.has(fallbackSelectedId) ? fallbackSelectedId : DEFAULT_PROFILE_ID;
  const selectedId = validIds.has(requestedSelectedId) ? requestedSelectedId : safeFallback;

  return {
    version: BANK_PROFILE_STATE_VERSION,
    selectedId,
    presetFees,
    customProfiles
  };
}

export function getBankProfiles(state) {
  const safeState = sanitizeBankProfileState(state);
  const presets = DEFAULT_BANK_PROFILES.map(profile => {
    const hasOverride = Object.prototype.hasOwnProperty.call(safeState.presetFees, profile.id);
    const fee = hasOverride ? safeState.presetFees[profile.id] : profile.defaultFee;
    return {
      ...profile,
      ...getIconPresentation(profile.iconKey),
      fee,
      kind: 'preset',
      isModified: hasOverride,
      status: hasOverride ? 'Personalizado' : profile.defaultStatus
    };
  });
  const customProfiles = safeState.customProfiles.map(profile => ({
    ...profile,
    iconScale: 0.80,
    iconSymbol: null,
    iconDarkFilter: null,
    defaultFee: null,
    defaultStatus: 'Personalizado',
    kind: 'custom',
    isModified: true,
    status: 'Personalizado'
  }));

  return [...presets, ...customProfiles];
}

export function groupBankProfiles(profiles) {
  const groups = [];
  const presetGroups = new Map();

  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile || typeof profile !== 'object') continue;
    if (profile.kind !== 'preset') {
      groups.push({
        id: profile.id,
        name: profile.name,
        profiles: [profile]
      });
      continue;
    }

    const groupKey = profile.name.toLocaleLowerCase('es-VE');
    let group = presetGroups.get(groupKey);
    if (!group) {
      group = {
        id: profile.id,
        name: profile.name,
        profiles: []
      };
      presetGroups.set(groupKey, group);
      groups.push(group);
    }
    group.profiles.push(profile);
  }

  return groups;
}

export function getBankProfile(state, profileId, manualFee = 0) {
  if (profileId === MANUAL_PROFILE_ID) {
    return {
      id: MANUAL_PROFILE_ID,
      name: 'Otro banco / Manual',
      cardType: '',
      fee: sanitizeCardFee(manualFee) ?? 0,
      defaultFee: null,
      initials: 'M',
      ...getIconPresentation('manual'),
      kind: 'manual',
      isModified: true,
      status: 'Personalizado'
    };
  }
  return getBankProfiles(state).find(profile => profile.id === profileId) || null;
}

export function getSelectedBankProfile(state, manualFee = 0) {
  const safeState = sanitizeBankProfileState(state);
  return getBankProfile(safeState, safeState.selectedId, manualFee)
    || getBankProfile(safeState, DEFAULT_PROFILE_ID, manualFee);
}

export function getEffectiveSelectedBankProfile(state, manualFee = 0, temporaryFee = null) {
  const selectedProfile = getSelectedBankProfile(state, manualFee);
  const safeTemporaryFee = sanitizeCardFee(temporaryFee);
  if (temporaryFee === null || safeTemporaryFee === null) return selectedProfile;
  return {
    ...selectedProfile,
    fee: safeTemporaryFee,
    status: 'Temporal',
    isTemporary: true
  };
}

export function selectBankProfile(state, profileId) {
  const safeState = sanitizeBankProfileState(state);
  const profile = getBankProfile(safeState, profileId);
  if (!profile) return safeState;
  return { ...safeState, selectedId: profileId };
}

export function updatePresetFee(state, profileId, feeValue) {
  const safeState = sanitizeBankProfileState(state);
  const preset = DEFAULT_BANK_PROFILES.find(profile => profile.id === profileId);
  const fee = sanitizeCardFee(feeValue);
  if (!preset || fee === null) return safeState;

  const presetFees = { ...safeState.presetFees };
  if (fee === preset.defaultFee) delete presetFees[profileId];
  else presetFees[profileId] = fee;
  return { ...safeState, presetFees };
}

export function restorePresetFee(state, profileId) {
  const safeState = sanitizeBankProfileState(state);
  if (!DEFAULT_PROFILE_IDS.has(profileId)) return safeState;
  const presetFees = { ...safeState.presetFees };
  delete presetFees[profileId];
  return { ...safeState, presetFees };
}

export function upsertCustomProfile(state, profile, requestedId = '') {
  const safeState = sanitizeBankProfileState(state);
  const existingId = cleanText(profile?.id, 87).toLowerCase();
  let id = existingId;

  if (!safeState.customProfiles.some(item => item.id === id)) {
    const baseId = cleanText(requestedId, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    id = baseId.startsWith('custom-') ? baseId : `custom-${baseId || Date.now().toString(36)}`;
    let suffix = 2;
    const usedIds = new Set([...DEFAULT_PROFILE_IDS, MANUAL_PROFILE_ID, ...safeState.customProfiles.map(item => item.id)]);
    const originalId = id;
    while (usedIds.has(id)) {
      id = `${originalId}-${suffix}`;
      suffix += 1;
    }
  }

  const usedIds = new Set([...DEFAULT_PROFILE_IDS, MANUAL_PROFILE_ID]);
  const otherProfiles = safeState.customProfiles.filter(item => item.id !== existingId);
  otherProfiles.forEach(item => usedIds.add(item.id));
  const sanitized = sanitizeCustomProfile({ ...profile, id }, usedIds);
  if (!sanitized) return safeState;

  const existingIndex = safeState.customProfiles.findIndex(item => item.id === existingId);
  const customProfiles = [...safeState.customProfiles];
  if (existingIndex >= 0) customProfiles[existingIndex] = sanitized;
  else customProfiles.push(sanitized);

  return { ...safeState, customProfiles };
}

export function removeCustomProfile(state, profileId) {
  const safeState = sanitizeBankProfileState(state);
  if (!safeState.customProfiles.some(profile => profile.id === profileId)) return safeState;
  return {
    ...safeState,
    selectedId: safeState.selectedId === profileId ? MANUAL_PROFILE_ID : safeState.selectedId,
    customProfiles: safeState.customProfiles.filter(profile => profile.id !== profileId)
  };
}

export function loadBankProfileState(storage, { hasLegacyCardFee = false } = {}) {
  const fallbackSelectedId = hasLegacyCardFee ? MANUAL_PROFILE_ID : DEFAULT_PROFILE_ID;
  try {
    const raw = storage.getItem(BANK_PROFILE_STORAGE_KEY);
    if (!raw) return createEmptyBankProfileState(fallbackSelectedId);
    return sanitizeBankProfileState(JSON.parse(raw), fallbackSelectedId);
  } catch {
    return createEmptyBankProfileState(fallbackSelectedId);
  }
}

export function saveBankProfileState(storage, state) {
  const safeState = sanitizeBankProfileState(state);
  storage.setItem(BANK_PROFILE_STORAGE_KEY, JSON.stringify(safeState));
  return safeState;
}
