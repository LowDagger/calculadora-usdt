import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptUrl = new URL('../scripts/setup-telegram-webhook.ps1', import.meta.url);
const script = await readFile(scriptUrl, 'utf8');

test('Telegram webhook helper keeps credentials external and validates token placeholders', () => {
  assert.match(script, /\$env:TELEGRAM_BOT_TOKEN/);
  assert.match(script, /\[System\.Security\.SecureString\]\$BotToken/);
  assert.match(script, /\[System\.Security\.SecureString\]\$VercelBypassSecret/);
  assert.match(script, /YOUR_BOT_TOKEN/);
  assert.match(script, /\(\?i\)\^bot/);
  assert.match(script, /\.Contains\('<'\)/);
  assert.doesNotMatch(script, /\b\d{8,12}:[A-Za-z0-9_-]{30,50}\b/);
});

test('Telegram webhook helper accepts a validated Preview URL and builds the Vercel bypass securely', () => {
  assert.match(script, /\[string\]\$WebhookUrl = 'https:\/\/calcu-flow\.vercel\.app\/api\/telegram'/);
  assert.match(script, /\$WebhookUri\.Scheme -cne \[Uri\]::UriSchemeHttps/);
  assert.match(script, /\$WebhookUri\.DnsSafeHost -notmatch/);
  assert.match(script, /vercel\\\.app\$/);
  assert.match(script, /\$WebhookUri\.AbsolutePath -cne '\/api\/telegram'/);
  assert.match(script, /\$WebhookUri\.Query/);
  assert.match(script, /\$WebhookUri\.Fragment/);
  assert.match(script, /\[Uri\]::EscapeDataString\(\$PlainVercelBypassSecret\)/);
  assert.match(script, /\$\{WebhookBaseUrl\}\?x-vercel-protection-bypass=\$EscapedVercelBypassSecret/);
  assert.match(script, /\$\{baseUrl\}\?x-vercel-protection-bypass=\[REDACTED\]/);
  assert.doesNotMatch(script, /\$[A-Za-z_][A-Za-z0-9_]*\?x-vercel-protection-bypass/);
  assert.match(script, /VercelProtectionBypass/);
  assert.match(script, /Protect-SensitiveText/);
  assert.match(script, /\$setWebhookDescription = Protect-SensitiveText/);
  assert.match(script, /LastErrorMessage = Protect-SensitiveText/);
});

test('Telegram webhook helper calls authenticated POST methods in the required order', () => {
  const getMeIndex = script.indexOf("Invoke-TelegramMethod -Method 'getMe'");
  const endpointCheckIndex = script.indexOf('Invoke-WebRequest');
  const setWebhookIndex = script.indexOf("Invoke-TelegramMethod -Method 'setWebhook'");
  const getWebhookInfoIndex = script.indexOf("Invoke-TelegramMethod -Method 'getWebhookInfo'");

  assert.ok(getMeIndex >= 0);
  assert.ok(endpointCheckIndex > getMeIndex);
  assert.ok(setWebhookIndex > getMeIndex);
  assert.ok(setWebhookIndex > endpointCheckIndex);
  assert.ok(getWebhookInfoIndex > setWebhookIndex);
  assert.match(script, /Invoke-RestMethod/);
  assert.match(script, /-Method Post/);
  assert.match(script, /-MaximumRedirection 0/);
  assert.match(script, /HTTP 200 directo/);
  assert.match(script, /https:\/\/calcu-flow\.vercel\.app\/api\/telegram/);
  assert.match(script, /-Uri \$EffectiveWebhookUrl/);
  assert.match(script, /url = \$EffectiveWebhookUrl/);
  assert.match(script, /No se intentó setWebhook/);
});

test('Telegram webhook helper subscribes to payment updates', () => {
  assert.match(script, /allowed_updates = @\('message', 'edited_message', 'callback_query', 'pre_checkout_query'\)/);
});

test('Telegram webhook helper supports the official isolated test API without changing production default', () => {
  assert.match(script, /\[switch\]\$TelegramTestEnvironment/);
  assert.match(script, /"https:\/\/api\.telegram\.org\/bot\$PlainToken\/test"/);
  assert.match(script, /TelegramEnvironment/);
});
