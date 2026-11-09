# Round 2 · Session 7 · Enrichment: progress

Plan: `tailoring-round-2-plan-s7-enrichment.md` (owner-approved 2026-11-09). Branch `rebuild/tailor-r2-enrich`, base `rebuild/tailor-r2-bugs` (9c5728d).

## Task 1: Reproduce E1 in the owner's Chrome — done
session: r2-enrich (session 7) · builder: claude
commit: none (no code) · reviews: 0 · fix rounds: 0 · guard denials: 0 · weekly 43% → 43%

Setup: the r2-bugs dev server (same commit as this branch, 9c5728d) was already running on 5173, so no restart was needed. Local database, owner's Chrome.
The owner's Kreditech role now has 4 bullets, so it no longer takes the one-bullet path. A temporary copy with one bullet and no notes ("Global Market Developer (E1 test)") was added for the check and removed afterwards (CV back to 7 roles).

Steps and what was seen:
1. The test role was scored in the background: 80, with 2 role questions ("Who did you report to…", "Did you lead or manage…") and 1 bullet question.
2. Opened focus mode (Make it stand out). Role question 1 of 2 → picked a chip → Continue. Role question 2 of 2 → picked a chip → Continue.
3. **The "Tell us about your time as Global Market Developer (E1 test) at Kreditech" box appeared, with an empty, read-only answer area and the button "Turning this into bullets…".** About 5 seconds later it was replaced by "New bullets · Pick the ones that are true". The box could never be answered.
4. Second case: closed and reopened the same role. Its role questions were now answered (filtered out by the notes), so the session opened on the real box. It stayed on screen through the background re-score (waited 10 s+).

Confirmed cause: the box is not a question at that moment, it's the loading screen of the "answers → bullets" call.
- `apps/web/src/cv/enrich/useFocusSession.ts:290-291`: on a role with one bullet or fewer, once a role question was answered (`roleAnswered`), `advance()` skips the box and calls `run(null, "answers")`.
- `useFocusSession.ts:159`: `run` with no bullet sets the step to `dumpWorking`.
- `apps/web/src/cv/enrich/FocusMode.tsx:186-200`: `dumpWorking` renders `BrainDumpStep`, i.e. the "Tell us about your time as…" heading with a read-only box and "Turning this into bullets…". When the call returns, `dumpPick` replaces it.
- The score did not cause it. The two other leads (the `FocusMode` key in `Editor.tsx:242`, and the `opening` effect calling `firstStep` again) were not involved: the mode is fixed at click time (`ScoreCard.tsx:99`), and the opening effect only runs while the step is `scoring/opening`.

For Task 2: besides the new order (box first, then role questions, then the pick step), the "answers → bullets" call must show a plain working screen, not the box, or the same flash comes back after the role questions.

Owner decision (2026-11-09, relayed by the plan session): for thin roles, after the "Tell us about your time as…" box is answered, ask the AI once more for that role's questions with the box answer in view (one extra AI call per thin role). Built as a `fresh` flag on `POST /v1/enrich/score` that skips the stored result (Task 3, server) and is used by focus mode after the box (Task 2).

## Task 4: The import stops copying "Company · Location"; clear stored copies — done
session: r2-enrich (session 7) · builder: claude
commit: see git log (base 9c5728d) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 43% → 44%
ruling: the Editor-open test is in `apps/web/src/cv/editor.test.tsx` and the reducer test in `apps/web/src/cv/edit/cvReducer.test.ts` (test files not in the brief's list). The import's `jobs()` helper is shared by experience and volunteering, so a volunteering "Organisation · Location" copy is dropped on import too; the clean-up on open touches experience only.
open: none
