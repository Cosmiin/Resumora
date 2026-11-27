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

## Part B: published
PR 101 merged (0374b3db) and published on 27 Nov 2026: website bundle index-BA1NzsNh.js (the API had not changed).

## Part C (Tasks 6–7): a note says what it is about; one answer lands once — done
session: Scurtează fluxul de îmbogățire · builder: claude
commits: 62b1d422 + review fix (base 0374b3db) · reviews: 1 (Opus, whole part) · fix rounds: 1 · guard denials: 0
open: none

Trial with the real AI (`eval/enrich/once.eval.ts`, fictional role modelled on the run of 27 Nov: five lines, six
answers; every line rewritten on its own, then the placing step). "Stray" = an answer's fact written into a line it
was not given about, or a ticked tool in more than one line.
- Live code (0374b3db), answers untagged, no placing step: 11 strays. "UX and product" in 5 of 5 lines, Google Sheets
  in 5 of 5, "6–10 projects" on two lines it was not given about, "10–20 projects" on the wrong line. This is what the
  owner saw.
- First version (answers grouped, all still shown): 4 strays. Numbers right; "UX and product decisions" in 3 lines,
  Google Sheets in 3.
- Other lines' answers and role-topic answers no longer shown, tools shown with a rule: 1 to 3 strays over four runs,
  all of them the ticked tool guessed into several lines. A rule did not hold; not showing it does.
- Final (tools not shown to a line's writer, placed once by `use-answers`; the writer told what was already asked):
  0 strays in 6 of 6 runs. Google Sheets on one line in 5 runs and on none in 1. No follow-up asked about tools again.
What it costs: lines with no answer of their own are now often left as they are (2 of 5 in most runs), where the live
code rewrote all five. The role's score rises less than before, as decision 4 said it would. About 22 model calls a
run, a few cents in all.

Notes:
- Ruling (Task 6): `ROLE_TOPICS` moved from `enrich.ts` to `cv.ts` (the note schema needs it); nothing else changed
  for its users. The budget drops an answered topic by filtering the role questions before `pickBudget`, so
  `pickBudget` is untouched.
- Review verdict "pass", two low findings on one line, fixed: the role run's placing step first sent the questions of
  every enrichment note of the role, so an earlier answer (also one the person had declined on an approve screen) was
  offered again on every later run, and on a role with more than 20 notes a re-given answer could fall outside the
  last 20. It now sends this run's answers, found by note id; only when nothing was asked this time (the earlier
  answers are the run) does it send them all. The fix was not reviewed again (one line and a test).
- Deploy order matters: the API first (it must accept the two new note fields), then the website.
- Changes to auth, RLS, migrations: none. The stored CV gains two optional fields on a note; no migration.
