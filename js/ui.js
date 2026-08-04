import { $, money, n, triggerHaptic } from './utils.js';

export const els = {
  usdToBuy: $('usdToBuy'), bankMargin: $('bankMargin'), bcvRate: $('bcvRate'), p2pRate: $('p2pRate'),
  cardFee: $('cardFee'), bpayFee: $('bpayFee'), autoRates: $('autoRates'), bcvView: $('bcvView'), bankView: $('bankView'), p2pView: $('p2pView'),
  lastUpdate: $('lastUpdate'), statusBox: $('statusBox'), opStatus: $('opStatus'), vesNeeded: $('vesNeeded'), vesSub: $('vesSub'),
  profitCard: $('profitCard'), profitUsdtBig: $('profitUsdtBig'), profitVes: $('profitVes'), roiMeta: $('roiMeta'), bpayRecommended: $('bpayRecommended'), usdtFinal: $('usdtFinal'), feesSub: $('feesSub'),
  flowUsd: $('flowUsd'), flowVes: $('flowVes'), flowCard: $('flowCard'), flowBpay: $('flowBpay'),
  flowReturn: $('flowReturn'), flowAfterCard: $('flowAfterCard'), flowBankDeduction: $('flowBankDeduction'), flowNetToBinance: $('flowNetToBinance'), flowUsdtToSell: $('flowUsdtToSell'), flowUsdtFinal: $('flowUsdtFinal'), flowProfit: $('flowProfit'), flowProfitSub: $('flowProfitSub'), formulaText: $('formulaText'), loadRatesBtn: $('loadRatesBtn'), shareBtn: $('shareBtn'), openSettingsBtn: $('openSettingsBtn'),
  settingsPanel: $('settingsPanel'), closeSettingsBtn: $('closeSettingsBtn'), clearBtn: $('clearBtn'), clearBtnTop: $('clearBtnTop'),
  resetDefaultsBtn: $('resetDefaultsBtn'), copyBtnSettings: $('copyBtnSettings'), clearBtnMobile: $('clearBtnMobile'), shareBtnMobile: $('shareBtnMobile'), loadRatesBtnMobile: $('loadRatesBtnMobile'), loadRatesBtnSettings: $('loadRatesBtnSettings'),
  // New elements
  breakdownAmount: $('breakdownAmount'),
  statusPill: $('statusPill'),
  statusPillText: $('statusPillText'),
  bottomTimestamp: $('bottomTimestamp'),
  openBreakdownBtn: $('openBreakdownBtn'),
  closeBreakdownBtn: $('closeBreakdownBtn'),
  breakdownPanel: $('breakdownPanel'),
  supportPanel: $('supportPanel'),
  openSupportBtn: $('openSupportBtn'),
  closeSupportBtn: $('closeSupportBtn'),
  toggleQrBtn: $('toggleQrBtn'),
  supportQrBox: $('supportQrBox'),
  brechaView: $('brechaView'),
  bcvEffectiveDate: $('bcvEffectiveDate'),
  usdAmountError: $('usdAmountError')
};

export function updateUsdToBuyDisplay(value) {
  // Highlight active chips
  document.querySelectorAll('[data-quick]').forEach(btn => {
    const isActive = btn.dataset.quick === value;
    btn.setAttribute('aria-pressed', String(isActive));
    if (isActive) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

export function setStatus(text, type = 'ok') {
  els.statusBox.textContent = text;
  els.statusBox.className = 'status show ' + type;
  els.statusBox.dataset.source = 'general';
  els.statusBox.setAttribute('role', type === 'err' ? 'alert' : 'status');
}

export function clearStatus() {
  els.statusBox.className = 'status';
  els.statusBox.textContent = '';
  delete els.statusBox.dataset.source;
  els.statusBox.removeAttribute('role');
}

export function showRateError(onRetry) {
  const message = document.createElement('span');
  message.textContent = 'No se pudieron actualizar las tasas. Conservando valores guardados.';

  const retryButton = document.createElement('button');
  retryButton.id = 'retryRatesBtn';
  retryButton.className = 'status-action';
  retryButton.type = 'button';
  retryButton.textContent = 'Reintentar';
  retryButton.addEventListener('click', onRetry);

  els.statusBox.replaceChildren(message, retryButton);
  els.statusBox.className = 'status show err rate-error';
  els.statusBox.dataset.source = 'rates';
  els.statusBox.setAttribute('role', 'alert');
}

export function clearRateError() {
  if (els.statusBox.dataset.source === 'rates') {
    clearStatus();
  }
}

export function renderUsdAmountValidation(error = '') {
  const hasError = Boolean(error);
  els.usdToBuy.setAttribute('aria-invalid', String(hasError));
  els.usdToBuy.closest('.calculator-display-wrap')?.classList.toggle('is-invalid', hasError);
  if (!els.usdAmountError) return;
  els.usdAmountError.textContent = error;
  els.usdAmountError.hidden = !hasError;
}

export function setLoadingRates(isLoading) {
  els.loadRatesBtn.disabled = isLoading;
  els.loadRatesBtn.setAttribute('aria-busy', String(isLoading));
  // Toggle .loading class to drive the CSS spin animation; preserve icon markup
  els.loadRatesBtn.classList.toggle('loading', isLoading);
  if (els.loadRatesBtnMobile) {
    els.loadRatesBtnMobile.disabled = isLoading;
    els.loadRatesBtnMobile.classList.toggle('loading', isLoading);
  }
  if (els.loadRatesBtnSettings) {
    els.loadRatesBtnSettings.disabled = isLoading;
    els.loadRatesBtnSettings.classList.toggle('loading', isLoading);
  }
  const retryButton = document.getElementById('retryRatesBtn');
  if (retryButton) {
    retryButton.disabled = isLoading;
    retryButton.setAttribute('aria-busy', String(isLoading));
    retryButton.textContent = isLoading ? 'Reintentando…' : 'Reintentar';
  }

  if (isLoading) {
    const skeletonHTML = '<span class="skeleton-shimmer"></span>';
    if (els.bcvView) els.bcvView.innerHTML = skeletonHTML;
    if (els.bankView) els.bankView.innerHTML = skeletonHTML;
    if (els.p2pView) els.p2pView.innerHTML = skeletonHTML;
    if (els.lastUpdate) els.lastUpdate.innerHTML = skeletonHTML;
    if (els.brechaView) els.brechaView.innerHTML = skeletonHTML;
    // Clear the BCV date while loading so no stale date shows during refresh
    if (els.bcvEffectiveDate) els.bcvEffectiveDate.textContent = '';
  }
}

export function renderEmpty() {
  els.opStatus.textContent = 'Esperando datos';
  ['vesNeeded','bpayRecommended','profitUsdtBig','profitVes','usdtFinal','flowUsd','flowVes','flowCard','flowAfterCard','flowBpay','flowReturn','flowUsdtToSell','flowUsdtFinal','flowProfit'].forEach(id => els[id] && (els[id].textContent = '--'));
  if (els.flowProfitSub) els.flowProfitSub.textContent = 'Resultado neto estimado.';
  if (els.flowProfitSub) els.flowProfitSub.className = '';
  els.feesSub.textContent = 'Tarjeta + BPay';
  els.roiMeta.textContent = 'Retorno --';
  els.vesSub.innerHTML = 'Vender ≈-- USDT';
  els.formulaText.textContent = 'Completa USD, BCV y P2P para ver fórmula.';
  if (els.breakdownAmount) els.breakdownAmount.textContent = '-- USD';
  
  updateUsdToBuyDisplay(els.usdToBuy.value);
  
  if (els.brechaView) {
    els.brechaView.textContent = '--';
    els.brechaView.className = 'brecha-val';
  }

  // Clear BCV effective date — no valid date available yet
  if (els.bcvEffectiveDate) els.bcvEffectiveDate.textContent = '';
  
  // Reset bottom status bar
  if (els.statusPill && els.statusPillText) {
    els.statusPillText.textContent = '--';
    els.statusPill.className = 'status-pill';
  }
  if (els.bottomTimestamp) {
    els.bottomTimestamp.textContent = '--';
  }
}

/**
 * Format a BCV effective date ISO 8601 string into the compact Spanish label.
 *
 * @param {string|null} isoStr  e.g. "2026-07-11T00:00:00-04:00"
 * @returns {string}  e.g. "Vigente 11 jul", or '' if input is absent/invalid.
 *
 * Implementation note: The date portion of the ISO string already encodes the
 * Venezuela date (-04:00 offset baked in).  We parse directly from the string
 * rather than relying on the device clock, so no timezone conversion is needed.
 */
function formatBcvDate(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return '';
  // Extract the YYYY-MM-DD portion directly — the offset is already -04:00 (VE time)
  const datePart = isoStr.substring(0, 10); // e.g. "2026-07-11"
  const segments = datePart.split('-');
  if (segments.length !== 3) return '';
  const month = parseInt(segments[1], 10);
  const day   = parseInt(segments[2], 10);
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `Vigente ${day} ${monthNames[month - 1]}`;
}

/**
 * Render (or clear) the BCV effective date inside the BCV rate card.
 *
 * @param {string|null} isoStr  Provider effective-date string, or null.
 */
export function renderBcvDate(isoStr) {
  if (!els.bcvEffectiveDate) return;
  els.bcvEffectiveDate.textContent = formatBcvDate(isoStr);
}

export function renderRates({ bcv, bank, p2p }) {
  const uBsUsd  = '<span class="rate-unit">Bs/USD</span>';
  const uBsUsdt = '<span class="rate-unit">Bs/USDT</span>';
  els.bcvView.innerHTML  = bcv  ? money(bcv, 2)  + uBsUsd  : '--';
  els.bankView.innerHTML = bank ? money(bank, 2) + uBsUsd  : '--';
  els.p2pView.innerHTML  = p2p  ? money(p2p, 2)  + uBsUsdt : '--';
  
  if (els.brechaView) {
    if (bcv && p2p) {
      const brecha = ((p2p - bcv) / bcv) * 100;
      els.brechaView.textContent = (brecha >= 0 ? '+' : '') + money(brecha, 2) + '%';
      els.brechaView.className = 'brecha-val ' + (brecha >= 12 ? 'brecha-green' : (brecha >= 5 ? 'brecha-yellow' : 'brecha-red'));
    } else {
      els.brechaView.textContent = '--';
      els.brechaView.className = 'brecha-val';
    }
  }
}

let activeModalsCount = 0;
let savedScrollY = 0;

export function lockBodyScroll() {
  if (activeModalsCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.top = `-${savedScrollY}px`;
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  }
  activeModalsCount++;
}

export function unlockBodyScroll() {
  activeModalsCount = Math.max(0, activeModalsCount - 1);
  if (activeModalsCount === 0) {
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
  }
}

function animateNumber(el, targetVal, formatFn, unitHtml = '') {
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const oldVal = el._prevVal !== undefined ? el._prevVal : 0;
  el._prevVal = targetVal;
  
  if (el._animFrameId) {
    cancelAnimationFrame(el._animFrameId);
    el._animFrameId = null;
  }
  
  if (isReduced || Math.abs(targetVal - oldVal) < 0.05) {
    el.innerHTML = formatFn(targetVal) + unitHtml;
    return;
  }
  
  const startTime = performance.now();
  const duration = 200; // 200ms
  
  function update(now) {
    const elapsed = now - startTime;
    if (elapsed >= duration) {
      el.innerHTML = formatFn(targetVal) + unitHtml;
      el._animFrameId = null;
      return;
    }
    
    const progress = elapsed / duration;
    const easeProgress = progress * (2 - progress); // ease-out quad
    const currentVal = oldVal + (targetVal - oldVal) * easeProgress;
    
    el.innerHTML = formatFn(currentVal) + unitHtml;
    el._animFrameId = requestAnimationFrame(update);
  }
  
  el._animFrameId = requestAnimationFrame(update);
}
export function renderResult(r) {
  els.opStatus.textContent = r.profitVes >= 0 ? 'Operación rentable' : 'Pérdida estimada';
  animateNumber(els.vesNeeded,    r.vesNeeded,  (v) => money(v, 2),                              '<span class="value-unit">Bs</span>');
  const usdtToSell = r.vesNeeded / r.p2p;
  els.vesSub.innerHTML = `Vender ≈${money(usdtToSell, 2)} USDT`;
  animateNumber(els.bpayRecommended, r.safeGateway.bpayInputAmount, (v) => money(v, 2), '<span class="value-unit">USD</span>');
  animateNumber(els.usdtFinal,    r.usdtFinal,  (v) => money(v, 2),                              '<span class="value-unit">USDT</span>');
  animateNumber(els.profitUsdtBig, r.profitUsdt, (v) => (v >= 0 ? '+' : '') + money(v, 2),      '<span class="value-unit">USD</span>');
  animateNumber(els.profitVes,    r.profitVes,  (v) => (v >= 0 ? '+' : '') + money(v, 2) + ' Bs');
  els.roiMeta.textContent = `Retorno ${r.roi >= 0 ? '+' : ''}${money(r.roi, 2)}%`;
  els.feesSub.textContent = `−${money(r.totalFeesUsd, 2)} USD en comisiones`;
  els.flowUsd.innerHTML     = money(r.usdUsed, 2)   + ' <span class="value-unit">USD</span>';
  els.flowVes.innerHTML     = money(r.vesNeeded, 2)  + ' <span class="value-unit">Bs</span>';
  els.flowCard.innerHTML    = '-' + money(r.cardFeeUsd, 2) + ' <span class="value-unit">USD</span> (' + money(r.cardPct, 1) + '%)';
  if (els.flowAfterCard) els.flowAfterCard.innerHTML = money(r.afterCard, 2) + ' <span class="value-unit">USD</span>';
  if (els.flowBankDeduction) els.flowBankDeduction.innerHTML = money(r.safeGateway.expectedBankDeduction, 2) + ' <span class="value-unit">USD</span>';
  if (els.flowNetToBinance) els.flowNetToBinance.innerHTML = money(r.safeGateway.netToBinance, 2) + ' <span class="value-unit">USDT</span>';
  els.flowBpay.innerHTML    = '-' + money(r.bpayFeeUsd, 2) + ' <span class="value-unit">USD</span> (' + money(r.bpayPct, 1) + '%)';
  els.flowReturn.innerHTML  = money(r.vesReturn, 2)  + ' <span class="value-unit">Bs</span>';
  
  if (els.flowUsdtToSell) {
    const usdtToSell = r.vesNeeded / r.p2p;
    els.flowUsdtToSell.innerHTML = money(usdtToSell, 2) + ' <span class="value-unit">USDT</span>';
  }
  if (els.flowUsdtFinal) {
    els.flowUsdtFinal.innerHTML = money(r.usdtFinal, 2) + ' <span class="value-unit">USDT</span>';
  }
  if (els.flowProfit) {
    els.flowProfit.innerHTML = (r.profitUsdt >= 0 ? '+' : '') + money(r.profitUsdt, 2) + ' <span class="value-unit">USD</span>';
    els.flowProfit.className = 'amount ' + (r.profitUsdt >= 0 ? 'positive' : 'negative');
  }
  if (els.flowProfitSub) {
    els.flowProfitSub.innerHTML = (r.profitVes >= 0 ? '+' : '') + money(r.profitVes, 2) + ' Bs';
    els.flowProfitSub.className = r.profitVes >= 0 ? 'step-desc-pos' : 'step-desc-neg';
  }

  els.profitCard.className = r.profitVes >= 0 ? 'kpi-card kpi-highlight' : 'kpi-card kpi-highlight kpi-loss';
  els.formulaText.innerHTML = `
    <strong>USDT a vender:</strong> ${money(r.vesNeeded, 2)} ÷ ${money(r.p2p, 4)} = ${money(r.vesNeeded / r.p2p, 2)} USDT.<br>
    <strong>Tasa banco:</strong> ${money(r.bcv, 4)} × ${(1 + n(els.bankMargin.value) / 100).toFixed(4)} = ${money(r.bank, 4)} Bs/USD.<br>
    <strong>Bs necesarios:</strong> ${money(r.usdUsed, 2)} × ${money(r.bank, 4)} = ${money(r.vesNeeded, 2)} Bs.<br>
    <strong>Monto máximo BPay:</strong> ${money(r.safeGateway.allowedBankSpend, 2)} ÷ ${(1 + r.cardPct / 100).toFixed(4)}, truncado a centavos = ${money(r.afterCard, 2)} USD.<br>
    <strong>USDT final:</strong> ${money(r.afterCard, 2)} - ${money(r.bpayFeeUsd, 2)} BPay = ${money(r.usdtFinal, 2)} USDT.<br>
    <strong>Retorno P2P:</strong> ${money(r.usdtFinal, 2)} × ${money(r.p2p, 4)} = ${money(r.vesReturn, 2)} Bs.<br>
    <strong>Ganancia:</strong> ${money(r.vesReturn, 2)} - ${money(r.vesNeeded, 2)} = ${(r.profitVes >= 0 ? '+' : '') + money(r.profitVes, 2)} Bs (${(r.profitUsdt >= 0 ? '+' : '') + money(r.profitUsdt, 2)} USD).
  `;
  
  if (els.breakdownAmount) {
    els.breakdownAmount.innerHTML = money(r.usdUsed, 2) + ' <span class="value-unit">USD</span>';
  }
  
  updateUsdToBuyDisplay(els.usdToBuy.value);
  
  // Update bottom status pill
  const isProfitable = r.profitVes >= 0;
  if (els.statusPill && els.statusPillText) {
    els.statusPillText.textContent = isProfitable ? 'Operación rentable' : 'Pérdida estimada';
    els.statusPill.className = 'status-pill ' + (isProfitable ? 'profitable' : 'loss');
  }
  if (els.bottomTimestamp) {
    els.bottomTimestamp.textContent = els.lastUpdate.textContent;
  }
}

export function openSettings() {
  els.settingsPanel.classList.remove('closing');
  els.settingsPanel.classList.add('open');
  els.settingsPanel.setAttribute('aria-hidden', 'false');
  triggerHaptic('light');
  lockBodyScroll();
}

export function closeSettings() {
  const panel = els.settingsPanel;
  if (!panel.classList.contains('open')) return;
  panel.classList.add('closing');
  triggerHaptic('light');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
  setTimeout(() => {
    panel.classList.remove('open', 'closing');
    panel.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
  }, duration);
}

export function openSupport() {
  els.supportPanel.classList.remove('closing');
  els.supportPanel.classList.add('open');
  els.supportPanel.setAttribute('aria-hidden', 'false');
  triggerHaptic('light');
  lockBodyScroll();
}

export function closeSupport() {
  const panel = els.supportPanel;
  if (!panel.classList.contains('open')) return;
  panel.classList.add('closing');
  triggerHaptic('light');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
  setTimeout(() => {
    panel.classList.remove('open', 'closing');
    panel.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
  }, duration);
}

export function openBreakdown() {
  els.breakdownPanel.classList.remove('closing');
  els.breakdownPanel.classList.add('open');
  els.breakdownPanel.setAttribute('aria-hidden', 'false');
  if (els.openBreakdownBtn) {
    els.openBreakdownBtn.setAttribute('aria-expanded', 'true');
  }
  triggerHaptic('light');
  lockBodyScroll();
}

export function closeBreakdown() {
  const panel = els.breakdownPanel;
  if (!panel.classList.contains('open')) return;
  panel.classList.add('closing');
  triggerHaptic('light');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
  setTimeout(() => {
    panel.classList.remove('open', 'closing');
    panel.setAttribute('aria-hidden', 'true');
    if (els.openBreakdownBtn) {
      els.openBreakdownBtn.setAttribute('aria-expanded', 'false');
    }
    unlockBodyScroll();
  }, duration);
}

// ── Toast / Snackbar ──────────────────────────────────────────────────────
let _toastEl = null;
let _toastTimer = null;

/**
 * Show a Material Design 3 snackbar toast.
 * @param {string} message  Text to display.
 * @param {'ok'|'err'|'warn'} type  Visual variant.
 * @param {number} duration  Auto-dismiss delay in ms (default 2500).
 */
export function showToast(message, type = 'ok', duration = 2500) {
  // Lazily create the toast element once
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.className = 'toast';
    document.body.appendChild(_toastEl);
  }

  // Cancel any in-flight dismiss timer
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

  // Reset state before updating to force re-animation even if already showing
  _toastEl.classList.remove('toast-show', 'toast-err', 'toast-warn');
  // Force reflow so removing + re-adding the class triggers the transition
  void _toastEl.offsetWidth;

  _toastEl.textContent = message;
  if (type === 'err')  _toastEl.classList.add('toast-err');
  if (type === 'warn') _toastEl.classList.add('toast-warn');
  _toastEl.classList.add('toast-show');

  _toastTimer = setTimeout(() => {
    _toastEl.classList.remove('toast-show');
    _toastTimer = null;
  }, duration);
}
