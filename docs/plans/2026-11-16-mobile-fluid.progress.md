# Progress: phones, fluid sheet and question screens

Branch `feat/mobile-fluid`, worktree `resumora-mobile`, base `2e3f988`.

## Tasks 1–3: sheet follows the finger · no keyboard by itself, buttons in reach · swipes stay inside — done
session: Mobile fluidity · builder: claude
commit: e5d9b0c (base 2e3f988) · reviews: 3 (agents) · fix rounds: 1 · guard denials: 0
open: none

One commit for the three tasks: Tasks 2 and 3 were built while Task 1's fix was in review, and they share `focus.css` and `editor.css`.

Whole-branch review (Opus): pass, one low finding (a fast drag that stops before the finger lifts counted as a flick). Fixed with a test in the next commit; not re-reviewed (three lines, low).
Cost line: review agents 4 (3 Sonnet, 1 Opus) · guard denials 0 · no Codex.

## Published on 2026-11-17 (owner asked)
- Website only, to the Pages project `resumora` (https://resumora.pages.dev): a build of `feat/go-live` with this branch merged in (local merge `0321353`, on no branch, not pushed). The Worker and the database were not touched.
- Until both pull requests are merged, the live website matches neither branch alone.

## Rulings
- Task 1: the short sheet's travel also subtracts the phone's bottom inset (read from the sheet's own bottom padding), so the drag starts where the sheet rests. Review finding, fixed.
- Task 1: the "this click belongs to the drag" flag clears itself after 350 ms, because a finger's drag sends no click. Review finding, fixed.
- Task 2: the sticky footer's `bottom` is minus the focus screen's bottom padding (the padding counts as part of the sticking area); in the tailoring room, where the page scrolls, it is 0. Found in the phone-sized check.
- Task 2: the footer's desktop width cap is lifted while it is sticky, so its line runs edge to edge between 560 and 900 px.

## Checked in a browser (390 px wide frame, Chrome, local database)
- Sheet: follows synthesized touch drags 1:1 (rest 584 → 484 → 334 px), opens on release, a drag on its content does not close a full sheet, a drag down from the grip closes it, a drag ending on a button does not click it.
- Question screen: footer pinned to the bottom edge when the step is taller than the screen, in its place at the end; no sideways scroll; `overscroll-behavior: contain` applied.
- Not checked: the slide animation's timing (the Chrome window was not on screen, so it drew no frames), a real finger on a real phone, iPhone Safari, the touch-screen focus rule outside its unit tests.
