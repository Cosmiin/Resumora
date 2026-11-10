# Redesign log

One line per non-obvious choice: date, choice, why. Read at each review.

## Phase 0: clean slate (2026-11-11)

Rule applied: merge what changes the API, prompts, extension or shared schema; drop what only changes screens.

| Branch | Decision | Why |
|---|---|---|
| `chore/remove-codebase-map` | Merged into main | Removes `docs/map` and updates `AGENTS.md`; follows the owner's 2026-11-10 decision to remove the map. Docs only. |
| `feat/enrich-guided-flow` (tip `c445716`) | Dropped | Changes only `apps/web` (enrichment screens, copy, styles). Those screens are replaced. Still on GitHub. |
| `feat/tailor-on-the-page` (tip `647b300`) | Dropped | Changes only `apps/web` (tailoring screens, copy, styles). Still on GitHub. |
| `rebuild/tailor-r2-enrich` (tip `2f107b8`) | Deleted, nothing to merge | Its engine work (enrich API, shared schema, migration) is already on main; a trial merge produced main's exact tree. |
| `fix/tailoring-role-scope` | Deleted, nothing to merge | Same commit as main: the role-scope prompt fixes are already merged. |
| `fix/e-photo-export-menu`, `fix/e-photo-export-menu-menu`, `map/initial` | Deleted | Already merged. |
| Job-closed branches | Nothing to do | Already merged; only empty folders were left. |
| `docs/codex-build-redesign` | Left as is, owner to decide | Two tooling documents, neither engine nor screens, and this repo is public. |

Other choices:

- 2026-11-11: removed all `resumora-*` worktree folders (13). Chrome loads the extension from the main checkout, so none was in use.
- 2026-11-11: stopped the dev server that was still running from the dropped `resumora-tailor-page` worktree.
- 2026-11-11: branches were deleted locally only. Their copies on GitHub are untouched, and main (2 commits ahead) is not pushed.
- 2026-11-11: after the merge, on main: lint and typecheck pass; tests pass (shared 438, API 773 + 4 skipped, extension 229, web 919). Database tests not run: no migration changed.
