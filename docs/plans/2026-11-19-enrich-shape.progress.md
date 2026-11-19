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

## Task 4: Check changes: grade only what changed, hold what would lower, predict the score — done
session: Enrichment redesign (owner session, 19 Nov) · builder: claude
commit: (this commit) (base 1d15744) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: notes — `gradeWithCoverage` returns coverage possibly undefined (stored marks kept then); the second call after a hold grades no lines (marks only), kept lines keep their first-call grades. Web `editor.test.tsx` and `jobs-page.test.tsx` time out in the full run and pass alone (known flaky).

## Task 5: Use every answer — done
session: Enrichment redesign: Tasks 5–9 (side session, 19 Nov) · builder: claude
commit: 694062d (base b43aca0) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: notes — the stored grades passed to the writer are the saved role's (a line rewritten by the prepared changes shows its old grade with its new text); new lines respect MAX_BULLETS (the CV's own limit).

## Task 6: The Shape screen — done
session: Enrichment redesign: Tasks 5–9 (side session, 19 Nov) · builder: claude
commit: aa5726d (base 694062d) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: ruling — step eyebrows renumbered in CompaniesStep/ToolsStep/BudgetStep (+ path-steps and budget-review tests), outside the file list. Start skips Shape synchronously when no role needs a merge or a move; Shape's check calls run all at once (no limit named). Web `editor.test.tsx` and `jobs-page.test.tsx` timed out in the full run and pass alone (known flaky).

## Task 7: Prepare all roles at once, apply directly, the new end screen — done
session: Enrichment redesign: Tasks 5–9 (side session, 19 Nov) · builder: claude
commit: 1edc737 (base aa5726d) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: rulings — ReviewSheet.tsx deleted with its tests in budget-review.test.tsx and its unused strings; `PrepChange` keeps `Change` as an alias; EndStep takes extra optional props `rolesBefore` and `more`; `RoleChecklist` written here (pulled forward from Task 8); new lines get fresh ids. The reviewer's one low finding (end screen flipped back to the spinner after Add anyway, losing a half-edited held line) was fixed before the commit: once shown, the end stays up (no test, covered by the branch review). A non-409 failed check leaves that role unchanged (its changes are not applied unchecked). `PATH_PARALLEL = 6` is untested against OpenRouter until a real run.
