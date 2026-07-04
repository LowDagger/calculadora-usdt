import { fetchRates } from './api.js';
import { calculateValues, currentBankRate } from './calculator.js';
import { loadState as readState, saveState as writeState } from './storage.js';
import { money, n } from './utils.js';
import { els, setStatus, clearStatus, setLoadingRates, showToast, renderEmpty, renderRates, renderResult, openSettings, closeSettings, collapseDetailsOnMobileLoad } from './ui.js';

function getState() {
  return {
    usdToBuy: els.usdToBuy.value,
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
  els.bankMargin.value = '0.5';
  els.cardFee.value = '1.5';
  els.bpayFee.value = '4.1';
  els.autoRates.checked = true;
  
  // Reset theme to system
  applyTheme('system');
  updateThemeUI('system');
  localStorage.setItem('theme', 'system');

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
  const bcv = n(els.bcvRate.value);
  const bank = currentBankRate(bcv, els.bankMargin.value);
  const p2p = n(els.p2pRate.value);

  renderRates({ bcv, bank, p2p });

  const result = calculateValues({
    requestedUsd, bcvRate: bcv, bankMargin: els.bankMargin.value,
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
  els.usdToBuy.value = '500';
  // Dispatch events so any event listeners on the input element are triggered
  els.usdToBuy.dispatchEvent(new Event('input', { bubbles: true }));
  els.usdToBuy.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Explicitly call calculation and save state to guarantee UI updates
  calculate();
  saveState(false);
  
  clearStatus();
  showToast('Cálculo limpiado');
}

function bindEvents() {
  ['usdToBuy','bankMargin','bcvRate','p2pRate','cardFee','bpayFee','autoRates'].forEach(key => {
    els[key].addEventListener('input', () => { calculate(); saveState(false); });
    els[key].addEventListener('change', () => { calculate(); saveState(false); });
  });

  document.querySelectorAll('[data-quick]').forEach(btn => btn.addEventListener('click', () => {
    els.usdToBuy.value = btn.dataset.quick;
    calculate();
    saveState(false);
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
    // This fires after the new SW calls clients.claim(), meaning our page is
    // now controlled by the fresh version.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
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
  btn.innerHTML = '<span class="material-symbols-rounded">check</span>';
  btn.classList.add('copy-success');
  setTimeout(() => {
    btn.innerHTML = '<span class="material-symbols-rounded">content_copy</span>';
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

  // Normalise comma → dot and recalculate on change (covers autofill, paste, etc.)
  input.addEventListener('change', () => {
    input.value = input.value.replace(',', '.');
    calculate();
    saveState(false);
  });

  // Recalculate whenever the field loses focus (covers all dismissal paths)
  input.addEventListener('blur', () => {
    input.value = input.value.replace(',', '.');
    calculate();
    saveState(false);
  });

  // --- Focus: scroll into view (center so the keyboard doesn't hide it) ---
  input.addEventListener('focus', () => {
    setTimeout(() => {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
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

loadState();
initTheme();
bindEvents();
calculate();
collapseDetailsOnMobileLoad();
setupKeyboardUX();
registerServiceWorker();

window.addEventListener('load', () => {
  collapseDetailsOnMobileLoad();
  if (els.autoRates.checked) loadRates().catch(() => {});
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
    if (btn.dataset.themeVal === theme) {
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
