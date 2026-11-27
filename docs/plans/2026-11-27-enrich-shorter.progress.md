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
