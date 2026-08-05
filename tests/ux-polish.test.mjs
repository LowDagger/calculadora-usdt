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
  assert.match(app, /if \(showSuccessToast === true\) \{[\s\S]*?Tasas consultadas: BCV Today y DolarAPI\./);
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
  assert.match(serviceWorker, /const APP_VERSION\s+= '34';/);
  assert.match(serviceWorker, /'\/js\/bcv-rates\.js'/);
});

test('rounds BCV only in the visible rate card', () => {
  assert.match(app, /els\.bcvRate\.value = String\(bcv\)/);
  assert.match(ui, /els\.bcvView\.innerHTML\s+= bcv\s+\? money\(bcv, 2\)/);
});
