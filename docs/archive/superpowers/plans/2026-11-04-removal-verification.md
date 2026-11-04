# Removal verification and cutover receipt

> Historical record. This is not the current specification or an active task list. Start with [the current handoff](../../../HANDOFF.md).

Target: existing hosted Resumora project `aquvhqbkvrtzhbmezkci` and active Linux checkout. Private source baseline includes all unfinished CV, enrichment and language changes. Initial whole-source reconciliation: zero differences. No original-tree reset, stash, branch change, or other-worktree deletion.

## Candidate checks

- API: 459/459 passing.
- Web: 838/838 passing across 82 files.
- Native PostgreSQL: 111/111 across 14 disposable suites, including fresh/upgrade catalog equality, two-tenant preservation, shared photos/ledgers, ownership, replay and stale-writer refusal.
- Type checks and production web/Worker dry-run builds pass.
- Managed runtime tests: 22/22; secret boundary: 1/1.
- Canonical schema fixtures and 15 negative cases pass.
- Playwright Chromium synthetic checks: sign-in, empty/Profile, appearance controls and history at 1366×900/390×844; no page exceptions, retired endpoints or external calls. Browser plugin unavailable. CV import/OCR/enrichment/skills/language/photo/PDF behavior also covered by retained synthetic API/web/native suites, not live provider calls.

## Independent review

Fresh reviewer found two P1 defects: direct retained RPCs could restore retired provenance, and historic `job_local_*` sources escaped inspection. Regression failed before the fix; expanded historical checks plus a persistent snapshot constraint pass the full native suite. No deferred minor findings. Hosted execution remains separately verified below.

## Tested migration

`20261104105519_remove_job_product.sql`

SHA-256: `61e3c850002794f1854d3cde2cc54271bc06810eeddbfa335dff22345391d8ea`

Drops 30 feature tables and 91 routines, replaces shared routines and narrows shared stores. All 38 applied predecessor migration files remain unchanged. One unapplied migration affecting only the removed materializer is deleted. Predecessor columns/constraints/policy hashes match hosted; shared-routine hashes are checked inside SQL.

## Preservation decisions

- Refuse proven or ambiguous embedded provenance atomically; inspected target has none. No speculative CV-text rewriting.
- Preserve the retained import object and unattributed orphan photo. No proven job-owned Storage object exists; frozen preflight must confirm this before SQL.
- Keep historical applied migrations and Git history, plus bounded transition tests/docs. Remove current product code/docs/demos and generated distribution artifacts.
- Preserve current unfinished Base work; its separate audit is deferred.

## Maintenance procedure

Stop the managed service from its owning checkout. Re-run `scripts/db/job-removal-preflight.sql`, schema/history checks and private all-account retained fingerprints. Apply the exact tested SQL once. Compare fingerprints and run `scripts/db/verify-base-only.sql` before restarting. If preflight differs, stop before mutation; after SQL commit repair forward without restoring removed data.

Apply only the candidate source delta after checking every original blob again. Remove retired extension ZIPs and generated caches, plus only `CAPTURE_WORKER_SECRET` lines from checkout runtime/recovery configuration. Keep all other private bindings. Install locked dependencies, start via `dev:start`, verify doctor/status, read-only smoke, retired-route404 and no retired worker.

## Hosted result

Hosted migration `20261104105519` applied successfully. All 43 retained-store fingerprints match the frozen baseline exactly, including all 39 editor snapshots, authentication records, imports, CV accounting and both Storage objects. Every postflight residual count is zero. Thirty tables and 91 routines are gone; nine job parsing attempts, seven retired operations, seven job audit events and attributable request receipts were removed. Three capture connections and their authorization/fences are removed with their tables. The exact candidate delta is installed in the active checkout; all original source blobs matched the isolation baseline before replacement. Locked dependency installation and the active web/Worker dry-run build succeeded. The managed service is active at `http://127.0.0.1:15173/#/profile`, with one CV import processor and no job processor. Doctor/status, read-only smoke, retired-endpoint 404, 22 runtime checks and 1 secret-boundary check pass. Authenticated read-only hosted Profile and language-context RPCs succeed. The optional admin authorization remains unconfigured and explicitly fails closed; no configuration was added. Live paid generation was not exercised.

## Scope and limits

Source changes remain uncommitted in the original checkout, alongside the preserved unfinished work; no push or PR was made. A local source-only recovery ref preserves the isolated candidate and its baseline in Git history. Other worktrees are unchanged. Temporary candidate source/data, browser preview and synthetic database are removed after verification.

An unreferenced photo was preserved because no evidence attributes it to the removed product. Storage object counts and hashes remain unchanged. Applied migration history, Git history, the forward removal migration and bounded transition tests necessarily record the transition. Offline installations/downloads, managed backups, provider records and shared system logs were not erased. The separate audit of unfinished CV/enrichment/language work remains deferred.

## Execution rulings

- Capture all unfinished source in isolation before editing; reconcile against it before integration. This prevents overwriting concurrent work.
- Run native suites in separate disposable databases; shared test worker secrets caused fixture contamination in the older aggregate runner. Authorization checks remain strict.
- Retire obsolete multiproduct demos/research while retaining current Base work, audits and the duration reference required by tests.
- Refuse attributed or ambiguous Base provenance instead of guessing how to rewrite personal content; frozen hosted checks were zero.
- Preserve the unattributed photo and omit an unused deletion utility because the proven Storage deletion set is empty.
- Delete the unapplied, exclusively retired-feature migration; preserve every applied predecessor.
- Use installed Playwright for synthetic UI checks because the Browser plugin is unavailable.
- Accept the existing optional admin route's exact unconfigured error in the smoke check; continue requiring anonymous rejection on Base routes.

Each decision avoids expanding deletion or changing retained behavior without evidence. No reviewer minor findings were deferred.
