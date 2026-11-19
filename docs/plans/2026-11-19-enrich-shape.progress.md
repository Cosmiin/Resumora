# Enrichment: Shape first, one fair score — progress

## Task 1: The new score and the two-tier question budget — done
session: Enrichment redesign (owner session, 19 Nov) · builder: claude
commit: 01641e5 (base 15ed0f7) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: ruling — 6 expected role scores updated in apps/api brain-dump/improve tests (formula change); web `jobs-page.test.tsx` timed out once in the full run and passes alone (known flaky)

## Task 2: Writers see the grades — done
session: Enrichment redesign (owner session, 19 Nov) · builder: claude
commit: (this commit) (base 01641e5) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none (score prompt verified byte-identical by hash before/after the GRADING_RULES move)

## Task 3: Shared change model and the Shape API — done
session: Enrichment redesign (owner session, 19 Nov) · builder: claude
commit: (this commit) (base 40c882e) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0
open: MIGRATION for the owner — `supabase/migrations/20261119000000_enrich_shape_ai_tasks.sql` adds `enrich_shape` and `enrich_use_answers` to `log_ai_call` (applied locally; the hosted database needs it before the API is published). Ruling: reused the existing `numbersIn` from enrich-checks.ts.
