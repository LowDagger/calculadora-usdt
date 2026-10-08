# Fix V1 Telegram calculations in one public group conversation

The previous release still propagated some topic IDs and had no durable session expiry
or update deduplication. This change keeps the existing calculation flow and engine,
while omitting all outgoing topic IDs and validating each panel's chat, initiating user,
revision, expiry and exact input prompt across serverless invocations.

- All ordinary members of the authorized group can start with `/calcular@calcuflowbot`.
  Menus, prompts and results remain public in the same chat. Group conversation is ignored.
- Only the initiator can use a panel's buttons or answer its active prompt. Cancelled,
  consumed, expired and pre-release controls give a concise Spanish restart instruction.
- Redis REST provides metadata, leases, 48-hour update deduplication and operation receipts
  without npm dependencies. Native fetch reuses the existing transport. The infrastructure
  integration was explicitly approved; Redis was not provisioned.
- Telegram POSTs require a webhook secret. One callback answer occurs before locks/provider
  work. Failed processing returns HTTP 503. Rate-limit receipts respect retry_after;
  permanent creates are not retried blindly. Ambiguous creates require reconciliation and
  are not sent twice. There is no background worker or exactly-once-delivery claim.
- Private calculations, navigation and Stars remain supported. Financial formulas,
  sequential commissions, bank fees, business rules, rate providers, website and CI are unchanged.

Validation: baseline **357/357**, final **373/373** on Node 24.19.0 / Windows, plus
`git diff --check`. Sixteen new tests exercise the production entrypoint using fresh
handlers and shared simulated storage, including two ordinary members, two panels for one
member, prompt/owner/revision checks, cancellation, expiry, duplicates, restart recovery,
callback acknowledgement, permanent errors, 429, ambiguity and private Stars. Existing
financial/transport suites remain intact and explicitly test the underlying factory.
Redis REST commands and Lua lease release were simulated; no real Redis service was tested.
Read-only production GET health returned HTTP 200.

**Draft: pending live validation and configuration.** No Telegram token was available and
Vercel credentials were invalid. Live username, Topics/Privacy settings, registered webhook,
production environment variables, logs and real two-member acceptance remain unverified.
Confirmed code defects do not establish the root cause of the current production incident.

Before an authorized release, configure Redis REST and `TELEGRAM_WEBHOOK_SECRET`, remove
`TELEGRAM_ALLOWED_THREAD_ID` / `TELEGRAM_ALLOWED_THREADS`, retain the intended chat allowlist,
verify bot identity, and register the authenticated webhook. Do not merge/deploy without
explicit authorization. No production configuration or webhook was changed.
The complete owner settings, exact environment table, secure webhook verification commands,
live acceptance checklist and Spanish member message are in
[docs/telegram-single-chat.md](docs/telegram-single-chat.md).

Changed files:
`api/telegram.mjs`, `api/telegram-app-handler.mjs`, `api/telegram-session-handler.mjs`,
`api/telegram-store.mjs`; `scripts/diagnose-telegram.ps1`, `scripts/setup-telegram-webhook.ps1`;
`tests/telegram-single-chat.test.mjs`, `tests/setup-telegram-webhook.test.mjs`,
`tests/telegram-bot.test.mjs`, `tests/telegram-bot-reliability.test.mjs`,
`tests/telegram-bot-ux-stars.test.mjs`, `tests/telegram-group-reliability.test.mjs`,
`tests/telegram-public-flow.test.mjs`, `tests/telegram-topic-routing-incident.test.mjs`;
`docs/telegram-single-chat.md`, `docs/telegram-pr-description.md`,
`docs/telegram-release.md`, `docs/telegram-public-flow.md`.
The pre-existing nested untracked `calculadora-usdt/` checkout is excluded.
