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
