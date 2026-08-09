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

test('keeps the shared Community modal discoverable from header, Community, and Settings', () => {
  assert.match(html, /class="support-title">Comunidad</);
  assert.doesNotMatch(html, /💗 Comunidad/);
  assert.match(html, /id="openCommunityHeaderBtn"[^>]*type="button"[^>]*aria-controls="qrPanel"[^>]*aria-expanded="false"/);
  assert.match(html, /id="openCommunityBtn"[^>]*aria-controls="qrPanel"[^>]*aria-expanded="false"/);
  assert.match(html, /id="openCommunitySettingsBtn"[^>]*aria-controls="qrPanel"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(html, /id="openCommunityHeaderBtn"[^>]*href=/);
  assert.match(html.match(/<div class="support-section">[\s\S]*?<\/div>/)?.[0] || '', />Unirme al grupo<[\s\S]*?>t\.me\/CalcuFlow</);
  assert.match(html, />Apoyar el proyecto</);
  assert.doesNotMatch(html, />Código QR de Telegram</);
  assert.doesNotMatch([html, changelog].join('\n'), /https:\/\/telegram\.me\/CalcuFlow/);
  assert.match(changelog, /telegramLink\.href = 'https:\/\/t\.me\/CalcuFlow'/);
});

test('uses a full-width accessible announcement card without reserved hidden space', () => {
  assert.match(css, /\.changelog-announcement\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /\.changelog-announcement:hover\s*\{/);
  assert.match(css, /\.changelog-announcement:active\s*\{/);
  assert.match(css, /\.changelog-announcement-action:focus-visible\s*,\s*\.changelog-announcement-dismiss:focus-visible\s*\{/);
  assert.match(html, /id="viewLatestAnnouncementBtn"[\s\S]*?Ver novedades/);
  assert.match(html, /id="dismissLatestAnnouncementBtn"[\s\S]*?aria-label="Ocultar anuncio de novedades"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.changelog-announcement/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none !important;/);
});
