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
- Codex deep review of the base CV flow found five points, all fixed with tests: the page behind stays locked only while a focus screen is open, also when an upload finishes over the open path; a thin role's second request for questions keeps the focus text; a save conflict while importing into an empty CV shows the page with the conflict banner, not the upload again; a CV counts as empty only with no contact details and no entries of any kind; the top bar's ways out stay clickable above the "score went up" moment.

## Phase 3, flow 3: jobs (branch `redesign/jobs`, on top of `redesign/base-cv`)

- Job list: one sheet with a row per job (title, company and place, how long ago it was saved, what is happening to it) and one next step per row: "Tailor my CV", "Open tailored CV" or "View job". The list now gets each job's application status and the ad's own "no longer open" flag from the server (two optional fields on a list item, read from columns that already exist; no database change).
- Not shown from the mockup: the "New" pill and the pill about the ad's language. Neither is stored for a job today; the language belongs to the tailoring flow's language check.
- The search box stays (the mockup has none): it already worked and a long list needs it.
- "Add a job by hand" asks for the ad's link and its text, as before (the server needs the link to recognise a job that is already saved). The extension how-to and the developer install steps left the dialog; the empty list points to Account > Browser extension instead ("Show me how").
- Job page: must-haves in ad order with a dot per line (filled: on the CV, half: partly, empty: missing) and the CV's own words behind a line; the keywords the match already identifies, as a bar and chips; nice-to-haves as chips; one sentence saying how many must-haves the CV shows. Everything else the page knew (in short, duties, benefits, the original ad with the requirements marked, application status, edit, remove, how the match is scored) sits under "More about this job".
- One main action in the page head: start tailoring, continue an open run, or open the tailored CV. A job that is still being read, could not be read or has no text shows what is going on and no tailor button (it used to show a button that explained itself when pressed).
- "Read it again" on a job that could not be read is not built: the server has no way to read a saved job again. The page offers "Remove this job" and the link to the ad.
- "Before you tailor" and "Remove this job?" are the kit's dialog now (the browser's own modal dialog: focus stays inside, Escape closes).
- The edit form keeps its old markup inside a sheet; only its colours and type are new.
- Browser extension panel: the mockup's wording ("This looks like a job ad. Want to keep it?", "Save this job", "Saved to your jobs.") and the app's colours. It stays English only and uses system fonts.
- Copy: `ro-jobs.ts` added, typed against `en-jobs.ts`.
- Codex review (jobs): a dialog removed from the page while open now closes itself first, so keyboard focus returns to the button that opened it (fix is in the shared Dialog, so every dialog gets it).
- Codex review (jobs): a list row marked "CV tailored" now leads to the job page ("View job"), not straight to the tailored CV. The status can be set by hand with no tailored CV behind it, and the list cannot tell the two apart; the job page can, and shows "Open tailored CV" when one exists. Differs from the mockup's row button: raise with the owner.

## Phase 3, flow 4: tailoring (2026-11-11)

Branch `redesign/tailoring`, on top of `redesign/jobs`, in the same folder as the jobs flow (no new worktree: the tailoring branch contains the jobs flow, so one running app shows both).

- Five steps in the step line: Language, Keywords, Roles, Summary and skills, Finish. The engine's own steps sit inside them: Experience and Projects & volunteering under Roles; Skills, Summary, the lighter sections (achievements, courses, publications, interests, languages) and "Order and headline" under Summary and skills.
- Language step (new): the CV's language next to the ad's, and a choice of six languages. The server gained a small read ("which languages would this start in") and the start accepts the picked language; no database change. The choice starts on the person's default from Account.
- The mockup's sentence "we translate what you keep and write new bullets in that language" is not shown: I could not confirm the engine translates lines it leaves unchanged. The step only says employers usually expect the ad's language.
- Keywords step (new): the keywords the match already identifies, as a bar and two lists, and the roles tailoring will go through. Not shown from the mockup: the per-role "2 questions, 4 bullets" pills, because nothing is known about a role's questions before they are asked.
- Someone who opens tailoring without having seen the job page first gets the match worked out there and then (it used to be worked out only on the job page).
- Tone and the extra questions (what draws you, fit, which roles to lean on, anything else) are not in the mockup. They are kept as an optional link on the keywords step and under "Look back at" once tailoring runs; tailoring starts without them (neutral tone). Raise with the owner: keep, move or drop.
- Questions are answered on the focus screen, like enrichment: the role's sheet beside the question with the line it is about marked, what the ad asks for behind the question (from the gap the question was written for) with "Not in your CV yet" or "Only partly", and "Why I ask" (the reason the engine already writes for every question).
- Not built from the mockup: the "Questions done for this role" screen between the last question and the suggestions. The suggestions follow directly.
- "Skip this role" while its questions are open leaves the role as it is and moves on, with no rewriting. On the suggestions list it keeps every line as it is.
- The way out of the focus screen says "Back to the job", not "Save and exit": answers of the role in progress are held in the browser until its last question and would be lost.
- Suggested changes are a list (owner's decision): each line as it is now against the suggestion, with Keep, Use new and Edit, and "This bullet already fits the job" for a line with no suggestion. "Accept all for this role" fills in the undecided ones. A line left undecided takes the suggestion, as before; the screen says so.
- Edit is new on the server: a kept line can carry the person's own wording (bullets, descriptions, the summary). It is written as typed.
- The line under each suggestion is the reason the engine writes. Today it exists mostly for guesses and reads like a note about "the candidate". Raise with the owner: it needs a prompt pass to speak to the person.
- The celebration between roles (score counting up, confetti) and the score in the step line are gone: tailoring shows keyword and must-have coverage, no score (decision of 2026-11-11).
- "Look back at" under the step line opens the finished steps (a finished role's answers can be changed, which redoes that role) and the tone and questions. It replaces the old clickable step bar.
- Skills, Summary and the lighter sections keep their own review screens (skills five at a time, the summary phrase by phrase) in the new look. The mockup's single "Summary and skills" screen is not built: the engine asks and rewrites them as separate steps.
- Finish: keywords now on the CV against the start, must-haves with a dot each, "Not covered" with "Change my answer" (opens the finished roles), and "Mark as ready" or "Mark as ready anyway". Marking ready is a step on this screen only: nothing new is stored (the job already shows "CV tailored" when tailoring ends). The mockup's reason per uncovered must-have ("You answered No...") is not shown: the engine does not record which answer left it uncovered.
- "Choose a template" on the ready screen comes with flow 6; until then the screen offers Open the CV, Export and Write a cover letter.
- Romanian: the whole tailoring flow. The tailored CV's own page, the cover letter and export stay English until flow 6.
- Codex review (tailoring): while a role is being saved its rows are frozen, so a decision made in that moment is not silently dropped.
- Codex review (tailoring): "Change my answer" on the finish screen lists every finished item (roles, projects, volunteering), and appears for a CV that has only projects.
- Codex review (tailoring): the person's own rewording is never applied to a flagged suggestion (older runs only; today's runs have none).
- The count on a keyword bar ("4 of 8") stays on one line; the label wraps beside it (seen at phone width).

## Phase 3, flow 5: templates and export (2026-11-11)

Branch `redesign/templates-export`, on top of `redesign/tailoring`, same folder.

- "My CVs" is a new page and a new item in the top navigation: the base CV, then every tailored CV with its job, its state (Ready or In progress), language, template and when it last changed. The server gained one read for it (every tailored CV of the signed-in person, with whether its newest tailoring run is still open); no database change.
- Not shown from the mockup on My CVs: "exported today" (exports happen in the browser and are not recorded) and "In progress: role 1 of 2" (the row says "In progress" only). A translated copy of a tailored CV is its own row, told apart by its language.
- "Choose a template" is a page of its own, for the base CV and for each tailored CV: the three templates beside the person's real CV in the one picked. Nothing is saved until "Use this template", which then goes to the download page.
- Templates for the base CV: the base CV has no template of its own in the database, so using one there sets the person's default (the page says so). For a tailored CV the template is saved on that CV, and a tick box also makes it the default.
- "Download your CV" is a page of its own, replacing the Export dropdown: PDF and Word, the template with "Change template", the file name once downloaded, and a plain message if the file could not be made. It keeps what the dropdown did: the warning about AI guesses not checked yet with the way to check them, the cover letter's files when there is a letter, and the "still over two pages" message.
- New on the download page: "we tightened the spacing to fit, no text was removed", shown when the export had to tighten (the export already knew this and did not say it).
- The base CV can be exported now (it could not before): "Export" beside "Enrich my CV" on the My CV page, and from My CVs. One line was added to the My CV page's file, which the base CV feedback work also edits; the other session was told.
- The tailored CV's page keeps the editor and gets the new toolbar: CV | Cover letter, "Template: Classic" (opens the template page), Language, Re-tailor, Export (opens the download page). The score line is gone, in line with the decision that tailoring shows no score. The template dropdown is gone; the template page replaces it.
- The finish screen of tailoring now offers "Choose a template" first, as in the mockup, then "Open the CV" and "Write a cover letter".
- Romanian: My CVs, templates, download, and the tailored CV's page with its cover letter panel. Still English only: the editor's own panel labels (as on the base CV page).
- Not rebuilt in this flow: the cover letter tab's layout and the guided check of AI guesses keep their structure and take the new colours and buttons only.
- Codex review (templates and export): "Template" and "Export" on a CV's page, and "Export" on the My CV page, ask before leaving while an edit is still being saved, like the top navigation does. The pages they open read the saved CV, so leaving early lost the edit.
- Codex review (templates and export): the server reads each tailored CV together with only its newest tailoring run, in one query. The first version asked for all runs of all CVs and would have gone wrong for someone with very many (a failed list near 500 CVs, wrong "In progress" past 1,000 runs).
- Codex review (templates and export): My CVs keeps the list on screen when a later refresh fails; the error with "Try again" shows only when there is nothing to show.

## Owner feedback on the base CV flow, 2026-11-11 (branch redesign/base-cv-feedback)

Built by the forked session while the main session was on templates and export. The six points are in the workspace file base-cv-review-2026-11-11.md.

- Remove my CV needs no database change: the CV row is emptied through the normal save (so a stale tab still gets the usual conflict), then its History and role scores are deleted, both of which a signed-in user may already delete for their own rows. Tailored CVs are separate rows and are not touched.
- Remove also deletes the CV's History. The owner asked for everything belonging to the CV to go; a removed CV that could be restored from History would not be removed.
- With the CV removed, My CV shows the upload start again (the same screen as a new account), including "write it from scratch".
- Things to confirm: the reader now starts each one with a tag ([name], [contact], [languages], [certifications], [other]). The app shows the fields for that tag. The tag is part of the sentence, not a new field, so the stored format and older imports are unchanged (an untagged one counts as "other").
- A general note ("other") has no fields to edit in place, so its two actions are "It's correct" and "I'll fix it on my CV". Raise with the owner if every note should be editable in place: that needs the reader to say exactly which line it means.
- The name fields open pre-filled with the full name split at its last word. It is only a starting point: nothing is written until the person presses Save.
- A confirmed item ticks off and stays visible, with "n of N confirmed" (owner was away; the default offered to them).
- Confirming is not required before continuing. The owner asked for a way to act, not for a gate.
- Upload result screen: two columns at full width, what needs the person on the right (confirmations first, then the buttons), the CV as found on the left. The counts and "Where each heading went" stay behind "Something is wrong or missing". On a phone it is one column with the confirmations first.
- Focus step: every role, project and volunteering item stays listed with its score ("Checking this role…" until it is ready). Ticks start on the two most recent roles that are still below 80; once the person ticks or unticks anything, their choice is kept as scores arrive.
- Not looked at in a browser: only one copy of the app can run at a time (the API port is fixed) and the main session was using it. Covered by tests only until the owner's review.
- Codex review (feedback branch), fixed: a second try at Remove my CV after a half-finished first one now finishes the cleanup; removing closes an open History preview; identical "things to confirm" are separate items; two correction forms open at once no longer overwrite each other (only changed fields are written); a section moved into Certifications while its form is open no longer crashes it; corrections are locked while the import is being used.
- Codex review, not changed: a score request already in flight when the CV is removed can store one score for a role that no longer exists. The scoring step already deletes such leftovers the next time any role is scored, so it cleans itself up.

## Owner review of the built flows, 2026-11-11 (on `redesign/templates-export`, after merging `redesign/base-cv-feedback`)

- Owner feedback 1 (My CV): the page wasted the width of a desktop screen and its text was small. Three wider layouts were shown (`mockups/phase3/my-cv-wide.html` in the workspace); the owner chose B, three columns.
- From 1360 px wide: "Contents" left of the page (the sections with reorder and hide, add a section, then the roles with their scores), the page in the middle, and the helper panel on the right with the strength, template, language and what needs attention. Below 1360 px nothing changes (one panel on the right; a bottom sheet on phones).
- A section's name in Contents scrolls the page to it. A role still puts the cursor in its title, as before.
- The sheet grows with the screen: 15% larger from 1500 px, 30% from 1700 px (the browser's zoom on the sheet only, so every template scales the same way).
- Differs from the chosen mockup: roles are listed under the sections, not nested under "Experience" (the section list is a drag-to-reorder list); the template stays a dropdown, not three pictures (the template page already shows them).
- The tailored CV's page uses the same editor and gets the same three columns.
- Owner feedback 2 to 5 (My CV), options shown on `mockups/phase3/my-cv-fixes.html` in the workspace; the owner's picks:
  - 2, Contents column: "Large, full names". 320 px wide, 17 px text, role names wrap and the word for the score (Clear, A good start) shows beside each. The three columns now start at 1460 px (was 1360), the larger sheet at 1600 and 1800.
  - 3, the scores: "Click a score to see why". A sentence above the roles says what the number is; in Contents a role opens its score card under its row (weakest line, what to fix, "Improve this role") with "Go to this role on the page". Below 1460 px a role still moves the cursor to it, which shows the same card in the panel.
  - 5, "N roles still have questions waiting": the roles are listed under the CV strength with an "Answer" button each, which opens that role's questions directly (first three, then "Show all").
  - 4, languages: one line, "Romanian (Native) · English (C1)", on the page, in the read-only view, and in the PDF and Word files. A language with no level shows its name only (on the editable page the empty level stays as a placeholder to type in).
- Differs from the picked mockup: the button in a role's score card says "Improve this role" or "Make it stand out" (the card's own words), not "Answer 2 questions": the number of questions is not known before they are asked.
- Noted, not changed: a role reads "Clear" from 75 but keeps "questions waiting" until 80. Raise with the owner.
- Owner feedback 6, open: the enrichment flow is confusing (role questions, then bullet questions, then the role's description, with no signpost). To be redesigned after these fixes.
- Owner feedback 6, decided (pages in `mockups/phase3/` in the workspace: `enrich-flow-variants.html`, `score-model.html`, `enrich-b-design.html`; plan in `enrich-b-score-plan-2026-11-11.md`):
  - Flow: B, answer all of a role's questions in one run (at most 6), then approve once on the role's sheet. Must work well on phones.
  - Score: a bullet has five checks (what you did 30, clear 20, specific 20, result 20, concise 10). A role is 60% Lines (its bullets) and 40% Coverage (six core parameters shown on the page, four that count when they apply, and the role's shape). Tools are written inside bullets, never as a keyword line.
  - CV strength: the most recent role counts 3 times, the one before twice, the rest once.
  - Showing it: a number and one next step; the two bars and the checks only behind "Understand the score". No score between questions.
  - International scope and kind of contract were dropped as parameters. Progression, notable projects and recognition may be asked about but are not scored.
- Enrichment flow B built (stages 2 to 4 of the plan; `cv/enrich/run.ts`, `useRoleRun.ts`, `RoleRun.tsx`, `ScoreExplain.tsx`). Choices and differences from `enrich-b-design.html`:
  - The score policy is `score/7`: the reviewer prompt now asks one question per conditional parameter, so every role is scored again once, the next time its owner opens the CV.
  - One column on every screen size. The role's sheet beside the question is not in the run (it carried bullet scores, and no score shows between the first and last screen); a question about a line shows that line above it.
  - Question screens keep "Back" and "Skip" (the mock-up shows neither). The link "Questions not specific enough? Describe it in your own words" is not in the run; the box under the options takes typed or spoken words as before.
  - "About 3 minutes" is worked out as half a minute a question.
  - A run stays at six when a follow-up arrives: it takes the place of the last question still to come, which waits behind "A few more questions". If nothing is left to displace, the follow-up itself waits there.
  - Not in the plan's notes: after the last question, the weak lines (below 80) that had no question are rewritten too, with the role's answers in view. Without it, an answer about tools or team size could only reach a line that happened to have its own question. Raise with the owner.
  - The role's description is proposed once per opened role, not again in "A few more questions". A role that already has one gets a new proposal only when the run brought answers (seen in the browser: with no answers it only reworded a good description).
  - New bullets from a thin role's answers: the prompt now says that what the company does and what the role was for belong in the description, not in a bullet (seen in the browser: the company answer came back as a bullet).
  - When the answers change no text (every piece kept, or only "No" answers), the run asks for the score again so "No one reported to me" counts, and hands it to the editor so My CV shows the same number.
  - Approval screen: it has a heading and one sentence the mock-up lacks; a new bullet's button reads "Leave it out" instead of "Keep mine"; a piece set aside offers "Use the new text".
  - Role done: outside the guided path the main button is "Back to my CV" and "Finish for now" is not shown; in the path the last role's button is "Continue". The sentence names up to three things the new score shows on the page (company, what you did, what changed).
  - "Understand the score": all ten parameters have their own tick (the mock-up groups "Tools, results, scale"), and the strong bullet is shown whole with its five checks, not split into underlined parts: the app does not know which words are the tool or the result.
  - Contents column: a clicked role no longer shows "Weakest line"; "Go to this role on the page" stays. The button counts the questions a run would ask ("Answer 3 questions"); with none to ask but a next step, it says "Improve this role".
  - The ✨ button on one bullet and "Make it stand out" still open the old single-bullet flow, unchanged.
- Owner tried flow B on 2026-11-11 and confirmed the five choices raised: weak lines without their own question are rewritten too; a role that has a description gets a new one only when the run brought answers; question screens keep Back and Skip; one column on every screen; a follow-up takes the place of the last question still to come.
- Owner feedback 7: an animation while the score is being worked out would be nice. Options shown on `mockups/phase3/score-animation.html` in the workspace.
- Owner's pick for feedback 7: the number counts up. On "role done" the new score climbs from the old one in 0.9 s while a bar fills, then the sentence comes in. No movement for people who asked their device for less motion.
- Golden set on `score/7` (2026-11-11): 4 cases, 80 AI calls, 0 bad patterns, 0 problems. The first run failed one role: the reviewer's answer was cut off, because it now carries more per role. Its length limit was raised.
- "Understand the score": the ticks were tight against their labels (another list rule won over the layout); fixed.
- Owner feedback 8: a role at 79 said "No questions about this role right now", so nothing could raise it. A role below 80 is never a dead end now. When every stored question was already answered, the run (1) asks the reviewer again for new questions; (2) if none come, asks its own, one per thing the page still does not show (a result, a tool, a size), each put to one line so the answer has a place to go, and asks the lines' own questions once more with the earlier answer in the box to add to; (3) on Start with nothing to ask at all, uses the answers already saved to rewrite the weak lines. Seen on the owner's "Budget and Reporting Executive" (79): the reviewer had nothing new, and the app asked for a result of one line.
- Not changed: the reviewer prompt. It returned no question for that role although no bullet shows a result; the app's own questions cover it. A prompt change would mean scoring every role again and another golden run.
- Owner feedback 9 (the dead end, done with more care): when a role below 100 has every stored question answered, the reviewer is asked for more: one question for every bullet with a grade that is not full and for every parameter not shown, each with 3 or 4 options to pick (`more` on `POST /v1/enrich/score`; a note added to the request, the base prompt and the score policy unchanged). A run still shows six at a time, the rest behind "A few more questions". The stored grades and score are kept for that request: only the questions are new, so asking never moves the number.
- The app's own three questions (a result, a tool, a size; typed, no options) stay as the last resort, for when the reviewer still returns nothing.
- A role's card in Contents offers "Improve this role" whenever the role is below 100 ("Not at 100 yet. I can look for what would still raise it." when there is no step to name). The list under the CV strength still names only the roles below 80.
- An answer about the whole role is now tried on every line below 100, not only the weak ones: a role at 80 or more has no weak line for it to reach otherwise.
- Seen on the owner's "Budget and Reporting Executive": six questions, each with options ("Who did you report to in this role?", "Did anyone report to you in this role?" with "No" first).
- Owner feedback 10 (focus step, after importing a CV): two roles were ticked at once and the ticks moved as the scores arrived. Cause: the ticks were worked out again on every score, counting a role still being checked as "needs work", so a recent role that came back at 80 or more passed its tick down. Now a tick is placed only once that role and every role above it has a score, top to bottom, and never moves afterwards. What the person ticks or unticks by hand is kept on top of the app's ticks (before, one click froze the list as it was at that moment). While nothing is ticked and scores are still arriving, the start button waits, so it cannot skip every role.
- Jobs review, owner feedback 11: on the jobs list only the title opened a job. The whole row opens it now (the title's link is stretched over the row; the row's button stays on top and goes to the same place).
- Jobs review, owner feedback 12: the owner wants two or three other ways to lay out the job page (score, must-haves, summary), in the same style. Options shown on `mockups/phase3/job-page-variants.html` in the workspace: A score on top, B the ad and the coach, C three piles. Waiting for the pick; nothing built.
- Owner's pick for feedback 12: A, score on top. Built on the job page:
  - A strip under the title holds the match as a large number with its band and a bar, the coach's sentence, "How is this scored?" and the page's main action (Tailor my CV, Continue tailoring, or Open tailored CV). The action left the title row.
  - Must-haves are sorted when there is a score: "Not on your CV yet", "Partly on your CV", then "Already on your CV" as green tags. A tag opens to the CV's own words, as a line did before. Without a score the list is plain and in ad order, as before. Nice to have is the last group of the same sheet; Keywords, when there are any, sit under it.
  - "More about this job" is now "About this job" and sits beside the must-haves, not below them. Benefits are tags, one each. Nothing was added or removed.
  - Copy: `job.must.onCv` and `job.must.partly` are gone (the group names say it); new group names, `job.match.label`, `job.match.of`, `job.band.label`, in EN and RO.
- Jobs review, owner feedback 13: predict the words a screening system (ATS) would look for and show them on the job page as soon as a job is added; keep the benefits. Built:
  - Reading an ad now also lists 8 to 20 ATS keywords, in the ad's own words (ad-reading prompt `job.v4`; new optional `keywords` on the job's extracted data, inside the existing JSON column, so no database change). Choice made without asking: only words the ad itself uses, none guessed. The owner said "predict"; adding likely words the ad does not say is a prompt change if wanted.
  - The match now marks exactly those keywords against the CV. Found on the way: the match used to pick its own keywords from the short requirement lines, and on the owner's job every one was dropped by the server's check, so "Keyword coverage" said "Not scored" and no keywords showed. A job with its own keyword list no longer depends on that. Jobs read before `job.v4` keep the old behaviour.
  - On the job page the block is called "ATS keywords", sits in "About this job" between the duties and the benefits, says what it is in one line, counts how many are on the CV, and shows each word green (on the CV) or dashed (not yet). Before there is a match the words are listed plain.
  - Effect on the number: once a job has keywords, "Keyword coverage" counts in the match as the score was designed, so a job added again can show a different match than before.
  - Not done: jobs saved earlier do not get keywords by themselves; the ad has to be added again. Using the keywords in tailoring is a later topic, by the owner's word.
- Tailoring review, owner feedback 14: on a tailoring question, the line the question will change should be the main focus and the other lines blurred; the screen should feel more natural and use the empty width. Options shown on `mockups/phase3/tailor-question-variants.html` in the workspace: A spotlight, B asked on the line, C the line on its own. Waiting for the pick; nothing built.
- Owner's pick for feedback 14: A, spotlight. Built for tailoring questions about a role (enrichment's question screen is untouched): the two columns fill up to 1300 pixels, the question and the role's sheet are set larger, the line the question is about is lit with the marker and a blue edge, and the role's other lines are blurred. Phones are unchanged (the sheet is hidden there, as before).
- Tailoring review, owner feedback 15: the wait right after the last question ("Comparing Experience with the ad…") is one line on an empty page; it should be animated, snappier and nicer. Options shown on `mockups/phase3/tailor-wait-variants.html` in the workspace: A the marker runs down the role, B ad meets CV, C the next screen takes shape. Waiting for the pick; nothing built. From this point the owner gives feedback to be collected and built together later.
- Owner's pick for feedback 15: A, the marker runs down the role. Not built yet; collected to build with the next points.
- Tailoring review, owner feedback 16: the screen where the suggested lines are reviewed (with the "Inferred, please confirm" mark) should look more interesting and must not confuse the user. Options shown on `mockups/phase3/tailor-review-variants.html` in the workspace: A side by side, B marked on your CV, C one at a time. Waiting for the pick; nothing built.
- Owner's pick for feedback 16: A, side by side. Not built yet; collected to build with the next points.
- Built feedback 15 (pick A): while a step is compared with the ad, the coach's line sits in the middle and two more lines take turns with it ("Reading your answers…", "Writing suggestions for your lines…"); for a role, its sheet slides up and the marker runs down its lines, leaving a tick on each, in a loop. With reduced motion only the one line shows. The "Looking for gaps" wait before the questions is unchanged.
- Built feedback 16 (pick A): a role's suggestions are cards side by side, "On your CV now" against "Suggested", with the words that go struck through and the new words marked. The buttons read "Keep mine" and "Use this"; the whole side can be clicked; the chosen side is stamped "Chosen". Lines with no suggestion are gathered in one quiet block below. The review page takes up to 1300 pixels.
  - A guess no longer shows "Inferred, please confirm". It shows a dashed box, "Please check this one", with one sentence saying part of the line is a guess, and its button reads "Yes, it's true. Use it".
  - Rule that changed with the pick: an ordinary suggestion starts chosen and is used unless the person keeps their line (as before). A guess starts with nothing chosen, and if the person does not decide, their own line stays on the CV. Before, an undecided guess was used.
  - Not known to the app: which words of a line are the guess. The box therefore speaks about "part of this line".
- Tailoring review, owner feedback 17 (for the next round, not built): a question must fit the years of the role it is about. Example seen: a role from Oct 2014 – Jul 2015 was asked about AI-powered tools, because the ad asks for prompt based tools.
- Tailoring review, owner feedback 18 (for the next round, not built): a question that is not about a role (seen: "Question 1 of 2", about RAG and vector databases, in the step after the roles) says why it is asked but not what the answer will change. The user must always see what part of the CV the answer affects, as the role questions do with the role's sheet.
- Tailoring review, owner feedback 19: the "Order and headline" screen in Summary and skills does not look good and needs a much better way of showing the changes. Options shown on `mockups/phase3/tailor-order-variants.html` in the workspace: A side by side, B a picture of your CV, C only what changes. Waiting for the pick; nothing built.
- Tailoring review, owner feedback 20 (flows to be shown after the picks for 18 and 19): the tailoring experience was enjoyable but the workflow felt chaotic: it went backwards and forwards between roles, bullet points and other steps. At the end there was no score, only a prompt to download the CV, and no way to go back and see how much better the CV had become. The flow is to be rethought; options for the whole flow are shown first and discussed, nothing built before.
- Built feedback 17: when tailoring writes questions for a role, the role's period is now spelled out to the AI on its own line ("2014-10 to 2015-07"), and the rule about a role's time is stronger: a gap about something newer than the role is skipped for that role, with AI-powered and prompt based tools for a role that ended in 2015 as the example. Not tried with a real AI call.
- Owner's pick for feedback 19: B, a picture of your CV ("absolutely fantastic").
- Feedback 18: options shown on `mockups/phase3/tailor-what-variants.html` in the workspace: A the section beside the question, B one clear sentence, C each answer shows its result. Waiting for the pick; nothing built.
- Owner's pick for feedback 18: A, the section beside the question. Built: a question in the Skills or Summary step now has a sheet beside it, as the role questions do. Skills: the CV's skills by group, faded, with the skill in question as a lit dashed place and "Your answer decides whether this is added to your skills". Summary: the CV's summary lit, with "Your answer shapes what I suggest for your summary". Other steps' questions are unchanged.
- Built feedback 19 (pick B): "Order and headline" is now "Headline and section order", as a picture. Left: one card for the headline (old struck through, new words marked) and one for the order, saying each move in a sentence ("Education moves up. From place 7 to place 5, above Certifications."); each card has "Keep mine" and its own "Use the new…" button, so the two are decided separately. Right: the CV in small, with the headline and the sections as blocks; a moved section is lit and numbered and a dashed line shows where it was. The picture follows the choices. Only sections the CV has are shown.
  - Differences from the mock-up: the app gets the new order as one suggestion, so the moves are accepted or kept together, not one by one; and it gets no reasons for this step, so the cards show none.
  - None of 17, 18, 19 or the wait animation has been seen in the browser: the owner's tailoring run was finished, and starting another would redo their CV.
- Feedback 20: flow options shown on `mockups/phase3/tailor-flow-variants.html` in the workspace: A three acts (all questions, one wait, all reviews, result), B one room (one layout, a map of every stop, the score always visible; recommended), C your CV in front of you (the CV is the screen, the coach beside it). All three end on a result screen with the match before and after, what moved it, what is still open, and a way to look back from the job page. To be discussed with the owner; nothing built.
- Owner's pick for feedback 20: B, one room ("it definitely remains B"), with a request for a more detailed flow with concrete examples before giving more feedback. Walkthrough shown on `mockups/phase3/tailor-room-walkthrough.html` in the workspace: nine screens (set up, a question, the wait, the review, the score going up, skills, last touches, the result, looking back from the job page), plus three open points: whether the score moment waits for a click, whether stops can be done in any order, whether set up is one screen. Nothing built.
- Owner's answers on the flow B walkthrough (no other notes): the score moment after a role stays until Next is pressed; the stops on the map can be done in any order; set up (language, keywords, tone) is one screen. Nothing built yet.
