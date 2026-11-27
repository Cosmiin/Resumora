# Enrichment in fewer screens: progress

## Part A (Tasks 1–3): tools on one screen, no wait after Shape, one start after an import — done
session: Scurtează fluxul de îmbogățire · builder: claude
commit: 42ef2b34 + test fix (base ad7fcb6c) · reviews: 1 (Opus, whole part) · fix rounds: 1 · guard denials: 0
open: none

Notes:
- The three tasks went in as one commit and got one whole-part review instead of three per-task reviews.
- Review verdict "fix", two findings, both about tests, no defect in product code: the "questions wait for the Shape
  check" test did not prove the questions come from the new scores (now the harness shows the put score and the test
  asserts the merged line's question); the import screen had no test for the time before the score is known (now
  asserted: no number, the place kept). The fix is tests only and was not reviewed again.
- Ruling (scope): Task 3 also touches `apps/web/src/cv/enrich/useRoleScores.ts` (the import's scores, `aheadScores`,
  optional so existing mocks of the hook stay valid). Added to the task's scope block.
- Ruling (Task 1): `enrich.path.tools.*` keys for the per-role screens (roleOf, ask, group.*, next) are removed; a
  role with no written line is left out by its lines, not by its score, so the step needs no scores.
- Seen in a browser (tools step only, sample data, desktop and phone width). The import screen's score line and the
  whole path with real AI were not seen in a browser.
- No auth, RLS, migration or API change.

## Part A: published
PR 100 merged (2b8cac38) and published on 27 Nov 2026: API version 89d44386, website bundle index-CLA5bQjj.js. The live
bundle holds the new tools text and no longer the "review at the end" promise.

## Part B (Tasks 4–5): one screen per role, one question at a time; a role prepared as soon as its questions are done — done
session: Scurtează fluxul de îmbogățire · builder: claude
commits: 885561b3, 177a8939 (base 2b8cac38) · reviews: 1 (Opus, whole part) · fix rounds: 0 · guard denials: 0
open: none

Notes:
- Review verdict "pass", one low finding, kept as a ruling: the progress line names the role only ("Step 4 of 4 ·
  Role 2 of 4"); "Question 1 of 3" sits with the open question, and a role with one question shows no count. Less
  text on a screen the owner asked to keep light.
- Ruling (Task 4): an existing test file, `budget-review.test.tsx`, also covers the step; its two expectations that
  named the old progress line and button were updated. The fade is on the question coming in and on the folded
  answer; there is no fade-out of the question leaving (no timers in the step).
- Ruling (Task 5): Back stays inside the role on screen, also for roles told about in one box. Closing the path in the
  middle of the questions leaves the roles already left with their changes on the CV; their held lines are not shown
  (same as a skipped held line: off the CV).
- Seen in a browser (questions step only, sample data): the folded answer, the count, the role staying on top.
- No auth, RLS, migration or API change.
