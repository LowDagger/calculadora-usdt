import { fetchRates, markP2pRecordCached } from './api.js';
import { markBcvRecordCached } from './bcv-rates.js';
import { triggerHaptic } from './utils.js';
import {
  clearRateError,
  els,
  renderBcvDate,
  setLoadingRates,
  showRateError,
  showToast
} from './ui.js';

export function parseLastUpdate(str) {
  if (!str) return null;
  const parts = str.split(' · ');
  if (!parts[0]) return null;
  let cleaned = parts[0].replace(/\s+/g, ' ').trim();
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
  const day = parseInt(dateSplit[0], 10);
  const month = parseInt(dateSplit[1], 10) - 1;
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
  const minute = parseInt(timeSplit[1], 10);
  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;

  const parsedDate = new Date(year, month, day, hour, minute, 0);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function formatRelativeTime(date) {
  if (!date) return 'Sin actualizar';
  const diffSec = Math.max(0, Math.floor((new Date() - date) / 1000));
  if (diffSec < 60) return `Actualizado hace ${diffSec} s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Actualizado hace ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Actualizado hace ${diffHour} h`;
  return `Actualizado hace ${Math.floor(diffHour / 24)} d`;
}

export function createRatesController({ calculate, saveState }) {
  let ratesLastUpdated = null;
  let requestInFlight = false;
  let activeBcvRecord = null;
  let activeP2pRecord = null;
  let lastAutomaticBcvRecord = null;
  let lastAutomaticP2pRecord = null;

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

  function hydrate(data) {
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
  }

  function getStoredState() {
    return {
      bcvRecord: activeBcvRecord,
      p2pRecord: activeP2pRecord,
      lastUpdate: els.lastUpdate.dataset.absolute || els.lastUpdate.textContent
    };
  }

  function useManualBcv() {
    if (activeBcvRecord) lastAutomaticBcvRecord = activeBcvRecord;
    activeBcvRecord = null;
    renderBcvDate(null);
  }

  function useManualP2p() {
    if (activeP2pRecord) lastAutomaticP2pRecord = activeP2pRecord;
    activeP2pRecord = null;
  }

  async function loadRates(showSuccessToast = false) {
    if (requestInFlight) return;
    requestInFlight = true;
    triggerHaptic();
    setLoadingRates(true);
    try {
      const result = await fetchRates({ cachedBcv: activeBcvRecord, cachedP2p: activeP2pRecord });
      const bcvUpdated = result.bcv.ok && result.bcv.updated;
      const p2pUpdated = result.p2p.ok && result.p2p.updated;

      if (result.bcv.ok) {
        activeBcvRecord = result.bcv.record;
        lastAutomaticBcvRecord = result.bcv.record;
      } else activeBcvRecord = markBcvRecordCached(activeBcvRecord);
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
      requestInFlight = false;
      setLoadingRates(false);
      updateRelativeTime();
      calculate();
    }
  }

  function restoreAutomaticBcv() {
    if (!lastAutomaticBcvRecord) return null;
    activeBcvRecord = lastAutomaticBcvRecord;
    return activeBcvRecord;
  }

  function restoreAutomaticP2p() {
    if (!lastAutomaticP2pRecord) return null;
    activeP2pRecord = lastAutomaticP2pRecord;
    return activeP2pRecord;
  }

  return {
    getActiveBcvRecord: () => activeBcvRecord,
    getActiveP2pRecord: () => activeP2pRecord,
    getLastAutomaticBcvRecord: () => lastAutomaticBcvRecord,
    getLastAutomaticP2pRecord: () => lastAutomaticP2pRecord,
    getStoredState,
    hydrate,
    loadRates,
    restoreAutomaticBcv,
    restoreAutomaticP2p,
    updateRelativeTime,
    useManualBcv,
    useManualP2p
  };
}
