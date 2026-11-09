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
