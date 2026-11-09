# Tailoring round 2 · Part A progress (session 5, `rebuild/tailor-r2-flow`)

## Task A1: Shared schemas for steering, per-role runs and guesses — done
session: tailor-r2 Part A · builder: claude
commit: 7d505dd (base 9c5728d) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 43% → 43%
open: ruling — 4 tone labels added to `apps/web/src/i18n/en-tailor.ts` (the existing steering screen lists every tone).

## Task A2: Migration: steering answers and role order — done
session: tailor-r2 Part A · builder: claude
commit: see git log (base 7d505dd) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 43% → 43%
open: migration (owner): new columns only, no RLS change. Owner steps went into a new tracked file `docs/superpowers/plans/2026-11-09-tailor-r2-db-steps.md` because the named db-steps file is uncommitted in the main folder. Applied locally with `npx supabase migration up`; `npm run db:test` passes (222).

## Task A3: Steering reaches every step — done
session: tailor-r2 Part A · builder: claude
commit: see git log (base 58aac53) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 43% → (next block)
open: rulings — `repo.ts`, `questions.ts`, `section-pass.ts` edited for wiring; the section prompt now sends one steering block instead of separate tone/instruction fields.

## Task A4: Steering screens (SteerC1, SteerC2) — done
session: tailor-r2 Part A · builder: claude
commit: see git log (base 667b146) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 43% → 44%
open: rulings — tone cache through two new TailorRepo methods; TailorFlow passes jobId and roles; `tailor-flow.test.tsx` and `cv/enrich/voice-look.test.tsx` updated to the new screens (the second one sits in session 7's folder: expect a tiny merge there).

## Next (fresh session, per claude-build's 4-task rule)
A5 Experience role by role → A6 truth rule → A7 Skills questions → A8 question screen → A9 going back. Then whole-branch review (Opus high), draft PR to `rebuild/tailor-r2-bugs`.

## Task A5: Experience runs role by role — done
session: tailor-r2 Part A (session 5, second block) · builder: claude
commit: 15827fe (base 43c3fe6) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 44% → (see A6)
open: rulings — `repo.ts`, `memory-repo.ts`, `supabase-repo.ts` map `role_order`/`current_role_id`; `retailor.ts` sets the role order; `eval/tailor/run.ts` loops roles. Skills cap 5, other sections share 8. Low (not fixed): a run started before this change has an empty role order, so its Experience step proposes nothing. The web still calls Experience without `roleId` until A8 (the web flow is broken against the real API between A5 and A8).
