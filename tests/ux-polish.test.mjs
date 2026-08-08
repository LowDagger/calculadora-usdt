import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const settingsHtml = html.match(/<section class="modal-shell settings-panel"[\s\S]*?<\/section>/)?.[0] || '';

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
  assert.match(serviceWorker, /const APP_VERSION\s+= '40';/);
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

test('keeps amount-entry actions together before bank selection', () => {
  assert.match(html, /id="usdToBuy"[\s\S]*?id="quickAmountRow"[\s\S]*?id="openBsHelperBtn"[\s\S]*?class="bank-profile-field"/);
  assert.match(css, /\.quick-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(68px, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*?\.quick-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.bs-helper-trigger\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-height:\s*48px[\s\S]*?background:\s*var\(--bg-soft\)/);
});

test('orders normal settings by usage and keeps rare values collapsed', () => {
  assert.match(settingsHtml, />Perfil de banco<[\s\S]*?>Montos rápidos<[\s\S]*?>Actualización<[\s\S]*?>Apariencia<[\s\S]*?>Opciones avanzadas</);
  assert.doesNotMatch(settingsHtml, />Montos generales</);
  assert.match(settingsHtml, /<details[^>]*id="advancedSettingsDisclosure"(?![^>]*\sopen)[^>]*>/);
  assert.match(settingsHtml, /id="advancedSettingsDisclosure"[\s\S]*?id="bankMargin"[\s\S]*?id="bpayFee"[\s\S]*?id="bcvRate"[\s\S]*?id="p2pRate"[\s\S]*?id="resetDefaultsBtn"/);
  assert.match(settingsHtml, /id="cardFee" type="hidden" value="1\.5"/);
});

test('keeps Settings and Bs sheets usable in short mobile viewports', () => {
  assert.match(css, /\.settings-content\s*\{[\s\S]*?scroll-padding-block:\s*8px 24px/);
  assert.match(css, /\.bs-helper-content\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?scroll-padding-block:\s*8px 72px/);
  assert.match(css, /\.bs-helper-actions\s*\{[\s\S]*?position:\s*sticky[\s\S]*?bottom:\s*0/);
  assert.match(css, /@media \(max-width: 860px\) and \(max-height: 560px\)/);
  assert.match(app, /if \(e\.key === 'Escape'\)[\s\S]*?dismissSettings\(\)/);
  assert.match(app, /modalFocusOrigins[\s\S]*?origin\.focus\(\)/);
});

test('keeps the compact mobile header accessible without duplicate ids', () => {
  assert.match(html, /id="telegramHeaderLink"[\s\S]*?href="https:\/\/telegram\.me\/CalcuFlow"[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/);
  assert.match(html, /id="telegramHeaderLink"[\s\S]*?id="shareBtn"[\s\S]*?id="openSettingsBtn"/);
  assert.match(css, /\.topbar\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(css, /\.rates-refresh-btn\s*\{[\s\S]*?position:\s*absolute[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.calculator-card\s*\{[\s\S]*?gap:\s*9px[\s\S]*?padding:\s*12px/);

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('simplifies Community, the unread marker and the footer', () => {
  const communityHtml = html.match(/<div class="support-section">[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(communityHtml, />Novedades</);
  assert.match(communityHtml, />Apoyar el proyecto</);
  assert.doesNotMatch(communityHtml, /telegram\.me|Unirme al grupo/);
  assert.match(html, /id="changelogBadge" role="status" aria-label="Novedad sin leer"[\s\S]*?class="changelog-badge-dot"/);
  assert.match(css, /\.changelog-badge-dot\s*\{[\s\S]*?width:\s*7px[\s\S]*?height:\s*7px/);
  assert.match(css, /footer\s*\{[\s\S]*?font-size:\s*0\.6rem[\s\S]*?line-height:\s*1\.35/);
});

test('rounds BCV only in the visible rate card', () => {
  assert.match(app, /els\.bcvRate\.value = String\(activeBcvRecord\.rate\)/);
  assert.match(ui, /els\.bcvView\.innerHTML\s+= bcv\s+\? money\(bcv, 2\)/);
});
