# Progress: the short enrichment path

Branch `feat/enrich-path`, worktree `resumora-path`, base `feat/company-guess` (`e334072`). Plan commit `6a60ecb`.
The owner approved the design on 17 Nov 2026 and asked for it to be built, committed and pushed overnight
(new sessions allowed). Not to do without the owner: deploy to the live site, merge anything.

## Task 1: Shared path helpers — done
session: Company question · builder: claude
commit: e1d7027 + fix 218fac2 (base 6a60ecb) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0
open: none

## Task 2: API — companies and tools for the whole CV — done
session: Company question · builder: claude
commit: b9a5f73 + fixes 32281c4, 9426337 (base 218fac2) · reviews: 3 (agents) · fix rounds: 2 · guard denials: 0
open: none
- Migration `20261117000000_enrich_path_ai_tasks.sql` (log_ai_call allowlist: enrich_companies, enrich_tools, and the
  project flow's project_questions, project_write, which were missing). Applied on the local stack; pgTAP passes.
  **Not applied to the hosted database** (owner's step at deploy: `npx supabase db push --remote`).

## Task 3: Role change preparation is shared — done
session: Company question · builder: claude
commit: 8ae755a (base 32281c4) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Task 4: Companies and tools screens — done
session: Company question · builder: claude
commit: 72db7de + fix b326f52 (base 9426337) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0
open: none

## Task 5: Budget questions and the review sheet — done
session: Company question · builder: claude
commit: 9edad61 (base 4730b35) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Task 7: Sparkles removed; project Improve; Suggest on five sections — done
session: Company question · builder: claude
commit: c40d2a2 (base 9edad61) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Task 6: The short enrichment path — done
session: Company question · builder: claude
commit: 3ba2d28 (base c40d2a2) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

Tasks 5–7 were built in this same session: a fresh session could not be started while the owner was connected over
Remote Control. Task 7 was built before Task 6 (it does not depend on it).

## Whole-branch review (Opus, base 6a60ecb)
Three medium and two low findings, all fixed in bd04d5c: a corrected answer (after Back) replaces its note; company
and tools answers no longer count as an answer about the whole role (they no longer widen rewrites to lines up to
100), and a role that got any note this round is never labelled "tidied"; Continue on the companies and tools screens
works once; budget answers are capped at the note limit; a long company name no longer hides every proposal.
Also 4d7b204: the four step names on the upload screen follow the short path.

## Checked in a browser (local stack, Chrome, a local test account) on 2026-11-17
A test CV with HR Manager · Carbon Global, Talent Acquisition Lead · Carbon Global SRL and Staffing Manager · Robert Half.
- Start: "Your CV: 36", Start enabled once the three roles were scored.
- Companies: one row for both Carbon Global roles (empty field), Robert Half with the AI's sentence and Edit.
- Tools: one grid, 8 tool columns, the add box reachable by scrolling the grid sideways.
- Questions: "Step 3 of 4 · Question 1 of 8", the role card (HR Manager · Carbon Global · Mar 2022 – Present) on top.
- Review: three roles collapsed with their counts; descriptions used the company answers; tools named in the lines.
- Apply all, then "Your CV: 36 → 58" and "8 more questions".
- No ✨ on the page, no console errors.
Not checked in the browser: a second round, "Rather just talk?", Suggest on Key achievements and courses, phones.

## Rulings
- Task 1: `toolShown(role, "BI")` is true when a line says "Power BI": the tool's own words appear as whole words.
- Task 1: a line question is kept once per line (two lines may share a wording); a role question once per role.
- Task 2: the companies prompt states the company rule in its own words (no shared constant), so the scoring prompt
  stays byte-identical. It adds: a name alone is not knowing the company.
- Task 2: route tests live in `companies.test.ts` (createApp, like achievements.test.ts), not routes.test.ts.
- Task 2: an answer that never fits the schema is retried, then 503 `ai_unavailable` (callModel's rule everywhere).
- Task 3: the role run's own `finish` is not rewritten (it holds rewrites in the background and inserts follow-up
  questions). `prepareRoleChanges` is a separate function with the same rules; `changeActions` and the `Change` type
  are shared. Its signature is `changeActions(cv, roleId, list, changes, decisions) → { actions, applied, changedBullets }`.
- Task 3: `Approve`, `Piece` (and `Pick`) moved to `ReviewPieces.tsx`; `Piece` takes `tidied`.
- Task 4: a company proposal shows with Edit only; continuing without editing confirms it (via ["pick"]).
- Task 4: every tool a role's own text names starts ticked and always has a column (even past 8); a tool the
  person adds keeps its box on that row when unticked.
- Task 4: all ticks removed from a role saves "None of these"; when the tools call fails, the grid is empty and
  Continue saves nothing.
- Task 5: `RunQuestion` is exported from RoleRun.tsx and reused for each budget question; the review sheet never shows
  the "was" strikethrough; Back in the budget skips roles answered with "Rather just talk?".
- Task 6: the old result screen (EnrichedScreen, SkillsNotice, enriched-rows.test.tsx) is deleted (unused);
  ENRICHED_AVERAGE moved into EnrichPath.tsx; PathStart.tsx stays for PathSteps (upload screen).
- Task 6: a role with score state "none" (no lines) does not block Start; the end waits at most 20 s for new scores.
- Task 7: AchievementsStop and PathScreen live in SectionSuggest.tsx; the "Coming next" placeholder on Key achievements
  is gone (its mechanism, aiButtonsFor, has no entries left).
- Task 4: strings under `enrich.path.*` (step, companies.*, tools.*, review.tidied) in en and ro.

## Open (owner)
- Deploy needs the migration `20261117000000_enrich_path_ai_tasks.sql` on the hosted database
  (`npx supabase db push --remote`), then the Worker and the website. Not done (owner's call).
- This branch is based on `feat/company-guess` (PR #66): merge that first.
- Seen in the browser: the AI's rewrites sometimes pad a line ("using industry-standard recruitment tools"). That is
  the existing rewrite prompt, not this change.
- "Rather just talk?" sits under the question's buttons; on a short screen it is below the fold.

Fix-only reviews (Opus): two rounds on the review fixes; the last asked for a test of a second-round "Rather just talk?", added and checked by removing the fix (the test then fails).

Cost line: review agents 16 (11 Sonnet, 5 Opus) · guard denials 0 · no Codex.
