export const BANK_PROFILE_STORAGE_KEY = 'calcuflowBankProfilesV1';
export const BANK_PROFILE_STATE_VERSION = 3;
export const MANUAL_PROFILE_ID = 'manual';
export const DEFAULT_PROFILE_ID = 'bdv-fisica';
export const MAX_CARD_FEE = 100;
export const MAX_PERSISTED_LOGO_BYTES = 100 * 1024;
export const DEFAULT_QUICK_AMOUNTS = Object.freeze([100, 500, 1000]);
export const MAX_QUICK_AMOUNT = 10000;

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
  Object.freeze({
    id: 'bdv-fisica',
    name: 'Banco de Venezuela',
    cardType: 'Física',
    defaultFee: 1.5,
    initials: 'BDV',
    iconKey: 'bdv',
    defaultStatus: 'Comisión reportada'
  }),
  Object.freeze({
    id: 'bdv-virtual',
    name: 'Banco de Venezuela',
    cardType: 'Virtual / otra modalidad',
    defaultFee: 2.5,
    initials: 'BDV',
    iconKey: 'bdv',
    defaultStatus: 'Pendiente de confirmar'
  }),
  Object.freeze({
    id: 'bbva-provincial',
    name: 'BBVA Provincial',
    cardType: '',
    defaultFee: 0,
    initials: 'BBVA',
    iconKey: 'bbva',
    defaultStatus: 'Comisión reportada'
  }),
  Object.freeze({
    id: 'banco-tesoro',
    name: 'Banco del Tesoro',
    cardType: '',
    defaultFee: 2.5,
    initials: 'BT',
    iconKey: 'tesoro',
    defaultStatus: 'Comisión reportada'
  }),
  Object.freeze({
    id: 'bancamiga',
    name: 'Bancamiga',
    cardType: '',
    defaultFee: 5,
    initials: 'BA',
    iconKey: 'bancamiga',
    defaultStatus: 'Comisión reportada'
  }),
  Object.freeze({
    id: 'banesco-fisica',
    name: 'Banesco',
    cardType: 'Física',
    defaultFee: 1.5,
    initials: 'B',
    iconKey: 'banesco',
    defaultStatus: 'Comisión reportada'
  }),
  Object.freeze({
    id: 'banesco-virtual',
    name: 'Banesco',
    cardType: 'Virtual',
    defaultFee: 2.5,
    initials: 'B',
    iconKey: 'banesco',
    defaultStatus: 'Comisión reportada'
  }),
  Object.freeze({
    id: 'bnc',
    name: 'BNC',
    cardType: '',
    defaultFee: 1.5,
    initials: 'BNC',
    iconKey: 'bnc',
    defaultStatus: 'Comisión reportada'
  })
]);

const DEFAULT_PROFILE_MAP = new Map(DEFAULT_BANK_PROFILES.map(profile => [profile.id, profile]));
const DEFAULT_PROFILE_IDS = new Set(DEFAULT_PROFILE_MAP.keys());
const CUSTOM_ID_PATTERN = /^custom-[a-z0-9-]{1,80}$/;
const ASSET_ICON_PATTERN = /^(?:\.?\/)?assets\/[a-z0-9/_-]+\.(?:png|webp)$/i;
const DATA_LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/i;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function getBase64ByteLength(value) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor(value.length * 3 / 4) - padding;
}

function getDefaultIcon(profile) {
  return BANK_ICONS[profile.iconKey]?.src || null;
}

function createDefaultStoredProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    cardType: profile.cardType,
    fee: profile.defaultFee,
    icon: getDefaultIcon(profile)
  };
}

function getFreshDefaultProfiles() {
  return DEFAULT_BANK_PROFILES.map(createDefaultStoredProfile);
}

function isSameStoredProfile(first, second) {
  const firstQuickAmounts = sanitizeQuickAmounts(first.quickAmounts);
  const secondQuickAmounts = sanitizeQuickAmounts(second.quickAmounts);
  return first.id === second.id
    && first.name === second.name
    && first.cardType === second.cardType
    && first.fee === second.fee
    && first.icon === second.icon
    && JSON.stringify(firstQuickAmounts) === JSON.stringify(secondQuickAmounts);
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

export function sanitizeProfileLogo(icon) {
  if (typeof icon !== 'string') return null;
  const value = icon.trim();
  if (!value || value.includes('..')) return null;
  if (value.length <= 180 && ASSET_ICON_PATTERN.test(value)) return value;

  const match = value.match(DATA_LOGO_PATTERN);
  if (!match || match[2].length % 4 !== 0) return null;
  return getBase64ByteLength(match[2]) <= MAX_PERSISTED_LOGO_BYTES ? value : null;
}

export const sanitizeIconPath = sanitizeProfileLogo;

export function sanitizeQuickAmounts(amounts) {
  if (!Array.isArray(amounts)) return null;
  const used = new Set();
  const sanitized = [];
  for (const amount of amounts) {
    if (sanitized.length >= 4) return null;
    const normalized = typeof amount === 'string' ? amount.trim() : amount;
    if (normalized === '') return null;
    const value = Number(normalized);
    if (!Number.isInteger(value) || value <= 0 || value > MAX_QUICK_AMOUNT || used.has(value)) return null;
    used.add(value);
    sanitized.push(value);
  }
  return sanitized.length ? sanitized : null;
}

function getSafeQuickAmounts(amounts) {
  return sanitizeQuickAmounts(amounts) || [...DEFAULT_QUICK_AMOUNTS];
}

function sanitizeStoredProfile(profile, usedIds) {
  if (!isRecord(profile)) return null;
  const id = cleanText(profile.id, 87).toLowerCase();
  const isDefaultId = DEFAULT_PROFILE_IDS.has(id);
  const name = cleanText(profile.name, 64);
  const cardType = cleanText(profile.cardType, 40);
  const fee = sanitizeCardFee(profile.fee);

  if ((!isDefaultId && !CUSTOM_ID_PATTERN.test(id)) || usedIds.has(id) || !name || fee === null) {
    return null;
  }
  usedIds.add(id);

  const sanitized = {
    id,
    name,
    cardType,
    fee,
    icon: sanitizeProfileLogo(profile.icon)
  };
  const quickAmounts = sanitizeQuickAmounts(profile.quickAmounts);
  if (quickAmounts) sanitized.quickAmounts = quickAmounts;
  return sanitized;
}

function migrateVersionOneState(source, fallbackSelectedId) {
  const profiles = getFreshDefaultProfiles();
  const presetFees = isRecord(source.presetFees) ? source.presetFees : {};

  for (const profile of profiles) {
    const fee = sanitizeCardFee(presetFees[profile.id]);
    if (fee !== null) profile.fee = fee;
  }

  const usedIds = new Set(DEFAULT_PROFILE_IDS);
  const customProfiles = Array.isArray(source.customProfiles) ? source.customProfiles : [];
  for (const profile of customProfiles.slice(0, 50)) {
    const sanitized = sanitizeStoredProfile(profile, usedIds);
    if (sanitized && !DEFAULT_PROFILE_IDS.has(sanitized.id)) profiles.push(sanitized);
  }

  const validIds = new Set(profiles.map(profile => profile.id));
  validIds.add(MANUAL_PROFILE_ID);
  const requestedSelectedId = cleanText(source.selectedId, 87).toLowerCase();
  const safeFallback = validIds.has(fallbackSelectedId) ? fallbackSelectedId : DEFAULT_PROFILE_ID;

  return {
    version: BANK_PROFILE_STATE_VERSION,
    selectedId: validIds.has(requestedSelectedId) ? requestedSelectedId : safeFallback,
    quickAmounts: [...DEFAULT_QUICK_AMOUNTS],
    profiles
  };
}

function migrateVersionTwoState(source, fallbackSelectedId) {
  const usedIds = new Set();
  const profiles = Array.isArray(source.profiles)
    ? source.profiles
      .slice(0, 58)
      .map(profile => sanitizeStoredProfile(profile, usedIds))
      .filter(Boolean)
    : [];
  const safeProfiles = profiles.length ? profiles : getFreshDefaultProfiles();
  const validIds = new Set(safeProfiles.map(profile => profile.id));
  validIds.add(MANUAL_PROFILE_ID);
  const requestedSelectedId = cleanText(source.selectedId, 87).toLowerCase();
  const safeFallback = validIds.has(fallbackSelectedId)
    ? fallbackSelectedId
    : safeProfiles[0]?.id || DEFAULT_PROFILE_ID;

  return {
    version: BANK_PROFILE_STATE_VERSION,
    selectedId: validIds.has(requestedSelectedId) ? requestedSelectedId : safeFallback,
    quickAmounts: [...DEFAULT_QUICK_AMOUNTS],
    profiles: safeProfiles
  };
}

export function createEmptyBankProfileState(selectedId = DEFAULT_PROFILE_ID) {
  const profiles = getFreshDefaultProfiles();
  const validSelectedId = selectedId === MANUAL_PROFILE_ID || profiles.some(profile => profile.id === selectedId)
    ? selectedId
    : DEFAULT_PROFILE_ID;
  return {
    version: BANK_PROFILE_STATE_VERSION,
    selectedId: validSelectedId,
    quickAmounts: [...DEFAULT_QUICK_AMOUNTS],
    profiles
  };
}

export function sanitizeBankProfileState(value, fallbackSelectedId = DEFAULT_PROFILE_ID) {
  const source = isRecord(value) ? value : {};
  if (source.version === 2 && Array.isArray(source.profiles)) {
    return migrateVersionTwoState(source, fallbackSelectedId);
  }
  if (source.version !== BANK_PROFILE_STATE_VERSION || !Array.isArray(source.profiles)) {
    return migrateVersionOneState(source, fallbackSelectedId);
  }

  const usedIds = new Set();
  const profiles = source.profiles
    .slice(0, 58)
    .map(profile => sanitizeStoredProfile(profile, usedIds))
    .filter(Boolean);
  const safeProfiles = profiles.length ? profiles : getFreshDefaultProfiles();
  const validIds = new Set(safeProfiles.map(profile => profile.id));
  validIds.add(MANUAL_PROFILE_ID);
  const requestedSelectedId = cleanText(source.selectedId, 87).toLowerCase();
  const safeFallback = validIds.has(fallbackSelectedId)
    ? fallbackSelectedId
    : safeProfiles[0]?.id || DEFAULT_PROFILE_ID;

  return {
    version: BANK_PROFILE_STATE_VERSION,
    selectedId: validIds.has(requestedSelectedId) ? requestedSelectedId : safeFallback,
    quickAmounts: getSafeQuickAmounts(source.quickAmounts),
    profiles: safeProfiles
  };
}

function getIconPresentation(profile) {
  const preset = DEFAULT_PROFILE_MAP.get(profile.id);
  const presetIcon = preset ? BANK_ICONS[preset.iconKey] : null;
  const usesOriginalIcon = Boolean(presetIcon?.src && profile.icon === presetIcon.src);
  return {
    iconScale: usesOriginalIcon ? presetIcon.scale : 0.80,
    iconSymbol: null,
    iconDarkFilter: usesOriginalIcon ? presetIcon.darkFilter || null : null
  };
}

export function getBankProfiles(state) {
  const safeState = sanitizeBankProfileState(state);
  return safeState.profiles.map(profile => {
    const preset = DEFAULT_PROFILE_MAP.get(profile.id);
    const isModified = preset
      ? !isSameStoredProfile(profile, createDefaultStoredProfile(preset))
      : true;
    return {
      ...profile,
      initials: createProfileInitials(profile.name),
      ...getIconPresentation(profile),
      defaultFee: preset?.defaultFee ?? null,
      defaultStatus: preset?.defaultStatus || 'Personalizado',
      kind: preset ? 'preset' : 'custom',
      isModified,
      status: isModified ? 'Personalizado' : preset.defaultStatus
    };
  });
}

export function groupBankProfiles(profiles) {
  const groups = [];
  const presetGroups = new Map();

  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile || typeof profile !== 'object') continue;
    if (profile.kind !== 'preset') {
      groups.push({ id: profile.id, name: profile.name, profiles: [profile] });
      continue;
    }

    const groupKey = profile.name.toLocaleLowerCase('es-VE');
    let group = presetGroups.get(groupKey);
    if (!group) {
      group = { id: profile.id, name: profile.name, profiles: [] };
      presetGroups.set(groupKey, group);
      groups.push(group);
    }
    group.profiles.push(profile);
  }

  return groups;
}

export function getGeneralQuickAmounts(state) {
  return getSafeQuickAmounts(sanitizeBankProfileState(state).quickAmounts);
}

export function getProfileQuickAmounts(state, profileId) {
  const safeState = sanitizeBankProfileState(state);
  const profile = safeState.profiles.find(item => item.id === profileId);
  return profile?.quickAmounts ? [...profile.quickAmounts] : getGeneralQuickAmounts(safeState);
}

export function updateGeneralQuickAmounts(state, amounts) {
  const quickAmounts = sanitizeQuickAmounts(amounts);
  if (!quickAmounts) return sanitizeBankProfileState(state);
  return { ...sanitizeBankProfileState(state), quickAmounts };
}

export function restoreGeneralQuickAmounts(state) {
  return { ...sanitizeBankProfileState(state), quickAmounts: [...DEFAULT_QUICK_AMOUNTS] };
}

export function updateProfileQuickAmounts(state, profileId, amounts) {
  const safeState = sanitizeBankProfileState(state);
  const quickAmounts = sanitizeQuickAmounts(amounts);
  if (!quickAmounts) return safeState;
  const profile = safeState.profiles.find(item => item.id === profileId);
  if (!profile) return safeState;
  return updateBankProfile(safeState, { ...profile, quickAmounts });
}

export function useGeneralQuickAmountsForProfile(state, profileId) {
  const safeState = sanitizeBankProfileState(state);
  const profile = safeState.profiles.find(item => item.id === profileId);
  if (!profile) return safeState;
  const { quickAmounts, ...withoutOverride } = profile;
  return updateBankProfile(safeState, withoutOverride);
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
      icon: null,
      iconScale: BANK_ICONS.manual.scale,
      iconSymbol: BANK_ICONS.manual.symbol,
      iconDarkFilter: null,
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
    || getBankProfile(safeState, safeState.profiles[0]?.id, manualFee);
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

export function hasDuplicateProfileName(state, name, excludedId = '') {
  const normalizedName = cleanText(name, 64).toLocaleLowerCase('es-VE');
  if (!normalizedName) return false;
  return getBankProfiles(state).some(profile => (
    profile.id !== excludedId
    && profile.name.toLocaleLowerCase('es-VE') === normalizedName
  ));
}

export function updateBankProfile(state, profile) {
  const safeState = sanitizeBankProfileState(state);
  const existingIndex = safeState.profiles.findIndex(item => item.id === profile?.id);
  if (existingIndex < 0) return safeState;
  const usedIds = new Set(safeState.profiles.filter((_, index) => index !== existingIndex).map(item => item.id));
  const sanitized = sanitizeStoredProfile(profile, usedIds);
  if (!sanitized) return safeState;
  const profiles = [...safeState.profiles];
  profiles[existingIndex] = sanitized;
  return { ...safeState, profiles };
}

export function updatePresetFee(state, profileId, feeValue) {
  const profile = getBankProfile(state, profileId);
  const fee = sanitizeCardFee(feeValue);
  if (!profile || profile.kind !== 'preset' || fee === null) return sanitizeBankProfileState(state);
  return updateBankProfile(state, { ...profile, fee });
}

export function restoreBankProfile(state, profileId) {
  const safeState = sanitizeBankProfileState(state);
  const preset = DEFAULT_PROFILE_MAP.get(profileId);
  if (!preset || !safeState.profiles.some(profile => profile.id === profileId)) return safeState;
  return updateBankProfile(safeState, createDefaultStoredProfile(preset));
}

export const restorePresetFee = restoreBankProfile;

export function restoreDefaultBankProfiles() {
  return createEmptyBankProfileState(DEFAULT_PROFILE_ID);
}

export function upsertCustomProfile(state, profile, requestedId = '') {
  const safeState = sanitizeBankProfileState(state);
  const existingId = cleanText(profile?.id, 87).toLowerCase();
  if (safeState.profiles.some(item => item.id === existingId)) {
    return updateBankProfile(safeState, { ...profile, id: existingId });
  }

  const baseId = cleanText(requestedId, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  let id = baseId.startsWith('custom-') ? baseId : `custom-${baseId || Date.now().toString(36)}`;
  const usedIds = new Set([...DEFAULT_PROFILE_IDS, MANUAL_PROFILE_ID, ...safeState.profiles.map(item => item.id)]);
  const originalId = id;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${originalId}-${suffix}`;
    suffix += 1;
  }
  const sanitized = sanitizeStoredProfile({ ...profile, id }, usedIds);
  if (!sanitized) return safeState;
  return { ...safeState, profiles: [...safeState.profiles, sanitized] };
}

export function removeBankProfile(state, profileId) {
  const safeState = sanitizeBankProfileState(state);
  if (safeState.profiles.length <= 1 || !safeState.profiles.some(profile => profile.id === profileId)) {
    return safeState;
  }
  const profiles = safeState.profiles.filter(profile => profile.id !== profileId);
  return {
    ...safeState,
    selectedId: safeState.selectedId === profileId ? profiles[0].id : safeState.selectedId,
    profiles
  };
}

export function removeCustomProfile(state, profileId) {
  const profile = getBankProfile(state, profileId);
  return profile?.kind === 'custom' ? removeBankProfile(state, profileId) : sanitizeBankProfileState(state);
}

export function readBankProfileState(storage, { hasLegacyCardFee = false } = {}) {
  const fallbackSelectedId = hasLegacyCardFee ? MANUAL_PROFILE_ID : DEFAULT_PROFILE_ID;
  let raw;
  try {
    raw = storage.getItem(BANK_PROFILE_STORAGE_KEY);
  } catch {
    return {
      state: createEmptyBankProfileState(fallbackSelectedId),
      shouldPersist: false,
      warning: 'storage-unavailable'
    };
  }
  if (!raw) {
    return {
      state: createEmptyBankProfileState(fallbackSelectedId),
      shouldPersist: false,
      warning: null
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const state = sanitizeBankProfileState(parsed, fallbackSelectedId);
    const isUnsupportedVersion = isRecord(parsed)
      && Object.prototype.hasOwnProperty.call(parsed, 'version')
      && parsed.version !== 1
      && parsed.version !== 2
      && parsed.version !== BANK_PROFILE_STATE_VERSION;
    const hasUnusableProfileCollection = parsed?.version === BANK_PROFILE_STATE_VERSION
      && Array.isArray(parsed.profiles)
      && !parsed.profiles.some(profile => sanitizeStoredProfile(profile, new Set()));
    if (isUnsupportedVersion || hasUnusableProfileCollection) {
      return {
        state,
        shouldPersist: false,
        warning: isUnsupportedVersion ? 'unsupported-version' : 'profiles-invalid'
      };
    }
    return {
      state,
      shouldPersist: parsed?.version !== BANK_PROFILE_STATE_VERSION
        || JSON.stringify(parsed) !== JSON.stringify(state),
      warning: null
    };
  } catch {
    return {
      state: createEmptyBankProfileState(fallbackSelectedId),
      shouldPersist: false,
      warning: 'corrupt'
    };
  }
}

export function loadBankProfileState(storage, options = {}) {
  return readBankProfileState(storage, options).state;
}

export function saveBankProfileState(storage, state) {
  const safeState = sanitizeBankProfileState(state);
  storage.setItem(BANK_PROFILE_STORAGE_KEY, JSON.stringify(safeState));
  return safeState;
}
