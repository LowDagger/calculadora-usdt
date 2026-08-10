import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const modalController = readFileSync(new URL('../js/modal-controller.js', import.meta.url), 'utf8');
const ratesController = readFileSync(new URL('../js/rates-controller.js', import.meta.url), 'utf8');
const settingsController = readFileSync(new URL('../js/settings-controller.js', import.meta.url), 'utf8');
const share = readFileSync(new URL('../js/share.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const settingsHtml = html.match(/<section class="modal-shell settings-panel"[\s\S]*?<\/section>/)?.[0] || '';

test('adds compact hierarchy labels without changing calculation terminology', () => {
  assert.match(html, /<h2 class="section-label">Tasas de referencia<\/h2>[\s\S]*?class="rates-grid"/);
  assert.match(html, /<div class="kpi-grid">/);
  assert.doesNotMatch(html, /Tu operación/);
  assert.match(css, /\.section-label\s*\{/);
});

test('exposes one accessible manual rate refresh control', () => {
  assert.equal((html.match(/id="loadRatesBtn"/g) || []).length, 1);
  assert.match(html, /id="loadRatesBtn"[^>]*type="button"[^>]*aria-label="Actualizar tasas"/);
  assert.match(html, /id="loadRatesBtn"[\s\S]*?aria-hidden="true">refresh/);
  assert.match(css, /\.rates-refresh-btn:focus-visible\s*\{/);
});

test('deduplicates rate requests and keeps initial success quiet', () => {
  assert.match(ratesController, /let requestInFlight = false;/);
  assert.match(ratesController, /if \(requestInFlight\) return;/);
  assert.match(ratesController, /requestInFlight = true;/);
  assert.match(ratesController, /requestInFlight = false;[\s\S]*?setLoadingRates\(false\)/);
  assert.match(app, /window\.addEventListener\('load', \(\) => \{[\s\S]*?loadRates\(false\)/);
  assert.match(ratesController, /if \(showSuccessToast === true \|\| !bcvUpdated \|\| !p2pUpdated \|\| usedFallback\)/);
  assert.match(ratesController, /Tasas actualizadas: BCV y Binance P2P\./);
});

test('keeps existing rate values visible during a manual refresh', () => {
  assert.match(ui, /const hasRenderedRates = \[els\.bcvView, els\.bankView, els\.p2pView\]/);
  assert.match(ui, /if \(isLoading && !hasRenderedRates\)/);
  assert.match(ui, /Actualizando tasas/);
});

test('renders a persistent accessible retry action through the same rate loader', () => {
  assert.match(ratesController, /showRateError\(\(\) => loadRates\(true\)\)/);
  assert.match(ui, /retryButton\.id = 'retryRatesBtn'/);
  assert.match(ui, /retryButton\.type = 'button'/);
  assert.match(ui, /retryButton\.textContent = 'Reintentar'/);
  assert.match(ui, /els\.statusBox\.setAttribute\('role', 'alert'\)/);
  assert.match(css, /\.status-action:focus-visible\s*\{/);
});

test('marks result-card symbols as decorative and bumps the PWA cache', () => {
  assert.equal(
    (html.match(/class="material-symbols-rounded card-icon(?: rate-edit-icon| rate-exchange-icon)?" aria-hidden="true"/g) || []).length,
    8
  );
  assert.match(ui, /btn\.setAttribute\('aria-pressed', String\(isActive\)\)/);
  assert.match(settingsController, /btn\.setAttribute\('aria-pressed', String\(isActive\)\)/);
  assert.match(html, /data-theme-val="system" aria-pressed="true"/);
  assert.match(serviceWorker, /const APP_VERSION\s+= '53';/);
  assert.match(serviceWorker, /'\/js\/bcv-rates\.js'/);
  for (const moduleName of ['modal-controller', 'rates-controller', 'settings-controller', 'share']) {
    assert.match(serviceWorker, new RegExp(`'/js/${moduleName}\\.js'`));
  }
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
  assert.match(settingsHtml, />Perfil de banco<[\s\S]*?>Montos rápidos<[\s\S]*?>Apariencia<[\s\S]*?>Opciones avanzadas</);
  assert.doesNotMatch(settingsHtml, />Montos generales</);
  assert.doesNotMatch(settingsHtml, /<div class="section-title">[\s\S]*?>Actualización<[\s\S]*?<\/div>/);
  assert.match(settingsHtml, /<details[^>]*id="advancedSettingsDisclosure"(?![^>]*\sopen)[^>]*>/);
  assert.match(settingsHtml, /id="advancedSettingsDisclosure"[\s\S]*?id="autoRates"[\s\S]*?id="bankMargin"[\s\S]*?id="bpayFee"[\s\S]*?id="bcvRate"[\s\S]*?id="p2pRate"[\s\S]*?id="resetDefaultsBtn"/);
  assert.match(settingsHtml, /id="cardFee" type="hidden" value="2\.5"/);
});

test('keeps Settings and Bs sheets usable in short mobile viewports', () => {
  assert.match(css, /\.settings-content\s*\{[\s\S]*?scroll-padding-block:\s*8px 24px/);
  assert.match(css, /\.bs-helper-content\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?scroll-padding-block:\s*8px 72px/);
  assert.match(css, /\.bs-helper-actions\s*\{[\s\S]*?position:\s*sticky[\s\S]*?bottom:\s*0/);
  assert.match(css, /@media \(max-width: 860px\) and \(max-height: 560px\)/);
  assert.match(app, /if \(e\.key === 'Escape'\)[\s\S]*?dismissSettings\(\)/);
  assert.match(modalController, /modalFocusOrigins[\s\S]*?origin\.focus\(\)/);
});

test('keeps the compact mobile header accessible without duplicate ids', () => {
  assert.match(html, /id="openCommunityHeaderBtn"[^>]*type="button"[^>]*aria-controls="qrPanel"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(html, /id="openCommunityHeaderBtn"[^>]*href=/);
  assert.match(html, /id="openCommunityHeaderBtn"[\s\S]*?id="shareBtn"[\s\S]*?id="openSettingsBtn"/);
  assert.match(css, /\.topbar\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(css, /\.rates-refresh-btn\s*\{[\s\S]*?position:\s*absolute[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/);
  assert.match(css, /\.header-telegram-icon\s*\{[\s\S]*?width:\s*23px[\s\S]*?height:\s*23px/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.calculator-card\s*\{[\s\S]*?gap:\s*9px[\s\S]*?padding:\s*12px/);

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('consolidates Community actions into one accessible Telegram modal', () => {
  const communityHtml = html.match(/<div class="support-section">[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(communityHtml, />Unirme al grupo<[\s\S]*?>t\.me\/CalcuFlow<[\s\S]*?>Novedades<[\s\S]*?>Apoyar el proyecto</);
  assert.doesNotMatch(communityHtml, />Código QR de Telegram</);
  assert.match(html, /id="openCommunityHeaderBtn"[^>]*aria-controls="qrPanel"/);
  assert.match(html, /id="openCommunityBtn"[^>]*aria-controls="qrPanel"/);
  assert.match(settingsHtml, /id="openCommunitySettingsBtn"[^>]*aria-controls="qrPanel"/);
  assert.match(html, /id="qrPanel" role="dialog" aria-modal="true"[\s\S]*?aria-labelledby="qrTitle"/);
  assert.match(html, /id="qrTitle">Comunidad CalcuFlow<[\s\S]*?Únete al grupo de Telegram/);
  assert.match(html, /id="closeQrBtn"/);
  assert.match(html, /class="community-handle" href="https:\/\/t\.me\/CalcuFlow"[\s\S]*?class="community-telegram-icon"[\s\S]*?<span>t\.me\/CalcuFlow<\/span>/);
  assert.match(html, /class="qr-image-link" href="https:\/\/t\.me\/CalcuFlow" target="_blank" rel="noopener noreferrer"[\s\S]*?aria-label="Abrir grupo de CalcuFlow en Telegram"/);
  assert.match(html, /<img[^>]*src="assets\/telegram-qr\.webp"[^>]*alt="Código QR del grupo de Telegram de CalcuFlow"[^>]*width="700"[^>]*height="700"[^>]*loading="lazy"[^>]*decoding="async"[^>]*\/?>/);
  assert.match(html, /class="bank-profile-action bank-profile-action--primary community-primary-action"[\s\S]*?href="https:\/\/t\.me\/CalcuFlow"[\s\S]*?class="community-telegram-icon"[\s\S]*?<span>Abrir en Telegram<\/span>/);
  assert.match(serviceWorker, /'\/assets\/telegram-qr\.webp'/);
  assert.equal((html.match(/href="https:\/\/t\.me\/CalcuFlow"/g) || []).length, 4);
  assert.doesNotMatch([html, app, ui, modalController].join('\n'), /https:\/\/telegram\.me\/CalcuFlow/);
  assert.match(app, /const communityTriggers = \[[\s\S]*?openCommunityHeaderBtn[\s\S]*?openCommunityBtn[\s\S]*?openCommunitySettingsBtn/);
  assert.match(app, /createCommunityModalController\(\{[\s\S]*?panel: els\.qrPanel[\s\S]*?openModal: openQr[\s\S]*?closeModal: closeQr/);
  assert.match(modalController, /openManagedModal\(panel, trigger, openModal, closeButton\)/);
  assert.match(modalController, /closeManagedModal\(panel, activeTrigger, closeModal\)/);
  assert.match(modalController, /settingsObscured[\s\S]*?setAttribute\('aria-hidden', 'true'\)[\s\S]*?setAttribute\('inert', ''\)[\s\S]*?removeAttribute\('inert'\)/);
  assert.match(modalController, /!panel\.classList\.contains\('open'\) \|\| panel\.classList\.contains\('closing'\)/);
  assert.match(app, /else if \(els\.qrPanel\.classList\.contains\('open'\)\) dismissCommunity\(\);[\s\S]*?dismissSettings\(\)/);
  assert.match(modalController, /panel\?\.addEventListener\('click',[\s\S]*?event\.target === panel[\s\S]*?dismiss\(\)/);
  assert.match(ui, /export function openQr\(\)/);
  assert.match(ui, /export function closeQr\(\)/);
  const openQrBlock = ui.match(/export function openQr\(\)[\s\S]*?(?=export function closeQr\(\))/)?.[0] || '';
  assert.equal((openQrBlock.match(/triggerHaptic\('light'\)/g) || []).length, 1);
  assert.match(openQrBlock, /lockBodyScroll\(\)/);
  assert.match(css, /\.qr-panel\s*\{[\s\S]*?z-index:\s*110/);
  assert.match(html, /id="changelogBadge" role="status" aria-label="Novedad sin leer"[\s\S]*?class="changelog-badge-dot"/);
  assert.match(css, /\.changelog-badge-dot\s*\{[\s\S]*?width:\s*7px[\s\S]*?height:\s*7px/);
  assert.match(css, /footer\s*\{[\s\S]*?font-size:\s*0\.6rem[\s\S]*?line-height:\s*1\.35/);
});

test('keeps the BCV, Brecha, and P2P composition compact without exposing internal bank presentation', () => {
  const ratesHtml = html.match(/<h2 class="section-label">Tasas de referencia<\/h2>[\s\S]*?<div class="status"/)?.[0] || '';
  assert.match(ratesHtml, /class="rates-grid"[\s\S]*?id="openBcvEditorBtn"[\s\S]*?>BCV<[\s\S]*?id="bcvEffectiveDate"[\s\S]*?id="bcvView"[\s\S]*?id="brechaView"[\s\S]*?id="openP2pEditorBtn"[\s\S]*?>P2P<[\s\S]*?id="p2pUpdateTime"[\s\S]*?id="p2pView"/);
  assert.doesNotMatch(ratesHtml, /BCV \+ Banco|id="bankView"|id="bankMarginView"|rate-margin-chip|rate-unit-label|Bs\/USDT/);
  assert.match(html, /display: none !important;[\s\S]*?id="bankView"[\s\S]*?id="bankMarginView"/);
  assert.match(ratesHtml, /class="material-symbols-rounded brecha-icon" aria-hidden="true">swap_horiz<\/span>[\s\S]*?class="brecha-val" id="brechaView"/);
  assert.match(ratesHtml, /class="brecha-label">Brecha<\/span>[\s\S]*?class="rate-spread-value"/);
  assert.match(css, /\.rates-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.rate-spread\s*\{[\s\S]*?align-self:\s*center[\s\S]*?flex-direction:\s*column[\s\S]*?border-radius:\s*999px/);
  assert.match(css, /\.rate-card\s*\{[\s\S]*?border-radius:\s*24px[\s\S]*?min-height:\s*64px/);
  assert.doesNotMatch(css, /\.rate-meta-row/);
  assert.match(css, /\.rate-spread \.brecha-label\s*\{[\s\S]*?text-transform:\s*uppercase/);
  assert.match(css, /\.brecha-icon\s*\{[\s\S]*?font-size:\s*0\.78rem/);
  assert.match(css, /\.rate-metadata\s*\{[\s\S]*?font-size:\s*0\.46rem[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.rate-metadata::before\s*\{[\s\S]*?content:\s*'·'/);
  assert.match(css, /\.rate-value-row\s*\{[\s\S]*?align-items:\s*baseline/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*?\.rates-grid\s*\{[\s\S]*?gap:\s*4px/);
});

test('offers one accessible quick editor for each editable rate card', () => {
  assert.match(html, /<button class="rate-card rate-card--editable" id="openBcvEditorBtn"[\s\S]*?aria-label="Editar tasa BCV"[\s\S]*?id="bcvEffectiveDate"[\s\S]*?id="bcvView"[\s\S]*?<\/button>/);
  assert.match(html, /<button class="rate-card rate-card--editable" id="openP2pEditorBtn"[\s\S]*?aria-label="Editar tasa P2P"[\s\S]*?id="p2pView"[\s\S]*?<\/button>/);
  assert.match(html, /id="bcvManualIndicator" hidden>Manual</);
  assert.match(html, /id="p2pManualIndicator" hidden>Manual</);
  assert.match(html, /id="bcvEditorPanel"[\s\S]*?Editar tasa BCV[\s\S]*?Usa una tasa personalizada para simular tu operación\.[\s\S]*?id="bcvQuickRate"[\s\S]*?Bs\/USD[\s\S]*?Restaurar tasa actual[\s\S]*?>Aplicar</);
  assert.match(html, /id="p2pEditorPanel"[\s\S]*?Editar tasa P2P[\s\S]*?Usa una tasa personalizada para simular tu operación\.[\s\S]*?id="p2pQuickRate"[\s\S]*?Bs\/USDT[\s\S]*?Restaurar tasa actual[\s\S]*?>Aplicar</);
  assert.match(css, /\.rate-card--editable\s*\{[\s\S]*?cursor:\s*pointer/);
  assert.match(css, /\.rate-card--editable:focus-visible\s*\{/);
  assert.match(css, /\.p2p-editor-content\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?scroll-padding-block:\s*8px 72px/);
});

test('keeps the quick editor synchronized with the existing manual P2P state', () => {
  assert.match(app, /p2pEditorEls\.input\.value = els\.p2pRate\.value/);
  assert.match(app, /els\.p2pRate\.value = String\(rate\)[\s\S]*?dispatchEvent\(new Event\('input'/);
  assert.match(ratesController, /if \(activeP2pRecord\) lastAutomaticP2pRecord = activeP2pRecord;[\s\S]*?activeP2pRecord = null/);
  assert.match(app, /const activeP2pRecord = ratesController\.restoreAutomaticP2p\(\)[\s\S]*?els\.p2pRate\.value = Number\(activeP2pRecord\.rate\)\.toFixed\(4\)[\s\S]*?calculate\(\)[\s\S]*?saveState\(false\)/);
  assert.match(app, /p2pEditorEls\.indicator\.hidden = !isManual/);
  assert.match(app, /openManagedModal\(p2pEditorEls\.panel, p2pEditorEls\.trigger[\s\S]*?p2pEditorEls\.input, p2pEditorEls\.trigger/);
  assert.match(app, /closeManagedModal\(p2pEditorEls\.panel, p2pEditorEls\.trigger/);
  assert.match(app, /p2pEditorEls\.panel\.classList\.contains\('open'\)\) dismissP2pEditor\(\)/);
  assert.match(app, /renderRates\(\{ bcv, bank, p2p, p2pRecord: ratesController\.getActiveP2pRecord\(\) \}\)/);
  assert.match(ui, /Date\.parse\(p2pRecord\?\.fetchedAt\)[\s\S]*?toLocaleTimeString\('en-US'[\s\S]*?timeZone: 'America\/Caracas'/);
});

test('keeps the BCV quick editor synchronized with the manual BCV state', () => {
  assert.match(app, /bcvEditorEls\.input\.value = els\.bcvRate\.value/);
  assert.match(app, /els\.bcvRate\.value = String\(rate\)[\s\S]*?dispatchEvent\(new Event\('input'/);
  assert.match(ratesController, /if \(activeBcvRecord\) lastAutomaticBcvRecord = activeBcvRecord;[\s\S]*?activeBcvRecord = null/);
  assert.match(app, /const activeBcvRecord = ratesController\.restoreAutomaticBcv\(\)[\s\S]*?els\.bcvRate\.value = String\(activeBcvRecord\.rate\)[\s\S]*?renderBcvDate\(activeBcvRecord\)[\s\S]*?calculate\(\)[\s\S]*?saveState\(false\)/);
  assert.match(app, /bcvEditorEls\.indicator\.hidden = !isManual/);
  assert.match(app, /openManagedModal\(bcvEditorEls\.panel, bcvEditorEls\.trigger[\s\S]*?bcvEditorEls\.input, bcvEditorEls\.trigger/);
  assert.match(app, /closeManagedModal\(bcvEditorEls\.panel, bcvEditorEls\.trigger/);
  assert.match(app, /bcvEditorEls\.panel\.classList\.contains\('open'\)\) dismissBcvEditor\(\)/);
  assert.match(ui, /formatBcvRateLabel\(record\)[\s\S]*?replace\(\/\^Vigente\\s\+\//);
});

test('uses icon-only profile editing while preserving the row accessibility contract', () => {
  assert.match(app, /option\.title = `Editar perfil \$\{displayProfile\.name\}`/);
  assert.match(app, /\? `Editar perfil \$\{displayProfile\.name\}/);
  assert.match(app, /editIcon\.className = 'material-symbols-rounded bank-profile-edit-icon'/);
  assert.doesNotMatch(app, /bank-profile-manage-label|editLabel\.textContent = 'Editar'/);
});

test('shares the current calculation hierarchy with bank context and keeps both delivery paths', () => {
  assert.match(share, /CalcuFlow — Banco → USDT/);
  assert.match(share, /Compra: \$\{amount\} USD[\s\S]*?Banco: \$\{bankDescription\}/);
  assert.match(share, /BCV: \$\{bcv\}[\s\S]*?Banco: \$\{bankRate\}[\s\S]*?P2P: \$\{p2p\}/);
  assert.match(share, /Bs necesarios: \$\{bsNeeded\} Bs[\s\S]*?Monto en BPay: \$\{bpayAmount\} USD[\s\S]*?USDT finales: \$\{finalUsdt\} USDT/);
  assert.match(share, /Ganancia estimada: \$\{profitUsd\} USD[\s\S]*?Retorno: \$\{roi\}%/);
  assert.doesNotMatch(share, /💵 Compra Banco|Calculado con CalcuFlow:/);
  assert.match(share, /if \(navigator\.share\)[\s\S]*?navigator\.share\(/);
  assert.match(share, /navigator\.clipboard\.writeText\(text\)/);
});

test('rounds BCV only in the visible rate card', () => {
  assert.match(app, /els\.bcvRate\.value = String\(activeBcvRecord\.rate\)/);
  assert.match(ui, /els\.bcvView\.textContent\s+= bcv\s+\? money\(bcv, 2\)/);
  assert.match(ui, /els\.bankView\.textContent = bank \? money\(bank, 2\)/);
  assert.match(ui, /els\.p2pView\.textContent\s+= p2p\s+\? money\(p2p, 2\)/);
});
