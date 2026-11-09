# Progress: 2026-11-06-test-fixes

Worktree `resumora-fixes`, branch `fix/local-test-findings`, base `ba8a190`.

## Task 1: Reproduce the typing loop (H1) in a test — done
commit: f49fcfe · codex: build 01a1ade1, review 01a1ade6 · codex tokens: 822,977 · fix rounds: 0 · guard denials: 0
open: H1 did not reproduce in jsdom. In Chrome, 26 single key presses kept every character; only the
extension's burst `type` dropped one. The user confirmed no missing letters when typing by hand. H1 closed as a
test-tool artifact; the tests stay as a regression guard.

## Task 2: Fix the typing loop (H1) — skipped
open: not needed (see Task 1).

## Task 3: Empty sections are flagged again after the CV is replaced (M1) — done
commit: d59ba93 · codex: build 01a1ade8, review 01a1adeb · codex tokens: 542,366 · fix rounds: 0 · guard denials: 0
open: none

## Task 4: Implausible job deadlines (M2) — done
commit: 650a51e · codex: build 01a1adec, review 01a1adef · codex tokens: 399,492 · fix rounds: 0 · guard denials: 0
open: date format is fixed to en-GB, like the page's salary; revisit when the UI gets more languages.
Browser check: re-adding the same ad stored applyBy null (the model got the year wrong again), page shows
"Apply by 30 Nov 3011" for the old row. The model probably lacks today's date in the job prompt (not fixed here).

## Task 5: Rewrites must not add a purpose or outcome (M3) — done
commit: b580fa8 · codex: build 01a1adf0, review 01a1adf2 · codex tokens: 218,351 · fix rounds: 0 · guard denials: 0
open: not checked against live AI (enrich eval needs the keys).

## Task 6: Give the job extraction model today's date — done
commit: 3393d6e · codex: build 01a1adf7, review 01a1adfb · codex tokens: 626,190 · fix rounds: 0 · guard denials: 1 (Claude appended this task to the plan from the shell; redone with Edit)
open: none. Browser check: the same ad now extracts applyBy 2026-11-30 and shows "Apply by 30 Nov 2026".

## End of run
Whole-branch review (ba8a190..b580fa8): pass, session 01a1adf3 (157,400 tokens).
Browser checks on the branch: M1 verified (restore flags empty sections again), M2 verified (see Task 4).
Cost: Codex build+review 2,140,586 tokens (most cached); plus counterpoints 269,774 and the first H1 trace
646,003. Guard denials: 0. Claude context: one long session.
