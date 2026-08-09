import { fetchRates, markP2pRecordCached } from './api.js';
import { markBcvRecordCached } from './bcv-rates.js';
import { MAX_REQUESTED_USD, calculateValues, currentBankRate, sanitizeRequestedUsdInput, validateRequestedUsd } from './calculator.js';
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_QUICK_AMOUNTS,
  MANUAL_PROFILE_ID,
  createProfileInitials,
  getEffectiveSelectedBankProfile,
  getBankProfile,
  getBankProfiles,
  getGeneralQuickAmounts,
  getProfileQuickAmounts,
  getSelectedBankProfile,
  groupBankProfiles,
  hasDuplicateProfileName,
  readBankProfileState,
  removeBankProfile,
  restoreGeneralQuickAmounts,
  restoreBankProfile,
  restoreDefaultBankProfiles,
  sanitizeCardFee,
  sanitizeQuickAmounts,
  saveBankProfileState,
  selectBankProfile,
  updateBankProfile,
  updateGeneralQuickAmounts,
  updateProfileQuickAmounts,
  useGeneralQuickAmountsForProfile,
  upsertCustomProfile
} from './bank-profiles.js';
import { renderBankLogo } from './bank-logo.js';
import { processBankLogo } from './bank-logo-processing.js';
import { initChangelog } from './changelog.js';
import { loadState as readState, saveState as writeState } from './storage.js';
import { money, n, triggerHaptic } from './utils.js';
import { els, updateUsdToBuyDisplay, setStatus, clearStatus, showRateError, clearRateError, setLoadingRates, showToast, renderEmpty, renderRates, renderResult, renderBcvDate, renderUsdAmountValidation, openSettings, closeSettings, openBreakdown, closeBreakdown, openSupport, closeSupport, openQr, closeQr, lockBodyScroll, unlockBodyScroll } from './ui.js';

let ratesLastUpdated = null;
let ratesRequestInFlight = false;
let activeBcvRecord = null;
let activeP2pRecord = null;
let lastAutomaticP2pRecord = null;
let lastAutomaticBcvRecord = null;
let bankProfileState = null;
let manualCardFee = '1.5';
let temporaryCardFee = null;
let manualFeeConfigured = false;
let editingBankProfileId = null;
let bankProfileListMode = 'select';
let bankProfileSelectionView = 'banks';
let activeBankGroupId = null;
let manualEditorMode = 'manual';
let editingBankProfileLogo = null;
let bankProfileLogoProcessing = false;
let expandQuickAmountsOnOpen = false;
let editingQuickAmountDraft = null;
const TEMPORARY_PROFILE_EDITOR_ID = 'temporary';

const bankProfileEls = {
  trigger: document.getElementById('openBankProfilesBtn'),
  panel: document.getElementById('bankProfilesPanel'),
  close: document.getElementById('closeBankProfilesBtn'),
  activeAvatar: document.getElementById('activeBankAvatar'),
  activeName: document.getElementById('activeBankName'),
  activeDetail: document.getElementById('activeBankDetail'),
  settingsRelation: document.getElementById('cardFeeProfile'),
  settingsAvatar: document.getElementById('bankProfileSettingsAvatar'),
  settingsName: document.getElementById('bankProfileSettingsName'),
  settingsMeta: document.getElementById('bankProfileSettingsMeta'),
  settingsManage: document.getElementById('manageBankProfilesSettingsBtn'),
  listView: document.getElementById('bankProfileListView'),
  list: document.getElementById('bankProfileList'),
  notice: document.getElementById('bankProfileNotice'),
  contextLabel: document.getElementById('bankProfileContextLabel'),
  modalitiesBack: document.getElementById('backToBankListFromModalitiesBtn'),
  selectionActions: document.getElementById('bankProfileSelectionActions'),
  managementActions: document.getElementById('bankProfileManagementActions'),
  managementDanger: document.getElementById('bankProfileManagementDanger'),
  openTemporary: document.getElementById('openTemporaryBankFeeBtn'),
  manage: document.getElementById('manageBankProfilesBtn'),
  backToSelection: document.getElementById('backToBankSelectionBtn'),
  createCustom: document.getElementById('createCustomBankProfileBtn'),
  restoreDefaults: document.getElementById('restoreDefaultBankProfilesBtn'),
  editor: document.getElementById('bankProfileEditor'),
  back: document.getElementById('backToBankListBtn'),
  editorBackLabel: document.getElementById('bankProfileEditorBackLabel'),
  nameField: document.getElementById('bankProfileNameField'),
  name: document.getElementById('bankProfileName'),
  cardTypeField: document.getElementById('bankProfileCardTypeField'),
  cardType: document.getElementById('bankProfileCardType'),
  fee: document.getElementById('bankProfileFee'),
  logoField: document.getElementById('bankProfileLogoField'),
  logoPreview: document.getElementById('bankProfileLogoPreview'),
  logoInput: document.getElementById('bankProfileLogoInput'),
  chooseLogo: document.getElementById('chooseBankProfileLogoBtn'),
  removeLogo: document.getElementById('removeBankProfileLogoBtn'),
  logoStatus: document.getElementById('bankProfileLogoStatus'),
  quickField: document.getElementById('bankProfileQuickAmountsField'),
  quickUseGeneral: document.getElementById('quickAmountsUseGeneral'),
  quickUseCustom: document.getElementById('quickAmountsUseCustom'),
  quickSummary: document.getElementById('bankProfileQuickSummaryBtn'),
  quickSummaryMode: document.getElementById('bankProfileQuickSummaryMode'),
  quickSummaryValues: document.getElementById('bankProfileQuickSummaryValues'),
  quickDetails: document.getElementById('bankProfileQuickDetails'),
  quickEditor: document.getElementById('quickAmountsEditor'),
  quickList: document.getElementById('quickAmountsList'),
  quickAdd: document.getElementById('addQuickAmountBtn'),
  quickPreview: document.getElementById('quickAmountsPreview'),
  quickGeneralNote: document.getElementById('quickAmountsGeneralNote'),
  quickLimit: document.getElementById('quickAmountsLimitMessage'),
  generalQuickList: document.getElementById('generalQuickAmountsList'),
  generalQuickAdd: document.getElementById('addGeneralQuickAmountBtn'),
  generalQuickRestore: document.getElementById('restoreGeneralQuickAmountsBtn'),
  generalQuickSave: document.getElementById('saveGeneralQuickAmountsBtn'),
  generalQuickError: document.getElementById('generalQuickAmountsError'),
  error: document.getElementById('bankProfileFormError'),
  restore: document.getElementById('restoreBankProfileBtn'),
  remove: document.getElementById('deleteBankProfileBtn'),
  save: document.getElementById('saveBankProfileBtn'),
  applyManual: document.getElementById('applyManualFeeBtn'),
  saveManual: document.getElementById('saveManualProfileBtn'),
  clearTemporary: document.getElementById('clearTemporaryBankFeeBtn'),
  title: document.getElementById('bankProfilesTitle'),
  description: document.querySelector('#bankProfilesPanel .modal-description')
};

function parseLastUpdate(str) {
  if (!str) return null;
  const parts = str.split(' · ');
  if (!parts[0]) return null;
  const dateTimeStr = parts[0];
  
  let cleaned = dateTimeStr.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/p\.\s*m\./i, 'PM').replace(/a\.\s*m\./i, 'AM');
  
  const commaIdx = cleaned.indexOf(',');
  let datePart = '';
  let timePart = '';
  if (commaIdx !== -1) {
    datePart = cleaned.substring(0, commaIdx).trim();
    timePart = cleaned.substring(commaIdx + 1).trim();
  } else {
    const spaceParts = cleaned.split(' ');
    datePart = spaceParts[0] || '';
    timePart = spaceParts.slice(1).join(' ') || '';
  }
  
  const dateSplit = datePart.split('/');
  if (dateSplit.length < 3) return null;
  let day = parseInt(dateSplit[0], 10);
  let month = parseInt(dateSplit[1], 10) - 1;
  let year = parseInt(dateSplit[2], 10);
  if (year < 100) year += 2000;
  
  let isPM = false;
  let isAM = false;
  if (timePart.toUpperCase().includes('PM')) {
    isPM = true;
    timePart = timePart.replace(/pm/i, '').trim();
  } else if (timePart.toUpperCase().includes('AM')) {
    isAM = true;
    timePart = timePart.replace(/am/i, '').trim();
  }
  
  const timeSplit = timePart.split(':');
  if (timeSplit.length < 2) return null;
  let hour = parseInt(timeSplit[0], 10);
  let minute = parseInt(timeSplit[1], 10);
  
  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;
  
  const parsedDate = new Date(year, month, day, hour, minute, 0);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatRelativeTime(date) {
  if (!date) return 'Sin actualizar';
  const diffMs = new Date() - date;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  
  if (diffSec < 60) {
    return `Actualizado hace ${diffSec} s`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `Actualizado hace ${diffMin} min`;
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `Actualizado hace ${diffHour} h`;
  }
  const diffDays = Math.floor(diffHour / 24);
  return `Actualizado hace ${diffDays} d`;
}

function updateRelativeTime() {
  if (!ratesLastUpdated) {
    els.lastUpdate.textContent = 'Sin actualizar';
    if (els.bottomTimestamp) els.bottomTimestamp.textContent = '--';
    return;
  }
  
  const relativeText = formatRelativeTime(ratesLastUpdated);
  const absoluteStr = els.lastUpdate.dataset.absolute || '';
  
  els.lastUpdate.textContent = relativeText;
  els.lastUpdate.title = absoluteStr;
  
  if (els.bottomTimestamp) {
    els.bottomTimestamp.textContent = relativeText;
    els.bottomTimestamp.title = absoluteStr;
  }
}

function formatProfileFee(fee) {
  return `${new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 }).format(fee)}%`;
}

function feeToInputValue(fee) {
  const safeFee = sanitizeCardFee(fee);
  return safeFee === null ? '0' : String(safeFee);
}

function persistBankProfiles(nextState = bankProfileState, { preserveEditor = false } = {}) {
  try {
    bankProfileState = saveBankProfileState(localStorage, nextState);
    return true;
  } catch (error) {
    const isQuotaError = error?.name === 'QuotaExceededError'
      || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error?.code === 22
      || error?.code === 1014;
    const message = isQuotaError
      ? 'No hay espacio suficiente para guardar el perfil. El formulario se conserva.'
      : 'No se pudieron guardar los perfiles en este dispositivo.';
    if (preserveEditor) setBankProfileFormError(message);
    else setStatus(message, 'warn');
    return false;
  }
}

function getVisibleQuickAmounts() {
  if (!bankProfileState) return [...DEFAULT_QUICK_AMOUNTS];
  return getProfileQuickAmounts(bankProfileState, bankProfileState.selectedId);
}

function renderQuickAmountChips() {
  const row = document.getElementById('quickAmountRow');
  if (!row) return;
  const buttons = getVisibleQuickAmounts().map(amount => {
    const button = document.createElement('button');
    button.className = 'chip-btn';
    button.type = 'button';
    button.dataset.quick = String(amount);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = String(amount);
    return button;
  });
  row.replaceChildren(...buttons);
  updateUsdToBuyDisplay(els.usdToBuy.value);
}

function renderActiveBankProfile() {
  if (!bankProfileState) return;
  const savedProfile = getSelectedBankProfile(bankProfileState, manualCardFee);
  const activeProfile = getEffectiveSelectedBankProfile(bankProfileState, manualCardFee, temporaryCardFee);
  renderBankLogo(bankProfileEls.activeAvatar, activeProfile);
  renderBankLogo(bankProfileEls.settingsAvatar, savedProfile);
  bankProfileEls.activeName.textContent = activeProfile.name;
  bankProfileEls.activeDetail.textContent = getProfileChoiceDetail(activeProfile, { includeTemporary: true });
  bankProfileEls.settingsRelation.textContent = `Perfil: ${[
    savedProfile.name,
    savedProfile.cardType,
    activeProfile.isTemporary ? 'Solo este cálculo' : ''
  ].filter(Boolean).join(' · ')}`;
  bankProfileEls.settingsName.textContent = savedProfile.name;
  bankProfileEls.settingsMeta.textContent = getProfileChoiceDetail(activeProfile, { includeTemporary: true });
}

function getProfileChoiceDetail(profile, { includeTemporary = false } = {}) {
  if (profile.kind === 'manual') {
    return manualFeeConfigured
      ? `Comisión personalizada · ${formatProfileFee(profile.fee)}`
      : 'Define tu comisión';
  }

  return [
    profile.cardType,
    formatProfileFee(profile.fee),
    includeTemporary && profile.isTemporary ? 'Solo este cálculo' : ''
  ].filter(Boolean).join(' · ');
}

function getSelectableBankGroups() {
  return groupBankProfiles([
    ...getBankProfiles(bankProfileState),
    getBankProfile(bankProfileState, MANUAL_PROFILE_ID, manualCardFee)
  ]);
}

function createBankProfileAvatar(profile) {
  const avatar = document.createElement('span');
  avatar.className = 'bank-profile-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  renderBankLogo(avatar, profile);
  return avatar;
}

function createSelectionCheck(isSelected) {
  const check = document.createElement('span');
  check.className = 'material-symbols-rounded bank-profile-check';
  check.textContent = 'check_circle';
  check.setAttribute('aria-hidden', 'true');
  check.hidden = !isSelected;
  return check;
}

function buildBankProfileOption(profile, mode = 'select') {
  const isSelected = bankProfileState.selectedId === profile.id;
  const displayProfile = mode === 'select' && isSelected
    ? getEffectiveSelectedBankProfile(bankProfileState, manualCardFee, temporaryCardFee)
    : profile;
  const isModalityView = mode === 'select' && bankProfileSelectionView === 'modalities';
  const option = document.createElement('button');
  option.type = 'button';
  option.className = `bank-profile-option${isSelected ? ' is-selected' : ''}`;
  if (mode === 'select') {
    option.dataset.selectProfile = profile.id;
    option.setAttribute('aria-pressed', String(isSelected));
  } else {
    option.dataset.editProfile = profile.id;
    option.title = `Editar perfil ${displayProfile.name}`;
  }
  option.setAttribute(
    'aria-label',
    isModalityView
      ? `${displayProfile.cardType || displayProfile.name}, comisión ${formatProfileFee(displayProfile.fee)}${isSelected ? ', seleccionada' : ''}`
      : mode === 'manage'
        ? `Editar perfil ${displayProfile.name}${displayProfile.cardType ? `, ${displayProfile.cardType}` : ''}`
        : `${displayProfile.name}${displayProfile.cardType ? `, ${displayProfile.cardType}` : ''}, comisión ${formatProfileFee(displayProfile.fee)}${isSelected ? ', seleccionado' : ''}`
  );

  const copy = document.createElement('span');
  copy.className = 'bank-profile-option-copy';
  const name = document.createElement('strong');
  name.className = 'bank-profile-option-name';
  name.textContent = isModalityView && displayProfile.cardType
    ? displayProfile.cardType
    : displayProfile.name;
  copy.append(name);
  const detail = document.createElement('span');
  detail.className = 'bank-profile-option-detail';
  detail.textContent = isModalityView && displayProfile.cardType
    ? formatProfileFee(displayProfile.fee)
    : getProfileChoiceDetail(displayProfile);
  copy.append(detail);

  const trailing = document.createElement('span');
  trailing.className = 'bank-profile-option-trailing';
  if (mode === 'select') {
    trailing.append(createSelectionCheck(isSelected));
  } else {
    const editIcon = document.createElement('span');
    editIcon.className = 'material-symbols-rounded bank-profile-edit-icon';
    editIcon.textContent = 'edit';
    editIcon.setAttribute('aria-hidden', 'true');
    trailing.append(editIcon);
  }

  option.append(createBankProfileAvatar(displayProfile), copy, trailing);
  return option;
}

function buildBankGroupOption(group) {
  const selectedProfile = group.profiles.find(profile => profile.id === bankProfileState.selectedId);
  const isSelected = Boolean(selectedProfile);
  const isMultiple = group.profiles.length > 1;
  const displayProfile = selectedProfile
    ? getEffectiveSelectedBankProfile(bankProfileState, manualCardFee, temporaryCardFee)
    : group.profiles[0];

  const option = document.createElement('button');
  option.type = 'button';
  option.className = `bank-profile-option${isSelected ? ' is-selected' : ''}`;
  if (isMultiple) option.dataset.selectBank = group.id;
  else option.dataset.selectProfile = displayProfile.id;
  option.setAttribute('aria-pressed', String(isSelected));

  const detailText = isMultiple && !isSelected
    ? `${group.profiles.length} modalidades`
    : getProfileChoiceDetail(displayProfile, { includeTemporary: true });
  option.setAttribute(
    'aria-label',
    `${group.name}, ${detailText}${isSelected ? ', seleccionado' : ''}${isMultiple ? ', elegir modalidad' : ''}`
  );

  const copy = document.createElement('span');
  copy.className = 'bank-profile-option-copy';
  const name = document.createElement('strong');
  name.className = 'bank-profile-option-name';
  name.textContent = group.name;
  const detail = document.createElement('span');
  detail.className = 'bank-profile-option-detail';
  detail.textContent = detailText;
  copy.append(name, detail);

  const trailing = document.createElement('span');
  trailing.className = 'bank-profile-option-trailing';
  if (isSelected) trailing.append(createSelectionCheck(true));
  if (isMultiple) {
    const chevron = document.createElement('span');
    chevron.className = 'material-symbols-rounded bank-profile-group-chevron';
    chevron.textContent = 'chevron_right';
    chevron.setAttribute('aria-hidden', 'true');
    trailing.append(chevron);
  }

  option.append(createBankProfileAvatar(displayProfile), copy, trailing);
  return option;
}

function renderBankProfileList(mode = bankProfileListMode) {
  if (!bankProfileState) return;
  const profiles = getBankProfiles(bankProfileState);
  if (mode === 'manage') {
    bankProfileEls.list.replaceChildren(...profiles.map(profile => buildBankProfileOption(profile, mode)));
    return;
  }

  const groups = getSelectableBankGroups();
  if (bankProfileSelectionView === 'modalities') {
    const group = groups.find(candidate => candidate.id === activeBankGroupId);
    if (group) {
      bankProfileEls.list.replaceChildren(...group.profiles.map(profile => buildBankProfileOption(profile, mode)));
      return;
    }
    bankProfileSelectionView = 'banks';
    activeBankGroupId = null;
  }
  bankProfileEls.list.replaceChildren(...groups.map(buildBankGroupOption));
}

function renderBankProfiles() {
  renderActiveBankProfile();
  renderBankProfileList();
  renderQuickAmountChips();
  renderGeneralQuickAmountSettings();
}

function initBankProfiles(legacyState) {
  const hasLegacyCardFee = Object.prototype.hasOwnProperty.call(legacyState, 'cardFee')
    && sanitizeCardFee(legacyState.cardFee) !== null;
  const legacyFee = sanitizeCardFee(legacyState.cardFee);
  manualCardFee = feeToInputValue(legacyFee ?? els.cardFee.value);
  temporaryCardFee = null;
  const profileRead = readBankProfileState(localStorage, { hasLegacyCardFee });
  bankProfileState = profileRead.state;
  manualFeeConfigured = bankProfileState.selectedId === MANUAL_PROFILE_ID;

  const activeProfile = getSelectedBankProfile(bankProfileState, manualCardFee);
  if (activeProfile.kind !== 'manual') {
    els.cardFee.value = feeToInputValue(activeProfile.fee);
  } else if (legacyFee !== null) {
    els.cardFee.value = feeToInputValue(legacyFee);
  }

  if (profileRead.shouldPersist) persistBankProfiles();
  if (profileRead.warning === 'corrupt') {
    setStatus('Los perfiles guardados no se pudieron leer. Se usarán los predeterminados sin borrar los datos dañados.', 'warn');
  } else if (profileRead.warning === 'profiles-invalid' || profileRead.warning === 'unsupported-version') {
    setStatus('Los perfiles guardados no son compatibles. Se usarán los predeterminados sin reemplazar los datos existentes.', 'warn');
  } else if (profileRead.warning === 'storage-unavailable') {
    setStatus('El almacenamiento local no está disponible. Los perfiles funcionarán solo en esta sesión.', 'warn');
  }
  renderBankProfiles();
}

function applySelectedBankProfile(profileId, manualFeeOverride = null, closeAfter = true) {
  if (profileId === MANUAL_PROFILE_ID) {
    const safeManualFee = sanitizeCardFee(manualFeeOverride ?? manualCardFee ?? els.cardFee.value);
    if (safeManualFee === null) return false;
    manualCardFee = feeToInputValue(safeManualFee);
    manualFeeConfigured = true;
  }

  temporaryCardFee = null;
  const nextState = selectBankProfile(bankProfileState, profileId);
  if (!persistBankProfiles(nextState)) return false;
  const activeProfile = getSelectedBankProfile(bankProfileState, manualCardFee);
  els.cardFee.value = feeToInputValue(activeProfile.fee);
  renderBankProfiles();
  calculate();
  saveState(false);
  triggerHaptic('success');
  showToast(`${activeProfile.name} aplicado.`);
  if (closeAfter) dismissBankProfiles();
  return true;
}

function syncActiveProfileFromCardFee() {
  if (!bankProfileState) return;
  const fee = sanitizeCardFee(els.cardFee.value);
  if (fee === null) return;
  if (temporaryCardFee !== null) {
    temporaryCardFee = feeToInputValue(fee);
    renderBankProfiles();
    return;
  }
  const activeProfile = getSelectedBankProfile(bankProfileState, manualCardFee);

  if (activeProfile.kind === 'preset' || activeProfile.kind === 'custom') {
    const nextState = updateBankProfile(bankProfileState, { ...activeProfile, fee });
    persistBankProfiles(nextState);
  } else {
    manualCardFee = feeToInputValue(fee);
    manualFeeConfigured = true;
  }
  renderBankProfiles();
}

function setBankProfileFormError(message = '', invalidField = null) {
  bankProfileEls.error.textContent = message;
  bankProfileEls.error.hidden = !message;
  bankProfileEls.name.setAttribute('aria-invalid', String(Boolean(message) && invalidField === bankProfileEls.name));
  bankProfileEls.cardType.setAttribute('aria-invalid', String(Boolean(message) && invalidField === bankProfileEls.cardType));
  bankProfileEls.fee.setAttribute('aria-invalid', String(Boolean(message) && invalidField === bankProfileEls.fee));
  bankProfileEls.quickList?.querySelectorAll('input').forEach(input => {
    input.setAttribute('aria-invalid', String(Boolean(message) && invalidField === input));
  });
}

function formatQuickAmountInput(amount) {
  return Number.isFinite(amount) && amount > 0 ? String(amount) : '';
}

function formatQuickAmountLabel(amount) {
  return `$${new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 }).format(amount)}`;
}

function getEditingProfileQuickSource(profile) {
  if (!profile || profile.kind === 'manual') return 'general';
  return Array.isArray(profile.quickAmounts) ? 'custom' : 'general';
}

function collectQuickAmountInputs() {
  return collectQuickAmountInputsFrom(bankProfileEls.quickList);
}

function collectQuickAmountInputsFrom(container) {
  const inputs = [...container.querySelectorAll('input')];
  const values = inputs.map(input => input.value.trim());
  const amounts = values.map(value => Number(value));
  const duplicateValue = amounts.find((amount, index) => Number.isFinite(amount) && amounts.indexOf(amount) !== index);
  const invalidInput = inputs.find((input, index) => {
    const raw = values[index];
    const amount = amounts[index];
    return raw === ''
      || !/^\d+$/.test(raw)
      || !Number.isInteger(amount)
      || amount <= 0
      || amount > 10000
      || amount === duplicateValue;
  });
  const sanitized = sanitizeQuickAmounts(values);
  if (!sanitized || invalidInput) {
    if (container === bankProfileEls.quickList) setQuickAmountDisclosure(true);
    const message = 'Usa entre 1 y 4 montos enteros, positivos, sin duplicados y hasta $10.000.';
    if (container === bankProfileEls.generalQuickList) {
      bankProfileEls.generalQuickError.textContent = message;
      bankProfileEls.generalQuickError.hidden = false;
    } else {
      setBankProfileFormError(message, invalidInput || bankProfileEls.quickList);
    }
    invalidInput?.focus();
    return null;
  }
  if (container === bankProfileEls.generalQuickList) {
    bankProfileEls.generalQuickError.textContent = '';
    bankProfileEls.generalQuickError.hidden = true;
  }
  return sanitized;
}

function renderGeneralQuickAmountSettings(amounts = getGeneralQuickAmounts(bankProfileState)) {
  renderQuickAmountInputList(bankProfileEls.generalQuickList, amounts);
  bankProfileEls.generalQuickAdd.hidden = amounts.length >= 4;
  bankProfileEls.generalQuickError.textContent = '';
  bankProfileEls.generalQuickError.hidden = true;
}

function saveGeneralQuickAmountSettings() {
  const amounts = collectQuickAmountInputsFrom(bankProfileEls.generalQuickList);
  if (!amounts) return;
  if (!persistBankProfiles(updateGeneralQuickAmounts(bankProfileState, amounts))) return;
  renderBankProfiles();
  renderGeneralQuickAmountSettings();
  showToast('Montos generales guardados.');
}

function setQuickAmountDisclosure(expanded, { focus = false } = {}) {
  bankProfileEls.quickSummary.setAttribute('aria-expanded', String(expanded));
  bankProfileEls.quickField.classList.toggle('is-open', expanded);
  bankProfileEls.quickDetails.hidden = !expanded;
  if (focus) requestAnimationFrame(() => bankProfileEls.quickSummary.focus());
}

function getCurrentEditorQuickAmounts() {
  const current = [...bankProfileEls.quickList.querySelectorAll('input')]
    .map(input => Number(input.value))
    .filter(value => Number.isFinite(value) && value > 0);
  return current.length ? current : getGeneralQuickAmounts(bankProfileState);
}

function renderQuickAmountPreview(amounts) {
  bankProfileEls.quickPreview.replaceChildren(...amounts.map(amount => {
    const chip = document.createElement('span');
    chip.className = 'bank-profile-quick-preview-chip';
    chip.textContent = formatQuickAmountLabel(amount);
    return chip;
  }));
}

function renderQuickAmountInputList(container, amounts) {
  const isGeneralEditor = container === bankProfileEls.generalQuickList;
  container.replaceChildren(...amounts.map((amount, index) => {
    const item = document.createElement('div');
    item.className = `bank-profile-quick-item${isGeneralEditor ? ' general-quick-item' : ''}`;
    const moneyPrefix = document.createElement('span');
    moneyPrefix.className = 'bank-profile-quick-prefix';
    moneyPrefix.textContent = '$';
    moneyPrefix.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '1';
    input.max = '10000';
    input.step = '1';
    input.value = formatQuickAmountInput(amount);
    input.setAttribute('aria-label', `Monto rápido ${index + 1}`);
    input.setAttribute('aria-describedby', isGeneralEditor
      ? 'generalQuickAmountsHelp generalQuickAmountsError'
      : 'bankProfileFormError bankProfileQuickAmountsHelp');

    const remove = document.createElement('button');
    remove.className = `bank-profile-quick-icon${isGeneralEditor ? ' general-quick-remove' : ''}`;
    remove.type = 'button';
    remove.dataset.quickRemove = String(index);
    remove.disabled = amounts.length <= 1;
    remove.setAttribute('aria-label', `${isGeneralEditor ? 'Quitar' : 'Eliminar'} monto ${formatQuickAmountInput(amount)}`);
    remove.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">${isGeneralEditor ? 'close' : 'delete'}</span>`;

    item.append(moneyPrefix, input, remove);
    return item;
  }));
}

function updateQuickAmountSummary(profile) {
  const custom = Array.isArray(profile?.quickAmounts);
  const amounts = custom ? profile.quickAmounts : getGeneralQuickAmounts(bankProfileState);
  bankProfileEls.quickSummaryMode.textContent = custom ? 'Personalizados para este banco' : 'Usando montos generales';
  bankProfileEls.quickSummaryValues.textContent = amounts.map(formatQuickAmountLabel).join(' · ');
}

function renderQuickAmountEditor(amounts) {
  const isGeneralMode = bankProfileEls.quickUseGeneral.checked;
  renderQuickAmountPreview(amounts);
  bankProfileEls.quickPreview.hidden = !isGeneralMode;
  bankProfileEls.quickGeneralNote.hidden = !isGeneralMode;
  bankProfileEls.quickList.hidden = isGeneralMode;
  renderQuickAmountInputList(bankProfileEls.quickList, isGeneralMode ? [] : amounts);
  bankProfileEls.quickAdd.hidden = isGeneralMode || amounts.length >= 4;
  bankProfileEls.quickAdd.disabled = isGeneralMode || amounts.length >= 4;
  bankProfileEls.quickLimit.hidden = isGeneralMode || amounts.length < 4;
  bankProfileEls.quickEditor.hidden = false;
}

function syncQuickAmountEditor() {
  const profile = getBankProfile(bankProfileState, editingBankProfileId, manualCardFee);
  if (!profile) return;
  const isGeneralMode = bankProfileEls.quickUseGeneral.checked;
  if (isGeneralMode && !bankProfileEls.quickList.hidden) {
    editingQuickAmountDraft = getCurrentEditorQuickAmounts();
  }
  const amounts = isGeneralMode
    ? getGeneralQuickAmounts(bankProfileState)
    : (editingQuickAmountDraft || profile.quickAmounts || getGeneralQuickAmounts(bankProfileState));
  renderQuickAmountEditor(amounts);
}

function applyQuickAmountEditorChanges(nextState, profileId) {
  if (bankProfileEls.quickUseGeneral.checked || profileId === MANUAL_PROFILE_ID) {
    const amounts = profileId === MANUAL_PROFILE_ID ? collectQuickAmountInputs() : getGeneralQuickAmounts(nextState);
    if (!amounts) return null;
    return profileId === MANUAL_PROFILE_ID
      ? updateGeneralQuickAmounts(nextState, amounts)
      : useGeneralQuickAmountsForProfile(nextState, profileId);
  }
  const amounts = collectQuickAmountInputs();
  if (!amounts) return null;
  return updateProfileQuickAmounts(nextState, profileId, amounts);
}

function showBankProfileList({ focusBack = false, mode = bankProfileListMode } = {}) {
  bankProfileListMode = mode;
  if (mode === 'manage') {
    bankProfileSelectionView = 'banks';
    activeBankGroupId = null;
  }
  const isModalities = mode === 'select' && bankProfileSelectionView === 'modalities';
  const activeGroup = isModalities
    ? getSelectableBankGroups().find(group => group.id === activeBankGroupId)
    : null;
  if (isModalities && !activeGroup) {
    bankProfileSelectionView = 'banks';
    activeBankGroupId = null;
  }
  const showingModalities = mode === 'select' && bankProfileSelectionView === 'modalities';
  editingBankProfileId = null;
  manualEditorMode = 'manual';
  bankProfileEls.editor.hidden = true;
  bankProfileEls.listView.hidden = false;
  bankProfileEls.panel.classList.remove('is-editing');
  bankProfileEls.panel.classList.toggle('is-managing', mode === 'manage');
  bankProfileEls.notice.hidden = mode === 'manage' || showingModalities;
  bankProfileEls.modalitiesBack.hidden = !showingModalities;
  bankProfileEls.selectionActions.hidden = mode !== 'select' || showingModalities;
  bankProfileEls.managementActions.hidden = mode !== 'manage';
  bankProfileEls.managementDanger.hidden = mode !== 'manage';
  bankProfileEls.contextLabel.hidden = mode !== 'manage';
  bankProfileEls.contextLabel.textContent = mode === 'manage' ? 'Modo administración' : '';
  bankProfileEls.title.textContent = showingModalities
    ? activeGroup.name
    : mode === 'select' ? 'Banco / tarjeta' : 'Administrar perfiles';
  bankProfileEls.description.textContent = showingModalities
    ? 'Elige la modalidad que usarás.'
    : mode === 'select'
      ? 'Selecciona el banco para este cálculo.'
      : 'Edita valores guardados o crea un perfil personalizado.';
  setBankProfileFormError();
  renderBankProfileList(mode);
  if (focusBack) {
    requestAnimationFrame(() => {
      const selector = mode === 'select'
        ? `[data-select-profile="${bankProfileState.selectedId}"]`
        : `[data-edit-profile="${bankProfileState.selectedId}"]`;
      (bankProfileEls.list.querySelector(selector)
        || bankProfileEls.list.querySelector('[data-edit-profile]'))?.focus();
    });
  }
}

function showBankModalities(groupId) {
  const group = getSelectableBankGroups().find(candidate => candidate.id === groupId);
  if (!group || group.profiles.length < 2) return;
  activeBankGroupId = group.id;
  bankProfileSelectionView = 'modalities';
  showBankProfileList({ mode: 'select' });
  requestAnimationFrame(() => {
    (bankProfileEls.list.querySelector(`[data-select-profile="${bankProfileState.selectedId}"]`)
      || bankProfileEls.list.querySelector('[data-select-profile]'))?.focus();
  });
}

function returnToBankGroups() {
  const previousGroupId = activeBankGroupId;
  bankProfileSelectionView = 'banks';
  activeBankGroupId = null;
  showBankProfileList({ mode: 'select' });
  requestAnimationFrame(() => {
    bankProfileEls.list.querySelector(`[data-select-bank="${previousGroupId}"]`)?.focus();
  });
}

function renderBankProfileLogoEditor() {
  const name = bankProfileEls.name.value.trim() || 'Banco';
  renderBankLogo(bankProfileEls.logoPreview, {
    icon: editingBankProfileLogo,
    iconScale: 0.80,
    iconDarkFilter: null,
    iconSymbol: null,
    initials: createProfileInitials(name)
  });
  bankProfileEls.chooseLogo.textContent = editingBankProfileLogo ? 'Reemplazar logo' : 'Añadir logo';
  bankProfileEls.removeLogo.hidden = !editingBankProfileLogo;
}

function showBankProfileEditor(profileId, { manualMode = 'manual' } = {}) {
  const isTemporary = profileId === TEMPORARY_PROFILE_EDITOR_ID;
  const profile = isTemporary
    ? getEffectiveSelectedBankProfile(bankProfileState, manualCardFee, temporaryCardFee)
    : getBankProfile(bankProfileState, profileId, manualCardFee);
  if (!profile) return;
  editingBankProfileId = isTemporary ? TEMPORARY_PROFILE_EDITOR_ID : profile.id;
  manualEditorMode = manualMode;
  const isManual = profile.kind === 'manual';
  const isPreset = profile.kind === 'preset';
  const isCustomOnly = isManual && manualMode === 'custom';
  const returnsToManagement = bankProfileListMode === 'manage';

  bankProfileEls.listView.hidden = true;
  bankProfileEls.editor.hidden = false;
  bankProfileEls.panel.classList.add('is-editing');
  bankProfileEls.panel.classList.toggle('is-managing', returnsToManagement);
  bankProfileEls.contextLabel.hidden = false;
  bankProfileEls.contextLabel.textContent = isTemporary
    ? 'Ajuste temporal'
    : isCustomOnly
      ? 'Nuevo perfil'
      : returnsToManagement ? 'Editando perfil' : 'Perfil manual';
  bankProfileEls.editorBackLabel.textContent = returnsToManagement ? 'Volver a perfiles' : 'Volver a bancos';
  bankProfileEls.nameField.hidden = isTemporary || (isManual && !isCustomOnly);
  bankProfileEls.cardTypeField.hidden = isTemporary || (isManual && !isCustomOnly);
  bankProfileEls.logoField.hidden = isTemporary || (isManual && !isCustomOnly);
  bankProfileEls.quickField.hidden = isTemporary;
  bankProfileEls.restore.hidden = !isPreset || isTemporary || !profile.isModified;
  bankProfileEls.remove.hidden = isManual || isTemporary || bankProfileState.profiles.length <= 1;
  bankProfileEls.save.hidden = isManual || isTemporary;
  bankProfileEls.applyManual.hidden = (!isManual || isCustomOnly) && !isTemporary;
  bankProfileEls.saveManual.hidden = !isManual || isTemporary;
  bankProfileEls.clearTemporary.hidden = !isTemporary || temporaryCardFee === null;
  bankProfileEls.applyManual.textContent = isTemporary ? 'Aplicar a este cálculo' : 'Usar sin guardar';
  bankProfileEls.name.value = isManual ? '' : profile.name;
  bankProfileEls.cardType.value = isManual ? '' : profile.cardType;
  bankProfileEls.fee.value = feeToInputValue(profile.fee);
  editingBankProfileLogo = isManual ? null : profile.icon;
  bankProfileLogoProcessing = false;
  editingQuickAmountDraft = profile.quickAmounts ? [...profile.quickAmounts] : null;
  bankProfileEls.logoInput.value = '';
  bankProfileEls.logoField.open = false;
  bankProfileEls.logoStatus.textContent = '';
  bankProfileEls.chooseLogo.disabled = false;
  renderBankProfileLogoEditor();
  const quickSource = getEditingProfileQuickSource(profile);
  bankProfileEls.quickUseGeneral.checked = quickSource === 'general';
  bankProfileEls.quickUseCustom.checked = quickSource === 'custom';
  bankProfileEls.quickUseCustom.disabled = isManual;
  bankProfileEls.quickUseGeneral.nextElementSibling.textContent = isManual ? 'Montos generales' : 'Usar montos generales';
  updateQuickAmountSummary(profile);
  syncQuickAmountEditor();
  setQuickAmountDisclosure(expandQuickAmountsOnOpen);
  expandQuickAmountsOnOpen = false;
  setBankProfileFormError();

  if (isTemporary) {
    bankProfileEls.title.textContent = 'Ajustar comisión';
    bankProfileEls.description.textContent =
      'Este cambio se aplicará únicamente al cálculo actual y no modificará el perfil guardado.';
  } else if (isCustomOnly) {
    bankProfileEls.title.textContent = 'Añadir banco';
    bankProfileEls.description.textContent = 'Guarda el banco, la tarjeta y su comisión.';
  } else if (isManual) {
    bankProfileEls.title.textContent = 'Otro banco / Manual';
    bankProfileEls.description.textContent = 'Úsalo sin guardar o completa el nombre para crear un perfil.';
  } else if (isPreset) {
    bankProfileEls.title.textContent = `Editar ${profile.name}`;
    bankProfileEls.description.textContent = 'Actualiza los datos que se aplican al elegir este perfil.';
    bankProfileEls.restore.textContent = 'Restaurar este banco';
  } else {
    bankProfileEls.title.textContent = `Editar ${profile.name}`;
    bankProfileEls.description.textContent = 'Actualiza los datos que se aplican al elegir este perfil.';
  }

  requestAnimationFrame(() => {
    (isTemporary ? bankProfileEls.fee : bankProfileEls.name).focus();
  });
}

function getEditorFee() {
  const fee = sanitizeCardFee(bankProfileEls.fee.value);
  if (fee === null) {
    setBankProfileFormError('Ingresa una comisión entre 0% y 100%.', bankProfileEls.fee);
    bankProfileEls.fee.focus();
    return null;
  }
  setBankProfileFormError();
  return fee;
}

function saveEditedBankProfile() {
  const profile = getBankProfile(bankProfileState, editingBankProfileId, manualCardFee);
  const fee = getEditorFee();
  if (!profile || fee === null || profile.kind === 'manual' || bankProfileLogoProcessing) return;
  const name = bankProfileEls.name.value.trim();
  if (!name) {
    setBankProfileFormError('Escribe el nombre del banco para guardar el perfil.', bankProfileEls.name);
    bankProfileEls.name.focus();
    return;
  }
  const changedName = name.toLocaleLowerCase('es-VE') !== profile.name.toLocaleLowerCase('es-VE');
  if (changedName && hasDuplicateProfileName(bankProfileState, name, profile.id)) {
    setBankProfileFormError('Ya existe un perfil con ese nombre. Usa un nombre diferente.', bankProfileEls.name);
    bankProfileEls.name.focus();
    return;
  }

  let nextState = updateBankProfile(bankProfileState, {
    id: profile.id,
    name,
    cardType: bankProfileEls.cardType.value,
    fee,
    icon: editingBankProfileLogo,
    quickAmounts: profile.quickAmounts
  });
  nextState = applyQuickAmountEditorChanges(nextState, profile.id);
  if (!nextState) return;
  if (!persistBankProfiles(nextState, { preserveEditor: true })) return;

  if (bankProfileState.selectedId === profile.id && temporaryCardFee === null) {
    els.cardFee.value = feeToInputValue(fee);
    calculate();
    saveState(false);
  }
  renderBankProfiles();
  showBankProfileList({ focusBack: true });
  triggerHaptic('success');
  showToast('Perfil actualizado.');
}

function applyManualFee() {
  const fee = getEditorFee();
  if (fee === null) return;
  if (editingBankProfileId === TEMPORARY_PROFILE_EDITOR_ID) {
    temporaryCardFee = feeToInputValue(fee);
    els.cardFee.value = temporaryCardFee;
    renderBankProfiles();
    calculate();
    saveState(false);
    triggerHaptic('success');
    showToast('Ajuste aplicado a este cálculo.');
    dismissBankProfiles();
    return;
  }
  applySelectedBankProfile(MANUAL_PROFILE_ID, fee);
}

function clearTemporaryBankFee() {
  if (temporaryCardFee === null) return;
  temporaryCardFee = null;
  const savedProfile = getSelectedBankProfile(bankProfileState, manualCardFee);
  els.cardFee.value = feeToInputValue(savedProfile.fee);
  renderBankProfiles();
  calculate();
  saveState(false);
  triggerHaptic('success');
  showToast('Valor guardado del perfil aplicado.');
  dismissBankProfiles();
}

function saveManualProfile() {
  const fee = getEditorFee();
  if (fee === null || bankProfileLogoProcessing) return;
  const name = bankProfileEls.name.value.trim();
  if (!name) {
    setBankProfileFormError('Escribe el nombre del banco para guardar el perfil.', bankProfileEls.name);
    bankProfileEls.name.focus();
    return;
  }
  if (hasDuplicateProfileName(bankProfileState, name)) {
    setBankProfileFormError('Ya existe un perfil con ese nombre. Usa un nombre diferente.', bankProfileEls.name);
    bankProfileEls.name.focus();
    return;
  }

  const previousIds = new Set(bankProfileState.profiles.map(profile => profile.id));
  const requestedId = `custom-${Date.now().toString(36)}`;
  let nextState = upsertCustomProfile(bankProfileState, {
    name,
    cardType: bankProfileEls.cardType.value,
    fee,
    icon: editingBankProfileLogo
  }, requestedId);
  nextState = applyQuickAmountEditorChanges(nextState, MANUAL_PROFILE_ID);
  if (!nextState) return;
  const createdProfile = nextState.profiles.find(profile => !previousIds.has(profile.id));
  if (!createdProfile) {
    setBankProfileFormError('No se pudo guardar el perfil. Revisa los datos.');
    return;
  }
  if (!persistBankProfiles(nextState, { preserveEditor: true })) return;
  applySelectedBankProfile(createdProfile.id);
}

function restoreEditingPreset() {
  const profile = getBankProfile(bankProfileState, editingBankProfileId, manualCardFee);
  if (!profile || profile.kind !== 'preset') return;
  const nextState = restoreBankProfile(bankProfileState, profile.id);
  if (!persistBankProfiles(nextState, { preserveEditor: true })) return;
  const restoredProfile = getBankProfile(bankProfileState, profile.id);
  if (bankProfileState.selectedId === profile.id && temporaryCardFee === null) {
    els.cardFee.value = feeToInputValue(restoredProfile.fee);
    calculate();
    saveState(false);
  }
  renderBankProfiles();
  showBankProfileEditor(profile.id);
  triggerHaptic('success');
  showToast('Banco predeterminado restaurado.');
}

function deleteEditingBankProfile() {
  const profile = getBankProfile(bankProfileState, editingBankProfileId, manualCardFee);
  if (!profile || profile.kind === 'manual') return;
  if (bankProfileState.profiles.length <= 1) {
    setBankProfileFormError('Debe quedar al menos un perfil de banco.');
    return;
  }
  if (!window.confirm(`¿Eliminar “${profile.name}”? Esta acción no se puede deshacer.`)) return;

  const wasSelected = bankProfileState.selectedId === profile.id;
  const nextState = removeBankProfile(bankProfileState, profile.id);
  if (!persistBankProfiles(nextState, { preserveEditor: true })) return;
  if (wasSelected) {
    temporaryCardFee = null;
    const selectedProfile = getSelectedBankProfile(bankProfileState, manualCardFee);
    els.cardFee.value = feeToInputValue(selectedProfile.fee);
    calculate();
    saveState(false);
  }
  renderBankProfiles();
  showBankProfileList({ focusBack: true });
  triggerHaptic('warning');
  showToast('Perfil eliminado.');
}

function chooseBankProfileLogo() {
  bankProfileEls.logoInput.click();
}

async function handleBankProfileLogoSelection() {
  const [file] = bankProfileEls.logoInput.files || [];
  bankProfileEls.logoInput.value = '';
  if (!file) return;

  bankProfileLogoProcessing = true;
  bankProfileEls.chooseLogo.disabled = true;
  bankProfileEls.logoStatus.textContent = 'Preparando logo…';
  setBankProfileFormError();
  try {
    editingBankProfileLogo = await processBankLogo(file);
    renderBankProfileLogoEditor();
    bankProfileEls.logoStatus.textContent = 'Logo listo para guardar.';
  } catch (error) {
    bankProfileEls.logoStatus.textContent = '';
    setBankProfileFormError(error?.message || 'No se pudo procesar el logo.', bankProfileEls.logoInput);
  } finally {
    bankProfileLogoProcessing = false;
    bankProfileEls.chooseLogo.disabled = false;
  }
}

function removeEditingBankProfileLogo() {
  editingBankProfileLogo = null;
  bankProfileEls.logoStatus.textContent = 'El logo se quitará al guardar.';
  renderBankProfileLogoEditor();
}

function restoreAllBankProfiles() {
  const message = '¿Restaurar todos los bancos predeterminados? Se eliminarán los perfiles añadidos y todos los cambios de nombres, modalidades, comisiones y logos.';
  if (!window.confirm(message)) return;
  const nextState = restoreDefaultBankProfiles();
  if (!persistBankProfiles(nextState)) return;
  temporaryCardFee = null;
  manualFeeConfigured = false;
  const selectedProfile = getSelectedBankProfile(bankProfileState, manualCardFee);
  els.cardFee.value = feeToInputValue(selectedProfile.fee);
  calculate();
  saveState(false);
  renderBankProfiles();
  showBankProfileList({ mode: 'manage' });
  triggerHaptic('warning');
  showToast('Perfiles predeterminados restaurados.');
}

function showBankProfiles(mode = 'select', { returnFocus = null } = {}) {
  bankProfileSelectionView = 'banks';
  activeBankGroupId = null;
  showBankProfileList({ mode });
  openManagedModal(bankProfileEls.panel, bankProfileEls.trigger, () => {
    bankProfileEls.panel.classList.remove('closing');
    bankProfileEls.panel.classList.add('open');
    bankProfileEls.panel.setAttribute('aria-hidden', 'false');
    triggerHaptic('light');
    lockBodyScroll();
  }, bankProfileEls.close, returnFocus);
}

function navigateBackWithinBankProfiles() {
  if (!bankProfileEls.editor.hidden) {
    showBankProfileList({ focusBack: true });
    return true;
  }
  if (bankProfileListMode === 'select' && bankProfileSelectionView === 'modalities') {
    returnToBankGroups();
    return true;
  }
  if (bankProfileListMode === 'manage') {
    showBankProfileList({ mode: 'select', focusBack: true });
    return true;
  }
  return false;
}

function configureSelectedProfileQuickAmounts() {
  expandQuickAmountsOnOpen = true;
  bankProfileSelectionView = 'banks';
  activeBankGroupId = null;
  showBankProfileList({ mode: 'manage' });
  openManagedModal(bankProfileEls.panel, bankProfileEls.trigger, () => {
    bankProfileEls.panel.classList.remove('closing');
    bankProfileEls.panel.classList.add('open');
    bankProfileEls.panel.setAttribute('aria-hidden', 'false');
    lockBodyScroll();
    showBankProfileEditor(bankProfileState.selectedId);
    requestAnimationFrame(() => bankProfileEls.quickSummary.focus());
  }, bankProfileEls.close);
}

function dismissBankProfiles() {
  closeManagedModal(bankProfileEls.panel, bankProfileEls.trigger, () => {
    bankProfileEls.panel.classList.add('closing');
    triggerHaptic('light');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
    setTimeout(() => {
      bankProfileEls.panel.classList.remove('open', 'closing');
      bankProfileEls.panel.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();
    }, duration);
  });
}

function bindBankProfileEvents() {
  bankProfileEls.trigger.addEventListener('click', () => showBankProfiles('select'));
  bankProfileEls.close.addEventListener('click', dismissBankProfiles);
  bankProfileEls.panel.addEventListener('click', event => {
    if (event.target === bankProfileEls.panel) dismissBankProfiles();
  });
  bankProfileEls.list.addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-profile]');
    if (editButton) {
      showBankProfileEditor(editButton.dataset.editProfile);
      return;
    }
    const bankButton = event.target.closest('[data-select-bank]');
    if (bankButton) {
      showBankModalities(bankButton.dataset.selectBank);
      return;
    }
    const selectButton = event.target.closest('[data-select-profile]');
    if (!selectButton) return;
    const profileId = selectButton.dataset.selectProfile;
    if (profileId === MANUAL_PROFILE_ID) showBankProfileEditor(profileId);
    else applySelectedBankProfile(profileId);
  });
  bankProfileEls.back.addEventListener('click', navigateBackWithinBankProfiles);
  bankProfileEls.modalitiesBack.addEventListener('click', returnToBankGroups);
  bankProfileEls.openTemporary.addEventListener('click', () => showBankProfileEditor(TEMPORARY_PROFILE_EDITOR_ID));
  bankProfileEls.manage.addEventListener('click', () => showBankProfileList({ mode: 'manage' }));
  bankProfileEls.backToSelection.addEventListener('click', () => showBankProfileList({ mode: 'select', focusBack: true }));
  bankProfileEls.createCustom.addEventListener('click', () => {
    showBankProfileEditor(MANUAL_PROFILE_ID, { manualMode: 'custom' });
  });
  bankProfileEls.restoreDefaults.addEventListener('click', restoreAllBankProfiles);
  bankProfileEls.editor.addEventListener('submit', event => {
    event.preventDefault();
    saveEditedBankProfile();
  });
  bankProfileEls.name.addEventListener('input', renderBankProfileLogoEditor);
  bankProfileEls.chooseLogo.addEventListener('click', chooseBankProfileLogo);
  bankProfileEls.logoInput.addEventListener('change', handleBankProfileLogoSelection);
  bankProfileEls.removeLogo.addEventListener('click', removeEditingBankProfileLogo);
  bankProfileEls.quickUseGeneral.addEventListener('change', syncQuickAmountEditor);
  bankProfileEls.quickUseCustom.addEventListener('change', syncQuickAmountEditor);
  bankProfileEls.quickSummary.addEventListener('click', () => {
    setQuickAmountDisclosure(bankProfileEls.quickDetails.hidden, { focus: false });
  });
  bankProfileEls.quickAdd.addEventListener('click', () => {
    const amounts = [...bankProfileEls.quickList.querySelectorAll('input')].map(input => input.value || '100');
    if (amounts.length >= 4) return;
    amounts.push('');
    renderQuickAmountEditor(amounts.map(amount => Number(amount) || 0));
    bankProfileEls.quickList.querySelector('.bank-profile-quick-item:last-child input')?.focus();
  });
  bankProfileEls.quickList.addEventListener('click', event => {
    const item = event.target.closest('.bank-profile-quick-item');
    if (!item) return;
    const items = [...bankProfileEls.quickList.children];
    const index = items.indexOf(item);
    const amounts = [...bankProfileEls.quickList.querySelectorAll('input')].map(input => Number(input.value) || 0);
    if (event.target.closest('[data-quick-remove]') && amounts.length > 1) {
      amounts.splice(index, 1);
    } else {
      return;
    }
    renderQuickAmountEditor(amounts);
  });
  bankProfileEls.generalQuickAdd.addEventListener('click', () => {
    const amounts = [...bankProfileEls.generalQuickList.querySelectorAll('input')].map(input => Number(input.value) || 0);
    if (amounts.length >= 4) return;
    amounts.push(0);
    renderGeneralQuickAmountSettings(amounts);
    bankProfileEls.generalQuickList.querySelector('.bank-profile-quick-item:last-child input')?.focus();
  });
  bankProfileEls.generalQuickRestore.addEventListener('click', () => {
    renderGeneralQuickAmountSettings(DEFAULT_QUICK_AMOUNTS);
  });
  bankProfileEls.generalQuickSave.addEventListener('click', saveGeneralQuickAmountSettings);
  bankProfileEls.generalQuickList.addEventListener('click', event => {
    const item = event.target.closest('.bank-profile-quick-item');
    if (!item || !event.target.closest('[data-quick-remove]')) return;
    const items = [...bankProfileEls.generalQuickList.children];
    const index = items.indexOf(item);
    const amounts = [...bankProfileEls.generalQuickList.querySelectorAll('input')].map(input => Number(input.value) || 0);
    if (amounts.length <= 1) return;
    amounts.splice(index, 1);
    renderGeneralQuickAmountSettings(amounts);
  });
  bankProfileEls.applyManual.addEventListener('click', applyManualFee);
  bankProfileEls.saveManual.addEventListener('click', saveManualProfile);
  bankProfileEls.clearTemporary.addEventListener('click', clearTemporaryBankFee);
  bankProfileEls.restore.addEventListener('click', restoreEditingPreset);
  bankProfileEls.remove.addEventListener('click', deleteEditingBankProfile);
}

function getState() {
  return {
    usdToBuy: els.usdToBuy.value,
    bankMargin: els.bankMargin.value,
    bcvRate: els.bcvRate.value,
    p2pRate: els.p2pRate.value,
    cardFee: els.cardFee.value,
    bpayFee: els.bpayFee.value,
    autoRates: els.autoRates.checked,
    bcvRecord: activeBcvRecord,
    p2pRecord: activeP2pRecord,
    lastUpdate: els.lastUpdate.dataset.absolute || els.lastUpdate.textContent
  };
}

function saveState(show = true) {
  writeState(getState());
  if (show) {
    triggerHaptic('success');
    setStatus('Configuración guardada.', 'ok');
  }
}

function loadState() {
  const data = readState();
  if (Object.prototype.hasOwnProperty.call(data, 'usdToBuy')) els.usdToBuy.value = data.usdToBuy;
  if (Object.prototype.hasOwnProperty.call(data, 'bankMargin')) els.bankMargin.value = data.bankMargin;
  if (Object.prototype.hasOwnProperty.call(data, 'bcvRate')) els.bcvRate.value = data.bcvRate;
  if (Object.prototype.hasOwnProperty.call(data, 'p2pRate')) els.p2pRate.value = data.p2pRate;
  if (Object.prototype.hasOwnProperty.call(data, 'cardFee')) els.cardFee.value = data.cardFee;
  if (Object.prototype.hasOwnProperty.call(data, 'bpayFee')) els.bpayFee.value = data.bpayFee;
  if (typeof data.autoRates === 'boolean') els.autoRates.checked = data.autoRates;
  if (data.bcvRecord && typeof data.bcvRecord === 'object') {
    activeBcvRecord = data.bcvRecord;
    lastAutomaticBcvRecord = data.bcvRecord;
    renderBcvDate(activeBcvRecord);
  }
  if (data.p2pRecord && typeof data.p2pRecord === 'object') {
    activeP2pRecord = data.p2pRecord;
    lastAutomaticP2pRecord = data.p2pRecord;
  }
  if (data.lastUpdate) {
    els.lastUpdate.textContent = data.lastUpdate;
    els.lastUpdate.dataset.absolute = data.lastUpdate;
    ratesLastUpdated = parseLastUpdate(data.lastUpdate);
  }
  return data;
}

function resetDefaults() {
  triggerHaptic('warning');
  els.usdToBuy.value = '500';
  els.bankMargin.value = '0.5';
  els.bpayFee.value = '4.1';
  els.autoRates.checked = true;
  temporaryCardFee = null;
  manualFeeConfigured = false;
  const nextProfileState = selectBankProfile(
    restoreBankProfile(bankProfileState, DEFAULT_PROFILE_ID),
    DEFAULT_PROFILE_ID
  );
  persistBankProfiles(nextProfileState);
  const activeProfile = getSelectedBankProfile(bankProfileState, manualCardFee);
  els.cardFee.value = feeToInputValue(activeProfile.fee);
  renderBankProfiles();
  
  // Reset theme to system
  applyTheme('system');
  updateThemeUI('system');
  localStorage.setItem('theme', 'system');

  calculate();
  saveState(false);
  setStatus('Valores base restaurados.', 'ok');
}

async function loadRates(showSuccessToast = false) {
  if (ratesRequestInFlight) return;
  ratesRequestInFlight = true;
  triggerHaptic();
  setLoadingRates(true);
  try {
    const result = await fetchRates({ cachedBcv: activeBcvRecord, cachedP2p: activeP2pRecord });
    const bcvUpdated = result.bcv.ok && result.bcv.updated;
    const p2pUpdated = result.p2p.ok && result.p2p.updated;

    if (result.bcv.ok) {
      activeBcvRecord = result.bcv.record;
      lastAutomaticBcvRecord = result.bcv.record;
    }
    else activeBcvRecord = markBcvRecordCached(activeBcvRecord);
    if (bcvUpdated) els.bcvRate.value = String(activeBcvRecord.rate);

    if (result.p2p.ok) {
      activeP2pRecord = result.p2p.record;
      lastAutomaticP2pRecord = result.p2p.record;
    } else {
      activeP2pRecord = markP2pRecordCached(activeP2pRecord);
    }
    if (p2pUpdated) els.p2pRate.value = activeP2pRecord.rate.toFixed(4);

    if (!bcvUpdated && !p2pUpdated) throw new Error('No rate was refreshed');
    const updatedRecords = [bcvUpdated ? activeBcvRecord : null, p2pUpdated ? activeP2pRecord : null]
      .filter(Boolean);
    ratesLastUpdated = new Date(Math.max(...updatedRecords.map(record => Date.parse(record.fetchedAt))));
    const timeStr = ratesLastUpdated.toLocaleString('es-VE', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Caracas'
    });
    const refreshLabel = bcvUpdated && p2pUpdated
      ? `${activeBcvRecord.source === 'bcv.today' ? 'BCV Today' : 'BCV respaldo'} + ${activeP2pRecord.source === 'binance-p2p' ? 'Binance P2P' : 'P2P respaldo'}`
      : (bcvUpdated ? 'BCV actualizada · P2P conservada' : 'P2P actualizada · BCV conservada');
    els.lastUpdate.dataset.absolute = `${timeStr} · ${refreshLabel}`;
    updateRelativeTime();
    renderBcvDate(activeBcvRecord);
    clearRateError();
    const usedFallback = activeBcvRecord?.status === 'fallback' || activeP2pRecord?.status === 'fallback';
    if (showSuccessToast === true || !bcvUpdated || !p2pUpdated || usedFallback) {
      if (bcvUpdated && p2pUpdated) {
        showToast(usedFallback ? 'Tasas actualizadas con una fuente de respaldo.' : 'Tasas actualizadas: BCV y Binance P2P.');
      } else {
        showToast(bcvUpdated ? 'BCV actualizada. P2P conservada.' : 'P2P actualizada. BCV conservada.');
      }
    }
    calculate();
    saveState(false);
  } catch (err) {
    activeBcvRecord = markBcvRecordCached(activeBcvRecord);
    activeP2pRecord = markP2pRecordCached(activeP2pRecord);
    renderBcvDate(activeBcvRecord);
    showToast('No se pudieron actualizar las tasas. Conservando valores guardados.', 'err');
    showRateError(() => loadRates(true));
  } finally {
    ratesRequestInFlight = false;
    setLoadingRates(false);
    updateRelativeTime();
    calculate();
  }
}

function calculate() {
  const amountValidation = validateRequestedUsd(els.usdToBuy.value);
  const bcv = n(els.bcvRate.value);
  const bank = currentBankRate(bcv, els.bankMargin.value);
  const p2p = n(els.p2pRate.value);

  renderRates({ bcv, bank, p2p });
  renderBcvRateMode();
  renderP2pRateMode();
  renderUsdAmountValidation(amountValidation.error);

  const result = calculateValues({
    requestedUsd: els.usdToBuy.value, bcvRate: bcv, bankMargin: els.bankMargin.value,
    p2pRate: p2p, cardFee: els.cardFee.value, bpayFee: els.bpayFee.value
  });

  if (!result) {
    renderEmpty();
    return null;
  }

  renderResult(result);

  if (els.statusBox.classList.contains('warn')) {
    clearStatus();
  }

  return result;
}

function buildShareText(r) {
  const amount = money(r.usdUsed, 2);
  const bsNeeded = money(r.vesNeeded, 2);
  const bpayAmount = money(r.safeGateway.bpayInputAmount, 2);
  const finalUsdt = money(r.usdtFinal, 2);
  const profitUsd = (r.profitUsdt >= 0 ? '+' : '') + money(r.profitUsdt, 2);
  const roi = (r.roi >= 0 ? '+' : '') + money(r.roi, 2);
  const bcv = money(r.bcv, 2);
  const bankRate = money(r.bank, 2);
  const p2p = money(r.p2p, 2);
  const activeProfile = getEffectiveSelectedBankProfile(bankProfileState, manualCardFee, temporaryCardFee);
  const bankDescription = activeProfile
    ? [activeProfile.name, activeProfile.cardType, formatProfileFee(activeProfile.fee)].filter(Boolean).join(' · ')
    : `Comisión ${formatProfileFee(manualCardFee)}`;

  return `CalcuFlow — Banco → USDT

Compra: ${amount} USD
Banco: ${bankDescription}

BCV: ${bcv}
Banco: ${bankRate}
P2P: ${p2p}

Bs necesarios: ${bsNeeded} Bs
Monto en BPay: ${bpayAmount} USD
USDT finales: ${finalUsdt} USDT
Ganancia estimada: ${profitUsd} USD
Retorno: ${roi}%

https://calcu-flow.vercel.app`;
}

function shareOrCopy(btn) {
  triggerHaptic('light');
  const r = calculate();
  if (!r) {
    const errorMsg = navigator.share ? 'Completa los datos antes de compartir.' : 'Completa los datos antes de copiar.';
    showToast(errorMsg, 'warn');
    return;
  }
  const text = buildShareText(r);

  if (navigator.share) {
    navigator.share({
      title: 'CalcuFlow',
      text: text
    })
    .then(() => {
      triggerHaptic('success');
      showToast('Cálculo compartido');
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        showToast('No se pudo compartir el cálculo', 'err');
      }
    });
  } else {
    navigator.clipboard.writeText(text)
      .then(() => {
        triggerHaptic('success');
        showToast('Resumen copiado al portapapeles');
        flashCopyBtn(btn);
      })
      .catch(() => showToast('No se pudo compartir el cálculo', 'err'));
  }
}

function initShare() {
  if (navigator.share) {
    const copyBtn = els.copyBtnSettings;
    if (copyBtn) {
      copyBtn.title = "Compartir resumen";
      copyBtn.setAttribute("aria-label", "Compartir resumen");
      const icon = copyBtn.querySelector('.material-symbols-rounded');
      if (icon) {
        icon.textContent = 'share';
      }
    }
  }
}

function clearOperation() {
  triggerHaptic();
  if (els.usdToBuy) {
    els.usdToBuy.blur();
  }
  // Micro-delay to let the browser process focus/blur events and keyboard dismissal,
  // preventing composition buffer commits from overwriting our reset value.
  setTimeout(() => {
    if (els.usdToBuy) {
      els.usdToBuy.value = '0';
      // Dispatch input event to trigger the exact same calculation pipeline
      els.usdToBuy.dispatchEvent(new Event('input', { bubbles: true }));
    }
    clearStatus();
    showToast('Cálculo limpiado');
  }, 50);
}

const modalFocusOrigins = new WeakMap();

const bsHelperEls = {
  trigger: document.getElementById('openBsHelperBtn'),
  panel: document.getElementById('bsHelperPanel'),
  close: document.getElementById('closeBsHelperBtn'),
  form: document.getElementById('bsHelperForm'),
  input: document.getElementById('bsHelperInput'),
  usdtPreview: document.getElementById('bsHelperUsdtPreview'),
  usdPreview: document.getElementById('bsHelperUsdPreview'),
  message: document.getElementById('bsHelperMessage'),
  confirm: document.getElementById('confirmBsHelperBtn')
};

const p2pEditorEls = {
  trigger: document.getElementById('openP2pEditorBtn'),
  panel: document.getElementById('p2pEditorPanel'),
  close: document.getElementById('closeP2pEditorBtn'),
  form: document.getElementById('p2pEditorForm'),
  input: document.getElementById('p2pQuickRate'),
  message: document.getElementById('p2pEditorMessage'),
  restore: document.getElementById('restoreP2pRateBtn'),
  apply: document.getElementById('applyP2pRateBtn'),
  indicator: document.getElementById('p2pManualIndicator')
};

const bcvEditorEls = {
  trigger: document.getElementById('openBcvEditorBtn'),
  panel: document.getElementById('bcvEditorPanel'),
  close: document.getElementById('closeBcvEditorBtn'),
  form: document.getElementById('bcvEditorForm'),
  input: document.getElementById('bcvQuickRate'),
  message: document.getElementById('bcvEditorMessage'),
  restore: document.getElementById('restoreBcvRateBtn'),
  apply: document.getElementById('applyBcvRateBtn'),
  indicator: document.getElementById('bcvManualIndicator')
};

function openManagedModal(panel, trigger, openFn, initialFocus, returnFocus = null, focusDelay = 0) {
  const origin = returnFocus || (document.activeElement instanceof HTMLElement ? document.activeElement : trigger);
  modalFocusOrigins.set(panel, origin);
  openFn();
  trigger.setAttribute('aria-expanded', 'true');
  const focusTarget = initialFocus || panel.querySelector('.modal-close');
  const focusPanel = () => {
    if (panel.classList.contains('open')) focusTarget?.focus();
  };
  if (focusDelay > 0) setTimeout(focusPanel, focusDelay);
  else requestAnimationFrame(focusPanel);
}

function closeManagedModal(panel, trigger, closeFn) {
  if (!panel.classList.contains('open')) return;
  closeFn();
  trigger.setAttribute('aria-expanded', 'false');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
  setTimeout(() => {
    const origin = modalFocusOrigins.get(panel);
    if (origin && document.contains(origin)) origin.focus();
    modalFocusOrigins.delete(panel);
  }, duration);
}

function trapModalFocus(event) {
  if (event.key !== 'Tab') return;
  const panel = document.querySelector('.modal-shell.open, .install-prompt.show');
  if (!panel) return;

  const focusable = Array.from(panel.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(element => element.offsetParent !== null);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!panel.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

let bsHelperTouched = false;

function parseVesInput(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '');
  if (!raw || raw.startsWith('-') || !/^\d[\d.,]*$/.test(raw)) return NaN;

  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  let normalized = raw;

  if (commaCount && dotCount) {
    if (commaCount !== 1) return NaN;
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (commaCount) {
    if (commaCount !== 1) return NaN;
    normalized = raw.replace(',', '.');
  } else if (dotCount) {
    const groups = raw.split('.');
    if (dotCount > 1) {
      if (!groups.slice(1).every(group => group.length === 3)) return NaN;
      normalized = groups.join('');
    } else if (groups[1].length === 3 && groups[0].length <= 3) {
      normalized = groups.join('');
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
}

function getBsHelperResult() {
  const targetVes = parseVesInput(bsHelperEls.input.value);
  const bank = currentBankRate(els.bcvRate.value, els.bankMargin.value);
  if (!Number.isFinite(targetVes) || !bank) return null;

  const requestedUsd = Math.round((targetVes / bank + Number.EPSILON) * 100) / 100;
  if (requestedUsd > MAX_REQUESTED_USD) return null;
  const result = calculateValues({
    requestedUsd,
    bcvRate: els.bcvRate.value,
    bankMargin: els.bankMargin.value,
    p2pRate: els.p2pRate.value,
    cardFee: els.cardFee.value,
    bpayFee: els.bpayFee.value
  });

  if (!result) return null;
  return { requestedUsd, usdtFinal: result.usdtFinal, vesNeeded: result.vesNeeded };
}

function renderBsHelperPreview() {
  const result = getBsHelperResult();
  bsHelperEls.confirm.disabled = !result;

  if (!result) {
    bsHelperEls.usdtPreview.textContent = '--';
    bsHelperEls.usdPreview.textContent = '--';
    const parsedVes = parseVesInput(bsHelperEls.input.value);
    const bank = currentBankRate(els.bcvRate.value, els.bankMargin.value);
    const exceedsUsdMaximum = Number.isFinite(parsedVes) && bank && parsedVes / bank > MAX_REQUESTED_USD;
    if (!bsHelperTouched && !bsHelperEls.input.value.trim()) bsHelperEls.message.textContent = '';
    else if (exceedsUsdMaximum) bsHelperEls.message.textContent = 'El equivalente supera el máximo de 1.000.000,00 USD.';
    else if (Number.isFinite(parsedVes)) bsHelperEls.message.textContent = 'Actualiza las tasas para calcular este monto.';
    else bsHelperEls.message.textContent = 'Ingresa un monto válido en bolívares.';
    return null;
  }

  bsHelperEls.usdtPreview.textContent = money(result.usdtFinal, 2);
  bsHelperEls.usdPreview.textContent = money(result.requestedUsd, 2);
  bsHelperEls.message.textContent = '';
  return result;
}

function showBsHelper() {
  bsHelperTouched = false;
  bsHelperEls.input.value = '';
  renderBsHelperPreview();
  openManagedModal(bsHelperEls.panel, bsHelperEls.trigger, () => {
    bsHelperEls.panel.classList.remove('closing');
    bsHelperEls.panel.classList.add('open');
    bsHelperEls.panel.setAttribute('aria-hidden', 'false');
    triggerHaptic('light');
    lockBodyScroll();
  }, bsHelperEls.input, null,
    window.matchMedia('(max-width: 860px)').matches ? 220 : 0
  );
}

function dismissBsHelper() {
  closeManagedModal(bsHelperEls.panel, bsHelperEls.trigger, () => {
    bsHelperEls.panel.classList.add('closing');
    triggerHaptic('light');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
    setTimeout(() => {
      bsHelperEls.panel.classList.remove('open', 'closing');
      bsHelperEls.panel.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();
    }, duration);
  });
}

function confirmBsHelper() {
  const result = renderBsHelperPreview();
  if (!result) return;

  els.usdToBuy.value = result.requestedUsd.toFixed(2);
  els.usdToBuy.dispatchEvent(new Event('input', { bubbles: true }));
  dismissBsHelper();
}

function parsePositiveRateInput(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const rate = Number(normalized);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function setP2pEditorMessage(text = '', type = '') {
  p2pEditorEls.message.textContent = text;
  p2pEditorEls.message.hidden = !text;
  p2pEditorEls.message.classList.toggle('is-error', type === 'error');
  p2pEditorEls.message.setAttribute('role', type === 'error' ? 'alert' : 'status');
}

function renderP2pEditorValidation(showError = false) {
  const rate = parsePositiveRateInput(p2pEditorEls.input.value);
  const invalid = rate === null;
  p2pEditorEls.apply.disabled = invalid;
  p2pEditorEls.input.setAttribute('aria-invalid', String(showError && invalid));
  if (showError && invalid) setP2pEditorMessage('Ingresa una tasa P2P válida.', 'error');
  else if (p2pEditorEls.message.classList.contains('is-error')) setP2pEditorMessage();
  return rate;
}

function renderP2pRateMode() {
  const displayedRate = n(els.p2pRate.value);
  const automaticRate = n(activeP2pRecord?.rate);
  const isManual = displayedRate > 0 && (!automaticRate || Math.abs(displayedRate - automaticRate) > 0.000001);
  p2pEditorEls.indicator.hidden = !isManual;
  p2pEditorEls.trigger.classList.toggle('is-manual', isManual);
  p2pEditorEls.trigger.setAttribute(
    'aria-label',
    isManual ? 'Editar tasa P2P. Ajuste manual activo' : 'Editar tasa P2P'
  );
}

function showP2pEditor() {
  p2pEditorEls.input.value = els.p2pRate.value;
  setP2pEditorMessage();
  renderP2pEditorValidation();
  openManagedModal(p2pEditorEls.panel, p2pEditorEls.trigger, () => {
    p2pEditorEls.panel.classList.remove('closing');
    p2pEditorEls.panel.classList.add('open');
    p2pEditorEls.panel.setAttribute('aria-hidden', 'false');
    triggerHaptic('light');
    lockBodyScroll();
  }, p2pEditorEls.input, p2pEditorEls.trigger,
    window.matchMedia('(max-width: 860px)').matches ? 220 : 0
  );
}

function dismissP2pEditor() {
  closeManagedModal(p2pEditorEls.panel, p2pEditorEls.trigger, () => {
    p2pEditorEls.panel.classList.add('closing');
    triggerHaptic('light');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
    setTimeout(() => {
      p2pEditorEls.panel.classList.remove('open', 'closing');
      p2pEditorEls.panel.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();
    }, duration);
  });
}

function applyP2pEditorRate() {
  const rate = renderP2pEditorValidation(true);
  if (rate === null) return;
  els.p2pRate.value = String(rate);
  els.p2pRate.dispatchEvent(new Event('input', { bubbles: true }));
  showToast('Tasa P2P ajustada para esta simulación.');
  dismissP2pEditor();
}

async function restoreP2pAutomaticRate() {
  p2pEditorEls.restore.disabled = true;
  p2pEditorEls.apply.disabled = true;
  setP2pEditorMessage('Buscando la tasa P2P actual…');

  if (!lastAutomaticP2pRecord) await loadRates(true);

  p2pEditorEls.restore.disabled = false;
  if (!lastAutomaticP2pRecord) {
    renderP2pEditorValidation();
    setP2pEditorMessage('No se pudo recuperar una tasa P2P automática.', 'error');
    return;
  }

  activeP2pRecord = lastAutomaticP2pRecord;
  els.p2pRate.value = Number(activeP2pRecord.rate).toFixed(4);
  calculate();
  saveState(false);
  showToast('Tasa P2P actual restaurada.');
  dismissP2pEditor();
}

function setBcvEditorMessage(text = '', type = '') {
  bcvEditorEls.message.textContent = text;
  bcvEditorEls.message.hidden = !text;
  bcvEditorEls.message.classList.toggle('is-error', type === 'error');
  bcvEditorEls.message.setAttribute('role', type === 'error' ? 'alert' : 'status');
}

function renderBcvEditorValidation(showError = false) {
  const rate = parsePositiveRateInput(bcvEditorEls.input.value);
  const invalid = rate === null;
  bcvEditorEls.apply.disabled = invalid;
  bcvEditorEls.input.setAttribute('aria-invalid', String(showError && invalid));
  if (showError && invalid) setBcvEditorMessage('Ingresa una tasa BCV válida.', 'error');
  else if (bcvEditorEls.message.classList.contains('is-error')) setBcvEditorMessage();
  return rate;
}

function renderBcvRateMode() {
  const displayedRate = n(els.bcvRate.value);
  const automaticRate = n(activeBcvRecord?.rate);
  const isManual = displayedRate > 0 && (!automaticRate || Math.abs(displayedRate - automaticRate) > 0.000001);
  bcvEditorEls.indicator.hidden = !isManual;
  bcvEditorEls.trigger.classList.toggle('is-manual', isManual);
  bcvEditorEls.trigger.setAttribute(
    'aria-label',
    isManual ? 'Editar tasa BCV. Ajuste manual activo' : 'Editar tasa BCV'
  );
}

function showBcvEditor() {
  bcvEditorEls.input.value = els.bcvRate.value;
  setBcvEditorMessage();
  renderBcvEditorValidation();
  openManagedModal(bcvEditorEls.panel, bcvEditorEls.trigger, () => {
    bcvEditorEls.panel.classList.remove('closing');
    bcvEditorEls.panel.classList.add('open');
    bcvEditorEls.panel.setAttribute('aria-hidden', 'false');
    triggerHaptic('light');
    lockBodyScroll();
  }, bcvEditorEls.input, bcvEditorEls.trigger,
    window.matchMedia('(max-width: 860px)').matches ? 220 : 0
  );
}

function dismissBcvEditor() {
  closeManagedModal(bcvEditorEls.panel, bcvEditorEls.trigger, () => {
    bcvEditorEls.panel.classList.add('closing');
    triggerHaptic('light');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
    setTimeout(() => {
      bcvEditorEls.panel.classList.remove('open', 'closing');
      bcvEditorEls.panel.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();
    }, duration);
  });
}

function applyBcvEditorRate() {
  const rate = renderBcvEditorValidation(true);
  if (rate === null) return;
  els.bcvRate.value = String(rate);
  els.bcvRate.dispatchEvent(new Event('input', { bubbles: true }));
  showToast('Tasa BCV ajustada para esta simulación.');
  dismissBcvEditor();
}

async function restoreBcvAutomaticRate() {
  bcvEditorEls.restore.disabled = true;
  bcvEditorEls.apply.disabled = true;
  setBcvEditorMessage('Buscando la tasa BCV actual…');

  if (!lastAutomaticBcvRecord) await loadRates(true);

  bcvEditorEls.restore.disabled = false;
  if (!lastAutomaticBcvRecord) {
    renderBcvEditorValidation();
    setBcvEditorMessage('No se pudo recuperar una tasa BCV automática.', 'error');
    return;
  }

  activeBcvRecord = lastAutomaticBcvRecord;
  els.bcvRate.value = String(activeBcvRecord.rate);
  renderBcvDate(activeBcvRecord);
  calculate();
  saveState(false);
  showToast('Tasa BCV actual restaurada.');
  dismissBcvEditor();
}

function bindEvents() {
  ['usdToBuy','bankMargin','bcvRate','p2pRate','cardFee','bpayFee','autoRates'].forEach(key => {
    els[key].addEventListener('input', () => {
      if (key === 'usdToBuy') {
        els[key].value = sanitizeRequestedUsdInput(els[key].value);
      }
      if (key === 'bcvRate') {
        if (activeBcvRecord) lastAutomaticBcvRecord = activeBcvRecord;
        activeBcvRecord = null;
        renderBcvDate(null);
      }
      if (key === 'p2pRate') {
        if (activeP2pRecord) lastAutomaticP2pRecord = activeP2pRecord;
        activeP2pRecord = null;
      }
      if (key === 'cardFee') syncActiveProfileFromCardFee();
      calculate();
      saveState(false);
    });
    els[key].addEventListener('change', () => {
      if (key === 'cardFee') syncActiveProfileFromCardFee();
      calculate();
      saveState(false);
    });
  });

  bindBankProfileEvents();

  document.getElementById('quickAmountRow')?.addEventListener('click', event => {
    const btn = event.target.closest('[data-quick]');
    if (!btn) return;
    triggerHaptic('light');
    els.usdToBuy.value = btn.dataset.quick;
    calculate();
    saveState(false);
  });

  // maxBtn was removed from the UI; its hidden compat element is also gone
  els.loadRatesBtn.addEventListener('click', () => loadRates(true));
  els.loadRatesBtnMobile.addEventListener('click', () => loadRates(true));
  els.loadRatesBtnSettings.addEventListener('click', () => loadRates(true));
  els.shareBtn.addEventListener('click', () => shareOrCopy(els.shareBtn));
  els.shareBtnMobile.addEventListener('click', () => shareOrCopy(els.shareBtnMobile));
  els.copyBtnSettings.addEventListener('click', () => shareOrCopy(els.copyBtnSettings));
  els.clearBtn.addEventListener('click', clearOperation);
  els.clearBtnTop.addEventListener('click', clearOperation);
  els.clearBtnMobile.addEventListener('click', clearOperation);
  els.resetDefaultsBtn.addEventListener('click', resetDefaults);
  const showSettings = () => {
    openManagedModal(els.settingsPanel, els.openSettingsBtn, openSettings, els.closeSettingsBtn);
  };
  const dismissSettings = () => closeManagedModal(els.settingsPanel, els.openSettingsBtn, closeSettings);
  const showBreakdown = () => {
    openManagedModal(els.breakdownPanel, els.openBreakdownBtn, openBreakdown, els.closeBreakdownBtn);
  };
  const dismissBreakdown = () => closeManagedModal(els.breakdownPanel, els.openBreakdownBtn, closeBreakdown);
  const showSupport = () => openManagedModal(els.supportPanel, els.openSupportBtn, openSupport, els.closeSupportBtn);
  const dismissSupport = () => closeManagedModal(els.supportPanel, els.openSupportBtn, closeSupport);

  els.openSettingsBtn.addEventListener('click', showSettings);
  els.closeSettingsBtn.addEventListener('click', dismissSettings);
  els.settingsPanel.addEventListener('click', e => { if (e.target === els.settingsPanel) dismissSettings(); });
  bankProfileEls.settingsManage.addEventListener('click', () => {
    dismissSettings();
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 270;
    setTimeout(() => showBankProfiles('manage', { returnFocus: els.openSettingsBtn }), duration);
  });
  els.openBreakdownBtn.addEventListener('click', showBreakdown);
  els.closeBreakdownBtn.addEventListener('click', dismissBreakdown);
  els.breakdownPanel.addEventListener('click', e => { if (e.target === els.breakdownPanel) dismissBreakdown(); });
  bsHelperEls.trigger.addEventListener('click', showBsHelper);
  bsHelperEls.close.addEventListener('click', dismissBsHelper);
  bsHelperEls.panel.addEventListener('click', e => { if (e.target === bsHelperEls.panel) dismissBsHelper(); });
  bsHelperEls.input.addEventListener('input', () => {
    bsHelperTouched = true;
    renderBsHelperPreview();
  });
  bsHelperEls.input.addEventListener('keydown', e => {
    if (e.key === '-') {
      e.preventDefault();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    confirmBsHelper();
  });
  bsHelperEls.form.addEventListener('submit', e => {
    e.preventDefault();
    confirmBsHelper();
  });
  p2pEditorEls.trigger.addEventListener('click', showP2pEditor);
  p2pEditorEls.close.addEventListener('click', dismissP2pEditor);
  p2pEditorEls.panel.addEventListener('click', e => { if (e.target === p2pEditorEls.panel) dismissP2pEditor(); });
  p2pEditorEls.input.addEventListener('input', () => {
    setP2pEditorMessage();
    renderP2pEditorValidation();
  });
  p2pEditorEls.input.addEventListener('beforeinput', e => {
    if (e.data && /[^\d.,]/.test(e.data)) e.preventDefault();
  });
  p2pEditorEls.form.addEventListener('submit', e => {
    e.preventDefault();
    applyP2pEditorRate();
  });
  p2pEditorEls.restore.addEventListener('click', () => restoreP2pAutomaticRate());
  bcvEditorEls.trigger.addEventListener('click', showBcvEditor);
  bcvEditorEls.close.addEventListener('click', dismissBcvEditor);
  bcvEditorEls.panel.addEventListener('click', e => { if (e.target === bcvEditorEls.panel) dismissBcvEditor(); });
  bcvEditorEls.input.addEventListener('input', () => {
    setBcvEditorMessage();
    renderBcvEditorValidation();
  });
  bcvEditorEls.input.addEventListener('beforeinput', e => {
    if (e.data && /[^\d.,]/.test(e.data)) e.preventDefault();
  });
  bcvEditorEls.form.addEventListener('submit', e => {
    e.preventDefault();
    applyBcvEditorRate();
  });
  bcvEditorEls.restore.addEventListener('click', () => restoreBcvAutomaticRate());

  // Prevent scroll leaking through any shared modal backdrop on mobile
  document.querySelectorAll('.modal-shell').forEach(shell => shell.addEventListener('touchmove', e => {
    if (!e.target.closest('.modal-panel')) {
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false }));

  const installPrompt = document.getElementById('installPrompt');
  if (installPrompt) {
    installPrompt.addEventListener('touchmove', e => {
      if (!e.target.closest('.install-prompt-content')) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
  }

  window.addEventListener('keydown', e => {
    trapModalFocus(e);
    if (e.key === 'Escape') {
      if (bankProfileEls.panel.classList.contains('open')) {
        if (!navigateBackWithinBankProfiles()) dismissBankProfiles();
      }
      else if (bsHelperEls.panel.classList.contains('open')) dismissBsHelper();
      else if (p2pEditorEls.panel.classList.contains('open')) dismissP2pEditor();
      else if (bcvEditorEls.panel.classList.contains('open')) dismissBcvEditor();
      else if (els.settingsPanel.classList.contains('open')) dismissSettings();
      else if (els.breakdownPanel.classList.contains('open')) dismissBreakdown();
      else if (els.qrPanel.classList.contains('open')) dismissQr();
      else if (els.supportPanel.classList.contains('open')) dismissSupport();
      else if (installPrompt?.classList.contains('show')) hideInstallPrompt();
    }
  });

  const formulaDetails = document.querySelector('.formula-details');
  if (formulaDetails) {
    const summarySpan = formulaDetails.querySelector('summary span:not(.formula-chevron)');
    formulaDetails.addEventListener('toggle', () => {
      summarySpan.textContent = formulaDetails.open ? 'Ocultar fórmulas' : 'Ver fórmulas';
    });
  }

  // Keep breakdown BPay amount and donation copy listeners active
  document.querySelectorAll('.kpi-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.copy;
      const el = document.getElementById(targetId);
      if (!el || el.textContent === '--') return;
      
      const textToCopy = el.textContent.trim();
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          triggerHaptic('success');
          const labels = {
            flowAfterCard: 'Monto a ingresar en BPay',
            supportUsdtTrc20: 'Dirección USDT TRC20',
            supportUsdtBep20: 'Dirección USDT BEP20',
            supportSolana: 'Dirección Solana',
            supportBinancePay: 'Binance Pay ID'
          };
          const label = labels[targetId] || 'Valor';
          showToast(`✓ ${label} copiado`);
        })
        .catch(() => {
          showToast('No se pudo copiar', 'err');
        });
    });
  });

  // Support bottom sheet triggers
  if (els.openSupportBtn) {
    els.openSupportBtn.addEventListener('click', showSupport);
  }
  if (els.closeSupportBtn) {
    els.closeSupportBtn.addEventListener('click', dismissSupport);
    if (els.supportPanel) {
      els.supportPanel.addEventListener('click', (e) => {
        if (e.target === els.supportPanel) {
          dismissSupport();
        }
      });
    }
  }

  // QR modal opens like the other sheets (focus restore, scroll lock, single haptic)
  const showQr = () => {
    openManagedModal(els.qrPanel, els.openQrBtn, openQr, els.closeQrBtn);
  };
  const dismissQr = () => closeManagedModal(els.qrPanel, els.openQrBtn, closeQr);
  if (els.openQrBtn) {
    els.openQrBtn.addEventListener('click', showQr);
  }
  if (els.closeQrBtn) {
    els.closeQrBtn.addEventListener('click', dismissQr);
  }
  if (els.qrPanel) {
    els.qrPanel.addEventListener('click', (e) => {
      if (e.target === els.qrPanel) dismissQr();
    });
  }

}

/**
 * Register the Service Worker and wire up the automatic update flow.
 *
 * Flow on a new deployment:
 *  1. Browser finds an updated service-worker.js and installs it.
 *  2. The new SW calls self.skipWaiting() during install, so it activates
 *     without waiting for old tabs to close.
 *  3. We detect the activation via `controllerchange`.
 *  4. We reload the page once (guarded by sessionStorage to prevent loops).
 *  5. A toast informs the user that the app just updated.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Guard: only reload once per session to prevent infinite-reload loops.
  const RELOAD_KEY = 'sw_reloading';

  window.addEventListener('load', async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    } catch {
      return; // SW not supported or blocked (e.g. private browsing on some browsers)
    }

    // ── Helper: signal the waiting SW to skip waiting ──
    function activateWaiting(waitingWorker) {
      if (!waitingWorker) return;
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }

    // ── Handle a worker that is already waiting when the page loads ──
    if (reg.waiting) {
      activateWaiting(reg.waiting);
    }

    // ── Handle a worker that starts installing after this page loads ──
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // When the new worker finishes installing and is now waiting, activate it.
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          activateWaiting(newWorker);
        }
      });
    });

    // ── Reload once when the controller (active SW) changes ──
    // Snapshot whether a controller already existed BEFORE binding this handler.
    // On a first-ever install the SW claims the page with no prior controller —
    // that is NOT an update and does NOT need a reload. Only reload when there
    // was already an active controller (i.e. a genuine app update occurred).
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // First-install claim: skip the reload entirely.
      if (!hadController) return;

      if (sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.removeItem(RELOAD_KEY);
        return; // already reloaded once – do nothing to avoid loops
      }
      sessionStorage.setItem(RELOAD_KEY, '1');
      showToast('Nueva versión instalada. Actualizando…', 'ok', 3000);
      // Small delay lets the toast render before the page reloads
      setTimeout(() => window.location.reload(), 800);
    });

    // ── Periodically check for updates (every 60 s) ──
    setInterval(() => reg.update().catch(() => {}), 60_000);
  });
}

/**
 * Briefly animate the copy button icon to give tactile feedback.
 * Swaps to a checkmark for 1.2s, applies a pop animation, then restores.
 */
function flashCopyBtn(btn) {
  if (!btn) return;
  const iconSpan = btn.querySelector('.material-symbols-rounded');
  if (!iconSpan) return;
  const originalIcon = iconSpan.textContent;
  iconSpan.textContent = 'check';
  btn.classList.add('copy-success');
  setTimeout(() => {
    iconSpan.textContent = originalIcon;
    btn.classList.remove('copy-success');
  }, 1200);
}

/**
 * Mobile keyboard UX:
 *  • Enter/Done key closes the keyboard and recalculates.
 *  • Auto-scroll the amount input into view when focused.
 *  • Tap outside any input to dismiss the keyboard.
 *  • Decimal-only guard for the type="text" USD input.
 *  • No floating Done/Listo UI is shown.
 */
function setupKeyboardUX() {
  const input = els.usdToBuy;
  if (!input) return;

  // Stop pasted or autofilled symbols before they reach the field whenever
  // the browser exposes the inserted text through beforeinput.
  input.addEventListener('beforeinput', (e) => {
    if (e.data && /[^\d.,]/.test(e.data)) e.preventDefault();
  });

  // --- Decimal-only filter for type="text" ---
  // Allow: digits, single dot/comma, backspace/delete, arrows, tab, home/end
  input.addEventListener('keydown', (e) => {
    // Handle Enter / Done key: close keyboard and recalculate
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      input.blur();
      calculate();
      saveState(false);
      return;
    }
    // Allow control keys
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End'];
    if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
    // Allow digits
    if (/^\d$/.test(e.key)) return;
    // Allow a single decimal separator (dot or comma)
    if ((e.key === '.' || e.key === ',') && !/[.,]/.test(input.value)) return;
    // Block everything else
    e.preventDefault();
  });

  // Fallback: blur on Enter via keyup (some Android browsers fire keyup but not keydown for Enter)
  input.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    }
  });

  const normalizeAmount = () => {
    input.value = sanitizeRequestedUsdInput(input.value);
    const validation = validateRequestedUsd(input.value);
    if (validation.value !== null) input.value = String(validation.value);
  };

  // Normalise valid decimal formats and recalculate on change (covers autofill, paste, etc.)
  input.addEventListener('change', () => {
    normalizeAmount();
    calculate();
    saveState(false);
  });

  // Recalculate whenever the field loses focus (covers all dismissal paths)
  input.addEventListener('blur', () => {
    normalizeAmount();
    calculate();
    saveState(false);
  });

  // --- Tap outside any input: dismiss keyboard ---
  document.addEventListener('touchend', (e) => {
    const tag = e.target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        active.blur();
      }
    }
  }, { passive: true });
}

// --- PWA Install Prompt & iOS detection ---
let deferredPrompt = null;
let installPromptFocusOrigin = null;

function revealInstallPrompt(promptEl, focusTarget) {
  installPromptFocusOrigin = document.activeElement;
  promptEl.classList.add('show');
  promptEl.setAttribute('aria-hidden', 'false');
  lockBodyScroll();
  requestAnimationFrame(() => focusTarget?.focus());
}

function shouldShowInstallPrompt() {
  const dismissedTime = localStorage.getItem('installPromptDismissed');
  if (dismissedTime) {
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - parseInt(dismissedTime, 10) < thirtyDaysMs) {
      return false;
    }
  }
  return true;
}

function showAndroidInstallPrompt() {
  const promptEl = document.getElementById('installPrompt');
  if (!promptEl) return;
  document.getElementById('installPromptTitle').textContent = 'Instalar CalcuFlow';
  document.getElementById('installPromptDesc').textContent = 'Agrega CalcuFlow a tu pantalla de inicio para un acceso más rápido.';
  const dismissBtn = document.getElementById('installDismissBtn');
  if (dismissBtn) dismissBtn.textContent = 'Ahora no';
  revealInstallPrompt(promptEl, document.getElementById('installConfirmBtn'));
}

function showIOSInstallPrompt() {
  const promptEl = document.getElementById('installPrompt');
  if (!promptEl) return;
  document.getElementById('installPromptTitle').textContent = 'Instalar en iOS';
  document.getElementById('installPromptDesc').innerHTML = 'Para instalar la app, toca el botón de compartir <span class="ios-share-icon"></span> y selecciona <strong>"Agregar a inicio"</strong>.';
  const dismissBtn = document.getElementById('installDismissBtn');
  if (dismissBtn) dismissBtn.textContent = 'Entendido';
  const confirmBtn = document.getElementById('installConfirmBtn');
  if (confirmBtn) confirmBtn.style.display = 'none';
  revealInstallPrompt(promptEl, dismissBtn);
}

function hideInstallPrompt() {
  const promptEl = document.getElementById('installPrompt');
  if (promptEl && promptEl.classList.contains('show')) {
    promptEl.classList.remove('show');
    promptEl.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
    if (installPromptFocusOrigin && document.contains(installPromptFocusOrigin)) {
      installPromptFocusOrigin.focus();
    }
    installPromptFocusOrigin = null;
  }
}

function initInstallPrompt() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (!isMobile || isStandalone) return;
  
  if (isIOS && isSafari) {
    if (shouldShowInstallPrompt()) {
      showIOSInstallPrompt();
    }
  }
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (shouldShowInstallPrompt()) {
      showAndroidInstallPrompt();
    }
  });
  
  const dismissBtn = document.getElementById('installDismissBtn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      hideInstallPrompt();
      localStorage.setItem('installPromptDismissed', Date.now().toString());
    });
  }
  
  const confirmBtn = document.getElementById('installConfirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      hideInstallPrompt();
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome !== 'accepted') {
        localStorage.setItem('installPromptDismissed', Date.now().toString());
      }
      deferredPrompt = null;
    });
  }
}



const storedAppState = loadState();
initBankProfiles(storedAppState);
initChangelog({
  lockScroll: lockBodyScroll,
  unlockScroll: unlockBodyScroll
});
initTheme();
initShare();
bindEvents();
calculate();
setupKeyboardUX();
initInstallPrompt();
updateRelativeTime();
setInterval(updateRelativeTime, 1000);
registerServiceWorker();

window.addEventListener('load', () => {
  if (els.autoRates.checked) loadRates(false).catch(() => {});
});

// ─── Theme Management ────────────────────────────────────────────────────────
function initTheme() {
  const currentTheme = localStorage.getItem('theme') || 'system';
  applyTheme(currentTheme);
  updateThemeUI(currentTheme);

  // Bind segmented buttons click
  const container = document.getElementById('themeSelector');
  if (container) {
    container.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.themeVal;
        applyTheme(val);
        updateThemeUI(val);
        localStorage.setItem('theme', val);
      });
    });
  }

  // Listen for system changes when theme is system
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem("theme") || "system") === "system") {
      applyTheme("system");
    }
  });
}

function applyTheme(theme) {
  const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (theme === "system") {
    document.documentElement.dataset.theme = systemIsDark ? "dark" : "light";
  } else if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  }
  updateStatusBarColor();
}

function updateThemeUI(theme) {
  const container = document.getElementById('themeSelector');
  if (!container) return;
  container.querySelectorAll('.segment-btn').forEach(btn => {
    const isActive = btn.dataset.themeVal === theme;
    btn.setAttribute('aria-pressed', String(isActive));
    if (isActive) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updateStatusBarColor() {
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) return;
  const isLight = document.documentElement.dataset.theme === 'light';
  metaThemeColor.setAttribute('content', isLight ? '#F5F7FA' : '#0F1115');
}
