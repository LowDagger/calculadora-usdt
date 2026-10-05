import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/diagnose-telegram.ps1', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/diagnose-telegram-harness.ps1', import.meta.url));
// Windows executes the script; Linux CI checks its guardrails without installing PowerShell.
const windows = process.platform === 'win32';
async function diagnose(scenario) {
  const { stdout, stderr } = await run('pwsh.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fixture,
    '-ScriptPath', script, '-Scenario', scenario]);
  assert.equal(stderr, '');
  assert.doesNotMatch(stdout, /SIMULATED_SECRET|SIMULATED_BYPASS|PRIVATE_NAME|987\.65/);
  return JSON.parse(stdout);
}

test('diagnostic has a read-only method allowlist and cannot consume or change pending updates', async () => {
  const text = await readFile(script, 'utf8');
  assert.match(text, /\$Method -notin @\('getMe', 'getWebhookInfo', 'getChat', 'getChatMember'\)/);
  assert.doesNotMatch(text, /setWebhook|deleteWebhook|getUpdates|drop_pending_updates|sendMessage/);
  assert.match(text, /-MaximumRedirection 0/);
  assert.match(text, /SecureString/);
  assert.match(text, /\$env:TELEGRAM_BOT_TOKEN/);
});

test('PowerShell diagnostic inspects metadata and own membership while redacting all secrets and descriptions', { skip: !windows }, async () => {
  const { report, methods, endpointCalls } = await diagnose('healthy');
  assert.deepEqual(methods, ['getMe', 'getWebhookInfo', 'getChat', 'getChatMember']);
  assert.equal(endpointCalls, 2);
  assert.equal(report.read_only, true);
  assert.equal(report.anonymous_endpoint.direct_health, true);
  assert.equal(report.telegram.getMe.can_read_all_group_messages, false);
  assert.equal(report.telegram.membership.status, 'member');
  assert.equal(report.telegram.group.can_send_messages, true);
  assert.equal(report.telegram.getWebhookInfo.pending_update_count, 7);
  assert.match(report.telegram.getWebhookInfo.registered_url, /\?\[REDACTED\]$/);
  assert.match(report.telegram.getWebhookInfo.last_error_message, /permission_or_protection.*redacted/);
  assert.match(report.telegram.getWebhookInfo.last_error_date, /^2026-/);
});

for (const [scenario, category] of [['redirect', 'redirect'], ['protected', 'unexpected_response_or_protection'],
  ['html', 'unexpected_response_or_protection'], ['timeout', 'timeout']]) {
  test(`PowerShell diagnostic does not accept ${scenario} as direct webhook access`, { skip: !windows }, async () => {
    const { report } = await diagnose(scenario);
    assert.equal(report.anonymous_endpoint.direct_health, false);
    assert.equal(report.anonymous_endpoint.category, category);
  });
}

test('PowerShell diagnostic skips Telegram without credentials', { skip: !windows }, async () => {
  const { report, methods } = await diagnose('no-token');
  assert.deepEqual(methods, []);
  assert.equal(report.telegram, 'skipped_without_credentials');
});

test('PowerShell diagnostic sanitizes denied credentials and does not request membership', { skip: !windows }, async () => {
  const { report, methods } = await diagnose('denied');
  assert.deepEqual(methods, ['getMe', 'getWebhookInfo']);
  assert.equal(report.telegram.getMe.category, 'permission_or_protection');
});

test('PowerShell diagnostic never probes an unexpected registered URL', { skip: !windows }, async () => {
  const { report, endpointCalls } = await diagnose('unexpected-url');
  assert.equal(endpointCalls, 1);
  assert.equal(report.telegram.getWebhookInfo.registered_url, '[unexpected URL redacted]');
});

test('PowerShell diagnostic rejects invalid endpoint before any network operation', { skip: !windows }, async () => {
  const { report, methods, endpointCalls } = await diagnose('invalid-input');
  assert.equal(report.diagnostic_error, 'invalid_input_or_unexpected_failure');
  assert.deepEqual(methods, []);
  assert.equal(endpointCalls, 0);
});
