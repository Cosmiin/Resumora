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

## Phase 1: chosen variant and foundation (2026-11-11)

Owner chose variant B, "Coach's Page". `DESIGN.md` describes it. Work is on branch `redesign/foundation` (worktree `resumora-foundation`).

- 2026-11-11: critique and accessibility review of variant B, fixed in the mockup: CV text now carries its own language tag inside a Romanian page, navigation is labelled, one 40px button raised to 44px. Carried into the kit: decision status lines stay in the page so screen readers announce them.
- 2026-11-11: new tokens come first in `tokens.css`; the old look's tokens stay below in a marked block until the last old screen is replaced. Old names that clashed with new ones were renamed with an `--old-` prefix across the old stylesheets (spacing, display font, tight leading, semibold weight, content width, durations). Why: the new names should be the clean ones, since the old ones are going away.
- 2026-11-11: kit styles are plain CSS classes prefixed `ui-` in one file (`styles/ui.css`), not a CSS-in-JS library. Why: the app already uses plain CSS, and no new dependency is needed.
- 2026-11-11: the kit takes every color, space, radius, type size, shadow and duration from tokens. The few fixed sizes left are the inner geometry of drawn marks (checkbox tick, spinner, step circle).
- 2026-11-11: new dependencies: three `@fontsource-variable` font packages (self-hosted, Romanian diacritics) and `lucide-react` for icons.
- 2026-11-11: `t()` now reads the chosen language. New screens use `useT()`, which re-renders on a language change; old screens keep calling `t()` and stay English until replaced. Romanian is a partial dictionary that falls back to English; each rebuilt flow adds `ro-<flow>.ts`, and the type system rejects a missing or extra key against its `en-<flow>.ts`.
- 2026-11-11: default interface language is English until the person chooses; no browser-language detection (not asked for).
- 2026-11-11: Dialog uses the browser's own dialog element (focus trap, Escape, focus return come for free). Menu closes on any outside click and on Escape (test finding #13).
- 2026-11-11: voice input is not a kit component: the flows reuse the existing `cv/enrich/VoiceControls`.
- 2026-11-11: gallery at `/dev/ui` exists only in development; verified absent from the production build.
- 2026-11-11: known issue, not from this work: six "rapid typing" tests in `src/cv/editor.test.tsx` take about 2.7s each against a 5s limit and time out when the whole suite runs under load. Same timing and same failures on main. Left unchanged; owner to decide whether to raise the limit.
- 2026-11-11: Codex review of the foundation found two bugs (a dialog closed on a click on its own padding; a menu stayed open after Tab moved focus out). Both fixed with tests. Owner confirmed: keep the Codex review for every flow.
- 2026-11-11: the foundation branch stays unmerged until the flow mockups are approved, so the shell and routes can be reviewed together with the kit.

## Phase 2: flow mockups (2026-11-11)

Six clickable mockups published as private pages, one per flow, English and Romanian, with empty, loading and error states switchable from a bar at the top. Sources in the private workspace (`mockups/phase2/`).

- 2026-11-11: all six share one stylesheet and one script, so a wording or look change is made once.
- 2026-11-11: checked before publishing: 130 screen-and-state views across both languages, no missing copy and no sideways scroll at phone width; key screens looked at on desktop. The formal critique and accessibility skills were run on variant B itself, not again on each flow page.
- 2026-11-11: tailoring demo uses the English CV with the English job (Flowbridge); the language-mismatch case is shown as a state of the language screen with the Romanian job.
- 2026-11-11: import ends on a short "we found 3 roles" confirmation with "Start with the questions" and "Skip for now", then goes into focus and the per-role forms.
- 2026-11-11: base CV keeps a 0–100 "CV strength" score with one line of reason per change; tailoring shows keyword and must-have coverage, no score.
- 2026-11-11: no claims invented: removed a file-size limit, a link-expiry time and a statement about screening software from draft copy. Time estimates ("about a minute", "about 10 minutes") are placeholders to confirm.

Open for the owner at the mockup review:
1. Finish screen: unmet must-haves are listed with the reason and a "Change my answer" button, and "Mark as ready anyway" stays possible. Should marking ready be blocked instead?
2. Extension install: the copy assumes testers download a zip and load it by hand in Chrome. Is that how testers will get it?
3. "Export all my data": shown as one prepared file to download. Needs a new API route; "Delete my account" needs a database and auth change. Both need approval before build.
4. "Add a job by hand" (paste the ad text) is kept from the current app. Keep it?
5. Base CV score name "CV strength": keep the number, or show only the reasons?
6. Default tailoring language preference offers "the job ad's language", "my CV's language" or a fixed language. The brief only says "default tailoring language"; are the first two wanted?

## Phase 2 review, 2026-11-11

Owner's answers to the six open questions (agreed with what the mockups show):
1. Finish screen: unmet must-haves are listed, "Mark as ready anyway" stays possible.
2. Extension: testers install from a zip, loaded by hand in Chrome.
3. "Export all my data" and "Delete my account" are wanted. The migration and auth change still get shown to the owner before they are applied.
4. "Add a job by hand" stays.
5. "CV strength" keeps its number, with the reasons.
6. Default tailoring language offers the ad's language, the CV's language, or a fixed one.

Review list:
1. Questions in the base CV flow and in tailoring appear one at a time (focus mode), not as a scrolling list, with an indication of what each question and answer is for.
   - Offered three layouts on one page (`mockups/phase2/focus-questions.html`): A the line it changes, B the whole role beside, C the reason in words. Waiting for the owner's pick, then flows 3 and 5 are updated.
   - Tailoring's line-by-line approvals stay a list unless the owner says otherwise.
   - Owner's pick (2026-11-11): on wide screens the whole role beside the question with the affected line pointed out, plus the coach's "Why I ask" note; on phones the question and the note only. Applied to flows 3 and 5; the three-layout page is retired.
   - Tailoring's role step is now two parts: the questions in focus mode, then the suggested changes as a list. The owner has not yet said whether the approvals should also go one at a time.
   - Owner (2026-11-11): tailoring's approvals of suggested lines stay a list.

## Phase 2 approved, 2026-11-11

Owner approved the six flow mockups. Foundation branch merged into main. Phase 3 starts with the public pages and account flow.
