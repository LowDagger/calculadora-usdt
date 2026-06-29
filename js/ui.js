import { $, money, n } from './utils.js';

export const els = {
  usdToBuy: $('usdToBuy'), bankLimit: $('bankLimit'), bankMargin: $('bankMargin'), bcvRate: $('bcvRate'), p2pRate: $('p2pRate'),
  cardFee: $('cardFee'), bpayFee: $('bpayFee'), autoRates: $('autoRates'), bcvView: $('bcvView'), bankView: $('bankView'), p2pView: $('p2pView'),
  lastUpdate: $('lastUpdate'), limitHint: $('limitHint'), statusBox: $('statusBox'), opStatus: $('opStatus'), vesNeeded: $('vesNeeded'), vesSub: $('vesSub'),
  profitCard: $('profitCard'), profitUsdtBig: $('profitUsdtBig'), profitVes: $('profitVes'), usdtFinal: $('usdtFinal'), feesSub: $('feesSub'),
  roiView: $('roiView'), returnSub: $('returnSub'), flowUsd: $('flowUsd'), flowVes: $('flowVes'), flowCard: $('flowCard'), flowBpay: $('flowBpay'),
  flowReturn: $('flowReturn'), formulaText: $('formulaText'), loadRatesBtn: $('loadRatesBtn'), copyBtn: $('copyBtn'), openSettingsBtn: $('openSettingsBtn'),
  settingsPanel: $('settingsPanel'), closeSettingsBtn: $('closeSettingsBtn'), clearBtn: $('clearBtn'), clearBtnTop: $('clearBtnTop'),
  resetDefaultsBtn: $('resetDefaultsBtn'), copyBtnSettings: $('copyBtnSettings'), clearBtnMobile: $('clearBtnMobile'), copyBtnMobile: $('copyBtnMobile'), maxBtn: $('maxBtn'), loadRatesBtnMobile: $('loadRatesBtnMobile'), loadRatesBtnSettings: $('loadRatesBtnSettings'),
  // New elements
  breakdownAmount: $('breakdownAmount'),
  statusPill: $('statusPill'),
  statusPillText: $('statusPillText'),
  bottomTimestamp: $('bottomTimestamp')
};

export function updateUsdToBuyDisplay(value) {
  const displayEl = document.getElementById('usdToBuyDisplay');
  if (!displayEl) return;
  const numPart = displayEl.querySelector('.num-part');
  if (numPart) {
    numPart.textContent = value || '0';
  }
  
  // Highlight active chips
  document.querySelectorAll('[data-quick]').forEach(btn => {
    if (btn.dataset.quick === value) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

export function setStatus(text, type = 'ok') {
  els.statusBox.textContent = text;
  els.statusBox.className = 'status show ' + type;
}

export function clearStatus() {
  els.statusBox.className = 'status';
  els.statusBox.textContent = '';
}

export function setLoadingRates(isLoading) {
  els.loadRatesBtn.disabled = isLoading;
  els.loadRatesBtn.innerHTML = isLoading
    ? '<span class="material-symbols-rounded">hourglass_top</span>'
    : '<span class="material-symbols-rounded">sync</span>';
  if (els.loadRatesBtnMobile) els.loadRatesBtnMobile.disabled = isLoading;
  if (els.loadRatesBtnSettings) els.loadRatesBtnSettings.disabled = isLoading;
}

export function renderEmpty() {
  els.opStatus.textContent = 'Esperando datos';
  ['vesNeeded','profitUsdtBig','profitVes','usdtFinal','roiView','flowUsd','flowVes','flowCard','flowBpay','flowReturn'].forEach(id => els[id].textContent = '--');
  els.feesSub.textContent = 'Tarjeta + BPay';
  els.returnSub.textContent = 'Venta P2P estimada';
  els.vesSub.textContent = 'Para comprar USD al banco';
  els.formulaText.textContent = 'Completa USD, BCV y P2P para ver fórmula.';
  if (els.breakdownAmount) els.breakdownAmount.textContent = '-- USD';
  
  updateUsdToBuyDisplay(els.usdToBuy.value);
  
  // Reset bottom status bar
  if (els.statusPill && els.statusPillText) {
    els.statusPillText.textContent = '--';
    els.statusPill.className = 'status-pill';
  }
  if (els.bottomTimestamp) {
    els.bottomTimestamp.textContent = '--';
  }
}

export function renderRates({ bcv, bank, p2p, limitUsd }) {
  els.limitHint.textContent = `Límite ${money(limitUsd, 0)} USD`;
  els.bcvView.textContent = bcv ? money(bcv, 2) : '--';
  els.bankView.textContent = bank ? money(bank, 2) : '--';
  els.p2pView.textContent = p2p ? money(p2p, 2) : '--';
}

export function renderResult(r) {
  els.opStatus.textContent = r.profitVes >= 0 ? 'Rentable' : 'Pérdida';
  els.vesNeeded.textContent = money(r.vesNeeded, 2);
  els.vesSub.textContent = r.usdBlocked > 0
    ? `Se usan ${money(r.usdUsed, 2)} USD · exceso ${money(r.usdBlocked, 2)} USD`
    : `Para ${money(r.usdUsed, 2)} USD al banco`;
  els.usdtFinal.textContent = money(r.usdtFinal, 2);
  els.profitUsdtBig.textContent = (r.profitUsdt >= 0 ? '+' : '') + money(r.profitUsdt, 2);
  els.profitVes.textContent = (r.profitVes >= 0 ? '+' : '') + money(r.profitVes, 2) + ' Bs';
  els.roiView.textContent = (r.roi >= 0 ? '+' : '') + money(r.roi, 2) + '%';
  els.feesSub.textContent = `Comisiones ${money(r.totalFeesUsd, 2)} USD`;
  els.returnSub.textContent = `${money(r.vesReturn, 2)} Bs al P2P`;
  els.flowUsd.textContent = money(r.usdUsed, 2) + ' USD';
  els.flowVes.textContent = money(r.vesNeeded, 2) + ' Bs';
  els.flowCard.textContent = '-' + money(r.cardFeeUsd, 2) + ' USD';
  els.flowBpay.textContent = '-' + money(r.bpayFeeUsd, 2) + ' USD';
  els.flowReturn.textContent = money(r.vesReturn, 2) + ' Bs';
  els.profitCard.className = r.profitVes >= 0 ? 'kpi-card kpi-highlight' : 'kpi-card kpi-highlight kpi-loss';
  els.formulaText.innerHTML = `
    <strong>Tasa banco:</strong> ${money(r.bcv, 4)} × ${(1 + n(els.bankMargin.value) / 100).toFixed(4)} = ${money(r.bank, 4)} Bs/USD.<br>
    <strong>Bs necesarios:</strong> ${money(r.usdUsed, 2)} × ${money(r.bank, 4)} = ${money(r.vesNeeded, 2)} Bs.<br>
    <strong>USDT final:</strong> ${money(r.usdUsed, 2)} - ${money(r.cardFeeUsd, 2)} tarjeta - ${money(r.bpayFeeUsd, 2)} BPay = ${money(r.usdtFinal, 2)} USDT.<br>
    <strong>Retorno P2P:</strong> ${money(r.usdtFinal, 2)} × ${money(r.p2p, 4)} = ${money(r.vesReturn, 2)} Bs.
  `;
  
  if (els.breakdownAmount) {
    els.breakdownAmount.textContent = money(r.usdUsed, 2) + ' USD';
  }
  
  updateUsdToBuyDisplay(els.usdToBuy.value);
  
  // Update bottom status pill
  const isProfitable = r.profitVes >= 0;
  if (els.statusPill && els.statusPillText) {
    els.statusPillText.textContent = isProfitable ? 'Rentable' : 'Pérdida';
    els.statusPill.className = 'status-pill ' + (isProfitable ? 'profitable' : 'loss');
  }
  if (els.bottomTimestamp) {
    els.bottomTimestamp.textContent = els.lastUpdate.textContent.replace(', ', ' · ');
  }
}

export function openSettings() {
  els.settingsPanel.classList.add('open');
  els.settingsPanel.setAttribute('aria-hidden','false');
}

export function closeSettings() {
  els.settingsPanel.classList.remove('open');
  els.settingsPanel.setAttribute('aria-hidden','true');
}

export function collapseDetailsOnMobileLoad() {
  if (window.matchMedia('(max-width: 860px)').matches) {
    document.querySelectorAll('details').forEach(detail => { detail.open = false; });
  }
}
