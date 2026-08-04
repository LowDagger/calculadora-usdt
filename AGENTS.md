# Codex project guidance — Calculadora Banco → USDT

## Project

This repository is a production, static, mobile-first PWA for calculating
Banco → USDT operations using BCV, bank, and P2P rates.

- Production: https://calculadora-banco-usdt.vercel.app
- There is no build step, backend, database, authentication, or required
  environment variable.
- Keep the product simple, one-screen, and mobile-first.

## Non-negotiable behavior

- Do not change financial formulas unless the user explicitly requests it.
- Do not change DolarAPI Venezuela rate behavior unless the user explicitly
  requests it.
- Preserve sequential commission logic.
- Do not add bank limits back to the application.
- Do not add login, accounts, a backend, a database, or user tracking.
- Avoid new frameworks and unnecessary dependencies.
- Do not overbuild the requested change.

## Repository map

- `index.html`: application markup.
- `css/style.css`: all application styling.
- `js/api.js`: DolarAPI Venezuela rate retrieval and validation.
- `js/app.js`: application orchestration.
- `js/calculator.js`: financial calculations.
- `js/storage.js`: localStorage persistence.
- `js/ui.js`: DOM rendering and interactions.
- `js/utils.js`: shared helpers.
- `service-worker.js`: offline caching.

## Local development

Run from the repository root:

```powershell
npx.cmd serve -p 5500 .
```

Then open http://localhost:5500.

Python is an acceptable fallback:

```powershell
python -m http.server 5500
```

## Verification

For every behavior or UI change, perform the relevant checks below:

- Load the app without console errors.
- Confirm both rates load from `https://ve.dolarapi.com/v1/dolares` when the
  endpoint is available.
- Confirm BCV uses `promedio` from the USD entry whose normalized `fuente` is
  exactly `oficial`.
- Confirm P2P / paralelo uses `promedio` from the USD entry whose normalized
  `fuente` is exactly `paralelo`.
- Confirm malformed, incomplete, or failed responses preserve the currently
  displayed and saved `localStorage` rates and do not update the timestamp.
- Confirm BCV and P2P remain manually editable.
- Confirm automatic refresh replaces both rates only after the complete
  response passes validation.
- Exercise the 100, 500, and 1000 quick-amount controls.
- Confirm calculations update when the amount changes.
- Check the mobile layout at a narrow viewport.
- When service-worker assets change, verify its cache list/version remains
  consistent so users receive the updated files.

Run the automated tests and state which additional manual checks were performed
and which could not be performed.

## Git workflow

- Inspect `git status` before editing and preserve unrelated user changes.
- Do not work directly on `main` unless the user explicitly authorizes it.
- Use `feature/<name>` for features, `fix/<name>` for fixes, and
  `hotfix/<name>` for production bugs.
- Do not commit, push, merge, deploy, or modify production unless explicitly
  requested.
- Before finishing, review the diff and report all changed files.

## Editing style

- Match the existing plain HTML, CSS, and JavaScript architecture.
- Prefer focused, readable changes over abstractions.
- Preserve Spanish user-facing language unless the task requests otherwise.
- Do not edit `node_modules` or generated artifacts.
