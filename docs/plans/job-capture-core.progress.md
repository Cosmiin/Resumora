# Progress: job-capture-core.md

Worktree `resumora-jobs`, branch `rebuild/jobs-core`, based on `rebuild/enrichment` at 92cc24c.
(This file lives in the main checkout so it never trips the worktree's scope check.)

## Docs: spec and plan — done
commit: 6233a08 · codex: review ×4 (01a1ac45, 01a1ac47, 01a1ac49, 01a1ac4a) · codex tokens: 535,594 · fix rounds: 2 + 1 escalation · guard denials: 1 (counterpoints prompt with `>=` near `apps/` paths)
open: none. Fixes: camelCase response fields, 3 attempts / `max_retries: 2`, `title` may be empty in `JobExtractionSchema`, duplicate check before the limit.

## Task 1: Database — jobs, job_runs, daily limit and RLS — done
commit: 643fcc0 · codex: build 01a1ac4c, review 01a1ac51 · codex tokens: 595,420 · fix rounds: 0 · guard denials: 0
open: none (101 db tests, 699 unit tests; Claude read the full migration: owner-only RLS, no update/delete on job_runs, run inserted in the same statement as the job)

## Task 2: Shared job schemas and URL normalization — done
commit: 0bea6e6 · codex: build 01a1ac53, review 01a1ac58 · codex tokens: 785,756 · fix rounds: 0 · guard denials: 0
open: none (751 tests)

## Task 3: Job repository (memory and Supabase) — done
commit: f655759 · codex: build 01a1ac5a, review 01a1ac60 (fix), fix round 01a1ac5a (no-op), escalation build 01a1ac64, review 01a1ac68 (pass) · codex tokens: 2,584,646 · fix rounds: 1 + 1 escalation · guard denials: 0
open: `-Build -Resume` fix rounds can't edit on this machine (`codex exec resume` runs under the `workspace-write` sandbox, which blocks the shell; codex-ask.ps1:253). The round reported "No changes made" with exit 0. Worked around with a fresh build from a rewritten brief. Fixes: memory repo refuses a duplicate id; `start` claims atomically with `.eq("attempts", n)`. 767 tests.

## Task 4: The /v1/jobs routes — done
commit: 1b5a90b · codex: build 01a1ac6a, fresh build 01a1ac71 (scope widened), review 01a1ac73 (fix), fresh build 01a1ac76, review 01a1ac78 (pass) · codex tokens: 1,794,303 · fix rounds: 2 (both as fresh builds, since `-Resume` can't edit) · guard denials: 0
open: none. The brief's file list missed 3 enrichment-branch tests that build `AppDeps` (`src/ai/voice-session.test.ts`, `src/enrich/rewrite.test.ts`, `src/enrich/routes.test.ts`); Codex asked instead of editing them. 792 tests. Claude read the app/index/wrangler diff: `/v1/jobs` sits behind the `/v1/*` auth middleware, CORS origin unchanged, `PATCH` added.

## Task 5: Extraction worker — done
commit: 7f09db4 · codex: build 01a1ac92, review 01a1ac99 (pass) · codex tokens: 1,277,613 · fix rounds: 0 · guard denials: 1 (Claude's heredoc writing the brief note contained the words "npm test")
open: none. 809 tests. Scope check at base: only `index.ts` holds the queue handler, no extra files. `job_extract` is logged by the service-role insert into `ai_calls` (no task check), so the `log_ai_call` RPC allowlist doesn't apply. Claude read the index/wrangler diff: unknown queues are logged and acked; the jobs consumer has `max_retries: 2`. The `-Build -Resume` fix (codex-ask.ps1:255) landed before this task, but no fix round was needed, so it is still untested on a real task.

## Task 6: Extraction eval set — done (eval not run yet)
commit: ef03208 · codex: build 01a1ac9b (SCOPE FAIL), resume round 01a1ac9b (no edits, scope ok), review 01a1aca6 (pass) · codex tokens: 1,854,405 (log sum; the resume line's 890,144 is cumulative and includes the build's 706,858) · fix rounds: 1 · guard denials: 1 (a `>` redirect in a command naming `apps/` paths)
open: **the real-provider eval run still needs a checkout with `.dev.vars`** (this worktree has no keys), and the spec's cost target (`≤ $___ per job`) stays blank until that run. The scope fail was a plan error, not Codex: the plan listed the `cases` directory (the check matches exact paths) and said `deps: false`, while Task 6 itself requires one `eval:jobs` script line in each `package.json`. Corrected brief `brief-jobs-6-fix.md` lists each file and sets `deps: true` (Claude checked: script lines only, no dependency change). The resume round made no edits by design, so `-Build -Resume` editing is still untested on a real task. 809 tests (the eval is excluded from them); Astra ran the dry check of all 15 cases.

## Whole-branch review (base 92cc24c, brief = plan file) — fix, 1 finding (fixed in Task 7)
codex: review 01a1aca9 · codex tokens: 710,245
open: fixed by Task 7 (4a7be6d) after the user chose pagination. Original finding: `apps/api/src/jobs/supabase-repo.ts:69` [high] `list()` has no limit, and PostgREST `max_rows = 1000` (`supabase/config.toml:18`), so `GET /v1/jobs` silently returns only the newest 1,000 jobs. Claude confirmed both lines. At 30 jobs/day this takes 34+ days of maxed use. The spec's API table defines the list as unpaginated "newest first", so the fix is a spec choice (pagination, a stated cap, or accept it), not a fix-round edit.

## Task 7: Paginate the job list — done (fixes the branch-review finding)
commit: 4a7be6d · codex: counterpoints 01a1acb2, build 01a1acb4, review 01a1acb9 (pass) · codex tokens: 1,239,205 · fix rounds: 0 · guard denials: 0
open: none. User chose pagination. Claude edited the spec (API table, list section, Errors row) and added Task 7 to the plan; these docs are in the same commit. Keyset over (`created_at` desc, `id` desc), `limit` 1–100 (default 50), `{ items, nextCursor }`, 400 `invalid_request` on a bad limit or cursor. The counterpoint changed the plan: the cursor's `id` must be a UUID and `createdAt` a UTC timestamp that survives a `Date` round-trip, otherwise Postgres would reject the value and the user would get a 500. Claude read the repo/route diff: the cursor is validated before it enters the `.or()` filter; the cursor keeps the database's raw microsecond `created_at`. 846 tests.

## Cost (Tasks 5–6 and branch review, this session)
Codex tokens: 3,842,263 by log sum (about 3,135,405 new, since the Task 6 resume line repeats the build's 706,858) · Claude context: not measured, roughly 80k · guard denials: 2 (both on Claude's own shell commands: "npm test" text in a heredoc, a `>` redirect next to `apps/` paths)

## Notes for Tasks 5–6 (next session)
- Fix rounds: use a fresh `-Build` with a rewritten brief ("already built, change only…"), not `-Build -Resume`, until codex-ask.ps1:253 is fixed.
- Before each brief, check the base for every `AppDeps` / handler user: `rg "createApp\(|ExportedHandler" apps/api`. API tests live in both `apps/api/test/` and `apps/api/src/**`.
- Task 6: the worktree has no `.dev.vars`, so the real-provider eval run and the cost target need a checkout with keys after the branch is merged or checked out there.
- The progress file stays in the main checkout (an untracked file in the worktree trips the scope check).
