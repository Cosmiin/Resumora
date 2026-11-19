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

## Task 8: Start screen and score explanation show the checklist — done
session: Enrichment redesign: Tasks 5–9 (side session, 19 Nov) · builder: claude
commit: 7a7c6a0 (base 1edc737) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: rulings — RoleChecklist came from Task 7; score-explain.test.tsx expectations updated to the new layout; the old explanation strings (lines, coverage, coverageList, shape.*, na) removed as unused. Start dates use the CV's own date format (`formatRange`), e.g. "Jan 2020 – Present", not years only. Web `editor.test.tsx` and `jobs-page.test.tsx` timed out in the full run and pass alone (known flaky).

## Task 9: Real AI check on the Vevol role (not committed) — done, two findings for the owner
session: Enrichment redesign: Tasks 5–9 (side session, 19 Nov) · builder: claude
commit: none (eval deleted after the run) · model: openrouter google/gemini-3.1-flash-lite · 6 runs, 8–9 calls and ~45–52k tokens each
results:
- Step 1 (Shape merges lines 2, 3, 5): 4 of 6 runs merged at least two of them (twice 1+2+3+5, once 1+3+5, plus one run whose details were not captured); 2 runs merged only 1+5. Every merge kept "5-10", Asana and Shopify Plus, at 125–164 characters (limit 220). Merged role vs original (full rescores): 87→91, 84→87, 84→90, 93→97, 87→81.
- Step 2 (an answer "I reported to the Head of Ecommerce"): 6 of 6 runs put it in the description ("Shopify agency. Reported to the Head of Ecommerce."), never in a line.
- Step 3 (a weak rewrite of the revenue line, plus one better line): the weak rewrite was held in 6 of 6 runs. Predicted vs full rescore of the kept role: 91 vs 87 (first run, different setup), 84 vs 91, 80 vs 91, ≤3 (one run), 88 vs 91, 83 vs 85: within ±3 in 3 of 6.
open (owner decides):
1. The core-item marks are re-read on every AI call and flip on the same text: on "Shopify agency." the company and purpose items went shown → applies between calls. One flip moves a role about 7 points (1 of 6 × 40%). In one run the only kept change raised a line 70 → 100, yet the prediction fell 93 → 88 because company flipped. So a change from the answers can still show as a lower score, the outcome the redesign is meant to prevent. Options: (a) during the path, a core item stored as shown stays shown unless its text was removed; (b) for Shape, keep the stored marks, as the design says ("the core-item marks stay"; Task 4 re-reads them on every check); (c) leave as is and accept the noise. Not built: no rule the owner didn't ask for.
2. `checkChanges` with `hold: true` holds a merge's `bullet` change but keeps its `remove` changes, so the merged-away lines would vanish. The path never does this today (Shape checks with `hold: false`; preparing makes no removals); the eval's first run hit it by mixing them. Fix would be to hold a merge's removals with its line.

## Whole-branch review (base 15ed0f7) — passed
session: Enrichment redesign: Tasks 5–9 (side session, 19 Nov) · builder: claude
reviews: 1 whole-branch (Opus high) + 1 fix-only (Opus high) · fix: d95a9bd (a second round's end screen could skip waiting for its scores; low)
open: the two Task 9 points above (core-mark noise; hold with a merge's removals), and PATH_PARALLEL = 6 untested against OpenRouter.
cost: no Codex; review agents this part (Tasks 5–9): 4 per-task Sonnet + 2 Opus; guard denials: 0; real-AI eval: 6 runs, ~300k tokens on gemini-3.1-flash-lite. Weekly usage not read in this session.

## Task 10: Company and purpose leave the score; the path's check keeps shown marks (owner, 19 Nov) — done
session: Enrichment redesign: Tasks 5–9 (side session, 19 Nov) · builder: claude
commit: 9995103 (base fd53dd1) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
what: core = actions, tools, results, scale (round(100 × shown / 4)); company and purpose on the checklist (first under Worth adding, always listed); purpose questions in the budget's second tier; `/check-changes` never lowers a mark stored as shown; SCORE_POLICY = score/10. Score expectations in api tests moved +7 (the fake roles never showed company or purpose); the prompt snapshot test now ignores the policy line.
stability (real AI, Vevol role, gemini-3.1-flash-lite, 2 runs in separate processes, 44 calls, ~300k tokens): the same role scored 10 times per run gave 95 ×10 in the first run and 93 ×10 in the second (spread 0 within a run, 2 across runs; identical requests at the same moment likely got the same cached answer, so within-run repeats aren't independent). Core part 100 in all 20 scores (before: 84–93 across runs, mostly company/purpose flips). The 2 points across runs come from one line graded 100 vs 80. Prediction vs full rescore after a kept rewrite: 96 vs 98 (×3) and 95 vs 98 (×3), within ±3; the weak rewrite was held 6 of 6.
open: line grades still differ between runs on borderline lines (one line 80 ↔ 100 = 2 role points). Tightening the line-grading wording is the next lever if the owner wants a spread of 0.

## Task 11: Sharper line-grading rules (owner, 19 Nov) — done
session: Enrichment redesign: Tasks 5–9 (side session, 19 Nov) · builder: claude
commit: 3ecb6bd (base 48f8c17) · reviews: 1 (agents) · fix rounds: 0 (the reviewer's low finding — "various" was both filler and the broad-area example — fixed before the commit) · guard denials: 0
what: GRADING_RULES now say a number of people/clients/accounts/sites/items covered is scale (impact specific); a broad verb followed by the concrete action is specific contribution, partial only for vague verbs (supported, helped with, assisted, was involved in, participated in); broad wording never lowers clarity or concise; specificity is specific when the line names what was worked on plus one more detail (for whom, when/how often, tool/method, why). Examples are not the test lines. The rest of the score prompt is unchanged (hash guard). SCORE_POLICY = score/11.
measured (real AI, gemini-3.1-flash-lite, 10 independent scores per batch, fresh line ids so no cached answer is reused, ~140k tokens per batch):
- before: Vevol 90×4 92×3 93×2 95; payroll 87×7 89×3. Lines that changed grade between scores: 4 of 8 (Vevol), 2 of 5 (payroll).
- after (5 batches of the kept wording or near variants): Vevol 96×8 93 97 | 96×4 98×4 93 95 | 96×5 98×4 97 (final); payroll 87×9 89 | 87×8 86 88 | 89×5 87×3 88×2 (final). Lines that still change: 1 of 8 (Vevol, "Managed technical store operations…"), 2–3 of 5 (payroll, "Checked employment contracts before signing", "Answered staff questions about payslips").
- One variant (also telling the model broad wording never lowers contribution) was tried and dropped: no gain.
open: rewording has reached its limit on this model: about ±1–2 points remain on genuinely borderline lines. Further options (owner's call, not built): a stronger grading model, or grading each role twice and keeping the higher/agreed grade (2× the cost).

## Task 12: CI lint fix (react-hooks rule on use-prefixed functions) — done
session: enrich-shape handoff · builder: claude
commit: 7b73c0a (base 05bccc0) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none. `useAnswers*` renamed to `placeAnswers*`; route `/v1/enrich/use-answers` and `UseAnswers*` types unchanged. Lint, typecheck and tests pass (editor/pdf timeouts under full load passed alone).
