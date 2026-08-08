import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const changelog = readFileSync(new URL('../js/changelog.js', import.meta.url), 'utf8');

test('keeps one permanent and one temporary trigger for the same changelog dialog', () => {
  assert.equal((html.match(/aria-controls="changelogPanel"/g) || []).length, 2);
  assert.match(html, /id="openTopChangelogBtn"[\s\S]*?hidden/);
  assert.match(html, /id="openChangelogBtn"/);
  assert.equal((html.match(/id="changelogPanel"/g) || []).length, 1);
  assert.equal((changelog.match(/markChangelogSeen\(storage\)/g) || []).length, 1);
});

test('keeps the community actions and reuses its Telegram URL', () => {
  assert.match(html, /class="support-title">Comunidad</);
  assert.doesNotMatch(html, /💗 Comunidad/);
  assert.match(html, /Comparte sugerencias y conoce las novedades\./);
  assert.match(html, />Unirme al grupo</);
  assert.match(html, />Apoyar el proyecto</);
  assert.match(changelog, /querySelector\('\.support-actions a\[href\*="telegram"\]'\)/);
});

test('uses a full-width accessible announcement card without reserved hidden space', () => {
  assert.match(css, /\.changelog-announcement\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /\.changelog-announcement:hover\s*\{/);
  assert.match(css, /\.changelog-announcement:active\s*\{/);
  assert.match(css, /\.changelog-announcement-action:focus-visible\s*,\s*\.changelog-announcement-dismiss:focus-visible\s*\{/);
  assert.match(html, /id="configureQuickAmountsAnnouncementBtn"[\s\S]*?Configurar ahora/);
  assert.match(html, /id="learnQuickAmountsAnnouncementBtn"[\s\S]*?Cómo funciona/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.changelog-announcement/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none !important;/);
});
