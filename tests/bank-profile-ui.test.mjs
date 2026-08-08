import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

test('renders exactly one compact general commission notice', () => {
  assert.equal((html.match(/Comisiones referenciales/g) || []).length, 1);
  assert.equal(
    (html.match(/Verifica el porcentaje vigente con tu banco antes de operar\./g) || []).length,
    1
  );
});

test('keeps repeated verification status out of selection and active-summary UI', () => {
  const presentationSource = `${html}\n${app}`;

  assert.doesNotMatch(presentationSource, /Comisión reportada/);
  assert.doesNotMatch(presentationSource, /Pendiente de confirmar/);
  assert.doesNotMatch(presentationSource, /activeBankStatus/);
});

test('uses one in-sheet modality view and the calculation-only adjustment copy', () => {
  assert.match(html, /id="backToBankListFromModalitiesBtn"/);
  assert.match(app, /dataset\.selectBank/);
  assert.match(app, /function returnToBankGroups/);
  assert.match(html, /Ajustar solo para este cálculo/);
  assert.match(
    app,
    /Este cambio se aplicará únicamente al cálculo actual y no modificará el perfil guardado\./
  );
});

test('routes Settings and selection to the same profile manager', () => {
  assert.match(app, /settingsManage\.addEventListener[\s\S]*showBankProfiles\('manage', \{ returnFocus: els\.openSettingsBtn \}\)/);
  assert.match(app, /bankProfileEls\.manage\.addEventListener\('click', \(\) => showBankProfileList\(\{ mode: 'manage' \}\)\)/);
});

test('uses the clarified manual-profile labels for configured and unconfigured states', () => {
  assert.match(app, /Define tu comisión/);
  assert.match(app, /Comisión personalizada/);
  assert.doesNotMatch(`${html}\n${app}`, /Manual \/ Otro banco/);
});

test('renders every visible profile card as one full-width native button', () => {
  assert.equal((app.match(/const option = document\.createElement\('button'\)/g) || []).length, 2);
  assert.doesNotMatch(app, /const option = document\.createElement\('div'\)/);
  assert.doesNotMatch(app, /option\.append\(select\)/);
  assert.match(app, /option\.setAttribute\('aria-pressed', String\(isSelected\)\)/);
  assert.match(app, /comisión \$\{formatProfileFee\(displayProfile\.fee\)\}/);
  assert.match(css, /\.bank-profile-option\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*58px;/);
  assert.match(css, /\.bank-profile-option:hover\s*\{/);
  assert.match(css, /\.bank-profile-option:active\s*\{/);
  assert.match(css, /\.bank-profile-option:focus-visible\s*,/);
  assert.equal((app.match(/bankProfileEls\.list\.addEventListener\('click'/g) || []).length, 1);
});

test('exposes complete bank CRUD and a restrained destructive restore flow in Spanish', () => {
  assert.match(html, /id="createCustomBankProfileBtn"[\s\S]*?Añadir banco/);
  assert.match(html, /id="restoreDefaultBankProfilesBtn"[\s\S]*?Restaurar perfiles predeterminados/);
  assert.match(html, /id="deleteBankProfileBtn"[\s\S]*?Eliminar perfil/);
  assert.match(app, /function deleteEditingBankProfile/);
  assert.match(app, /Debe quedar al menos un perfil de banco\./);
  assert.match(
    app,
    /¿Restaurar todos los bancos predeterminados\? Se eliminarán los perfiles añadidos y todos los cambios/
  );
  assert.match(app, /Ya existe un perfil con ese nombre\. Usa un nombre diferente\./);
});

test('makes profile management a distinct mode with one predictable way back', () => {
  assert.match(html, /id="bankProfileContextLabel" hidden/);
  assert.match(
    html,
    /id="bankProfileManagementActions" hidden[\s\S]*?id="backToBankSelectionBtn"[\s\S]*?id="createCustomBankProfileBtn"[\s\S]*?id="bankProfileList"/
  );
  assert.match(
    html,
    /id="bankProfileSelectionActions"[\s\S]*?id="bankProfileManagementDanger" hidden[\s\S]*?id="restoreDefaultBankProfilesBtn"/
  );
  assert.match(app, /classList\.toggle\('is-managing', mode === 'manage'\)/);
  assert.match(app, /function navigateBackWithinBankProfiles\(\)/);
  assert.match(app, /if \(!navigateBackWithinBankProfiles\(\)\) dismissBankProfiles\(\)/);
  assert.match(css, /\.bank-profile-management-toolbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.bank-profile-back\s*\{[\s\S]*?min-height:\s*44px/);
});

test('prioritizes profile essentials and separates optional and destructive controls', () => {
  assert.match(
    html,
    /id="bankProfileNameField"[\s\S]*?id="bankProfileCardTypeField"[\s\S]*?id="bankProfileFee"[\s\S]*?id="bankProfileQuickAmountsField"[\s\S]*?id="bankProfileLogoField"/
  );
  assert.match(html, /id="bankProfileQuickSummaryValues">\$100 · \$200 · \$500 · \$1\.000</);
  assert.match(html, /<details class="field bank-profile-logo-field" id="bankProfileLogoField">/);
  assert.match(
    html,
    /class="bank-profile-editor-actions"[\s\S]*?id="saveBankProfileBtn"[\s\S]*?class="bank-profile-editor-danger"[\s\S]*?id="deleteBankProfileBtn"/
  );
  assert.match(css, /\.bank-profile-editor-actions \.bank-profile-action--primary\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(css, /\.bank-profile-editor-danger\s*\{[\s\S]*?border-top:\s*1px solid var\(--border\)/);
});

test('shows accessible optional logo controls and requirements near the upload action', () => {
  assert.match(html, /id="chooseBankProfileLogoBtn" type="button">Añadir logo/);
  assert.match(html, /id="removeBankProfileLogoBtn" type="button" hidden>Quitar logo/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(html, /PNG, JPEG o WebP · máximo 2 MB · recomendado 512 × 512 px\./);
  assert.match(html, /id="bankProfileLogoStatus" role="status" aria-live="polite"/);
  assert.match(app, /processBankLogo\(file\)/);
  assert.match(app, /Logo listo para guardar\./);
  assert.match(css, /\.bank-profile-logo-control\s*\{/);
});

test('keeps editor data visible when local persistence fails', () => {
  assert.match(app, /persistBankProfiles\(nextState, \{ preserveEditor: true \}\)/);
  assert.match(app, /No hay espacio suficiente para guardar el perfil\. El formulario se conserva\./);
});
