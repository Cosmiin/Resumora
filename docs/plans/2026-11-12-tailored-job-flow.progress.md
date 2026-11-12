# Tailored job flow: progress

Plan: `docs/plans/2026-11-12-tailored-job-flow.md` · feature id `tailored-job-flow`
Branch `feat/tailored-job-flow` · worktree `resumora-tailored-job` · part base `5533085` (origin/main, 2026-11-12)
One lane, Tasks 1 to 7 in plan order. Fresh session after Task 4.

**Builder: Claude (Fable 5.2), with the `claude-build` skill.** The owner stopped the Codex build on 2026-11-12 and made it a permanent rule: Codex only on their explicit request. Read the plan's `codex-build` wording as `claude-build`. One Codex risk check ran for Task 1 before the stop; its half-built code was discarded.

Not done without the owner's yes: pushing, a PR, running either migration on the hosted database, and applying Task 1's migration to the **local** database (see R3).
Release order: the API from Task 1 must be live before Task 1's migration runs on the hosted database.

## Rulings

- R1 (Task 1): scope widened by three files the plan missed. `apps/api/test/tailor-accept.test.ts` and `apps/api/test/tailor-retailor.test.ts` asserted the status `tailored`; new `supabase/tests/database/application_status.test.sql` holds the plan's database test.
- R2 (Task 1): `acceptSection` keeps `jobs` in its `deps` type although nothing reads it now. Removing it would change the signature for its three callers, outside this task's files.
- R3 (Task 1): **the migration is not applied to the local database.** All worktrees share one local database, and every other branch still writes `tailored` when a run finishes, so the new check would break the last tailoring step on their local servers. The migration and its pgTAP file were run together inside one transaction that was rolled back (9 of 9 pass). The pgTAP file drops the old check itself, so `npm run db:test` passes with or without the migration applied. Owner decides when the local database gets it (needed before this branch's preview shows jobs that were `tailored`).
- R4 (Task 1): the dictionary key `jobs.pill.tailored` stays although nothing uses it after this task; Tasks 4 and 6 use it for the "Tailored CV" pill.

- R5 (Task 2): the score answer had no shared schema (the plan pointed at `tailor.ts:79`, which is the score itself). Added `JobScoreSchema` / `JobScore` to `packages/shared/src/tailor.ts`; Task 4's `getJobScore` parses with it.
- R6 (Task 2): scope widened by `apps/api/test/tailor-accept.test.ts` (the accept harness, for "accepting clears the flag") and `supabase/tests/database/tailoring.test.sql` (the column test). That pgTAP file now needs the Task 2 migration, so in this worktree `npm run db:test` fails until the local database has it (R3). Both migrations plus that file were run in one rolled-back transaction: 78 of 78 pass.
- R7 (Task 2): a tailored score save (`saveScore`, target `tailored`) also writes the copy's `score` column, so Re-check updates it without bumping the copy's version. The accept flow already wrote the same value.
- R8 (Task 2): a new or refreshed translation sets `score_stale = true`. Without it, a re-translated copy that had been re-checked earlier would show its old number as current.
- R9 (Task 2): "content differs" is decided after reading both sides through the stored-CV schema (`sameCv` in `tailor/repo.ts`), because Postgres reorders JSON keys. The Supabase editor save now reads the stored content first: one extra query per save.

- R10 (Task 3): `summaries` runs 3 queries, plus a 4th when the page has a tailored job. The 4th (the chosen copies' score history) is the only one that can hit PostgREST's 1000-row cap; a copy the cut-off result did not reach shows its own `score` column, which holds the same number since R7. `tailoredLanguages` is sorted by code (`["en", "ro"]`).

- R11 (Task 4): scope widened by `apps/web/src/jobs/JobMatch.tsx` (new exported `openMusts`, the "still open" texts of the coach line) and `apps/web/src/tailor/tailor-flow.test.tsx` (its `scoreJob` fixture needs the new fields).
- R12 (Task 4): `JobPage` already reads `?cv=` from the job URL and passes it to `getJobScore`; the score query key is `["job-score", userId, id, cv]`. Task 5's language switch only has to set `?cv=`.
- R13 (Task 4): the four links are the loaded doc's `links`; before the CV has loaded, or when it failed, `TailoredJobView` builds the same addresses from `tailoredCvId`, so the buttons work in both acceptance cases.
- R14 (Task 4): `JobPage` keeps the header and builds the must-haves and About this job as two small functions (`mustHaves(marks)`, `about(marks)`) used by both layouts; `TailoredJobView` gets them as `details`.

## Tasks

## Task 1: Application status keeps five values — done
session: Build tailored job flow · builder: claude
commit: 217716b (base 6d1a763) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
migration for the owner: `20261112000000_application_status.sql` (data update + check constraint on `jobs.application_status`; no RLS change)
open: local database not migrated (R3)

## Task 2: Score of one tailored copy, "edited since last score", Re-check (API) — done
session: Build tailored job flow · builder: claude
commit: b3825d1 (base 217716b) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
migration for the owner: `20261112000100_tailored_score_stale.sql` (one boolean column on `tailored_cvs`; no RLS change). New route `POST /v1/tailored/:id/score`: ownership through RLS, like `PUT /v1/tailored/:id`.
open: (a) the new Supabase queries (`scoreCopies`, `hasTailoredCv`, the editor-save compare) are covered by the memory repo's tests and the typecheck only; exercise them against the real database in the preview check. (b) For the owner: starting a re-tailor resets the copy to the base wording and a guided-review decision changes its wording, both without a new score and without setting the flag (the plan sets it on hand edits only). Until the next accept the page shows the previous number as current.

## Task 3: The Jobs list carries each job's latest score and tailored languages (API) — done
session: Build tailored job flow · builder: claude
commit: 4dd9def (base b3825d1) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: the `summaries` queries (embedded tables with per-job limits) ran only against a stubbed fetch; the reviewer checked their syntax against the schema. Exercise `GET /v1/jobs` against the real local database in the preview check.

## Task 4: Tailored job page: the CV, the latest score, folded job details (web) — done
session: Build tailored job flow · builder: claude
commit: 2e9a279 (base 4dd9def) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: (a) not yet seen in a browser: the phone layout rules were checked by reading the CSS only. (b) For the preview check: a ready job shows today's layout until its score answer arrives, so a tailored job's page starts as the old layout (with "Tailor my CV") and then switches. The old page had the same button swap; now the whole lower page swaps. If it looks bad, hold the area under the header as a skeleton while the score loads.

## Hand-over after Task 4 (2026-11-12)

Next: Task 5, then 6, then 7, each through the `claude-build` per-task steps. Base for Task 5: `2e9a279` (plus the commit of this file).
- The plan's line numbers are from `5533085`; `JobPage.tsx` changed a lot in Task 4, so find the places by name: the unfinished-run query is `openRun` (query key `job-tailor-run`), the status handler is `changeStatus`, the tailored branch renders `TailoredJobView`.
- Tests: `npm run typecheck`, `npm run lint` and `npm test` from the worktree root (about a minute). The web tests of the tailored page live in the `describe("a tailored job")` block of `apps/web/src/jobs/job-page.test.tsx`; its `band()` helper waits for the score answer before looking at the page.
- Database: never `npm run db:test` or `npx supabase migration up` here before the owner decides R3. To check SQL, run the migration files plus the pgTAP file through `docker exec -i supabase_db_resumora psql -U postgres -d postgres` inside `begin; ... rollback;`.
- After Task 7: the preview check at 375 px and at desktop width (needs R3 decided, and a `resumora-tailored-job` entry in the workspace `.claude/launch.json` using `tools/dev-worktree.ps1`; stop older dev servers first; no secret copies, no `db:reset`), then the end-of-run steps: full tests once, one whole-branch review on Opus (base `5533085`, brief = all seven task sections), a security review on Opus, one run per threat, because the branch adds a route and two migrations (user A reads or changes user B's data; login checks on the changed routes; input validation; guessable or changeable ids), the cost line, the final report.
- Ask the owner before: pushing, a PR, any migration on the hosted database, the local migration (R3), anything the guard denies.
