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
  assert.match(app, /settingsManage\.addEventListener[\s\S]*showBankProfiles\('manage'\)/);
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
