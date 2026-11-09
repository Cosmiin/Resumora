# Focus mode: codex-build progress

Plan: `resumora-focus/docs/superpowers/plans/2026-11-05-focus-mode.md` · worktree `resumora-focus` · branch `rebuild/focus-mode` · branch base `92cc24c`

## Claude step A: setup, migration, RLS check — done
Migration `20261107000000_insights_pending.sql` + 5 pgTAP checks (the user wrote the cross-user overwrite check); `npm run db:test` 28/28 locally. Not yet applied to the hosted project.

## Task 1: Shared: policy score/2, question kind, facts, mergeGrades — done
commit: 3b81a8d · codex: build 01a1ac45-c8bc-7123-abe2-472ccb9094d0, rebuild 01a1ac4f-ac96-7271-91fc-60afcf3f9912, review 01a1ac53-c83e-7562-b9df-7deed4383832 · codex tokens: 2,642,007 · fix rounds: 1 (resume came back read-only) + 1 rebuild · guard denials: 2
open: `facts` is `.nullable().optional()` instead of the spec's `.default(null)` (avoids touching ~20 fixtures); `codex-ask -Build -Resume` gets a read-only sandbox, so fix rounds are done as fresh rebuilds; codex-ask.ps1 got a PS 5.1 quote-escaping fix.

## Task 2: API: pending cache, promotion in scoreRole, grade-only scoring — done
commit: abefb65 · codex: build 01a1ac56-c57e-73a2-851e-466b7269a33e, rebuild 01a1ac62-2b4d-7db1-bec0-0a4c84abfe66, review 01a1ac65-3462-7df3-bf2e-54905f275c0f · codex tokens: 2,023,635 · fix rounds: 1 (rebuild) · guard denials: 0
open: Astra (high): gradeBullets id check inside the schema → 503 instead of 502; moved after callModel like scoreRole. Plan's error rule reworded to match callModel (schema failure after retries = 503).

## Task 3: API: POST /v1/enrich/improve-bullet — done
commit: 26ef01c · codex: build 01a1ac66-cba2-7fd1-8e6a-0d6c49c78aec, rebuild 01a1ac72-0723-7443-b2e6-e05d43aa530f, review 01a1ac75-1494-7e22-afff-a8f0da723f65 · codex tokens: 2,092,890 · fix rounds: 1 (rebuild) · guard denials: 1 (brief written to %TEMP% matched the apps/ write pattern)
open: Astra (high): length checked on squashed text but trimmed text returned (232 chars); now squashed everywhere. Same rule added to Task 4.

## Task 4: API: brain-dump and role-facts — done
commit: f7dc500 · codex: build 01a1ac77-5962-76f2-8f09-46a377f0195d, rebuild 01a1ac83-cd58-7081-8bf4-c56f5fa69124, review 01a1ac86-d4f9-7be2-aef7-62f700f1d09b · codex tokens: 2,622,910 · fix rounds: 1 (rebuild) · guard denials: 0
open: Astra (high): mergeGrades rebuilt stored duplicates with duplicateOf null, inflating role scores (also improve-bullet's roleAfter). Fixed in mergeGrades (duplicateOf = first bullet); plan updated.

## Checkpoint after Task 4
Branch `rebuild/focus-mode` at f7dc500, 805 tests passing. Next: Task 5 (remove the role rewrite). Briefs are rebuilt from the plan per task (Global Constraints + the task section). Use absolute paths for codex-ask.ps1; `-Resume` fix rounds come back read-only, so fix rounds are fresh `-Build` runs with a "State of the worktree" section appended to the brief. Claude step B needs the user's answer on lifting the guard.

## Task 5: API: remove the whole-role rewrite — done
commit: 34416a6 · codex: build 220s, review 93s · codex tokens: 1105364 · fix rounds: 0 · guard denials: 0
open: none (802 tests; rewrite-role tests removed, 404 test added)

## Task 6: Eval: single-bullet and brain-dump cases — done
commit: d032b09 · codex: build 389s + fixes 224/129/103s, review 121/108/102/112s · codex tokens: 3860510 · fix rounds: 2 + 1 escalation · guard denials: 0
open: range check in run.eval.ts went substring → both-numbers → 12-char gap → connector whitelist (Astra found a false pass/fail each time). `-Build -Resume` fix rounds now write. Codex saw one history test needing a rerun (possible flake, outside scope).

## Task 7: Web data layer: stream-events, enrich-api, reducer actions — done
commit: 1dd8c3b · codex: build ~?s, review ~?s · codex tokens: 1182207 · fix rounds: 0 · guard denials: 0
open: src/cv/history.test.tsx "lists versions newest first" is flaky (failed once, passed on rerun; also seen by Codex in Task 6). 815 tests.

## Task 8: Web: useFocusSession — done
commit: 47fa46f · codex tokens: 3664000 (build+fix 3275806, reviews 387753) · fix rounds: 1 · guard denials: 1 (progress append via shell heredoc mentioning an apps/ path; redone with Edit)
open: brief scope widened to en.ts for one key `enrich.focus.followUpQuestion` (plan didn't list en.ts). Astra fixes: roleDone now follows the fresh score; capped-attempt path awaits waitForSave. 840 tests.

## Task 9: Web: voice countdown and maxSeconds — done
commit: 90f2a27 · codex tokens: 2275541 (build+fix 1973432, reviews 302109) · fix rounds: 1 (plus one SCOPE FAIL from the scope extension: size 323 > 300) · guard denials: 1 (a -Task string with `Promise<void>` and an apps/ path)
open: scope widened to en.ts (`enrich.focus.voice.gettingReady`) and realtime.ts (Transport gets an `opened` promise; recording waits for countdown end + capture + socket open). Brief size raised 150 → 200. 848 tests.

## Checkpoint after Task 9
Branch `rebuild/focus-mode` at 90f2a27, 848 tests passing. Tasks 5–9 done. Next: Claude step B (front end, needs the user's answer on lifting the guard), then step C (live eval to fill RESULTS.md, whole-branch review, merge). Known flaky test: `src/cv/history.test.tsx` "lists versions newest first". `-Build -Resume` fix rounds now write. Avoid `>` and `apps/` together in any shell command text (heredocs and -Task strings), or the guard denies it.

## Claude step B: focus-mode front end — escalated (awaiting the user)
Not committed; staged in resumora-focus on top of 90f2a27. 836 tests, typecheck and lint clean. Guard override in place (user-created).
Astra rounds: (1) Tab escaped from a focused step heading; celebration covered ✕ — fixed. (2) phone ✕ dropped from the trap (offsetParent null when fixed); failed brain dump lost the ramble; ✨ on a 100 bullet opened elsewhere — fixed. (3) brain dump had no Skip — fixed. (4, escalation) mic denial unmounts the focused button, focus falls to body, dialog-scoped Esc/Tab handler misses it — open. Proposed: move the key handler to a document listener while focus mode is open.
Also changed in useFocusSession: close works while busy; role-facts on close awaits waitForSave.

## Claude step B: focus-mode front end — done
commit: b230124 · Astra reviews: 7 (6 × fix, then pass) · fix rounds: 6 (4 – 6 approved by the user after the escalation) · guard override in place for this step
fixed: Tab escaping from a step heading; celebration covering ✕; fixed ✕ dropped from the trap on phones; ramble lost after a failed dump; ✨ on a 100 bullet; no Skip on the brain dump; Esc/Tab missed after the focused mic unmounted (now document-level); dump box editable mid-request; focus left on <body> when the opener vanished at 100.
open: the last fix (focus to page when the opener is gone) has no automated test; check by hand in step C. 838 tests.

## Task 10: Whole-branch review fixes — done
commit: 10a5283 · codex: build 01a1ad2c-bb32-72c1-9c92-99f83659cedf, review 01a1ad33-00ac-7540-8e65-02dee41fff6e · codex tokens: 1,469,488 · fix rounds: 0
First whole-branch review (01a1ad1c) found: no ai History copy in improve/brain-dump; uncached prediction celebrated; 81→81 celebration after rounding; applyProposals leftover. User chose: snapshot back, wait for the real score. Includes decision record 0013. 844 tests. rebuild/enrichment fast-forwarded to 10a5283.

## Task 11: Second whole-branch review fixes — done
commit: 742861d · codex: build + fix 01a1ad3c-f7a1-7e60-bf22-984afad36c2c, reviews 01a1ad40 (fix), 01a1ad45 (pass) · codex tokens: 1,963,348 · fix rounds: 1 (-Resume now writes)
Second whole-branch review (01a1ad34) found: paraphrase of a later bullet not flagged as duplicate; enrich.drop.* strings removed in step B by mistake (summary builds keys at runtime); stale facts after a History restore. Facts guard ended up in the reducer (the hook is unmounted after close). 851 tests. rebuild/enrichment fast-forwarded to 742861d.

## Task 12: Third whole-branch review fixes — done
commit: 7983c52 · codex: build 01a1ad4e-0031-7a12-8295-90a0ae83e3b1, review 01a1ad51-3598-7783-90ef-b5a040381799 · codex tokens: 540,834 · fix rounds: 0
Third whole-branch review (01a1ad47) found: log_ai_call allowlist rejected the three new tasks (Claude wrote migration 20261107010000 + pgTAP check, 29/29 locally); six dead styles (Codex). Local DB had lost cv_insights.pending although history listed 20261107000000 (shared local stack, likely another session); restored with add column if not exists. 851 tests. rebuild/enrichment at 7983c52.

## Task 13: Fourth whole-branch review fixes — done
codex: build 01a1ad5b-39ae-7fc0-9ab2-3f5571e82059, review 01a1ad5f-114e-7a23-b9da-5d19ddc9926f · codex tokens: 900,061 · fix rounds: 0
Fourth whole-branch review (01a1ad53, 2.6M tokens) found: stale grades excluded an edited former-100 bullet; brain-dump temp id `new1` could collide. 858 tests. rebuild/enrichment fast-forwarded.

## Release note (found in the running app)
Apply the focus-mode migrations (now 20261107010000 and 20261107020000, see below) to the hosted database BEFORE deploying this API: scoreRole reads cv_insights.pending on every cache miss, so without the column all scoring (not only focus mode) returns 500 "column cv_insights.pending does not exist".

## Migration renumbering — done, pushed
commit: b485be8 (pushed: origin/rebuild/focus-mode) · review 01a1ad8b-e307-7c72-beca-e1b28233edbe pass
rebuild/jobs-core had taken 20261107000000 (`_jobs.sql`). Focus migrations are now 20261107010000_insights_pending.sql (`add column if not exists`) and 20261107020000_focus_ai_tasks.sql, whose allowlist also gains `job_extract` (job capture's task, rejected before). Local DB 77/77 after running both files directly; the shared local stack had been reset from the jobs worktree. rebuild/enrichment fast-forwarded to b485be8 (local only, not pushed).

## Hand-off: merging focus mode and jobs
- Branches: rebuild/focus-mode (b485be8, pushed) and rebuild/jobs-ui (the jobs session pushes it). Both start from rebuild/enrichment at 92cc24c.
- Files changed on both sides: the web i18n `en.ts`, the web `main.tsx` (CSS imports), the shared `index.ts` (exports), and the API's enrich `rewrite.test.ts` / `routes.test.ts` (focus mode removed the rewrite-role tests these touch).
- Migrations, in order: 20261107000000_jobs.sql, 20261107010000_insights_pending.sql, 20261107020000_focus_ai_tasks.sql. Apply to the hosted project only after the merge, and BEFORE deploying the API.
- Dev servers: `.claude/launch.json` "enrichment-dev" (web 5174) and "jobs-ui-dev" (web 5173) both start the API on 127.0.0.1:8788, and both web apps proxy /v1 there, so only one works at a time. After the merge one config is enough.
- Local Supabase is one stack shared by every worktree: a `db reset` in one changes it for all.
- Still open for focus mode: the hands-on check against the mockups (needs the migrations) and the live eval (`npm run eval:enrich`, results into the enrich eval's RESULTS.md).
