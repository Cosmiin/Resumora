# Removal verification and cutover receipt

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

`20261104101028_remove_job_product.sql`

SHA-256: `61e3c850002794f1854d3cde2cc54271bc06810eeddbfa335dff22345391d8ea`

Drops 30 feature tables and91 routines, replaces shared routines and narrows shared stores. All38 applied predecessor migration files remain unchanged. One unapplied migration affecting only the removed materializer is deleted. Predecessor columns/constraints/policy hashes match hosted; shared-routine hashes are checked inside SQL.

## Preservation decisions

- Refuse proven or ambiguous embedded provenance atomically; inspected target has none. No speculative CV-text rewriting.
- Preserve the retained import object and unattributed orphan photo. No proven job-owned Storage object exists; frozen preflight must confirm this before SQL.
- Keep historical applied migrations and Git history, plus bounded transition tests/docs. Remove current product code/docs/demos and generated distribution artifacts.
- Preserve current unfinished Base work; its separate audit is deferred.

## Maintenance procedure

Stop the managed service from its owning checkout. Re-run `scripts/db/job-removal-preflight.sql`, schema/history checks and private all-account retained fingerprints. Apply the exact tested SQL once. Compare fingerprints and run `scripts/db/verify-base-only.sql` before restarting. If preflight differs, stop before mutation; after SQL commit repair forward without restoring removed data.

Apply only the candidate source delta after checking every original blob again. Remove retired extension ZIPs and generated caches, plus only `CAPTURE_WORKER_SECRET` lines from checkout runtime/recovery configuration. Keep all other private bindings. Install locked dependencies, start via `dev:start`, verify doctor/status, read-only smoke, retired-route404 and no retired worker.

## Hosted result

Pending maintenance execution.
