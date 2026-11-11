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

## Phase 3, flow 1: public pages and account (branch `redesign/public-account`)

Owner decisions (2026-11-11):
- "Export all my data" and "Delete my account": approved. Two new API actions, no schema change. Delete uses the service role key on the server, only for the caller's own id.
- Name, default template and default tailoring language: new table `user_preferences` (migration `20261111100000_user_preferences.sql`), SQL shown to and approved by the owner before it was applied locally.
- Extension page: honest version. No "Connected" badge, no Disconnect button; it shows the install steps and the last job the extension saved.

Choices made while building:
- Routes: `/` homepage (signed-in visitors go to `/cv`), `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/account/{profile,preferences,data,extension}`.
- The top bar is new on every signed-in page; the pages under it (CV, jobs, tailoring) keep the old look until their own flow is rebuilt. "My CVs" joins the navigation with flow 6, when the page exists.
- Sign out moved from the old account menu to the profile page, as in the mockup.
- The name typed at sign-up travels with the login (user metadata), because preferences can only be saved once signed in. The profile shows it until a name is saved.
- Export is one JSON file downloaded at once (table rows as stored, uploaded files as base64), so the mockup line "the file will wait for you here" was replaced.
- A reset link that no longer works gets its own message and a way to ask for a new one (error state the mockup did not draw).
- Jobs added by hand in the web app are now labelled `link`, not `extension`, so "last job saved from the extension" is true.
- Italian is offered as a tailoring language (the engine supports six; the mockup listed five).
- Extension download: `npm run package -w @resumora/extension` builds the zip into `apps/web/public/downloads/` (not committed). It must be run before the web app is deployed, or the download button has no file.
- The default template and tailoring language are saved now; tailoring and export start reading them when flows 5 and 6 are rebuilt.

Codex deep review of this flow (two reads: server side, web side) and what changed because of it:
- No way found for one user to read, change, export or delete another user's data.
- Export: files are listed with one-hour download links instead of being packed into the file (many photos would exceed what one request may hold); the login's email, sign-up date and details are now included. The page says so.
- Preferences are cached per person, so a second person signing in on the same device never sees the first one's.
- Tailoring now starts from the saved defaults (language and template). The base CV preview still uses the classic template until flow 3 rebuilds that screen.
- Profile: a failed email change no longer claims "nothing was changed" when the name was saved; typing during a save is kept; a failed background refresh no longer discards what is being typed.
- Email change copy now says both addresses get a confirmation link (the project is set to confirm both).
- The page a person was heading to survives a detour through sign up or password reset.
- The extension page asks the server for the newest extension job (new `source` filter on the job list) instead of looking only at the newest 50 jobs.
- After deleting an account, the "go to the homepage" request is used once only.

Open for the owner:
- For up to an hour after deleting an account, the still-valid session could upload a file into that user's own storage folder, and it would stay. Closing it means changing the storage access rules (a check that the user still exists), which needs approval.

Owner review of this flow (2026-11-11): parts 1 and 2 approved with no changes. Decisions from the same review:
- CV language detection stays English and Romanian only for now.
- Close the gap after account deletion, kept simple: one rule on file storage that requires the account to still exist (`20261111120000_deleted_account_files.sql`).
- The golden examples report is accepted for now; the owner will test the prompts more deeply later.
## Phase 4: prompt rework (branch `redesign/prompts`)

- Map of every prompt as it stood: `prompt-map.md` in the workspace folder (2026-11-11). It supersedes the tailoring part of the 10 November map.
- Golden set: `apps/api/eval/golden/` (4 cases from the two fictional weak CVs and two ads, two with a language mismatch). `GOLDEN_LABEL=before|after npm run eval:golden` runs the prompts of the checkout and rebuilds `REPORT.md`. Saved runs are judged again with the current checks each time, so both columns are measured the same way.
- Rework: tailoring questions and rewrites, enrichment scoring and improve-bullet open with a short list of principles. New behaviour in code: questions follow the interface language (header `x-interface-language`, sent by the web app; absent = the CV's language, as before); "other" options are removed in six languages in both flows; single-role enrichment prompts get the role's period; focus roles change only the number of questions; the fact check of a role's rewrite no longer reads notes saved for other jobs; the "what does the company do" question carries no guessed options (the model is not told the employer).
- Stored enrichment scores are recomputed once (score policy 4 → 5), because the wording that produces them changed.
- Result on the golden set: 52 flagged patterns before, 0 after (the first count of 59 included 7 false alarms from the check itself, since fixed). The check is a word search; what a reader still finds is listed at the top of the report copy in the workspace.
- Not done: language detection for German, French and Spanish CVs (changes the shared CV structure, needs the owner's approval); a past-tense check in code for languages other than English.
- Codex deep review of the prompt rework found five points, all fixed: a stored score is reused only when its questions are in the language used now (server and the old enrichment screen); the improve-bullet prediction keeps its question language; re-grading one bullet follows the question language; a role's dates are part of the score fingerprint, so changing them asks fresh questions; a role that is not current with no end date is described as ended, not current.

## Phase 3, flow 2: base CV (branch `redesign/base-cv`)

- First step, before any screen is rebuilt: the old token names (pine, sage, marigold, old fonts, shadows, radii) now carry the new palette and type, and old buttons are ink pills. Every screen that is still waiting for its rebuild (CV page, enrichment path, jobs, tailoring, export) takes the new colours and fonts at once, with no change to layout or behaviour. Reason: the owner asked to walk the whole experience now, and two looks under one top bar read as two products. The names still say pine and sage; a comment in `tokens.css` says so.
- The engine already runs enrichment as a guided path with one question per step (`EnrichPath`, `FocusMode`, `useFocusSession`), with the role beside the question. The rebuild keeps that engine and changes what the mockup adds: choosing the roles, a free-text or spoken focus, the "why I ask" note, import leading straight into the path, and the result screen.
- Focus step (was the path's start screen): the roles, projects and volunteering below 80 are listed with a tick box each; the two most recent roles start ticked (with no role on the list, the first two of the others). The path visits only the ticked ones. Items at 80 or more are not listed, as before.
- "Is there anything you want your CV to bring out?": the text is kept for the open path only (no new stored field, so no change to the database or the shared CV structure). It is sent with the request that prepares each chosen role's questions (`focus` on `POST /v1/enrich/score`, at most 600 characters), which asks the model again with that goal in view; the note in the prompt says it is a goal, not a fact about the role, and that grades must not change. It does not reach the rewrite prompts.
- "Why I ask": for a question about one line, the one-sentence gap the score already names for that line; when the score names none, a general reason by kind (detail or result). For a question about the whole role, a fixed reason by topic (company, purpose, tools, other). No prompt change was needed.
- Question screen: top bar with where the role sits in the path, "Skip this role for now" (path only) and "Save and exit" (was ✕ Close); likely answers as a list; the role on paper beside the question with the line being asked about in bold and the note "Your answer rewrites this line in your CV". Under 900 px the paper is hidden and only the question and the reason show. The path's own segment bar across the top was removed; the top bar's words replace it.
- The engine's order of work is unchanged: an answer leads to a proposed rewrite of the line, which the person accepts or declines (the mockup showed the line changing directly). Quick stops for courses, awards, publications and interests, Key achievements and Skills still follow the roles.
- Question numbering is unchanged ("Question 1 of 2" counts role questions among themselves and line questions among the lines to improve), while the segments under it count every step of the role. Aligning the two changed nine existing tests' meaning, so it was left for the owner's review.
- Result screen: one layout in place of "Your CV is enriched" and "Almost there". CV strength before and after (the average of every scored item), one row per item with how far it moved, or why it did not (not chosen, already clear, or no change), what else the path added, and "What would help most next" (the weakest item's next step with the line it is about). "Find a job" shows from an average of 80, which is also when the CV is marked as enriched, as before.
- Import: "Reading your CV…" with a skeleton, then "We found N roles" (name, roles with dates and bullet count, CV language). The earlier review (where each heading went, what needs a look, the full page) sits under "Something is wrong or missing" and opens by itself for a scan, lines not found in the file or anything to confirm. "Start with the questions" uses the import and opens the focus step; "Skip for now" uses it and shows the CV with a notice that the questions are waiting. "Cancel" in the top bar leaves the CV untouched. The History line shows only when a CV with content is being replaced.
- No CV yet: the page starts with the upload (drop a file or choose one). "I'd rather write it from scratch" opens the empty page; it is not in the mockup and keeps what a new person could already do.
- My CV page: a heading with "Enrich my CV" (moved from the side panel), and above the panel the CV strength, the template and the CV language. The template is the person's preference (the one their tailored CVs start with); the base CV page now shows it, and choosing another one here saves the preference.
- Not in this flow: "Export" on My CV (the base CV has no export today; it belongs to the templates and export flow) and the "My CVs" navigation item.
- Copy: the flow's keys moved from `en.ts` to `en-basecv.ts`, with `ro-basecv.ts` typed against it. The editor's own panel and field labels (`panel.*`, `edit.*`, `cv.*`) are still English only.
