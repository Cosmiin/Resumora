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
