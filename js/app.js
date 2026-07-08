import { fetchRates } from './api.js';
import { calculateValues, currentBankRate } from './calculator.js';


import { loadState as readState, saveState as writeState } from './storage.js';
import { money, n } from './utils.js';
import { els, setStatus, clearStatus, setLoadingRates, showToast, renderEmpty, renderRates, renderResult, openSettings, closeSettings, openBreakdown, closeBreakdown } from './ui.js?v=10';

let ratesLastUpdated = null;

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

function updateRelativeTime() {
  if (!ratesLastUpdated) {
    els.lastUpdate.textContent = 'Sin actualizar';
    if (els.bottomTimestamp) els.bottomTimestamp.textContent = '--';
    return;
  }
  
  const diffMs = new Date() - ratesLastUpdated;
  const diffSec = Math.floor(diffMs / 1000);
  
  let relativeText = '';
  if (diffSec < 15) {
    relativeText = 'Actualizado hace un momento';
  } else if (diffSec < 60) {
    relativeText = `Actualizado hace ${diffSec} segundos`;
  } else {
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      relativeText = `Hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
    } else {
      const diffHour = Math.floor(diffMin / 60);
      relativeText = `Hace ${diffHour} ${diffHour === 1 ? 'hora' : 'horas'}`;
    }
  }
  
  const absoluteStr = els.lastUpdate.dataset.absolute || '';
  els.lastUpdate.textContent = `${relativeText} · TasaVE`;
  els.lastUpdate.title = absoluteStr;
  
  if (els.bottomTimestamp) {
    els.bottomTimestamp.textContent = `${relativeText} · TasaVE`;
    els.bottomTimestamp.title = absoluteStr;
  }
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
    lastUpdate: els.lastUpdate.dataset.absolute || els.lastUpdate.textContent
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
  if (data.lastUpdate) {
    els.lastUpdate.textContent = data.lastUpdate;
    els.lastUpdate.dataset.absolute = data.lastUpdate;
    ratesLastUpdated = parseLastUpdate(data.lastUpdate);
  }
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
    ratesLastUpdated = new Date();
    const timeStr = ratesLastUpdated.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
    els.lastUpdate.dataset.absolute = `${timeStr} · TasaVE`;
    updateRelativeTime();
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

function buildShareText(r) {
  const amount = money(r.usdUsed, 2);
  const bsNeeded = money(r.vesNeeded, 2);
  const finalUsdt = money(r.usdtFinal, 2);
  const profitUsd = (r.profitUsdt >= 0 ? '+' : '') + money(r.profitUsdt, 2);
  const profitBs = (r.profitVes >= 0 ? '+' : '') + money(r.profitVes, 2);
  const roi = (r.roi >= 0 ? '+' : '') + money(r.roi, 2);
  const bcv = money(r.bcv, 4);
  const bankRate = money(r.bank, 4);
  const p2p = money(r.p2p, 4);

  return `💵 Compra Banco → USDT

USD:
${amount} USD

Bs necesarios:
${bsNeeded} Bs

USDT finales:
${finalUsdt} USDT

Ganancia:
${profitUsd} USD
${profitBs} Bs

ROI:
${roi}%

Tasas:
BCV ${bcv}
Banco ${bankRate}
P2P ${p2p}

Calculado con TasaVE:
https://calculadora-banco-usdt.vercel.app`;
}

function shareOrCopy(btn) {
  const r = calculate();
  if (!r) {
    const errorMsg = navigator.share ? 'Completa los datos antes de compartir.' : 'Completa los datos antes de copiar.';
    showToast(errorMsg, 'warn');
    return;
  }
  const text = buildShareText(r);

  if (navigator.share) {
    navigator.share({
      title: 'Calculadora Banco → USDT',
      text: text
    })
    .then(() => showToast('Cálculo compartido'))
    .catch((err) => {
      if (err.name !== 'AbortError') {
        showToast('No se pudo compartir el cálculo', 'err');
      }
    });
  } else {
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast('Resumen copiado al portapapeles');
        flashCopyBtn(btn);
      })
      .catch(() => showToast('No se pudo copiar.', 'err'));
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
  els.shareBtn.addEventListener('click', () => shareOrCopy(els.shareBtn));
  els.shareBtnMobile.addEventListener('click', () => shareOrCopy(els.shareBtnMobile));
  els.copyBtnSettings.addEventListener('click', () => shareOrCopy(els.copyBtnSettings));
  els.clearBtn.addEventListener('click', clearOperation);
  els.clearBtnTop.addEventListener('click', clearOperation);
  els.clearBtnMobile.addEventListener('click', clearOperation);
  els.resetDefaultsBtn.addEventListener('click', resetDefaults);
  els.openSettingsBtn.addEventListener('click', openSettings);
  els.closeSettingsBtn.addEventListener('click', closeSettings);
  els.settingsPanel.addEventListener('click', e => { if (e.target === els.settingsPanel) closeSettings(); });
  els.openBreakdownBtn.addEventListener('click', openBreakdown);
  els.closeBreakdownBtn.addEventListener('click', closeBreakdown);
  els.breakdownPanel.addEventListener('click', e => { if (e.target === els.breakdownPanel) closeBreakdown(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeSettings();
      closeBreakdown();
    }
  });
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

// --- PWA Install Prompt & iOS detection ---
let deferredPrompt = null;

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
  document.getElementById('installPromptTitle').textContent = 'Instalar Aplicación';
  document.getElementById('installPromptDesc').textContent = 'Agrega Calculadora Banco → USDT a tu pantalla de inicio para un acceso más rápido.';
  const dismissBtn = document.getElementById('installDismissBtn');
  if (dismissBtn) dismissBtn.textContent = 'Ahora no';
  promptEl.classList.add('show');
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
  promptEl.classList.add('show');
}

function hideInstallPrompt() {
  const promptEl = document.getElementById('installPrompt');
  if (promptEl) {
    promptEl.classList.remove('show');
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
      if (outcome === 'accepted') {
        console.log('User accepted install prompt');
      } else {
        localStorage.setItem('installPromptDismissed', Date.now().toString());
      }
      deferredPrompt = null;
    });
  }
}



loadState();
initTheme();
initShare();
bindEvents();
calculate();
setupKeyboardUX();
initInstallPrompt();
updateRelativeTime();
setInterval(updateRelativeTime, 5000);
registerServiceWorker();

window.addEventListener('load', () => {
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
