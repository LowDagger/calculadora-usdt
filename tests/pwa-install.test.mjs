import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("markup provides accessible, initially hidden install entry points in header and community section", () => {
  // Header install button
  assert.match(
    html,
    /<button class="icon-btn" id="installHeaderBtn"[^>]*title="Instalar CalcuFlow"[^>]*aria-label="Instalar CalcuFlow"[^>]*hidden>/
  );
  assert.match(
    html,
    /id="installHeaderBtn"[\s\S]*?<span class="material-symbols-rounded" aria-hidden="true">install_mobile<\/span>/
  );

  // Header button is placed before community/share/settings buttons in .icon-actions
  const iconActionsMatch = html.match(/<div class="icon-actions">([\s\S]*?)<\/div>/);
  assert.ok(iconActionsMatch, "icon-actions container exists");
  const iconActionsContent = iconActionsMatch[1];
  const installIndex = iconActionsContent.indexOf('id="installHeaderBtn"');
  const communityIndex = iconActionsContent.indexOf('id="openCommunityHeaderBtn"');
  const shareIndex = iconActionsContent.indexOf('id="shareBtn"');
  const settingsIndex = iconActionsContent.indexOf('id="openSettingsBtn"');
  assert.ok(installIndex !== -1 && installIndex < communityIndex, "installHeaderBtn is placed before openCommunityHeaderBtn");
  assert.ok(communityIndex < shareIndex && shareIndex < settingsIndex, "other actions maintain hierarchy");

  // Community section install row
  assert.match(
    html,
    /<button class="changelog-trigger" id="openInstallCommunityBtn"[^>]*aria-controls="installPrompt"[^>]*aria-expanded="false"[^>]*hidden>/
  );
  assert.match(
    html,
    /id="openInstallCommunityBtn"[\s\S]*?<span class="material-symbols-rounded community-install-icon" aria-hidden="true">install_mobile<\/span>/
  );
  assert.match(html, /<strong>Instalar CalcuFlow<\/strong>\s*<span>Acceso rápido desde tu pantalla de inicio<\/span>/);

  // Community section order: Unirme -> Instalar -> Apoyar
  const supportSectionMatch = html.match(/<div class="support-section">([\s\S]*?)<\/div>/);
  assert.ok(supportSectionMatch, "support-section exists");
  const supportContent = supportSectionMatch[1];
  const groupIndex = supportContent.indexOf('id="openCommunityBtn"');
  const communityInstallIndex = supportContent.indexOf('id="openInstallCommunityBtn"');
  const supportIndex = supportContent.indexOf('id="openSupportBtn"');
  assert.ok(groupIndex !== -1 && groupIndex < communityInstallIndex, "openCommunityBtn comes first");
  assert.ok(communityInstallIndex < supportIndex, "openInstallCommunityBtn comes before openSupportBtn");

  // Reused install prompt modal
  assert.match(html, /<div class="install-prompt" id="installPrompt" role="dialog" aria-modal="true"/);
  assert.match(html, /<h3 id="installPromptTitle">Instalar CalcuFlow<\/h3>/);
  assert.match(html, /<button class="btn-secondary" id="installDismissBtn" type="button">Ahora no<\/button>/);
  assert.match(html, /<button class="btn-primary" id="installConfirmBtn" type="button">Instalar<\/button>/);
});

test("community install icon has restrained styling matching existing secondary icons", () => {
  assert.match(css, /\.community-install-icon\s*\{[\s\S]*?font-size:\s*18px;[\s\S]*?color:\s*var\(--muted\);/);
});

test("never automatically presents installation UI upon page load or beforeinstallprompt", () => {
  // initInstallPrompt must NOT automatically trigger any reveal/show function
  assert.doesNotMatch(app, /if\s*\(isIOS\s*&&\s*isSafari\)\s*\{\s*if\s*\(shouldShowInstallPrompt/);
  assert.doesNotMatch(app, /beforeinstallprompt'[\s\S]*?showAndroidInstallPrompt/);
  assert.doesNotMatch(app, /beforeinstallprompt'[\s\S]*?revealInstallPrompt/);
  assert.doesNotMatch(app, /function initInstallPrompt\(\)[\s\S]*?revealInstallPrompt/);
});

test("implements small single source of truth for standalone detection", () => {
  assert.match(
    app,
    /function isRunningStandalone\(\)\s*\{\s*return Boolean\(\s*window\.navigator\.standalone\s*\|\|\s*window\.matchMedia\('\(display-mode: standalone\)'\)\.matches\s*\);\s*\}/
  );
});

test("synchronizes install entry points visibility and hides them in standalone mode", () => {
  assert.match(app, /function updateInstallUIVisibility\(\)\s*\{/);
  assert.match(app, /const isStandalone = isRunningStandalone\(\);/);
  assert.match(app, /const canInstall = !isStandalone && \(isMobile \|\| isIOS \|\| Boolean\(deferredPrompt\)\);/);
  assert.match(app, /if \(headerBtn\) headerBtn\.hidden = !canInstall;/);
  assert.match(app, /if \(communityBtn\) communityBtn\.hidden = !canInstall;/);

  // Listens to standalone matchMedia changes
  assert.match(app, /matchMedia\('\(display-mode: standalone\)'\)/);
  assert.match(app, /standaloneMedia\.addEventListener\('change', updateInstallUIVisibility\)/);
});

test("handles Android / Chromium native installation with single-use prompt and appinstalled listener", () => {
  // beforeinstallprompt stores event and updates visibility without popping UI
  assert.match(
    app,
    /window\.addEventListener\('beforeinstallprompt',\s*\(e\)\s*=>\s*\{\s*e\.preventDefault\(\);\s*deferredPrompt = e;\s*updateInstallUIVisibility\(\);\s*\}\);/
  );

  // handleInstallAction executes stored prompt and clears deferredPrompt
  assert.match(app, /async function handleInstallAction\(\)\s*\{/);
  assert.match(app, /if \(isRunningStandalone\(\)\) return;/);
  assert.match(app, /if \(deferredPrompt\)\s*\{\s*const promptEvent = deferredPrompt;\s*deferredPrompt = null;/);
  assert.match(app, /promptEvent\.prompt\(\);/);
  assert.match(app, /await promptEvent\.userChoice;/);

  // appinstalled listener immediately clears prompt, closes modal if open, and updates visibility
  assert.match(
    app,
    /window\.addEventListener\('appinstalled',\s*\(\)\s*=>\s*\{\s*deferredPrompt = null;\s*hideInstallPrompt\(\);\s*updateInstallUIVisibility\(\);\s*\}\);/
  );
});

test("handles Android fallback instructions when beforeinstallprompt is unavailable", () => {
  assert.match(app, /function showAndroidFallbackPrompt\(\)\s*\{/);
  assert.match(app, /Abre el menú de tu navegador y busca <strong>"Instalar aplicación"<\/strong> o <strong>"Agregar a pantalla de inicio"<\/strong>\./);
  assert.match(app, /dismissBtn\.textContent = 'Entendido';/);
  assert.match(app, /confirmBtn\.hidden = true;/);
  assert.match(app, /revealInstallPrompt\(promptEl, dismissBtn\);/);
});

test("handles iOS installation instructions with Apple terminology and without fake installation flag", () => {
  assert.match(app, /function showIOSInstallPrompt\(\)\s*\{/);
  assert.match(app, /1\. Toca Compartir <span class="ios-share-icon" aria-hidden="true"><\/span>\./);
  assert.match(app, /2\. Selecciona <strong>"Agregar a inicio"<\/strong>\./);
  assert.match(app, /3\. Activa "Abrir como app web" si aparece\./);
  assert.match(app, /4\. Toca <strong>"Agregar"<\/strong>\./);
  assert.match(app, /dismissBtn\.textContent = 'Entendido';/);
  assert.match(app, /confirmBtn\.hidden = true;/);

  // Dismissing or viewing instructions must NOT set any fake installation flag
  assert.doesNotMatch(app, /calcuFlowInstalled/);
  assert.doesNotMatch(app, /localStorage\.setItem\('calcuFlowInstalled'/);
});

test("removes 30-day automatic prompt suppression state entirely", () => {
  assert.doesNotMatch(app, /installPromptDismissed/);
  assert.doesNotMatch(app, /shouldShowInstallPrompt/);
  assert.doesNotMatch(app, /thirtyDaysMs/);
});
