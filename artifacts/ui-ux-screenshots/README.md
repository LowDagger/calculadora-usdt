# CalcuFlow UI/UX screenshot package

Captured locally from the current repository on 2026-07-29. The application is a single-route static PWA; all screenshots represent `/` plus its dialogs, bottom sheets, forms, and UI states.

## Repository UI inventory

- Route: `/` — Banco → USDT calculator. No additional user-facing routes, navigation tabs, authenticated areas, tables, or back-office pages were found.
- Primary controls: USD amount field, 100/500/1000 quick amounts, bank/card selector, “Calcular desde Bs”, share, and settings.
- Financial display: BCV, bank, and P2P rates; BCV↔P2P spread; required bolívares; maximum BPay amount; final USDT; fees; estimated profit; ROI; and the detailed sequential-commission flow.
- Dialogs and sheets: bank selection, bank-profile management/editor, calculation breakdown and formulas, Bs helper, settings, changelog, and project support.
- External or integrated information: public TasaVE rates, Telegram community links, public support wallet addresses, Google-hosted fonts/icons, and local-only Vercel analytics script references. Vercel analytics has no visible application panel.
- Persisted local UI: rates/settings, selected bank profile, custom profiles, theme, changelog viewed state, and install-prompt dismissal.

## Screenshot manifest

| Filename | Page, route, or component | Viewport | UI state | Actions taken | Data | Limitations / notes |
|---|---|---:|---|---|---|---|
| `desktop/desktop-home-default.png` | `/` calculator | 1440×900 | Initial/default empty-rate state | Opened a fresh isolated origin, safely blocked the external rate request, then captured after the transient error message dismissed | Simulated unavailable integration; default local UI | Represents first use without saved rates |
| `desktop/desktop-calculator-completed.png` | `/` calculator | 1440×900 | Completed calculation, Banco de Venezuela Física, 500 USD | Opened a fresh origin and allowed automatic TasaVE loading | Real public TasaVE rates plus built-in bank preset | No financial operation was performed |
| `desktop/desktop-home-completed-full-page.png` | `/` complete document | 1440×1095 full page | Completed calculation plus Community/footer | Same as completed calculator; captured the natural document height | Real public TasaVE rates plus static app content | Full-page exception to the 900 px viewport height |
| `desktop/desktop-bank-selector-open.png` | Bank/card selector dialog | 1440×900 | Bank list open with grouped modalities and commissions | Clicked the Banco / tarjeta control | Built-in static bank presets | Shows all selectable banks without changing data |
| `desktop/desktop-calculator-bbva-selected.png` | `/` calculator | 1440×900 | Completed calculation using BBVA Provincial 0% | Opened bank selector and selected BBVA Provincial | Real public TasaVE rates plus built-in BBVA preset | Demonstrates the visible commission/result change |
| `desktop/desktop-bank-profiles-management.png` | Bank-profile management dialog | 1440×900 | Management list | Opened bank selector, then Administrar perfiles | Built-in static profiles and local selected state | No profile was created, edited, or deleted |
| `desktop/desktop-calculation-breakdown.png` | Calculation breakdown dialog | 1440×900 | Completed six-step flow, formulas collapsed | Clicked Ver desglose on a completed calculation | Real public TasaVE rates plus built-in BBVA preset | Includes sequential card → BPay commissions |
| `desktop/desktop-breakdown-formulas-expanded.png` | Breakdown formula disclosure | 1440×900 | Formulas expanded | Opened the breakdown and clicked Ver fórmulas | Real public TasaVE rates and calculated values | Read-only calculation explanation |
| `desktop/desktop-bs-helper-completed.png` | Calcular desde Bs dialog | 1440×900 | Valid preview for 400,000 Bs | Opened the Bs helper and entered `400000` | Simulated user amount with real public TasaVE rates | Preview only; “Usar este monto” was not submitted |
| `desktop/desktop-settings-panel.png` | Settings dialog | 1440×900 | Current theme, fees, profile, manual rates, and auto-refresh | Clicked the settings icon | Real public TasaVE values and local app settings | Contains no environment variables or credentials |
| `desktop/desktop-home-light-theme.png` | `/` calculator | 1440×900 | Completed calculation in light theme | Selected Claro in settings and closed the dialog | Real public TasaVE rates plus local theme state | Theme choice affected only the isolated local origin |
| `desktop/desktop-changelog-dialog.png` | Changelog dialog | 1440×900 | Current release notes | Clicked the unread Novedades announcement | Static application release content | Telegram URL is the public in-app community link |
| `desktop/desktop-support-dialog.png` | Support dialog | 1440×900 | Project support options | Clicked Apoyar el proyecto | Static public application content | Wallet addresses are already intentionally public in the application; no private payment data is shown |
| `mobile/mobile-home-default.png` | `/` calculator | 390×844 | Initial/default empty-rate state | Opened the isolated unavailable-data origin and waited for the transient error message to dismiss | Simulated unavailable integration; default local UI | No horizontal overflow |
| `mobile/mobile-calculator-completed.png` | `/` calculator | 390×844 | Completed calculation, Banco de Venezuela Física, 500 USD | Opened a fresh origin and allowed automatic TasaVE loading | Real public TasaVE rates plus built-in bank preset | Requested mobile completed-calculation state |
| `mobile/mobile-home-completed-full-page.png` | `/` complete document | 390×1070 full page | Completed calculation plus Community/footer | Same as mobile completed; captured the natural document height | Real public TasaVE rates plus static app content | Full-page exception to the 844 px viewport height |
| `mobile/mobile-bank-selector-open.png` | Bank/card bottom sheet | 390×844 | Selector open | Tapped Banco / tarjeta | Built-in static bank presets | Shows the responsive bottom-sheet treatment |
| `mobile/mobile-calculation-breakdown.png` | Breakdown bottom sheet | 390×844 | Completed six-step flow | Tapped Ver desglose | Real public TasaVE rates plus built-in bank preset | Formula disclosure remains visible but collapsed |
| `mobile/mobile-settings-panel.png` | Settings bottom sheet | 390×844 | Complete settings layout | Tapped the settings icon | Real public TasaVE values and local app settings | Responsive single-column panel |
| `mobile/mobile-bs-helper-completed.png` | Calcular desde Bs bottom sheet | 390×844 | Valid preview for 400,000 Bs | Opened the Bs helper and entered `400000` | Simulated user amount with real public TasaVE rates | Preview only; no financial action was submitted |
| `states/desktop-rates-loading.png` | `/` rates section | 1440×900 | Loading skeletons | Opened a capture-only local origin whose mocked rate response was delayed five seconds | Mocked rate response; capture-only server | No application source or production behavior was changed |
| `states/states-api-unavailable.png` | `/` calculator and error toast | 1440×900 | TasaVE unavailable with empty results | Opened a separate capture-only origin with external connections blocked | Simulated API failure | Shows the exact built-in fallback message; no production request was altered |
| `states/desktop-validation-error.png` | Main USD amount form | 1440×900 | Maximum-amount validation error | Entered `1000001` in the USD amount field | Simulated invalid user input with real public rates | Results correctly return to the empty state |
| `states/states-bank-profile-validation-error.png` | Custom bank-profile editor | 1440×900 | Required-name validation error | Opened profile management, chose Nuevo perfil personalizado, and submitted the empty form | Simulated invalid local form input | No profile was saved |

## State coverage

- Initial/default: desktop and mobile empty-rate views.
- Completed/success: desktop and mobile completed calculations using current public TasaVE data.
- Alternate selection: BBVA Provincial 0% compared with Banco de Venezuela Física 1.5%.
- Loading: deterministic skeleton state from a separate capture-only delayed endpoint.
- Empty/unavailable: rate and result placeholders with no saved fallback.
- Validation errors: oversized calculator amount and missing custom-profile name.
- API error: the built-in “No se pudo cargar TasaVE” toast.
- Responsive layouts: calculator, bank selector, breakdown, settings, Bs helper, and full page at 390×844.
- External-data content: TasaVE loaded/error states, Telegram changelog/community surfaces, and the public support panel.

## Verification

- All 24 PNG files were opened successfully as valid PNG images.
- All viewport captures are exactly 1440×900 or 390×844.
- Full-page captures preserve the requested widths and use natural heights: 1440×1095 and 390×1070.
- Contact-sheet review confirmed readable content, no blocked overlays, no horizontal overflow, and no unfinished loading outside the intentional loading-state screenshot.
- A fresh isolated browser load completed with zero console warnings or errors.
- The repository contains no API keys, authentication secrets, private URLs, environment variables, or credential files. The screenshots show only public app content and simulated/local input.
- Automated verification passed: 38/38 Node tests and JavaScript syntax checks for every file in `js/` plus `service-worker.js`.
- No application source, financial formula, TasaVE behavior, service-worker asset, or production data was modified.

## Limitations

- The PWA install prompt could not be captured because it depends on a browser-supplied `beforeinstallprompt` event or an iOS user agent; neither is exposed by the selected desktop automation environment. It was not forced by changing application code.
- The native share sheet was not captured because its appearance and available targets are operating-system/browser UI rather than application UI. Triggering external sharing was intentionally avoided.
- Browser tooltips based only on native `title` attributes are platform-dependent and were not forced.
- There is no authentication, production data-entry flow, table, or additional route to capture.
