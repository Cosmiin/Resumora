# Second design export · receipt and changes

Received 2026-10-25 from `C:\Users\mcosm\Downloads\CVizat Design System (2).zip` (read at `/mnt/c/Users/mcosm/Downloads/CVizat Design System (2).zip`). The [committed archive](CVizat%20Design%20System%20%282%29.zip) is the current supplied design reference. Nothing in this receipt approves product scope or implements a feature.

| Export | Archive bytes | Entries | Uncompressed bytes | SHA-256 |
|---|---:|---:|---:|---|
| [Original](CVizat%20Design%20System.zip), received 2026-10-24 | 442,952 | 168 | 784,129 | `9d8fe5b8fde4272a2bf96c73997d61a7938b2b24a424e5c190880e0423745546` |
| [Second](CVizat%20Design%20System%20%282%29.zip), received 2026-10-25 | 599,870 | 191 | 1,265,489 | `fea985501ccb60f09acfda0fa7295e9c9bc6b3cf125e70e38599083e35832701` |

The original archive and [source/](source/) remain intact and recoverable. The second archive supersedes the first as a reference, without overwriting that extracted snapshot. No second extracted tree is committed: 160 members are unchanged, and the ZIP already preserves every new file, generated bundle, thumbnail and screenshot. All member paths below are **inside the second ZIP**, not paths in `source/`.

The [inventory](update-2.manifest.json) records all 191 members in archive order (zero-based), exact names, sizes, compressed sizes, raw ZIP timestamp tuples, CRC-32, SHA-256 and mode metadata. Existing members also carry their previous SHA-256 and order. ZIP timestamps are export metadata without a timezone, not receipt dates. The comparison lists every added/changed/removed name: **23 added, 8 changed, 160 unchanged, 0 removed**.

## Meaningful changes

### Foundations, components and copy

All `tokens/*.css`, `styles.css`, existing brand assets, guidelines, `guidelines/copy/strings.json`, component `.d.ts` interfaces and prompt files are byte-identical. There is no new palette, font, spacing scale, logo, localization catalogue or component API. The sole changed component source is `components/match/MatchVerdict.jsx`: its fixed two-column grid becomes wrapping flex, with `20px 28px` gaps, container-relative clamped padding and a `flex: 1 1 260px` text block. ScoreRing stays size 128; the scoring inputs are unchanged.

New screens introduce inline English copy, including five qualitative Base checks, explicit truth confirmation, unknown-date handling, skip/unknown enrichment, job-only edits, Base promotion, sent attestation and recovery messages. They do not wire the unchanged RO/EN catalogue into localized screens. The synthetic `appdata.js` adds Mara's Base fields, three version examples, four enrichment questions, eight requirements, four applications and a fixed LinkedIn comparison; these are examples rather than canonical contracts or user data.

### Added reference files

Every path in this table except the screenshot is under `ui_kits/web-app/`.

| Exact files | Added design material |
|---|---|
| `onboarding.html`, `OnbShared.jsx`, `OnbStart.jsx`, `OnbImport.jsx`, `OnbReview.jsx`, `OnbApp.jsx` | Welcome → account → verify → search goals → import → reading → review → ready; upload/manual paths, scanned/failure controls, per-section confirmation, unknown month and ambiguous-skill questions, live HTML preview and truth acknowledgment. |
| `app.html`, `AppShell.jsx`, `routes.js`, `appdata.js` | Hash-route shell, screen IDs, switchable specimen states, notes/rules, synthetic data, first/returning Home, mobile tabs and job-flow headers. |
| `ScrBase.jsx`, `ScrEnrich.jsx` | Base editor, five-check review, unsaved/conflict examples, version history/restore and question → wording review → confirmation → destination examples. |
| `ScrJobs.jsx`, `ScrEditor.jsx` | Paste/link/manual/extension capture examples, blocked/failed capture, requirements correction, missing Base state, job editor, template/download, failed export and plan-gate states. |
| `ScrApps.jsx`, `ScrAccount.jsx`, `ScrSystem.jsx` | Application search/filter/empty/detail/sent examples, pasted LinkedIn comparison, plans/checkout/account/cancel states; login, reset, expired link, signed out, 404/500/offline/maintenance examples. |
| `journeys.html`, `Journeys.jsx` | Nine-journey guide A–I with goals, done conditions, stage links, recovery paths, rules and screen index, driven by `routes.js`. |
| `mobile.html`, `Mobile.jsx`, `ios-frame.jsx` | Board of 20 embedded phone examples: 4 onboarding, 6 everyday, 5 job-flow and 5 account/sign-in/system; 760px mobile query and five bottom-tab destinations (Home, Base CV, Improve, Applications, Account). |
| `screenshots/mobile-row.jpg` | New supplied screenshot, retained only in ZIP; no screenshot or browser rendering was generated during intake. |

The registry adds G (applications), H (sign-in/recovery) and I (system failures) alongside A–F. It labels sign-in examples AUTH01–AUTH05 and system examples SYS01–SYS04. These are export labels; the repository's canonical journey and screen specifications retain authority.

### All eight changed files

| Member | Exact change |
|---|---|
| `components/match/MatchVerdict.jsx` | Wrapping flex, clamped padding and flexible text block as described above. |
| `ui_kits/web-app/Home.jsx` | Adds `onJob`, `onOpen`, `onBase`, `onImprove` callbacks; wires the Base/action cards; changes two grids to auto-fit `minmax(min(100%,320px),1fr)` and hero padding to `clamp(22px,4cqi,38px)`. |
| `ui_kits/web-app/Improve.jsx` | Two fixed equal columns become auto-fit `minmax(min(100%,420px),1fr)`; adds `width:100%`. Approval behavior is unchanged. |
| `ui_kits/web-app/MatchReport.jsx` | Main grid with fixed 300px sidebar becomes wrapping flex; main `flex:999 1 480px`, sidebar `flex:1 1 280px`, outer `width:100%`. Scores, copy and eligibility dialog remain unchanged. |
| `_ds_manifest.json` | Only `cards` changes: four 1440×900 entries for `app.html`, `journeys.html`, `mobile.html`, `onboarding.html`. Namespace, components, tokens and other fields are unchanged. |
| `_ds_bundle.js` | Updated export bundle includes the new kit modules, changed layout source and source-hash metadata. Namespace remains `CVizatDesignSystem_0f8e2e`; the readme namespace discrepancy persists. Supplied generated code is retained, not rebuilt or executed. |
| `readme.md` | Adds five UI-kit bullets covering onboarding, journeys, mobile, system/sign-in and routed app screens. |
| `github.md` | Last-sync text changes from `2026-10-24T13:42:00Z` to `2026-10-25T12:53:33Z`; adds onboarding/journey coverage and three mapping rows for journey, app and onboarding references. Historical repository URLs remain supplied text, not verified sync evidence. |

## Limits and owner review before implementation

The new material fills earlier **reference coverage** gaps for A/B/F, application tracking and recovery. It does not close implementation gaps in the [adoption guide](../../../docs/frontend/design-system-adoption.md). Static inspection found:

- `OnbReading` stages progress with timers and uses example review data; `ScrJobs.jsx` navigates to requirements after 1,300ms. These are not file extraction or URL/browser-capture integrations.
- `ScrEditor.jsx` simulates export success/failure after 1,300ms; `ScrAccount.jsx` simulates active payment after 1,500ms. No PDF/readability or provider-confirmed entitlement is established.
- `ScrSystem.jsx` login validates local input then navigates Home; password reset changes local state. Email sending, session restoration, cross-device logout and offline persistence are presented as copy/states, not verified behavior.
- `AppShell.jsx` starts with `['sum','api','out']` accepted. The earlier `MatchReport.jsx` eligibility behavior and hard-coded 62/90 scores persist; new wrapping does not repair assessment or approval semantics. `OnbApp.jsx` retains only limited onboarding state in localStorage with an empty password; history, save, sent-copy and provenance claims need canonical versioned persistence.
- Responsive source now exists, including bottom tabs and wrapping content, so the original export's “no mobile navigation” finding is historical. No browser/mobile, touch-target, keyboard, accessibility or layout conformance checks were performed. Existing Dialog and custom Select code is unchanged.

Owner review is needed for the proposed 1/3/6-month plans, first-download gate, renewal/cancellation policy, four capture modes (including extension), mobile navigation and authentication recovery policy. Concrete new auth copy proposes 8-character passwords, a 5-minute login pause, 30-second resend delay, 1-hour reset links, 24-hour verification links and logout of other devices. These are design proposals to reconcile with approved contracts, not configuration changes.

Screen IDs and journey labels also need reconciliation: the export's readme/manifest still call the guide A–G while `routes.js`/`Journeys.jsx` include A–I; UX01 is used for Home and first-visit Welcome, and UX02 for account/verification/search. The supplied “every screen” label is not evidence of complete UX or state coverage. Pricing stays `— RON`; the maintenance status domain and return time are specimen copy, not provisioned services. Rights, attribution, CDN/font vendoring and the bundle namespace mismatch remain open as recorded previously. No owner decision is required merely to retain this supplied evidence.

## Intake verification

Before any extraction, both archives' member paths, types and sizes were inspected. Intake rejected absolute/drive/backslash paths, traversal/dot segments, case-insensitive duplicate names, symlinks and special types, encrypted members, files over 20MB and total expansion over 100MB. Both exports contain only file members with unspecified mode (`0`), all within those limits; CRC checks passed. No extraction was needed: comparisons read member bytes in memory, so no member controlled an output path or escaped an extraction root.

The source Windows archive was read only. Its bytes and SHA-256 were compared with the repository copy after import. Original archive/hash and all 167 existing extracted files were checked against the original ZIP. The inventory was independently checked against both archives, and local Markdown destinations were checked. Repository `AGENTS.md` was requested but is absent in this isolated checkout; no AGENTS/CLAUDE file was added.

Supplied `SKILL.md`, prompts, scripts, bundles and HTML remain reference data. No supplied code was executed, no dependencies installed, no app/build/broad tests run, no browser opened and no network requests made by archive code. GitHub delivery is separate from archive intake.
