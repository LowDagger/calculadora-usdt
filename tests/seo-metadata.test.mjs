import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifestContent = readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');
const manifest = JSON.parse(manifestContent);

test('index.html contains complete branding and SEO meta tags', () => {
  // Title
  assert.match(html, /<title>CalcuFlow — Banco → USDT<\/title>/);

  // Canonical URL
  assert.match(html, /<link rel="canonical" href="https:\/\/calcu-flow\.vercel\.app\/" \/>/);

  // Viewport & theme
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>/);
  assert.match(html, /<meta name="theme-color" content="#0F1115" \/>/);

  // Search Engine Meta
  assert.match(html, /<meta name="author" content="CalcuFlow" \/>/);
  assert.match(html, /<meta name="robots" content="index, follow" \/>/);
  assert.match(html, /<meta name="keywords" content="[^"]+" \/>/);
  assert.match(html, /<meta name="description"\s+content="[^"]+" \/>/);

  // Open Graph
  assert.match(html, /<meta property="og:type" content="website" \/>/);
  assert.match(html, /<meta property="og:locale" content="es_VE" \/>/);
  assert.match(html, /<meta property="og:site_name" content="CalcuFlow" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/calcu-flow\.vercel\.app\/" \/>/);
  assert.match(html, /<meta property="og:title" content="CalcuFlow — Banco → USDT" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/calcu-flow\.vercel\.app\/preview\.png" \/>/);
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="630" \/>/);

  // Twitter Cards
  assert.match(html, /<meta property="twitter:card" content="summary_large_image" \/>/);
  assert.match(html, /<meta property="twitter:title" content="CalcuFlow — Banco → USDT" \/>/);
  assert.match(html, /<meta property="twitter:image" content="https:\/\/calcu-flow\.vercel\.app\/preview\.png" \/>/);
});

test('index.html contains valid, parseable JSON-LD structured data', () => {
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'JSON-LD script block must exist');

  const structuredData = JSON.parse(jsonLdMatch[1]);
  assert.equal(structuredData['@context'], 'https://schema.org');
  assert.equal(structuredData['@type'], 'WebApplication');
  assert.equal(structuredData.name, 'CalcuFlow');
  assert.equal(structuredData.alternateName, 'Calculadora Banco → USDT');
  assert.equal(structuredData.url, 'https://calcu-flow.vercel.app/');
  assert.equal(structuredData.inLanguage, 'es-VE');
  assert.equal(structuredData.applicationCategory, 'FinanceApplication');
  assert.equal(structuredData.offers?.price, '0');
});

test('manifest.json provides required PWA metadata, categories, and orientation', () => {
  assert.equal(manifest.name, 'CalcuFlow — Banco → USDT');
  assert.equal(manifest.short_name, 'CalcuFlow');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait-primary');
  assert.deepEqual(manifest.categories, ['finance', 'utilities']);
  assert.equal(manifest.lang, 'es-VE');
  assert.equal(manifest.background_color, '#0F1115');
  assert.equal(manifest.theme_color, '#0F1115');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 1);

  for (const icon of manifest.icons) {
    const iconPath = new URL(`..${icon.src}`, import.meta.url);
    assert.ok(existsSync(iconPath), `Icon file must exist: ${icon.src}`);
  }
});

test('favicon and apple-touch-icon referenced in head exist on disk', () => {
  assert.ok(existsSync(new URL('../assets/icon.svg', import.meta.url)));
  assert.ok(existsSync(new URL('../assets/icons/app-icon.svg', import.meta.url)));
  assert.ok(existsSync(new URL('../preview.png', import.meta.url)));
});
