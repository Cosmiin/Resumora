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
