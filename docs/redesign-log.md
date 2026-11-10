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
- 2026-11-11: `docs/codex-build-redesign` resolved by the owner: its two documents were moved to the private workspace and the branch deleted.
- 2026-11-11: after the merge, on main: lint and typecheck pass; tests pass (shared 438, API 773 + 4 skipped, extension 229, web 919). Database tests not run: no migration changed.

## Phase 1: design variants (2026-11-11)

Owner's answers: questions and buttons in the interface language, CV text in the tailoring language; the design speaks to early-career and experienced job seekers equally.

- 2026-11-11: wrote `PRODUCT.md` (product facts only, no visual decisions) from the brief and the owner's answers; the design skill needs it before any visual work.
- 2026-11-11: the current look (pine green, sage, Newsreader and Instrument Sans) is treated as the old look and not carried over. Why: the brief asks for a new warm direction, and both fonts are on the design skill's list of overused defaults.
- 2026-11-11: three variants, each with a different organisation as well as a different skin, so the choice is about more than colour:
  - A "Glazed": cobalt and ivory from Romanian glazed ceramics, side rail, questions left and CV preview right, old and new bullets side by side. Rings are the one motif and the progress mark.
  - B "Coach's Page": sunny desk with white sheets, top bar, the CV sheet on the left, coach's questions and reasons in blue handwriting, yellow highlighter on what changed, old above new.
  - C "Ticket Book": apricot and plum, each role and question a perforated coupon, a strip that shows the roles still ahead, decisions land as a stamp and the unchosen text stays visible, struck through.
- 2026-11-11: no drawn illustrations in the variants; "light illustration" is done with simple shapes (rings, highlighter strokes, perforations). Why: no image generation here, and sketch-style SVG drawings read as amateur. Real illustration can be added to the chosen variant.
- 2026-11-11: the three mockups share one copy file and one script (`mockups/phase1/content.js`, `app.js` in the private workspace), so English and Romanian wording is identical across variants and can be corrected in one place.
- 2026-11-11: mockups are light theme only. Why: the product has no dark theme and the brief does not ask for one.
- 2026-11-11: wording choices visible in the mockups: inferred questions read "It looks like you … since you … Is that right?" with an "Inferred from your CV" tag; a bullet with no real improvement shows "This bullet already fits the job. No change suggested."; the keyword count ("6 of 10") replaces an unexplained score, with a one-line reason under each suggestion.
- 2026-11-11: checked before publishing: no console errors, no sideways scroll at phone width in either language, text contrast at AA (two greens darkened after the check), radio groups keyboard-operable, touch targets 46px or more, reduced motion respected. The separate critique and accessibility skills run on the chosen variant, not on all three.
