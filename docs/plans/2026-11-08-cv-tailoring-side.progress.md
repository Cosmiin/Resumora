# CV tailoring — side lane progress (branch `rebuild/tailor-side`, from `07dabe6`)

session: Tailoring S1 · Side · Tasks 8, 23a (side session started by Tailoring 00, local_eddc9931-19f5-40f7-ba00-9eb4021eaa78)

## Rulings
- Task 8: the plan lists `apps/api/src/ai/call-model.test.ts`, which does not exist; the tests live in `apps/api/test/call-model.test.ts`. The brief's scope was changed to that file and Codex added the tests there.
- Task 23 is split: **23a** (this branch) is the template registry, CSS and the `CvDocument` `template` prop only. The toolbar dropdown, `TailorToolbar.tsx`, the `PATCH /v1/tailored/:id` call and the "switching calls the PATCH" test stay for **Task 23b**, done with Task 23's remaining scope once Part 4 creates the toolbar.
- Task 23a: `apps/web/src/i18n/en.ts` added to scope so the three template labels resolve through `t()` (it is the only strings file). Size estimate 180 lines (the plan's 220 included the toolbar).
- Whole-branch review uses a combined brief of Tasks 8 and 23a, not the full plan, so the reviewer doesn't flag the 25 tasks this lane doesn't own.
- This progress file is committed with the whole-branch review pass, so its cost line excludes that last review; the final message gives that number.

## Task 8: Cheap/strong model tier — done
commit: 26e50f8 · codex: build 01a1bb47-eae4-7a12-9088-485c22dddb66, review 01a1bb4e-b568-7af0-b9f4-48272e423000 · codex tokens: 781671 (1124799 with the branch-review fix) · fix rounds: 1 (test file path), +1 from the branch review · guard denials: 1 (shell edit of the brief whose text named apps/)
open: the owner sets real strong model ids in `.dev.vars`; no caller uses `tier: "strong"` yet (Task 9 onward).

## Task 23a: Template registry with Classic, Modern, Compact (no toolbar) — done
commit: 5322115 · codex: build 01a1bb50-26fe-79e1-a11f-091c44c98b6d, review 01a1bb56-039d-7c31-9060-61e85d47e8b3 · codex tokens: 1034817 · fix rounds: 1 (scope fail from my untracked progress file, plus en.ts label keys) · guard denials: 1 (shell move whose text named apps/)
open: Task 23b (toolbar dropdown + PATCH save + its test); only `en.ts` has the labels, like every other string.

## Whole-branch review — done
review 1 (01a1bb58-3143-7e01-a3dd-bc536557c3c3): fix, one medium finding: `StreamRequest.tier` in `stream-model.ts` had no callers (the plan uses the strong tier only through `callModel`). Fix: Task 8's build session restored `stream-model.ts` to its base content (now 1015596 tokens for that session). This fix and this file go into one commit once a branch review passes; `git log` shows that commit.
review 2 (01a1bb5b-afba-71b3-adc8-8932caf089e9): fix, only finding was this file describing that commit as already made; reworded.
open: if a later task streams with the strong tier, add `tier` to `StreamRequest` then.

## Cost
codex tokens: 2489472 across 6 Codex sessions (Task 8 1124799, Task 23a 1034817, branch reviews 1 and 2 194806 + 135050), not counting the passing branch review that admits this file (its count is in `tools/codex-log.jsonl` and the side session's final message) · Claude context: ≈80k (estimate) · guard denials: 2 (both shell commands whose text named apps/; no work-around used)
