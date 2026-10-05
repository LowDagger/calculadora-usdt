# Fix official-group Telegram routing and public calculation reliability

The official group no longer has topic 555, but the previous router still required
it through hardcoded and environment fallbacks. Required Telegram API failures
could also return successful delivery statuses. This change authorizes the whole
official group, preserves private access and rejects unapproved groups and
commands addressed to other bots.

`/calc 500 bdv` now delivers an ordinary public result; `/calc` and `/calcular`
guide users through bank and amount. Each initiating user owns their editable
panel; shared entry buttons create separate panels. Ordinary group messages are
ignored, and custom amounts require a validated reply to this bot's ForceReply.
Results include unchanged financial values with units and truthful rate sources
and dates. Private navigation and Stars remain available. No user messages are
automatically deleted.

Telegram transport classifies HTTP and body errors, treats unchanged edits as
success, limits plain-text fallback to formatting errors, replaces missing panels,
and bounds retries. Callback queries are acknowledged before provider work.
Ambiguous sends and partially completed flows are acknowledged without reporting
successful delivery or blindly replaying message creation. Sanitized logs and a
read-only PowerShell diagnostic make failures reviewable.

Validation: baseline 343 tests passed; final suite **357/357 passed**, including
**144 Telegram tests**, on Node v24.19.0/Windows. [Release QA](telegram-release.md)
records the limits. Simulations cover concurrent users,
ownership, repeated updates/callbacks, deleted/old messages, decimals, provider
outages, formatting/403/429/5xx/timeouts and eight-bank financial parity. The
PowerShell diagnostic runs against simulated APIs and redacts sensitive output.
Local static website HTTP smoke and focused PWA tests pass; production GET
health is directly accessible. Live Telegram, credentials-backed diagnostics,
Node 20 CI, rendered desktop/mobile/themes, browser console and actual PWA
installation/offline checks remain pending. Health and unit tests do not certify
Telegram end-to-end delivery.

No financial formulas, rate integrations, PWA interface, dependencies or CI
changed. Distributed deduplication is not provided: repeated creating updates
may duplicate results, and suppressed ambiguous retries may lose a response.
Remove obsolete topic variables, retain only the official group allowlist, and
verify the production function duration before release. Deployment, controlled
two-user acceptance and code/configuration rollback are detailed in the release
guide; pre-fix rollback code still depends on deleted topic 555.

The user authorized committing and pushing these reviewed changes to main on
2026-10-05 with the documented live checks pending. No manual deployment or
production reconfiguration was performed; pending Telegram updates were not
consumed or discarded.
