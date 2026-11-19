# Top-grade lines: progress

## Task 1: Lines up to 440 characters (score/12) — done
session: enrich-shape handoff · builder: claude
commit: fe6a830 (base d6d29b8) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0
ruling: every line limit moves to 440, not only the grader's: `PROPOSAL_MAX`, the focus/rewrite prompts, the "too long" tip (en, ro). `CONCISE_CHARS` = { partial: 440, missing: 440 }: over 440 is concise "missing". REST hash unchanged (only blanked parts changed).
open: none

## Task 2: Writers aim for the top grade — done
session: enrich-shape handoff · builder: claude
commit: 846438c (base fe6a830) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none. Shape keeps its floor ("not weaker than the lines it replaces") next to the top-grade bar.

## Task 3: Gradeable options with a blank and its amounts — done
session: enrich-shape handoff · builder: claude
commit: 44c0eef (base 846438c) · reviews: 1 (agents) · fix rounds: 0 (one low finding fixed: a dead regex removed) · guard denials: 0
ruling: `amounts` is optional everywhere (not default []), so older results and test doubles need no change. REST hash updated on purpose: the option rules and the Results row are new prompt text.
open: none

## Task 4: Blank options: pick an amount or type it — done (after escalation)
session: enrich-shape handoff · builder: claude
commit: 9ffc063 (base 44c0eef) · reviews: 4 (agents: 3 Sonnet, 1 Opus) · fix rounds: 2 + 1 after escalation · guard denials: 0
rulings: an unfilled blank is dropped by `withoutOpenBlanks` in each submitting screen (QuestionStep, RoleRun, ProjectRun), not in the reducer, so a "…" typed by a phone's autocorrect survives; focus.css in scope for the focus-mode amount row. Escalation: character-by-character matching kept missing edge cases (endless loop for "…% faster", trailing space or ", " hiding an open blank), so the blank logic was rewritten on trimmed comma pieces; a fill counts only as a short amount with a digit. Amounts without a digit are dropped in shared `pickOptions` to match.
open (low, from the Opus review): a short typed text that starts like a trailing-blank option and has a digit ("Led a team of 5" vs "Led …") reads as filled; a blank option can match an already picked plain option with a range ("10–50 clients" vs "… clients"); words spoken right after a filled blank join with a space, so the chip reads unpicked; text typed after a blank without a comma ("…% in Q3") keeps the "…". Blank options containing a comma are unsupported.

## Task 5: A held line asks for its missing fact — done
session: enrich-shape handoff · builder: claude
commit: 584e168 (base 9ffc063) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
ruling: ro-basecv.ts in scope; `asks[].amounts` optional like every other amounts field.
open: none

## Task 6: Real-AI check — done (not committed; eval deleted)
Same eval on main (d6d29b8) and on the branch, 5 runs each, payroll role with three answers, plus 5 scores each of the Vevol and payroll roles. 60 AI calls per side, 0 failed.
- Facts placed from answers (use-answers, then graded): before 11 of 15 lines at 100 (average 94.7); after 15 of 15 at 100 (average 100). The before misses were the month-end line at 80.
- Line rewrites (improve-bullet): before 5 of 6 at 100 (avg 96.7); after 5 of 6 (avg 99.2). Both sides answered "needs more detail" for 9 of 15 requests even with the answers in the notes — unchanged by this work, worth a look on its own.
- Line length: every written line 75–116 characters; nothing used the new room up to 440.
- Options: vague result options ("Faster", "Lower cost" …) 0 on both sides. Blank options: before 0, after 7, on 2 questions, both with amounts; 0 blank questions without amounts. Purpose options: before bare nouns ("Client account management", "Project coordination"); after concrete aims ("To manage Shopify store operations for clients", "Managing end-to-end payroll for small business clients").

## End of part
Whole-branch review (Opus high): 1 medium, 1 low, both fixed — `mergeGrades` dropped `amounts` on lines it did not grade again (stored results after check-changes / improve-bullet lost the amount chips); "Add with this fact" added a second note on a retry (now one note per card via the round's `save` slot). Fix-only review (Opus high): pass. No second whole-branch review needed: the fix touched one shared function's output field and one web handler.
Cost: review agents 12 (9 Sonnet, 3 Opus for the Task 4 escalation and the branch); guard denials 0; no Codex. Real-AI eval: 120 AI calls across both sides.
Tests: shared 518, api 936 (+4 skipped), extension 229, web 1213 — all pass; lint and typecheck clean.
Not done: hosted database needs nothing (no migration). Not checked in a browser.
