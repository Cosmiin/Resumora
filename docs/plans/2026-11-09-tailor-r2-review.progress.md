# Tailoring round 2 · Part B progress (session 6, `rebuild/tailor-r2-review`)

Base: `01cbc9a` (Part A's tip, PR #50). Owner answer: each guessed Summary phrase is its own item and counts separately.

## Task B1: Word-level change highlights — done
session: tailor-r2 Part B · builder: claude
commit: 653148b (base 01cbc9a) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 48% → 48%
open: none

## Task B2: Experience review with the Original / New switch (RevC) — done
session: tailor-r2 Part B · builder: claude
commit: see git log (base 653148b) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 48% → 48%
open: rulings — "← My answers" on the role under review reuses A9's panel and redo route: `api/src/tailor/redo.ts` now also accepts the current role once its pass is done (status `waiting_user`), and the redone proposals go back to the normal review, whose accept moves the run on; the role-accept route still refuses it (API test added). SectionReview's old per-role pages and their 4 copy keys are gone (RoleReview replaces them; SectionReview stays as the fallback when the CV can't load). `redo.test.tsx` and `role-context.test.tsx` updated to the new screen. A role with no changes shows "Nothing to change in this role ✓" and Continue.

## Task B3: Role done moment (RoleDone) — done
session: tailor-r2 Part B · builder: claude
commit: see git log (base 0b8c41e) · reviews: 1 (agents) · fix rounds: 0 (2 low findings fixed inline: no "now shows" line when a role changed nothing; a redo's score becomes the next role's "before") · guard denials: 0 · weekly 48% → 48%
open: rulings — new `TailorMoment.tsx` copies enrichment's count-up and confetti with the `fm-moment` classes, because `CelebrateMoment` sits in the enrichment folder (off limits) and has fixed role-score copy; B7 reuses it. `flow-phase.ts` holds TailorFlow's Phase type and remember/remembered (re-exported) so TailorFlow stays under 300 lines. TailorFlow loads the job (`getJob`) to name requirements and the company. Full suite: 2 known flaky `cv/editor.test.tsx` "rapid typing" failures under load; they pass alone (14/14).

## Task B4: Skills review in batches of 5 (SkillsA2) — done
session: tailor-r2 Part B · builder: claude
commit: see git log (base d826179) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 49% → 49%
open: rulings — SectionReview hands the Skills step to SkillsReview; its old Skills groups and 3 copy keys are gone (`role-context.test.tsx` F5 test removed, `tailor-flow.test.tsx` clicks "Save skills"). A guess left undecided is sent in neither list (kept, unreviewed). Also removed one unused import in TailorFlow left by B3's split (lint). `.tailor-explain` / `.tailor-group` CSS is now unused (left in place).

## Next (fresh session, per claude-build's 4-task rule)
B5 Summary check (API `guesses` + SummaryReview; owner: each guessed phrase is its own item, counts separately) → B6 Final touches → B7 Done screen (reuse `TailorMoment.tsx`) → B8 Guided review (+ ExportMenu; expect a small merge with PR #46). Then the whole-branch review (Opus high, base `01cbc9a`), push, draft PR with base `rebuild/tailor-r2-flow`.
Notes for B5–B8:
- B5 needs accept changes outside its file list: an edited Summary text (Edit / Remove a phrase) and one review entry per guessed phrase, so "Still to check", the export warning and "AI guess N of M" all count phrases.
- B8: `accept.ts` must also store each guess's `reason` in `review` for the guided review.
- B7: the score labels and job are already loaded in TailorFlow (`scoreRef`, `job`) for "Now met"; TailorFlow is at ~287 lines, so the done screen goes in its own file.
- Full suite under load: 0–2 flaky `cv/editor.test.tsx` "rapid typing" failures; they pass alone.

## Task B5: Summary check in place (SumA) — done
session: tailor-r2 Part B (block 2) · builder: claude
commit: 4bdbadd (base 2ca7768) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 49% → 49%
open: rulings — outside the file list: `packages/shared/src/tailor.ts` (`placeGuesses` / `applyGuesses`, used by both API and web so the `summary#<n>` indexes match), `accept.ts` (a decision may carry `text`; each guess becomes its own review item `summary#<n>` with its `reason`; the summary item itself is no longer inferred when it has guesses), `tailor-api.ts` (AcceptBody `text?`), and `guesses: null` added to the strict model replies in the API tests and `eval/tailor/run.ts`. A guess not found verbatim, or overlapping an earlier one, is dropped. "Use my original summary" sends at once (no guesses stored).

## Task B6: Final touches one per screen (FinalA) — done
session: tailor-r2 Part B (block 2) · builder: claude
commit: see git log (base 4bdbadd) · reviews: 2 (agents) · fix rounds: 1 (an empty final touch's auto-accept now has its own step `pass()` with its own Retry; the tick shows only once saved) · guard denials: 0 · weekly 49% → 49%
open: rulings — `LayoutReview.tsx` holds all three final-touch screens (Achievements, Languages, Order and headline); copy in `en-tailor.ts`, two CSS lines in `tailor.css`. TailorFlow is at ~306 lines until B7 moves code out.

## Task B7: "Tailoring done" screen (DoneA) — done
session: tailor-r2 Part B (block 2) · builder: claude
commit: see git log (base 11d00dd) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 49% → 49%
open: rulings — `TailorMoment.tsx` gains an optional button and a children slot (the done screen sits under the count-up); `role-done.ts` exports `nameOf`; the steering confirm dialog moved to `SteeringStep.tsx` (`SteerConfirm`) so TailorFlow stays at ~299 lines; `TailoredCvPage.tsx` reads `?tab=letter` and `?export=1`, and `ExportMenu.tsx` takes `startOpen` (the done screen's Export and cover letter links). Now met counts requirement labels only (refs `r<n>`) whose base status was missing or partial. A run that is already done shows the done screen again on reload of the flow. `tailor-flow.test.tsx` now finishes through the done screen. Full suite under load: up to 9 timing failures in `cv/editor`, `jobs-page`, `editable-page` (files this task doesn't touch); each passes alone.
