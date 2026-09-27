import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.document = { getElementById: () => null };
const { formatRelativeTime } = await import('../js/rates-controller.js');

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');

test('rate freshness stays quiet for the first minute and never renders live seconds', () => {
  assert.equal(formatRelativeTime(new Date(Date.now() - 30_000)), 'Hace <1 min');
  assert.match(formatRelativeTime(new Date(Date.now() - 125_000)), /Actualizado hace 2 min/);
  assert.match(app, /setInterval\(updateRelativeTime, 60000\)/);
  assert.doesNotMatch(app, /setInterval\(updateRelativeTime, 1000\)/);
});

test('header keeps only the brand and actions while freshness sits with reference rates', () => {
  const header = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1] || '';
  assert.doesNotMatch(header, /Banco → USDT|lastUpdate/);
  assert.match(html, /<div class="section-heading-row">[\s\S]*?Tasas de referencia[\s\S]*?id="lastUpdate"/);
});

test('BDV presentation is aggregated while sequential calculation data remains intact', () => {
  assert.match(html, /Banco de Venezuela[\s\S]*?Virtual \/ otra modalidad · 2,5%/);
  assert.match(ui, /const bankFeeLabel = `\$\{money\(r\.cardPct, 1\)\}%`/);
  assert.doesNotMatch(ui, /bankFeeSteps\.map\(fee => `\$\{money\(fee, 1\)\}%`\)\.join\('\s\+\s'\)/);
});
