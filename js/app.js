import { fetchRates } from './api.js';
import { calculateValues, currentBankRate } from './calculator.js';
import { loadState as readState, saveState as writeState } from './storage.js';
import { money, n } from './utils.js';
import { els, setStatus, clearStatus, setLoadingRates, showToast, renderEmpty, renderRates, renderResult, openSettings, closeSettings, collapseDetailsOnMobileLoad } from './ui.js';

function getState() {
  return {
    usdToBuy: els.usdToBuy.value,
    bankLimit: els.bankLimit.value,
    bankMargin: els.bankMargin.value,
    bcvRate: els.bcvRate.value,
    p2pRate: els.p2pRate.value,
    cardFee: els.cardFee.value,
    bpayFee: els.bpayFee.value,
    autoRates: els.autoRates.checked,
    lastUpdate: els.lastUpdate.textContent
  };
}

function saveState(show = true) {
  writeState(getState());
  if (show) setStatus('Configuración guardada.', 'ok');
}

function loadState() {
  const data = readState();
  if (data.usdToBuy) els.usdToBuy.value = data.usdToBuy;
  if (data.bankLimit) els.bankLimit.value = data.bankLimit;
  if (data.bankMargin) els.bankMargin.value = data.bankMargin;
  if (data.bcvRate) els.bcvRate.value = data.bcvRate;
  if (data.p2pRate) els.p2pRate.value = data.p2pRate;
  if (data.cardFee) els.cardFee.value = data.cardFee;
  if (data.bpayFee) els.bpayFee.value = data.bpayFee;
  if (typeof data.autoRates === 'boolean') els.autoRates.checked = data.autoRates;
  if (data.lastUpdate) els.lastUpdate.textContent = data.lastUpdate;
}

function resetDefaults() {
  els.usdToBuy.value = '500';
  els.bankLimit.value = '1000';  // Default limit updated to 1000 USD
  els.bankMargin.value = '0.5';
  els.cardFee.value = '1.5';
  els.bpayFee.value = '4.1';
  els.autoRates.checked = true;
  calculate();
  saveState(false);
  setStatus('Valores base restaurados.', 'ok');
}

async function loadRates() {
  setLoadingRates(true);
  try {
    const { bcv, p2p } = await fetchRates();
    els.bcvRate.value = bcv.toFixed(4);
    els.p2pRate.value = p2p.toFixed(4);
    const timeStr = new Date().toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
    els.lastUpdate.textContent = `${timeStr} · TasaVE`;
    showToast('Tasas actualizadas desde TasaVE.');
    calculate();
    saveState(false);
  } catch (err) {
    showToast('No se pudo cargar TasaVE. Conservando tasas manuales.', 'err');
  } finally {
    setLoadingRates(false);
    calculate();
  }
}

function calculate() {
  const requestedUsd = n(els.usdToBuy.value);
  const limitUsd = n(els.bankLimit.value) || 1000;  // Default limit is 1000 USD
  const bcv = n(els.bcvRate.value);
  const bank = currentBankRate(bcv, els.bankMargin.value);
  const p2p = n(els.p2pRate.value);

  renderRates({ bcv, bank, p2p, limitUsd });

  const result = calculateValues({
    requestedUsd, limitUsd, bcvRate: bcv, bankMargin: els.bankMargin.value,
    p2pRate: p2p, cardFee: els.cardFee.value, bpayFee: els.bpayFee.value
  });

  if (!result) {
    renderEmpty();
    return null;
  }

  renderResult(result);

  if (result.usdBlocked > 0) {
    setStatus(`Límite aplicado: se usan ${money(limitUsd, 2)} USD y se ignoran ${money(result.usdBlocked, 2)} USD.`, 'warn');
  } else if (els.statusBox.classList.contains('warn')) {
    clearStatus();
  }

  return result;
}

function copySummary() {
  const r = calculate();
  if (!r) { showToast('Completa los datos antes de copiar.', 'warn'); return; }
  const text = `Compra banco: ${money(r.usdUsed, 2)} USD
Tasa BCV: ${money(r.bcv, 4)} Bs
Tasa banco: ${money(r.bank, 4)} Bs
Bs necesarios: ${money(r.vesNeeded, 2)} Bs
USDT final: ${money(r.usdtFinal, 2)} USDT
P2P/paralelo: ${money(r.p2p, 4)} Bs
Retorno: ${money(r.vesReturn, 2)} Bs
Ganancia: ${(r.profitVes >= 0 ? '+' : '') + money(r.profitVes, 2)} Bs (${(r.profitUsdt >= 0 ? '+' : '') + money(r.profitUsdt, 2)} USDT)
ROI: ${(r.roi >= 0 ? '+' : '') + money(r.roi, 2)}%`;
  navigator.clipboard.writeText(text)
    .then(() => {
      showToast('Resumen copiado.');
      flashCopyBtn(els.copyBtn);
      flashCopyBtn(els.copyBtnSettings);
    })
    .catch(() => showToast('No se pudo copiar.', 'err'));
}

function clearOperation() {
  els.usdToBuy.value = '';
  clearStatus();
  calculate();
  saveState(false);
}

function bindEvents() {
  ['usdToBuy','bankLimit','bankMargin','bcvRate','p2pRate','cardFee','bpayFee','autoRates'].forEach(key => {
    els[key].addEventListener('input', () => { calculate(); saveState(false); });
    els[key].addEventListener('change', () => { calculate(); saveState(false); });
  });

  document.querySelectorAll('[data-quick]').forEach(btn => btn.addEventListener('click', () => {
    els.usdToBuy.value = btn.dataset.quick;
    calculate();
    saveState(false);
  }));

  document.querySelectorAll('[data-limit]').forEach(btn => btn.addEventListener('click', () => {
    els.bankLimit.value = btn.dataset.limit;
    calculate();
    saveState(false);
    setStatus('Límite actualizado a ' + btn.dataset.limit + ' USD.', 'ok');
  }));

  // maxBtn was removed from the UI; its hidden compat element is also gone
  els.loadRatesBtn.addEventListener('click', loadRates);
  els.loadRatesBtnMobile.addEventListener('click', loadRates);
  els.loadRatesBtnSettings.addEventListener('click', loadRates);
  els.copyBtn.addEventListener('click', copySummary);
  els.copyBtnMobile.addEventListener('click', copySummary);
  els.copyBtnSettings.addEventListener('click', copySummary);
  els.clearBtn.addEventListener('click', clearOperation);
  els.clearBtnTop.addEventListener('click', clearOperation);
  els.clearBtnMobile.addEventListener('click', clearOperation);
  els.resetDefaultsBtn.addEventListener('click', resetDefaults);
  els.openSettingsBtn.addEventListener('click', openSettings);
  els.closeSettingsBtn.addEventListener('click', closeSettings);
  els.settingsPanel.addEventListener('click', e => { if (e.target === els.settingsPanel) closeSettings(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {}));
  }
}

/**
 * Briefly animate the copy button icon to give tactile feedback.
 * Swaps to a checkmark for 1.2s, applies a pop animation, then restores.
 */
function flashCopyBtn(btn) {
  if (!btn) return;
  btn.innerHTML = '<span class="material-symbols-rounded">check</span>';
  btn.classList.add('copy-success');
  setTimeout(() => {
    btn.innerHTML = '<span class="material-symbols-rounded">content_copy</span>';
    btn.classList.remove('copy-success');
  }, 1200);
}

/**
 * Mobile keyboard UX improvements:
 *  • Auto-scroll the amount input into view when focused.
 *  • Show a floating “Listo” button above the virtual keyboard.
 *  • Tap outside any input to dismiss the keyboard.
 *  • Uses visualViewport API (where available) to position the button
 *    correctly above the keyboard even when the viewport shifts.
 */
function setupKeyboardUX() {
  const input   = els.usdToBuy;
  const doneBtn = document.getElementById('keyboardDoneBtn');
  if (!doneBtn || !input) return;

  let hasTouched = false;
  window.addEventListener('touchstart', () => { hasTouched = true; }, { once: true, passive: true });

  // --- position helper ---
  function positionDoneBtn() {
    if (!window.visualViewport) return;
    // keyboard top = window.innerHeight - visualViewport.height (approx)
    const kbHeight = window.innerHeight - window.visualViewport.offsetTop - window.visualViewport.height;
    doneBtn.style.bottom = Math.max(0, kbHeight) + 'px';
  }

  // --- show / hide ---
  function showDoneBtn() {
    doneBtn.classList.add('kbd-visible');
    positionDoneBtn();
  }
  function hideDoneBtn() {
    doneBtn.classList.remove('kbd-visible');
    doneBtn.style.bottom = '';
  }

  // --- focus: scroll into view + show Done button on mobile ---
  input.addEventListener('focus', () => {
    setTimeout(() => {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);   // wait for keyboard animation to start
    if (hasTouched) showDoneBtn();
  });

  input.addEventListener('blur', hideDoneBtn);

  // --- Done button tapped ---
  doneBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();        // prevent focus loss triggering hide before click
    input.blur();
    hideDoneBtn();
  });

  // --- visualViewport resize: reposition Done button as keyboard animates ---
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize',  positionDoneBtn, { passive: true });
    window.visualViewport.addEventListener('scroll',  positionDoneBtn, { passive: true });
  }

  // --- Tap outside any input: dismiss keyboard ---
  document.addEventListener('touchend', (e) => {
    const tag = e.target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && e.target.id !== 'keyboardDoneBtn') {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        active.blur();
      }
    }
  }, { passive: true });
}

loadState();
bindEvents();
calculate();
collapseDetailsOnMobileLoad();
setupKeyboardUX();
registerServiceWorker();

window.addEventListener('load', () => {
  collapseDetailsOnMobileLoad();
  if (els.autoRates.checked) loadRates().catch(() => {});
});
