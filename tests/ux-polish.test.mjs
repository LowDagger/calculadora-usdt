import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('adds compact hierarchy labels without changing calculation terminology', () => {
  assert.match(html, /<h2 class="section-label">Tasas de referencia<\/h2>[\s\S]*?class="rates-grid"/);
  assert.match(html, /<h2 class="section-label">Tu operación<\/h2>[\s\S]*?class="kpi-grid"/);
  assert.match(css, /\.section-label\s*\{/);
});

test('exposes one accessible manual rate refresh control', () => {
  assert.equal((html.match(/id="loadRatesBtn"/g) || []).length, 1);
  assert.match(html, /id="loadRatesBtn"[^>]*type="button"[^>]*aria-label="Actualizar tasas"/);
  assert.match(html, /id="loadRatesBtn"[\s\S]*?aria-hidden="true">refresh/);
  assert.match(css, /\.rates-refresh-btn:focus-visible\s*\{/);
});

test('deduplicates rate requests and keeps initial success quiet', () => {
  assert.match(app, /let ratesRequestInFlight = false;/);
  assert.match(app, /if \(ratesRequestInFlight\) return;/);
  assert.match(app, /ratesRequestInFlight = true;/);
  assert.match(app, /ratesRequestInFlight = false;[\s\S]*?setLoadingRates\(false\)/);
  assert.match(app, /window\.addEventListener\('load', \(\) => \{[\s\S]*?loadRates\(false\)/);
  assert.match(app, /if \(showSuccessToast === true \|\| !bcvUpdated \|\| !p2pUpdated \|\| usedFallback\)/);
  assert.match(app, /Tasas actualizadas: BCV y Binance P2P\./);
});

test('keeps existing rate values visible during a manual refresh', () => {
  assert.match(ui, /const hasRenderedRates = \[els\.bcvView, els\.bankView, els\.p2pView\]/);
  assert.match(ui, /if \(isLoading && !hasRenderedRates\)/);
  assert.match(ui, /Actualizando tasas/);
});

test('renders a persistent accessible retry action through the same rate loader', () => {
  assert.match(app, /showRateError\(\(\) => loadRates\(true\)\)/);
  assert.match(ui, /retryButton\.id = 'retryRatesBtn'/);
  assert.match(ui, /retryButton\.type = 'button'/);
  assert.match(ui, /retryButton\.textContent = 'Reintentar'/);
  assert.match(ui, /els\.statusBox\.setAttribute\('role', 'alert'\)/);
  assert.match(css, /\.status-action:focus-visible\s*\{/);
});

test('marks result-card symbols as decorative and bumps the PWA cache', () => {
  assert.equal(
    (html.match(/class="material-symbols-rounded card-icon" aria-hidden="true"/g) || []).length,
    7
  );
  assert.match(ui, /btn\.setAttribute\('aria-pressed', String\(isActive\)\)/);
  assert.match(app, /btn\.setAttribute\('aria-pressed', String\(isActive\)\)/);
  assert.match(html, /data-theme-val="system" aria-pressed="true"/);
  assert.match(serviceWorker, /const APP_VERSION\s+= '37';/);
  assert.match(serviceWorker, /'\/js\/bcv-rates\.js'/);
  assert.match(serviceWorker, /requestUrl\.pathname\.startsWith\('\/api\/'\)/);
});

test('uses the approved quick amounts and compact Bs helper copy', () => {
  assert.match(html, /data-quick="100"[\s\S]*?data-quick="200"[\s\S]*?data-quick="500"[\s\S]*?data-quick="1000"/);
  assert.match(html, /class="chip-btn active"[^>]*data-quick="500"[^>]*aria-pressed="true"/);
  assert.match(html, /id="usdToBuy"[^>]*value="500"/);
  assert.match(html, />Calcular desde Bs</);
  assert.match(html, />Bs disponibles</);
  assert.match(html, />Equivale a</);
  assert.match(html, />USDT finales estimados</);
  assert.match(html, />Usar este monto</);
  assert.doesNotMatch(app, /scrollIntoView/);
});

test('presents general quick amounts as cohesive accessible 2x2 controls', () => {
  assert.match(html, /id="generalQuickAmountsHelp"[\s\S]*?id="generalQuickAmountsList"/);
  assert.match(html, /id="generalQuickAmountsError" role="alert" hidden/);
  assert.match(app, /general-quick-item/);
  assert.match(app, /general-quick-remove/);
  assert.match(app, /generalQuickAmountsHelp generalQuickAmountsError/);
  assert.match(css, /\.general-quick-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.general-quick-item\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) 44px/);
  assert.match(css, /\.general-quick-remove\s*\{[\s\S]*?width:\s*44px[\s\S]*?min-height:\s*46px/);
});

test('rounds BCV only in the visible rate card', () => {
  assert.match(app, /els\.bcvRate\.value = String\(activeBcvRecord\.rate\)/);
  assert.match(ui, /els\.bcvView\.innerHTML\s+= bcv\s+\? money\(bcv, 2\)/);
});
