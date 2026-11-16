# Progress: 2026-11-10-job-capture-closed-ads

Part base: 564001c3b14671644277ca03598afff701fbaa60 (origin/main)
Claude weekly at start: 62%
Owner OK: 2026-11-10 (kept step 2, the trailing-list cut).

## Lanes

| lane | worktree | tasks | current task | last commit | last step |
|---|---|---|---|---|---|
| A | resumora-job-closed | 1, 2 | 1 | 564001c | risk |
| B | resumora-job-closed-popup | 3 | 3 | 564001c | risk |

## Task 3: Extension popup flags Local as not set up — done
commit: a8d8c90 (lane B) · codex: risk 33s, build 183s, review 67s · codex tokens: ~0.87M (mostly cached) · fix rounds: 0 · guard denials: 0
risk: 0 of 0 · map: used 6, gaps 1 (popup-state test line, fixed in build), misses 0 · map gate: 1 connected claim confirmed and stamped (popup-shell)
open: none
note: first risk run aborted with a false "Codex changed files" warning; Claude had deleted an untracked plan copy from the worktree mid-run.

## Task 1: Closed ads are jobs, trailing job lists cut before extraction — done
commit: 58b83a3 (lane A) · codex: risk 89s, build ~3m, fix ~4m, review 122s · codex tokens: ~2.4M (mostly cached) · fix rounds: 1 · guard denials: 0
risk: 3 of 3 kept (fixtures lacking the field) -> design changed: shared field optional, model-only required; process.ts added to scope · map: used 11, gaps 4 (filled in fix round), misses 0
cause check: information was missing - the builder flagged the consumer test's mocked model answer; Claude hadn't put jobs-consumer.test.ts in scope.
open: none

## Task 2: Job page shows a "no longer open" notice — done
commit: 629bfb8 (lane A) · codex: risk 59s, build 144s, map round 93s, review 59s · codex tokens: ~1.3M (mostly cached) · fix rounds: 0 · map rounds: 1 · guard denials: 0
risk: 0 of 0 · map: used 8 of 29 given, gaps 3 (filled in map round), misses 0
brief note: the slice had 29 entries (JobPage imports a lot); the full text overflowed the command line, so the 23 dependency entries went in as id + one-line summary.
cause check: Codex ignored what it was given - it thought map files were out of scope; sharpen the brief template ("map entry files may change without being in the scope block").
open: none

## Lanes
Lane B merged into lane A at a524d66. Post-merge -Test -WithDb: PASS; map check OK (3 pre-existing SIZE warnings); index unchanged.

## End of part
- Whole-branch review: fix (api-core/worker checked_hash stale). Bug hunt (Astra): 1 real bug - popup.ts:68 footer selector still had the Hosted-only check. Both fixed in one round at abb1a01; fix-only review pass (local to the popup, no shared contract touched). Whole-branch reviews used: 1 of 2.
- Security test: skipped (no migrations, routes, auth or RLS in the diff).
- Map: check OK (249 entries), coverage OK, index written. Refresh sample: 6 of ~20 refreshed entries (api-core/job-processing, shared/jobs, api-core/worker, web-app/job-page, web-app/i18n, extension/popup-view), 117 claims, 0 false or misleading.
- Cost: Claude weekly 62% -> 64%. Codex medians per task: 2.1M tokens (mostly cached), 15.6 min, 0.5 fix rounds, overhead 20%, 0 slice misses. Claude context ~21%. Guard denials: 0.
- Pending: push, PR, merge (owner's OK); then set the contract-claims row to merged; rebuild the extension dist from main.
