> Historical previous release. Current single-chat implementation, configuration and pending live acceptance: [telegram-single-chat.md](telegram-single-chat.md). The current webhook requires Redis REST and a webhook secret; old deduplication/failure statements below describe the prior release.

# CalcuFlow Telegram release review

Prepared locally on `feature/telegram-group-reliability`, 2026-10-02.
Base: `e0571103a870b87d00ee42d6c53255c6394bf5c8` (HEAD and origin/main at review).
The QA below was recorded before publication. On 2026-10-05 the user authorized
committing and pushing these changes to main with the documented live checks
still pending. Deployment IDs, production settings, BotFather settings and group
permissions have not been inspected with credentials. Fill those records before
production validation; no manual deployment or webhook mutation was performed.

## Confirmed defects and resulting behavior

The previous code required topic 555 in the official group even with empty topic
variables, accepted commands targeting other bots, swallowed required Telegram
delivery failures, and used text fallback for unrelated HTTP 400 errors. These
are confirmed code defects, not proof of the cause of every production report.

The authorized group now works without topics and in General; topic variables
cannot restrict it again. Private chats remain available and other groups stay
unauthorized. Public calculations use ordinary messages, with a separate owned
panel for each initiation. Group conversation is ignored. Custom amounts use
explicit replies to this bot's owner-specific ForceReply reference. Users'
messages are never deleted. Stars remains a private flow.

Telegram failures are classified using HTTP and response body. Unchanged edits
succeed; formatting fallback is limited to entity errors. Missing panels/replies
recover after explicit rejection. Callback acknowledgement precedes provider work.
Retries are bounded; ambiguous creating requests are not resent. A required
failure never returns a successful `*_sent` outcome. HTTP 200 can deliberately
acknowledge failed/ambiguous/partial delivery to prevent uncontrolled replay;
only explicit 429 before any required completion permits HTTP 503/redelivery.

Formulas, sequential commissions, rounding, margins, bank profiles, providers,
PWA interface and service worker are unchanged. Rate source/date presentation
uses the actual record, including DolarAPI fallback labels.
[Representative before/after messages](telegram-public-flow.md) use fixed test data.

## Actual QA and outstanding evidence

| Check | Result / evidence |
|---|---|
| Baseline, `node --test tests/*.test.mjs` | 343 passed before this release review |
| Final full suite, same command | **357/357 passed, zero failures/skips**; Node v24.19.0 on Windows; 144/144 Telegram tests also passed |
| Added public-flow regressions | 16/16 passed: two interleaved users, ownership, General/private, old buttons, deleted messages, invalid/custom decimal inputs and replies to another bot |
| Duplicate updates/callbacks | Simulated concurrent repeated owned callbacks edit one panel; repeated commands and shared entry clicks create duplicates as documented |
| Provider failure | Simulated primary fallback and complete outage; no fabricated calculation on total failure |
| Financial parity | Bot command output compared with shared engine for 8 banks × 100, 375.50, 500, 1000 USD; original engine tests cover rounding and sequential fees |
| Telegram failures | Simulated HTTP/body failure, formatting, unchanged edit, inaccessible panels/replies/topics, 403, 429/retry_after, 5xx, network/body/request timeout, partial completion and acknowledgement failure |
| Diagnostic | 10/10 tests, including actual PowerShell 7 execution against simulated APIs; secrets, names, amounts, arbitrary descriptions and URL queries omitted/redacted |
| Public production GET | Read-only diagnostic: direct HTTP 200 and expected webhook health JSON, no redirects, no token. Initial restricted-network attempt failed; unrestricted read-only retry passed |
| Local website HTTP smoke | Shell, CSS, app JS, manifest and service worker return HTTP 200; all 30 precache assets also return HTTP 200 from loopback static server |
| Website/PWA focused tests | 56/56 passed: calculator, rate client, install behavior, cache policy and UI contracts; simulations/source assertions, not rendered browser QA |
| Desktop/mobile rendering | **Not performed**: browser connection returned no available browsers |
| Light/dark/system rendering, browser console | **Not performed** for the same reason; source inspected, no assertion of visual correctness or zero console errors |
| PWA installation/offline on real browser/device | **Not performed**; service-worker/install simulations passed |
| Node 20 CI | **Not executed here**; existing CI runs Node 20. Windows-only diagnostic execution tests skip on Linux; its method guardrail test still runs |
| Live Telegram | **Not performed**: no token or Telegram client session available; getMe/getWebhookInfo/membership checks skipped |
| Production provider availability/logs/function settings | **Not verified**; provider selection and failure behavior inspected and simulated |

Unit tests, health HTTP 200, and a zero pending queue do not establish Telegram
end-to-end success. Missing permission, privacy, webhook, timeout, rate-limit and
provider evidence remains hypotheses until diagnostic/live checks establish it.

## Read-only diagnostic

Run from the repository root in PowerShell 7:

```powershell
./scripts/diagnose-telegram.ps1
# With credentials, entered securely (no token literal or command history):
./scripts/diagnose-telegram.ps1 -PromptForToken
# Alternatively it reads an already-provided TELEGRAM_BOT_TOKEN environment variable.
```

It only permits `getMe`, `getWebhookInfo`, `getChat`, `getChatMember`, plus GET
health probes with redirect following disabled. It never changes webhooks,
consumes/polls updates, sends messages or discards pending delivery. Calls have
10-second bounds. It validates endpoint host/path before any request. The
registered URL is probed only when its base matches the selected endpoint;
credentials/bypass queries stay in memory and are redacted in output.

Inspect `anonymous_endpoint.direct_health`, registered URL match, pending count,
UTC last error date, last error category, bot identity match, join/privacy flags,
group forum/default send permissions and bot membership/restrictions. A normal
member may omit permission flags: missing is unknown, not permission denied.
GET success does not prove POST delivery, Telegram-origin access, or firewall
compatibility. A historical last error may remain after recovery; compare its
timestamp with new live tests. Descriptions are classified rather than printed;
if insufficient, an authorized owner can inspect the original privately without
copying credentials/user content into the PR. Inspect JSON results, not just the
PowerShell exit code. Do not enable verbose/transcript logging of secret input.

`scripts/setup-telegram-webhook.ps1` is a separate **mutation** tool. It was
reviewed, not run or changed. Its current `drop_pending_updates = false` preserves
the queue. Its Preview option is not permission to move the production bot there.

## Vercel configuration review

Capture existing values/scopes securely before making later authorized changes.
Do not paste tokens, bypass secrets or EDGE_CONFIG URLs into git/PR/logs.

| Setting | Production action | Rollback record |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Retain current production token; never put it in Preview/Development | Secure credential reference and scope, not value in report |
| `TELEGRAM_BOT_USERNAME` | Retain/set `calcuflowbot` without `@`; verify via getMe | Previous value/scope |
| `TELEGRAM_ALLOWED_CHAT_ID` | Set to `-1003824051698` for this release; remove any unapproved extra IDs. Built-in official group and private chats remain authorized even if absent | Prior allowlist; do not broaden on rollback without authorization |
| `TELEGRAM_ALLOWED_THREAD_ID` | Remove; ignored by new code | Prior presence/value privately, with legacy-code caveat below |
| `TELEGRAM_ALLOWED_THREADS` | Remove; ignored by new code | Same |
| `TELEGRAM_BOT_API_TEST_MODE` | Remove or `false`; production must use production API | Prior presence/value |
| `TELEGRAM_PAYMENT_SUPPORT_URL` | Retain existing valid private payment-support contact | Prior value/scope; test /paysupport |
| `EDGE_CONFIG` | Retain unchanged if configured; no rate/config provider migration | Existing secure reference/scope |
| Function maximum duration | Verify `/api/telegram` gets at least 30 seconds for its 25-second work budget; change only if required and authorized | Previous duration/runtime/project settings |
| Protection/firewall/domain/bypass | Retain working direct canonical route. If Telegram is blocked, review a narrowly scoped correction before release; keep existing bypass secret securely if used | Prior protection settings and exact registered URL privately |

No new variables or credentials are required. No rate-provider keys or selections
are introduced. Preview tests, if later authorized, use a separate test bot/token
and explicitly authorized test group. Never redirect production delivery there.

## Minimum Telegram configuration

BotFather: allow joining groups (`/setjoingroups` enabled), retain Privacy Mode
(`/setprivacy` enabled), and register ordinary, non-ephemeral commands:

```text
calc - Calcular Banco a USDT
calcular - Elegir banco y monto
tasas - Ver tasas de referencia
ayuda - Ver ejemplos de uso
privado - Abrir el bot en privado
```

Retain private `/start`, `/apoyar`, `/terms`, `/paysupport` entries and existing
payment support. Inspect command scopes/languages for old topic instructions or
ephemeral flags; the main commands should produce public interactions.

The bot needs membership and permission to send ordinary text in the official
group. No administrator, message-deletion, member-management or topic-management
rights are needed for the calculator. If forum mode remains, General must be
open and usable by members; group administrators can manage that manually.
Privacy Mode does not guarantee delivery of every unaddressed command: use
`/calc@calcuflowbot` when another bot was last active. Explicit targeting and
ForceReply are the supported reliable path. See [Telegram Privacy Mode](https://core.telegram.org/bots/features#privacy-mode)
and [ForceReply](https://core.telegram.org/bots/api#forcereply).

## Deployment procedure — execute only after release approval

1. Complete the pending browser/device checks below and obtain Node 20 CI results.
   Review the complete diff and commit only reviewed files after authorization;
   exclude the pre-existing untracked `calculadora-usdt/` nested checkout and local
   logs/secrets. Record the final release SHA.
2. In the existing CalcuFlow Vercel project, record the current production deployment
   ID/URL/SHA, variable scopes, duration, protection settings, BotFather commands
   and membership. Securely retain the exact webhook URL/bypass and existing
   subscriptions/options. Check the rollback target: pre-fix code still requires
   deleted topic 555 and is not a healthy group fallback.
3. Apply only the approved Production configuration table changes. Verify the
   existing project/account using the Vercel dashboard; use a clean checkout of
   the reviewed release SHA when deploying. Do not upload the nested checkout,
   .env files or unrelated user work. Use the existing project toolchain, no npm
   build command. No PWA asset/cache-version change is required for this bot release.
4. With the existing authenticated Vercel CLI linked to that exact project, stage
   the Production build without assigning the canonical domain:

   ```powershell
   vercel deploy --prod --skip-domain
   ```

   Record the resulting deployment URL/ID. Inspect its status, runtime, function
   duration and target environment. Smoke-test its website and GET health without
   submitting bot commands or registering the production token against it.
   Staging retains the existing production webhook/domain until promotion.
5. Promote the inspected Production deployment at the agreed release time:

   ```powershell
   vercel promote <reviewed-production-deployment-url>
   vercel promote status
   ./scripts/diagnose-telegram.ps1 -PromptForToken
   ```

   Verify canonical domain points to that release and is directly accessible.
   Check registered URL equals the canonical `/api/telegram` route, with any
   previously approved bypass preserved. Normally **no webhook reconfiguration
   is necessary** because the canonical URL is unchanged.
6. If webhook registration/options are actually wrong, stop for specific approval
   of the configuration change. After approval, the separate setup script can
   set the canonical URL using secure token input and, only if needed, secure
   Vercel bypass input:

   ```powershell
   $releaseBotToken = Read-Host 'Production token' -AsSecureString
   ./scripts/setup-telegram-webhook.ps1 -BotToken $releaseBotToken -WebhookUrl 'https://calcuflow.live/api/telegram'
   $releaseBotToken = $null
   ```

   This exact command is for an unprotected canonical endpoint. If a bypass is
   required, also pass `-VercelBypassSecret` from `Read-Host -AsSecureString`;
   never omit an existing required bypass accidentally. Compare allowed_updates
   before using the script: it sets message, edited_message, callback_query and
   pre_checkout_query. Preserve any separately required options rather than
   blindly overwriting them. Always keep `drop_pending_updates=false`; never call
   deleteWebhook/getUpdates or flush the queue during deployment.
7. Execute the controlled two-user validation below, then inspect sanitized
   Vercel operation/outcome/duration/category logs and diagnostic again. Record
   release ID, timestamps, client versions and pass/fail without names, tokens,
   complete message bodies or real financial amounts. Watch for 15 minutes after
   the last test. Do not equate zero pending updates with acceptance.

The staging/promotion commands follow [Vercel deploy](https://vercel.com/docs/cli/deploy)
and [promotion](https://vercel.com/docs/deployments/promoting-a-deployment).
Duration is checked in [Settings → Functions](https://vercel.com/docs/functions/configuring-functions/duration).

## Controlled live acceptance — two real users, pending

Use consenting testers A and B, synthetic amounts, a low-traffic window and
ordinary member permissions. Do not induce production 429/5xx/provider failures
or flood repeated updates; those fault cases are simulated. Record evidence of
successful visible results and ownership enforcement from both accounts.

| Step | Action | Acceptance |
|---|---|---|
| 1 | A in private: /calc 500 bdv; B: /calcular, choose BNC then 100 | Both get expected complete results; private navigation works |
| 2 | A in official group: /calc@calcuflowbot 500 bdv | B also sees ordinary public result with all values, source/date and links |
| 3 | B presses Nuevo cálculo on A's result; selects BNC | B gets a separate owned panel; A's result is intact |
| 4 | A attempts B's bank/amount buttons; B attempts A's | Neither overwrites the other's panel; alert explains own /calc |
| 5 | Interleave A changing own amount to 1000 and B completing 500 | Each own panel updates; labels remain understandable |
| 6 | B chooses Otro monto and replies 375,50; A separately uses 375.50 | ForceReply targets initiator; valid same-bank results; no user messages deleted |
| 7 | A tries replying to B's prompt; send standalone number/chat text | Ignored; no spurious calculation or provider work |
| 8 | /tasas@calcuflowbot, /ayuda@calcuflowbot, /calc@anotherbot 500 bdv | Public truthful rates/help; other-bot command ignored if Telegram delivers it |
| 9 | Reply a number to a different bot | No CalcuFlow calculation; do not assume ignored-input logs prove delivery in Privacy Mode |
| 10 | Repeat an owned preset button twice, spaced ≥2 seconds | Same owned panel, no extra result panel; old query expiry never breaks a delivered result |
| 11 | Group admin manually deletes a test panel; initiator uses an already open old button if client permits | New owned panel recovers, or clear /calc restart if client no longer exposes action |
| 12 | Delete a test amount prompt; initiate /calc again; submit invalid amount in new prompt | Restart works; invalid reply retains bank/owner guidance; bot deletes nothing |
| 13 | In General if forum mode remains, repeat steps 2–6 | No deleted-topic ID or topic redirect; public reply visible in General |
| 14 | Existing unauthorized group, only if bot is already present and testers have permission: command/callback | No calculations/messages; callback may explain unauthorized access. Do not join new groups just to test |
| 15 | Private /apoyar, /terms, /paysupport | Navigation retained; no actual Stars payment required |

Do not resend raw production webhook updates to demonstrate deduplication. The
local replay tests already establish its limitation. Verify group and private
website links; compare results using **the same captured rates** in the shared
engine/PWA, since later live rates can legitimately differ.

Browser acceptance still required: desktop 1440×900; mobile 320×568, 360×800 and
390×844; no horizontal overflow; inputs/100/500/1000 controls; settings and
modals; light/dark/system including OS preference changes; browser console and
network failures; existing BCV/P2P editable rates and provider metadata; PWA
install affordance, standalone launch and offline shell; `/api/` excluded from
SW cache. Use Vercel dev or an authorized deployment for API smoke: the static
loopback HTTP server does not execute serverless routes.

## Rollback — execute only under an approved release/incident procedure

Rollback triggers: sustained failed delivery, ownership bypass, inaccessible
group/private flow, misleading financial output, or required live checks fail.
Do not retry a whole interaction to diagnose an ambiguous/partial send.

1. Record the failing release ID and sanitized category/time; stop further tester
   actions. Confirm the recorded rollback target and its known behavior.
2. Point production to the retained target without rebuilding:

   ```powershell
   vercel rollback <recorded-previous-production-deployment-url-or-id>
   vercel rollback status
   ```

   Plan limits can restrict available targets; verify availability before release.
   Keep the canonical webhook URL active and pending updates untouched.
3. Restore approved project configuration from its secure snapshot: variable
   values **and scopes**, function duration/runtime, protection/bypass settings,
   and any BotFather commands/privacy/group permission changes. Code rollback
   alone does not restore those settings. Existing deployment variables belong
   to that deployment; project variable edits affect later deployments. If a
   corrected environment requires rebuilding, redeploy the recorded source SHA
   in the existing project with the restored configuration, verify, then promote.
4. Topic-specific caveat: rolling back to pre-fix code restores the hardcoded 555
   requirement even if both topic variables stay removed. Restoring old topic
   values cannot make a deleted topic usable. Prefer a separately tested artifact
   retaining the reliability fix if one is available; otherwise full rollback
   restores the known private flow while the group needs a reviewed forward fix.
   Do not recreate deleted topics, expand group authorization or claim group
   recovery. No compatible intermediate deployment has been prepared here.
5. Webhook should be unchanged. If an approved release changed registration,
   restore the exact saved canonical URL/options/bypass through a separately
   reviewed configuration operation with `drop_pending_updates=false`. Never
   restore a Preview/local URL with the production token; do not use the setup
   defaults if prior subscriptions/options differ.
6. Repeat read-only diagnostics, private and two-user group validation as supported
   by the target code, and website health. Check visible delivery and logs, not
   only queue depth. Document any remaining old-topic limitation. Fix code on a
   feature branch and repeat review; do not reset/discard the user's workspace.

See [Vercel rollback](https://vercel.com/docs/deployments/rollback-production-deployment)
and [rollback configuration behavior](https://vercel.com/docs/instant-rollback).

## Remaining delivery limitations

No distributed deduplication or per-user durable state store is added. References
carry bank/panel/owner across serverless invocations. Repeated creating commands,
shared entry clicks, edited commands, or a crash after send and before webhook
acknowledgement can duplicate messages. Old missing-panel callbacks can create
multiple replacements if replayed. Repeated owned edits are normally no-ops,
but concurrent different actions by the same owner can finish out of order.
Ambiguous sends are acknowledged to avoid blind duplication and can be lost.
Long 429 is redelivered only before required completion; timing remains Telegram's
responsibility. If a custom panel updates but its prompt fails, the user must
retry Otro monto or /calc; whole-update replay is deliberately suppressed.

## Changed files

- `api/telegram.mjs`, `api/telegram-app-handler.mjs`, `api/telegram-ui.mjs`, `api/telegram-formatter.mjs`
- `tests/telegram-bot.test.mjs`, `tests/telegram-bot-reliability.test.mjs`, `tests/telegram-bot-ux-stars.test.mjs`, `tests/telegram-topic-routing-incident.test.mjs`
- `tests/telegram-group-reliability.test.mjs`, `tests/telegram-public-flow.test.mjs`
- `scripts/diagnose-telegram.ps1`, `tests/diagnose-telegram.test.mjs`, `tests/fixtures/diagnose-telegram-harness.ps1`
- `README.md`, `docs/telegram-public-flow.md`, `docs/telegram-release.md`, `docs/telegram-pr-description.md`

Pre-existing untracked nested `calculadora-usdt/` is preserved and excluded.
No CI, financial-engine/provider, website or production-configuration edits.
