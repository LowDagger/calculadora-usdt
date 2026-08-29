export const BANK_PROFILE_STORAGE_KEY = 'calcuflowBankProfilesV1';
export const BANK_PROFILE_STATE_VERSION = 5;
export const MANUAL_PROFILE_ID = 'manual';
export const DEFAULT_PROFILE_ID = 'bdv-fisica';
export const MAX_CARD_FEE = 100;
export const MAX_PERSISTED_LOGO_BYTES = 100 * 1024;
export const DEFAULT_QUICK_AMOUNTS = Object.freeze([100, 200, 500, 1000]);
export const MAX_QUICK_AMOUNT = 10000;
export const MAX_CUSTOM_PROFILES = 50;

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
  bdt: Object.freeze({
    src: '/assets/banks/bdt.png',
    scale: 0.82
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
    defaultFee: 2.5,
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
    defaultStatus: 'Comisión reportada'
  }),
  Object.freeze({
    id: 'bbva-provincial',
    name: 'BBVA Provincial',
    cardType: '',
    defaultFee: 1.5,
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
  }),
  Object.freeze({
    id: 'bdt',
    name: 'Banco Digital de los Trabajadores',
    cardType: '',
    defaultFee: 2.5,
    initials: 'BDT',
    iconKey: 'bdt',
    defaultStatus: 'Comisión reportada'
  })
]);

export const MAX_TOTAL_PROFILES = DEFAULT_BANK_PROFILES.length + MAX_CUSTOM_PROFILES;
const DEFAULT_PROFILE_MAP = new Map(DEFAULT_BANK_PROFILES.map(profile => [profile.id, profile]));
export const DEFAULT_PROFILE_IDS = Object.freeze(new Set(DEFAULT_PROFILE_MAP.keys()));
let activeRemoteBankFees = {};

export function setRemoteBankDefaults(remoteFees) {
  if (!remoteFees || typeof remoteFees !== 'object' || Array.isArray(remoteFees)) {
    activeRemoteBankFees = {};
    return;
  }
  const clean = {};
  for (const [id, fee] of Object.entries(remoteFees)) {
    if (DEFAULT_PROFILE_IDS.has(id)) {
      const sanitized = sanitizeCardFee(fee);
      if (sanitized !== null) {
        clean[id] = sanitized;
      }
    }
  }
  activeRemoteBankFees = clean;
}

export function getPresetDefaultFee(profileId) {
  if (Object.prototype.hasOwnProperty.call(activeRemoteBankFees, profileId)) {
    return activeRemoteBankFees[profileId];
  }
  return DEFAULT_PROFILE_MAP.get(profileId)?.defaultFee ?? null;
}
const ORIGINAL_PRESET_IDS = new Set([
  'bdv-fisica',
  'bdv-virtual',
  'bbva-provincial',
  'banco-tesoro',
  'bancamiga',
  'banesco-fisica',
  'banesco-virtual',
  'bnc'
]);

/**
 * Snapshot of historical default values used ONLY for one-time migrations from
 * legacy un-versioned or v1-v4 states that lacked explicit field override metadata.
 *
 * In v5+, explicit `overrides: string[]` is the sole source of truth for user customizations.
 * Future default updates in v5+ do not require expanding this historical table.
 *
 * Legacy Ambiguity Policy:
 * When migrating legacy data, stored values matching any historical default (e.g. BBVA fee = 0%)
 * are deterministically treated as untouched application defaults and upgraded to current defaults.
 * Any stored value differing from all historical defaults is treated as an intentional user customization
 * and preserved with an explicit override marker.
 */
const HISTORICAL_PRESET_DEFAULTS = Object.freeze({
  'bdv-fisica': Object.freeze({
    fees: [1.5, 2.5],
    names: ['Banco de Venezuela'],
    cardTypes: ['Física'],
    icons: ['/assets/banks/banco-de-venezuela.png']
  }),
  'bdv-virtual': Object.freeze({
    fees: [2.5],
    names: ['Banco de Venezuela'],
    cardTypes: ['Virtual / otra modalidad'],
    icons: ['/assets/banks/banco-de-venezuela.png']
  }),
  'bbva-provincial': Object.freeze({
    fees: [0, 1.5],
    names: ['BBVA Provincial'],
    cardTypes: [''],
    icons: ['/assets/banks/bbva-provisional.png']
  }),
  'banco-tesoro': Object.freeze({
    fees: [2.5],
    names: ['Banco del Tesoro'],
    cardTypes: [''],
    icons: ['/assets/banks/banco-del-tesoro.png']
  }),
  'bancamiga': Object.freeze({
    fees: [5],
    names: ['Bancamiga'],
    cardTypes: [''],
    icons: ['/assets/banks/bancamiga.png']
  }),
  'banesco-fisica': Object.freeze({
    fees: [1.5],
    names: ['Banesco'],
    cardTypes: ['Física'],
    icons: ['/assets/banks/banesco-provisional.png']
  }),
  'banesco-virtual': Object.freeze({
    fees: [2.5],
    names: ['Banesco'],
    cardTypes: ['Virtual'],
    icons: ['/assets/banks/banesco-provisional.png']
  }),
  'bnc': Object.freeze({
    fees: [1.5],
    names: ['BNC'],
    cardTypes: [''],
    icons: ['/assets/banks/bnc.png']
  }),
  'bdt': Object.freeze({
    fees: [0, 2.5],
    names: ['Banco Digital de los Trabajadores'],
    cardTypes: [''],
    icons: ['/assets/banks/bdt.png']
  })
});
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
    fee: getPresetDefaultFee(profile.id),
    icon: getDefaultIcon(profile)
  };
}

function getFreshDefaultProfiles() {
  return DEFAULT_BANK_PROFILES.map(createDefaultStoredProfile);
}

function isSameStoredProfile(first, second) {
  const firstQuickAmounts = sanitizeQuickAmounts(first.quickAmounts);
  const secondQuickAmounts = sanitizeQuickAmounts(second.quickAmounts);
  const firstOverrides = sanitizeOverrides(first.overrides);
  const secondOverrides = sanitizeOverrides(second.overrides);
  return first.id === second.id
    && first.name === second.name
    && first.cardType === second.cardType
    && first.fee === second.fee
    && first.icon === second.icon
    && JSON.stringify(firstOverrides) === JSON.stringify(secondOverrides)
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
  return sanitized.length ? sanitized.sort((a, b) => a - b) : null;
}

function getSafeQuickAmounts(amounts) {
  return sanitizeQuickAmounts(amounts) || [...DEFAULT_QUICK_AMOUNTS];
}

function sanitizeOverrides(overrides) {
  if (!Array.isArray(overrides)) return [];
  const valid = new Set(['name', 'cardType', 'fee', 'icon']);
  const result = [];
  for (const field of overrides) {
    if (typeof field === 'string' && valid.has(field) && !result.includes(field)) {
      result.push(field);
    }
  }
  return result;
}

function sanitizeRemovedPresetIds(removedIds) {
  if (!Array.isArray(removedIds)) return [];
  const result = [];
  for (const id of removedIds) {
    const cleanId = cleanText(id, 87).toLowerCase();
    if (DEFAULT_PROFILE_IDS.has(cleanId) && !result.includes(cleanId)) {
      result.push(cleanId);
    }
  }
  return result;
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
  if (isDefaultId) {
    const overrides = sanitizeOverrides(profile.overrides);
    if (overrides.length) sanitized.overrides = overrides;
  }
  const quickAmounts = sanitizeQuickAmounts(profile.quickAmounts);
  if (quickAmounts) sanitized.quickAmounts = quickAmounts;
  return sanitized;
}

function migratePresetFromHistory(storedProfile) {
  const preset = DEFAULT_PROFILE_MAP.get(storedProfile.id);
  if (!preset) return null;
  const history = HISTORICAL_PRESET_DEFAULTS[storedProfile.id] || {
    fees: [preset.defaultFee],
    names: [preset.name],
    cardTypes: [preset.cardType],
    icons: [getDefaultIcon(preset)]
  };

  const overrides = [];

  let fee = sanitizeCardFee(storedProfile.fee);
  if (fee === null) {
    fee = preset.defaultFee;
  } else if (!history.fees.includes(fee)) {
    overrides.push('fee');
  } else {
    fee = preset.defaultFee;
  }

  let name = cleanText(storedProfile.name, 64);
  if (!name || history.names.includes(name)) {
    name = preset.name;
  } else {
    overrides.push('name');
  }

  let cardType = cleanText(storedProfile.cardType, 40);
  if (history.cardTypes.includes(cardType)) {
    cardType = preset.cardType;
  } else {
    overrides.push('cardType');
  }

  let icon = sanitizeProfileLogo(storedProfile.icon);
  if (!icon || history.icons.includes(icon)) {
    icon = getDefaultIcon(preset);
  } else {
    overrides.push('icon');
  }

  const migrated = {
    id: storedProfile.id,
    name,
    cardType,
    fee,
    icon
  };
  if (overrides.length) migrated.overrides = overrides;
  const quickAmounts = sanitizeQuickAmounts(storedProfile.quickAmounts);
  if (quickAmounts) migrated.quickAmounts = quickAmounts;
  return migrated;
}

function migrateVersionOneState(source, fallbackSelectedId) {
  const profiles = getFreshDefaultProfiles();
  const presetFees = isRecord(source.presetFees) ? source.presetFees : {};

  for (const profile of profiles) {
    const fee = sanitizeCardFee(presetFees[profile.id]);
    const defaultPreset = DEFAULT_PROFILE_MAP.get(profile.id);
    const history = HISTORICAL_PRESET_DEFAULTS[profile.id] || { fees: [defaultPreset.defaultFee] };
    if (fee !== null) {
      if (!history.fees.includes(fee)) {
        profile.fee = fee;
        profile.overrides = ['fee'];
      } else {
        profile.fee = defaultPreset.defaultFee;
      }
    }
  }

  const usedIds = new Set(DEFAULT_PROFILE_IDS);
  const customProfiles = Array.isArray(source.customProfiles) ? source.customProfiles : [];
  for (const profile of customProfiles.slice(0, MAX_CUSTOM_PROFILES)) {
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
    removedPresetIds: [],
    profiles
  };
}

function migrateVersionFourState(source, fallbackSelectedId) {
  const usedIds = new Set();
  const sourceProfiles = Array.isArray(source.profiles) ? source.profiles : [];
  const storedIds = new Set(sourceProfiles.map(p => cleanText(p?.id, 87).toLowerCase()).filter(Boolean));

  const removedPresetIds = [];
  if (sourceProfiles.length > 0) {
    for (const originalId of ORIGINAL_PRESET_IDS) {
      if (!storedIds.has(originalId)) {
        removedPresetIds.push(originalId);
      }
    }
  }

  const profiles = [];
  for (const rawProfile of sourceProfiles.slice(0, MAX_TOTAL_PROFILES)) {
    if (!isRecord(rawProfile)) continue;
    const id = cleanText(rawProfile.id, 87).toLowerCase();
    if (DEFAULT_PROFILE_IDS.has(id)) {
      if (usedIds.has(id)) continue;
      usedIds.add(id);
      const migratedPreset = migratePresetFromHistory(rawProfile);
      if (migratedPreset) profiles.push(migratedPreset);
    } else if (CUSTOM_ID_PATTERN.test(id)) {
      const sanitizedCustom = sanitizeStoredProfile(rawProfile, usedIds);
      if (sanitizedCustom) profiles.push(sanitizedCustom);
    }
  }

  for (const preset of DEFAULT_BANK_PROFILES) {
    if (!usedIds.has(preset.id) && !removedPresetIds.includes(preset.id)) {
      usedIds.add(preset.id);
      profiles.push(createDefaultStoredProfile(preset));
    }
  }

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
    removedPresetIds,
    profiles: safeProfiles
  };
}

function migrateVersionTwoState(source, fallbackSelectedId) {
  const v4Result = migrateVersionFourState(source, fallbackSelectedId);
  return {
    ...v4Result,
    quickAmounts: [...DEFAULT_QUICK_AMOUNTS]
  };
}

function migrateVersionThreeState(source, fallbackSelectedId) {
  const legacyDefaults = [100, 500, 1000];
  const storedQuickAmounts = getSafeQuickAmounts(source.quickAmounts);
  const usesLegacyDefaults = storedQuickAmounts.length === legacyDefaults.length
    && storedQuickAmounts.every((amount, index) => amount === legacyDefaults[index]);

  const v4Result = migrateVersionFourState(source, fallbackSelectedId);
  return {
    ...v4Result,
    quickAmounts: usesLegacyDefaults ? [...DEFAULT_QUICK_AMOUNTS] : storedQuickAmounts
  };
}

function reconcileVersionFiveState(source, fallbackSelectedId) {
  const usedIds = new Set();
  const removedPresetIds = sanitizeRemovedPresetIds(source.removedPresetIds);
  const removedSet = new Set(removedPresetIds);
  const sourceProfiles = Array.isArray(source.profiles) ? source.profiles.slice(0, MAX_TOTAL_PROFILES) : [];
  const profiles = [];

  for (const rawProfile of sourceProfiles) {
    if (!isRecord(rawProfile)) continue;
    const id = cleanText(rawProfile.id, 87).toLowerCase();

    if (DEFAULT_PROFILE_IDS.has(id)) {
      if (usedIds.has(id) || removedSet.has(id)) continue;
      usedIds.add(id);
      const defaultPreset = DEFAULT_PROFILE_MAP.get(id);
      const overrides = new Set(sanitizeOverrides(rawProfile.overrides));

      let name = defaultPreset.name;
      if (overrides.has('name')) {
        const customName = cleanText(rawProfile.name, 64);
        if (customName && customName !== defaultPreset.name) {
          name = customName;
        } else {
          overrides.delete('name');
        }
      }

      let cardType = defaultPreset.cardType;
      if (overrides.has('cardType')) {
        const customCardType = cleanText(rawProfile.cardType, 40);
        if (customCardType !== defaultPreset.cardType) {
          cardType = customCardType;
        } else {
          overrides.delete('cardType');
        }
      }

      const activeDefaultFee = getPresetDefaultFee(id);
      let fee = activeDefaultFee;
      if (overrides.has('fee')) {
        const customFee = sanitizeCardFee(rawProfile.fee);
        if (customFee !== null && customFee !== activeDefaultFee) {
          fee = customFee;
        } else {
          overrides.delete('fee');
        }
      }

      let icon = getDefaultIcon(defaultPreset);
      if (overrides.has('icon')) {
        const customIcon = sanitizeProfileLogo(rawProfile.icon);
        if (customIcon !== getDefaultIcon(defaultPreset)) {
          icon = customIcon;
        } else {
          overrides.delete('icon');
        }
      }

      const reconciledPreset = {
        id,
        name,
        cardType,
        fee,
        icon
      };
      if (overrides.size > 0) reconciledPreset.overrides = [...overrides];
      const quickAmounts = sanitizeQuickAmounts(rawProfile.quickAmounts);
      if (quickAmounts) reconciledPreset.quickAmounts = quickAmounts;
      profiles.push(reconciledPreset);
    } else if (CUSTOM_ID_PATTERN.test(id)) {
      const sanitizedCustom = sanitizeStoredProfile(rawProfile, usedIds);
      if (sanitizedCustom) profiles.push(sanitizedCustom);
    }
  }

  for (const preset of DEFAULT_BANK_PROFILES) {
    if (!usedIds.has(preset.id) && !removedSet.has(preset.id)) {
      usedIds.add(preset.id);
      profiles.push(createDefaultStoredProfile(preset));
    }
  }

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
    removedPresetIds,
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
    removedPresetIds: [],
    profiles
  };
}

export function sanitizeBankProfileState(value, fallbackSelectedId = DEFAULT_PROFILE_ID) {
  const source = isRecord(value) ? value : {};
  if (source.version === 2 && Array.isArray(source.profiles)) {
    return migrateVersionTwoState(source, fallbackSelectedId);
  }
  if (source.version === 3 && Array.isArray(source.profiles)) {
    return migrateVersionThreeState(source, fallbackSelectedId);
  }
  if (source.version === 4 && Array.isArray(source.profiles)) {
    return migrateVersionFourState(source, fallbackSelectedId);
  }
  if (source.version !== BANK_PROFILE_STATE_VERSION || !Array.isArray(source.profiles)) {
    return migrateVersionOneState(source, fallbackSelectedId);
  }

  return reconcileVersionFiveState(source, fallbackSelectedId);
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
      defaultFee: preset ? getPresetDefaultFee(preset.id) : null,
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

  let profileToSanitize = { ...profile };
  const isDefaultId = DEFAULT_PROFILE_IDS.has(profile?.id);

  if (isDefaultId) {
    const defaultPreset = DEFAULT_PROFILE_MAP.get(profile.id);
    const overrides = new Set();

    const name = cleanText(profile.name, 64);
    if (name && name !== defaultPreset.name) overrides.add('name');

    const cardType = cleanText(profile.cardType, 40);
    if (cardType !== defaultPreset.cardType) overrides.add('cardType');

    const fee = sanitizeCardFee(profile.fee);
    if (fee !== null && fee !== getPresetDefaultFee(profile.id)) overrides.add('fee');

    const icon = sanitizeProfileLogo(profile.icon);
    if (icon !== getDefaultIcon(defaultPreset)) overrides.add('icon');

    if (overrides.size > 0) profileToSanitize.overrides = [...overrides];
    else delete profileToSanitize.overrides;
  }

  const usedIds = new Set(safeState.profiles.filter((_, index) => index !== existingIndex).map(item => item.id));
  const sanitized = sanitizeStoredProfile(profileToSanitize, usedIds);
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
  if (!preset) return safeState;

  const restored = createDefaultStoredProfile(preset);
  const existingIndex = safeState.profiles.findIndex(profile => profile.id === profileId);
  const removedPresetIds = safeState.removedPresetIds.filter(id => id !== profileId);
  let profiles = [...safeState.profiles];

  if (existingIndex >= 0) {
    profiles[existingIndex] = restored;
  } else {
    profiles.push(restored);
  }

  return {
    ...safeState,
    removedPresetIds,
    profiles
  };
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
  let selectedId = safeState.selectedId;
  if (selectedId === profileId) {
    selectedId = profiles.some(profile => profile.id === DEFAULT_PROFILE_ID)
      ? DEFAULT_PROFILE_ID
      : profiles[0].id;
  }
  const removedPresetIds = [...safeState.removedPresetIds];
  if (DEFAULT_PROFILE_IDS.has(profileId) && !removedPresetIds.includes(profileId)) {
    removedPresetIds.push(profileId);
  }
  return {
    ...safeState,
    selectedId,
    removedPresetIds,
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
      && parsed.version !== 3
      && parsed.version !== 4
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
