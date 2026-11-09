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

## Task 3: Role questions about company, purpose and tools, plus the thin flag — done
session: r2-enrich (session 7) · builder: claude
commit: see git log (base 3921670) · reviews: 2 (agents) · fix rounds: 1 (one stale test expectation) · guard denials: 0 · weekly 44% → 44%
ruling: also holds the owner's `fresh` flag on `POST /v1/enrich/score` (routes.ts, routes.test.ts, web `scoreRole`). Old RoleResult fixtures in 7 web test files gained `thin: false` / `topic: "other"`. The "Question n of N · Tools" eyebrow moves to Task 2 (FocusMode).
note: `score/4` changes every role's fingerprint, so every stored role is re-scored once when its CV opens (as the plan intends).
open: none

## Task 2: Steps never disappear, and Back (2B) — done
session: r2-enrich (session 7) · builder: claude
commit: see git log (base 8e87db3) · reviews: 1 (agents) · fix rounds: 0 (two low findings fixed before commit: a first answer given after Back counts toward the answers→bullets step; the bullet eyebrow is hidden on a revisited step) · guard denials: 0 · weekly 44% → 45%
ruling: `apps/api/src/enrich/brain-dump.ts` (+ test): `source: "answers"` now reads every role note, the box included, so the thin role's pick step is built "from the box and the answers". `QuestionStep` exports a small `BackButton` used by the three step components.
built: thin role = box first → (box answered: AI re-asked with `fresh`) → role questions → answers→bullets behind a plain working screen → pick → bullet questions. The history of shown text steps drives Back (re-send updates the same note and returns to the latest step) and the dots row. The `FocusMode` key in `Editor.tsx` no longer includes the mode.
note: `dumpEmpty` is no longer reachable (a thin box goes on to questions or bullets; a free-talk ramble with nothing new returns to its question). Left in place.
tests: the editor's "rapid typing" tests time out at 5 s in full web runs on this machine today; they pass alone, and the base branch (r2-bugs) times out the same way in a full run.
open: none

## Task 5: The role description step (3B) — done
session: r2-enrich (session 7) · builder: claude
commit: see git log (base 05d8e1a) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0 · weekly 45% → 46%
ruling: the answer is `{ text, keywords }` (keywords: ATS terms the model used, kept only when they appear in the text, for the "Helps ATS with" chips). The prompt lives in `role-description.ts`.
**database (for the owner):** new migration `supabase/migrations/20261109210000_enrich_r2_ai_tasks.sql`: `log_ai_call` accepts `enrich_role_description` and `enrich_achievements` (Task 7). Without it the calls work but are never logged in `ai_calls`. Same body, security and grants as before; it keeps `tailor_tone_examples` from session 5's `20261109200000_tailor_r2.sql`, so whichever runs last keeps every name. Applied to the LOCAL database only (session 5's migration file was copied in for the CLI check and removed again; history not repaired). `supabase test db`: 209 pass. The hosted database is untouched.
open: when merging, session 5's branch and this one both redefine `log_ai_call`; a later migration on either branch must keep all names.

## Task 6: The guided path and its start screen (1A) — done
session: r2-enrich (session 7) · builder: claude
commit: see git log (base b8eaefa) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 46% → 47%
ruling: `HelperPanel.tsx` passes `onEnrich` to `Overview`; the editor tests for the button and `?enrich=1` are in `editor.test.tsx`. Below 80 = anything but a ready score ≥ 80. The Key achievements stop is a placeholder until Task 7.
open: none
