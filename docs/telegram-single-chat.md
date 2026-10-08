# CalcuFlow V1: single public Telegram conversation

Prepared 2026-10-08 on `feature/telegram-single-chat`, based on `6eb2d316`.
No merge, deployment, webhook registration, production environment change or Redis provisioning was performed.

## Findings and uncertainty

The bot is in this V1 repository: `api/telegram.mjs` exports the Vercel webhook,
`api/telegram-app-handler.mjs` implements the conversation, and `api/telegram-ui.mjs`
provides menus and prompt references. It calls the existing `js/calculator.js` engine
and existing rate providers. There is no separate bot repository and no V2 work.
The linked Vercel project is `calculadora-usdt`; its local metadata says Node 24.x.

Confirmed in the previous checked-in code:

- The prior fix already removed authorization on deleted topic 555, but outgoing routing
  could still copy other `message_thread_id` values. A topic-free group must send none.
- Panels encoded an owner but had no durable session, revision, prompt identity or expiry.
  Old references could be reused indefinitely. Group text was already ignored outside commands/replies.
- There was no distributed update deduplication. The Vercel model requires shared metadata,
  not process memory. Required failures and ambiguous sends could return HTTP 200.
- Existing access restrictions are chat-based. There is no ordinary-member/admin/owner
  user allowlist in the active calculation handler. The official chat is `-1003824051698`.

Read-only production GET returned direct HTTP 200 and the expected webhook health JSON.
No Telegram bot token was available; local `.env.local` only exposed a Vercel OIDC variable name.
Vercel CLI credentials were rejected, so production variables and logs could not be read.
No `getMe`, `getChat`, `getChatMember` or `getWebhookInfo` was executed against live Telegram.
`calcuflowbot` matches repository configuration but its live identity remains unverified.
These code defects are confirmed; the cause of the current users' incident is not confirmed.
GitHub CLI credentials were invalid; the GitHub connector could read this repository with push permission.
The pre-existing untracked nested `calculadora-usdt/` checkout was preserved.

## Implementation and storage

A focused durable decorator wraps the existing conversation and financial engine.
All outgoing conversation operations omit topic IDs. Menus and results remain ordinary
public messages in the originating chat. Owner, chat, panel ID, button revision and
30-minute absolute expiry are verified before a mutation. Custom amounts require the
initiator's reply to the exact active bot prompt for that panel and bank. Choosing another
panel action, retrying invalid input, cancellation or consuming a prompt invalidates older
prompts. Private commands, numeric input, navigation and Stars remain supported.

Group members start with `/calcular` or `/calcular@calcuflowbot`; `/calc 500 bdv` remains
available. Group “Nuevo cálculo” buttons give a brief command instruction. Unrelated
messages, commands for other bots, edited messages and anonymous sender-chat messages
are ignored. Anonymous admins must send as their own user so ownership can be established.
Foreign owners get a brief callback notification; legacy or expired buttons instruct them
to start again. No messages are automatically deleted.

Approved new infrastructure: Redis REST, using native fetch, with no npm dependencies.
The adapter supports existing Upstash/Vercel KV REST credentials. Nothing was provisioned.
Redis contains temporary owner/chat/message/action metadata and delivery receipts;
raw updates, message text and custom financial amounts are not stored or logged.
A per-chat/user lease serializes a user's mutations while allowing different members
(and separate panels for one member) to calculate independently. Leases use atomic SET NX
and owner-checked Lua release. Redis must be durable, non-evicting and configured so reads
observe preceding writes; use one writable REST endpoint, not an eventually consistent replica.

Completed update IDs and operation receipts persist for 48 hours. Creating operations record
an uncertainty marker before dispatch; confirmed message IDs are journaled afterward. Retries
reuse confirmed receipts. Long `retry_after` values are stored as a not-before time. Permanent
creating errors are recorded and are not blindly sent again. One callback acknowledgement is
attempted after minimal owner/expiry metadata reads and before locks/provider work. Webhook POSTs require Telegram's secret header.

Limit: Telegram message creation and Redis receipt writes cannot be one atomic transaction.
A timeout/crash during creation or before its confirmed receipt is stored is ambiguous.
It returns HTTP 503, keeps the durable uncertainty marker, and does not resend that message.
There is no background worker and no claim of automatic recovery or exactly-once delivery.
An operator must reconcile such updates; the member can start a fresh calculation with a
new command. Never delete a pending receipt merely to force a retry without proving the
original message was not delivered. Likewise, fix permissions/configuration before issuing
new commands after a recorded permanent rejection. Monitor safe `telegram_durable_failure`
and `telegram_webhook_outcome` events. Do not dump Redis values or full Telegram updates in logs.

## Telegram settings for the owner

1. In the intended group's Edit/Manage settings, turn **Topics OFF**. Deleting topics alone
   does not verify this setting. `getChat.is_forum` must be false/absent for the shared conversation.
2. In @BotFather, `/setjoingroups` for the verified bot: Enable.
3. `/setprivacy`: Enable. Commands and replies to the bot's ForceReply prompts are sufficient.
   Telegram says changing Privacy Mode requires re-adding the bot; do this if that setting changes.
4. Give the bot permission to send messages. Administrator, topic management and message deletion
   permissions are not required. Ordinary members need permission to send their commands/replies.
5. `/setcommands` in the appropriate group/default scope: `calcular - Iniciar cálculo`,
   `tasas - Consultar tasas`, `ayuda - Ver ayuda`. Cancellation uses the Cancelar button. Do not mark calculation commands ephemeral/private to a recipient.
6. Verify `getMe.username` is `calcuflowbot` before telling members to use the addressed command.
   The setup helper now stops if the token belongs to another bot.

## Hosting environment variables (change only after release authorization)

| Name | Required action |
| --- | --- |
| `TELEGRAM_ALLOWED_THREAD_ID` | Remove. No replacement topic ID. |
| `TELEGRAM_ALLOWED_THREADS` | Remove. No replacement topic list. |
| `TELEGRAM_ALLOWED_CHAT_ID` | Set to `-1003824051698` for this official group. Retain other explicitly authorized chat IDs only if intended. This is a chat ID, never 555 or another topic ID. |
| `TELEGRAM_BOT_USERNAME` | `calcuflowbot`, after confirming it with live `getMe`. |
| `TELEGRAM_BOT_TOKEN` | Retain the V1 bot token, `[REDACTED]`. Verify identity; do not rotate merely for this change. |
| `TELEGRAM_WEBHOOK_SECRET` | New required random secret, 32-256 characters from A-Z/a-z/0-9/_/-. `[REDACTED]`. Match `setWebhook.secret_token`. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Writable durable Redis REST endpoint / secret `[REDACTED]`, unless using the existing KV pair below. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Supported alternative pair. Use one complete pair; Upstash names take precedence. Never use a read-only token. |
| `TELEGRAM_BOT_API_TEST_MODE` | Remove or set false in production. The isolated Telegram test API is only for a separate test bot/environment. |
| Existing rate/provider/payment variables | Preserve. No formula, fee, commission, provider or payment configuration change is required. |

No production values were fetched or modified. Redis and webhook-secret configuration are
mandatory before enabling this entrypoint: absent/unavailable durable storage or absent
webhook secret returns HTTP 503, never a process-memory fallback. Preview/test environments
must use a separate test bot and Redis database so they cannot consume production updates.
Verify the function duration accommodates the 45-second total processing budget plus cleanup
(at least 60 seconds); do not change CI or runtime settings as part of this patch.

## Webhook verification and authorized registration

Run the existing read-only diagnostic, entering the token securely:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\diagnose-telegram.ps1 -PromptForToken
```

Verify `getMe.expected_username`, group membership and send permissions, Topics disabled,
registered URL `https://calcuflow.live/api/telegram`, `allowed_updates` containing `message`
and `callback_query` (also `pre_checkout_query` for private Stars), pending update count and
recent error dates. Watch pending updates drain during the real two-member test; zero alone
is not delivery proof. Inspect sanitized Vercel function outcomes and correlate timestamps.
An anonymous GET is only health; verify authenticated webhook POSTs through real Telegram.
A forged/missing secret header must return 401 when the secret is configured.

After explicit merge/deployment/configuration authorization, set the same webhook secret
in hosting, then register with the prepared helper using SecureString parameters:

```powershell
$botTokenForSetup = Read-Host 'Bot token' -AsSecureString
$webhookSecretForSetup = Read-Host 'Webhook secret' -AsSecureString
.\scripts\setup-telegram-webhook.ps1 -BotToken $botTokenForSetup -WebhookSecret $webhookSecretForSetup
```

The helper verifies live username and GET health before registration, sets the secret header,
subscribes to `message`, `callback_query`, `pre_checkout_query` and keeps pending updates.
It is mutating and was not run during development. It can accept the existing Vercel bypass
secret securely if hosting protection requires it. Never paste tokens into URLs, reports,
commands saved in history, or PRs. Coordinate the secret/environment and webhook switch;
otherwise Telegram deliveries fail authentication. Old queued callbacks deliberately expire.

## Live acceptance with two real non-admin members (pending)

1. Confirm Topics OFF, Privacy Mode ON, writable bot membership and the live username.
2. Alice and Bob each send `/calcular@calcuflowbot` at nearly the same time. Both menus appear
   publicly in that group. Choose different banks and amounts; everyone sees both correct results.
3. Bob taps Alice's amount/change/cancel button: brief notification, no change to Alice's panel.
   Bob starts his own calculation with the command.
4. Both choose Otro monto and reply to their own exact prompt. Cross-user replies and standalone
   numbers do not change either panel. Invalid input produces one retry prompt; the earlier
   prompt then expires. Old pre-release buttons tell members to start again.
5. Cancel one calculation. Its old buttons and prompt cannot resume it. Let another session
   expire after 30 minutes; it gives the Spanish restart instruction.
6. Confirm `/calcular`, `/calcular@calcuflowbot`, direct `/calc 500 bdv`, `/tasas` and private
   calculations still work. Ordinary group chatter is ignored. Nobody's messages are deleted.
7. Restart/redeploy the same approved code with the same Redis and bot identity. A current
   unexpired panel still works. Replay a captured update only in an isolated test environment:
   one processed update produces one result. Do not replay private financial input in production logs.
8. Inspect outgoing API telemetry in a controlled test: no `message_thread_id`, no recipient-only
   calculation messages, no results delivered to a DM. Check rate-limit/error events and queue drain.

## Message ready for the group

> Para calcular, escribe /calcular@calcuflowbot y elige banco y monto. Para «Otro monto»,
> responde al mensaje del bot que te pide el valor. Cada persona controla su propio cálculo
> y todos vemos los resultados aquí. Si un botón venció, inicia otro con /calcular.

## Validation record

Baseline: 357/357 existing tests passed on Node 24.19.0 / Windows.
The new production-entrypoint suite uses fresh handlers with a shared simulated backend,
real transport helpers and the unchanged financial engine. Existing suites explicitly target
the underlying conversation/transport factory; they are not claims of durable end-to-end coverage.
Redis REST syntax, NX leases, TTL and owner-checked Lua release are checked with simulated REST.
No real Redis service was provisioned or exercised. Live Telegram, production settings/logs,
real serverless Redis durability/latency and two-member acceptance remain pending.
Final full-suite count and reviewed files are recorded in the PR description.

Sources: [Telegram Privacy Mode](https://core.telegram.org/bots/features#privacy-mode),
[Telegram Bot API](https://core.telegram.org/bots/api#setwebhook),
[Upstash Redis REST](https://upstash.com/docs/redis/features/restapi).
