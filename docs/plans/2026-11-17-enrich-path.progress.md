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

## Task 4: Companies and tools screens — in review
session: Company question · builder: claude
commit: 72db7de (base 9426337)

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
- Task 4: all ticks removed from a role saves "None of these"; when the tools call fails, the grid is empty and
  Continue saves nothing.
- Task 4: strings under `enrich.path.*` (step, companies.*, tools.*, review.tidied) in en and ro.
