# Tailored job flow: progress

Plan: `docs/plans/2026-11-12-tailored-job-flow.md` · feature id `tailored-job-flow`
Branch `feat/tailored-job-flow` · worktree `resumora-tailored-job` · part base `5533085` (origin/main, 2026-11-12)
One lane, Tasks 1 to 7 in plan order. Fresh session after Task 4.

**Builder: Claude (Fable 5.2), with the `claude-build` skill.** The owner stopped the Codex build on 2026-11-12 and made it a permanent rule: Codex only on their explicit request. Read the plan's `codex-build` wording as `claude-build`. One Codex risk check ran for Task 1 before the stop; its half-built code was discarded.

Not done without the owner's yes: pushing, a PR, running either migration on the hosted database, and applying Task 1's migration to the **local** database (see R3).
Release order: the API from Task 1 must be live before Task 1's migration runs on the hosted database.

## Rulings

- R1 (Task 1): scope widened by three files the plan missed. `apps/api/test/tailor-accept.test.ts` and `apps/api/test/tailor-retailor.test.ts` asserted the status `tailored`; new `supabase/tests/database/application_status.test.sql` holds the plan's database test.
- R2 (Task 1): `acceptSection` keeps `jobs` in its `deps` type although nothing reads it now. Removing it would change the signature for its three callers, outside this task's files.
- R3 (Task 1): **the migration is not applied to the local database.** All worktrees share one local database, and every other branch still writes `tailored` when a run finishes, so the new check would break the last tailoring step on their local servers. The migration and its pgTAP file were run together inside one transaction that was rolled back (9 of 9 pass). The pgTAP file drops the old check itself, so `npm run db:test` passes with or without the migration applied. Owner decides when the local database gets it (needed before this branch's preview shows jobs that were `tailored`).
- R4 (Task 1): the dictionary key `jobs.pill.tailored` stays although nothing uses it after this task; Tasks 4 and 6 use it for the "Tailored CV" pill.

- R5 (Task 2): the score answer had no shared schema (the plan pointed at `tailor.ts:79`, which is the score itself). Added `JobScoreSchema` / `JobScore` to `packages/shared/src/tailor.ts`; Task 4's `getJobScore` parses with it.
- R6 (Task 2): scope widened by `apps/api/test/tailor-accept.test.ts` (the accept harness, for "accepting clears the flag") and `supabase/tests/database/tailoring.test.sql` (the column test). That pgTAP file now needs the Task 2 migration, so in this worktree `npm run db:test` fails until the local database has it (R3). Both migrations plus that file were run in one rolled-back transaction: 78 of 78 pass.
- R7 (Task 2): a tailored score save (`saveScore`, target `tailored`) also writes the copy's `score` column, so Re-check updates it without bumping the copy's version. The accept flow already wrote the same value.
- R8 (Task 2): a new or refreshed translation sets `score_stale = true`. Without it, a re-translated copy that had been re-checked earlier would show its old number as current.
- R9 (Task 2): "content differs" is decided after reading both sides through the stored-CV schema (`sameCv` in `tailor/repo.ts`), because Postgres reorders JSON keys. The Supabase editor save now reads the stored content first: one extra query per save.

- R10 (Task 3): `summaries` runs 3 queries, plus a 4th when the page has a tailored job. The 4th (the chosen copies' score history) is the only one that can hit PostgREST's 1000-row cap; a copy the cut-off result did not reach shows its own `score` column, which holds the same number since R7. `tailoredLanguages` is sorted by code (`["en", "ro"]`).

- R11 (Task 4): scope widened by `apps/web/src/jobs/JobMatch.tsx` (new exported `openMusts`, the "still open" texts of the coach line) and `apps/web/src/tailor/tailor-flow.test.tsx` (its `scoreJob` fixture needs the new fields).
- R12 (Task 4): `JobPage` already reads `?cv=` from the job URL and passes it to `getJobScore`; the score query key is `["job-score", userId, id, cv]`. Task 5's language switch only has to set `?cv=`.
- R13 (Task 4): the four links are the loaded doc's `links`; before the CV has loaded, or when it failed, `TailoredJobView` builds the same addresses from `tailoredCvId`, so the buttons work in both acceptance cases.
- R14 (Task 4): `JobPage` keeps the header and builds the must-haves and About this job as two small functions (`mustHaves(marks)`, `about(marks)`) used by both layouts; `TailoredJobView` gets them as `details`.

## Tasks

## Task 1: Application status keeps five values — done
session: Build tailored job flow · builder: claude
commit: 217716b (base 6d1a763) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
migration for the owner: `20261112000000_application_status.sql` (data update + check constraint on `jobs.application_status`; no RLS change)
open: local database not migrated (R3)

## Task 2: Score of one tailored copy, "edited since last score", Re-check (API) — done
session: Build tailored job flow · builder: claude
commit: b3825d1 (base 217716b) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
migration for the owner: `20261112000100_tailored_score_stale.sql` (one boolean column on `tailored_cvs`; no RLS change). New route `POST /v1/tailored/:id/score`: ownership through RLS, like `PUT /v1/tailored/:id`.
open: (a) the new Supabase queries (`scoreCopies`, `hasTailoredCv`, the editor-save compare) are covered by the memory repo's tests and the typecheck only; exercise them against the real database in the preview check. (b) For the owner: starting a re-tailor resets the copy to the base wording and a guided-review decision changes its wording, both without a new score and without setting the flag (the plan sets it on hand edits only). Until the next accept the page shows the previous number as current.

## Task 3: The Jobs list carries each job's latest score and tailored languages (API) — done
session: Build tailored job flow · builder: claude
commit: 4dd9def (base b3825d1) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: the `summaries` queries (embedded tables with per-job limits) ran only against a stubbed fetch; the reviewer checked their syntax against the schema. Exercise `GET /v1/jobs` against the real local database in the preview check.

## Task 4: Tailored job page: the CV, the latest score, folded job details (web) — done
session: Build tailored job flow · builder: claude
commit: 2e9a279 (base 4dd9def) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: (a) not yet seen in a browser: the phone layout rules were checked by reading the CSS only. (b) For the preview check: a ready job shows today's layout until its score answer arrives, so a tailored job's page starts as the old layout (with "Tailor my CV") and then switches. The old page had the same button swap; now the whole lower page swaps. If it looks bad, hold the area under the header as a skeleton while the score loads.

## Hand-over after Task 4 (2026-11-12)

Next: Task 5, then 6, then 7, each through the `claude-build` per-task steps. Base for Task 5: `2e9a279` (plus the commit of this file).
- The plan's line numbers are from `5533085`; `JobPage.tsx` changed a lot in Task 4, so find the places by name: the unfinished-run query is `openRun` (query key `job-tailor-run`), the status handler is `changeStatus`, the tailored branch renders `TailoredJobView`.
- Tests: `npm run typecheck`, `npm run lint` and `npm test` from the worktree root (about a minute). The web tests of the tailored page live in the `describe("a tailored job")` block of `apps/web/src/jobs/job-page.test.tsx`; its `band()` helper waits for the score answer before looking at the page.
- Database: never `npm run db:test` or `npx supabase migration up` here before the owner decides R3. To check SQL, run the migration files plus the pgTAP file through `docker exec -i supabase_db_resumora psql -U postgres -d postgres` inside `begin; ... rollback;`.
- After Task 7: the preview check at 375 px and at desktop width (needs R3 decided, and a `resumora-tailored-job` entry in the workspace `.claude/launch.json` using `tools/dev-worktree.ps1`; stop older dev servers first; no secret copies, no `db:reset`), then the end-of-run steps: full tests once, one whole-branch review on Opus (base `5533085`, brief = all seven task sections), a security review on Opus, one run per threat, because the branch adds a route and two migrations (user A reads or changes user B's data; login checks on the changed routes; input validation; guessable or changeable ids), the cost line, the final report.
- Ask the owner before: pushing, a PR, any migration on the hosted database, the local migration (R3), anything the guard denies.

- R15 (Task 5): the score query keeps the previous answer on screen while another copy's answer loads (`placeholderData: keepPreviousData` in `JobPage`). Without it, choosing a language emptied the score for a moment and the whole page fell back to the untailored layout. The pressed language button follows `?cv=` at once; the number, the CV and the links follow when the answer arrives.
- R16 (Task 5): `TailoredJobView` loads the job's copies with its own `listTailored` request (query key `job-tailored-list`). `useCvDoc` makes the same request inside its loader, so a tailored job's page asks for the list twice; sharing it would mean changing `useCvDoc`, outside this task's files.

## Task 5: Language switch, Re-check, Continue tailoring (web) — done
session: Build tailored job flow, part 2 · builder: claude
commit: 7e3d627 (base 32992bf) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: (a) not yet seen in a browser. (b) A failed Re-check replaces the "Edited since last score" text with "Couldn't check the score." and the button reads "Try again" until it succeeds. (c) Two editor typing tests (`src/cv/editor.test.tsx`, "keeps every character typed…") timed out once at 5 s in a full run under load and passed alone and in the run before; not touched by this branch.

- R17 (Task 6): the list's reading text is the plan's "Reading the ad" (new key `jobs.cv.reading`); the old "Reading the ad. About a minute." string is removed. The row keeps the "saved … ago" date and the "No longer open" pill under the title: the columns had room for both.
- R18 (Task 6): a `needs_text` job shows nothing in the CV column. The plan says "the text the row shows today", and today the row shows none for that state. A `failed` job keeps its "Couldn't read" pill there. Both keep "View job" as their action.
- R19 (Task 6): the layout rules can't be run in the tests (the test run applies no CSS), so the "no sideways scroll" test reads `styles/jobs.css` as text and checks the title's wrapping and the row's column tracks.
- R20 (Task 7): the after-export lines said "Your tailored CV stays in My CVs." / "Your base CV stays in My CVs.", which is no longer true. The plan gives no new wording, so the second sentence is cut: "Good luck with this one." and "Done.". For the owner to reword if wanted.
- R21 (Task 7): the missing / error state has no CV loaded, so it picks its way back from the address: a page under `/jobs/:id/...` offers "Back to the job", `/cv/...` offers "Back to my CV".

## Task 6: Jobs list: score, CV and application; cards on a phone (web) — done
session: Build tailored job flow, part 2 · builder: claude
commit: 0a73423 (base f265df3) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: (a) not yet seen in a browser: the desktop columns and the phone cards were checked by reading the CSS only. (b) R18: say if a `needs_text` job should name its state in the CV column.

## Task 7: Remove My CVs (web) — done
session: Build tailored job flow, part 2 · builder: claude
commit: a603305 (base 0a73423) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: (a) the API route `GET /v1/tailored` is no longer called by the web; it stays, removing it is the owner's call (plan, Task 7). (b) R20: the shortened after-export lines. (c) The new "Template" link in the base CV's header has no test of its own (the plan lists none); check it in the preview.

- R22 (end of run): the owner said yes to R3 on 2026-11-12 ("please put it on the local database now", and the same pick on the decision page). Both migrations were applied to the shared local database when this branch's preview started. Until this branch is merged, the last step of a tailoring run fails on the other branches' local servers.
- R23 (fix round): the Supabase job repo reads a stored application status of `tailored` as `saved` (`storedStatus` in `apps/api/src/jobs/supabase-repo.ts`, a file no task listed). The API is released before the status migration runs, and without this every read of such a row failed.

## End of run (2026-11-12)

**Whole-branch review** (Opus, base `5533085`): 1 finding, medium, confirmed against the code. Between the API release and the status migration, a row that still says `tailored` failed the new five-value check on every read, so the Jobs list (one such row fails the page) and that job's pages answered 500. Fixed in `ee7acd8` (R23), with a test. A second whole-branch review was not needed: the fix touches no shared type, migration, RLS or file of two tasks.

**Security review** (Opus, one run per threat, base `5533085`):
- user A reads or changes user B's data: pass, no findings. Every new query uses the caller's client, so RLS applies.
- login checks on the changed routes: pass, no findings. All five routes sit behind the `/v1/*` check.
- input validation: pass, no findings.
- guessable or changeable ids: pass, 2 low findings in the web, both display only. (1) A Re-check started in the moment after another language was chosen could put its answer under the other copy's address: fixed in `ee7acd8`, with a test. (2) Left open, see below.

**Fix round:** `ee7acd8` (base `78aec10`), reviewed alone by a fresh Opus agent: pass, 1 low finding left open, see below. Fix rounds: 1. Whole-branch reviews: 1.

**Checks on `ee7acd8`:** typecheck clean, lint clean, tests 446 + 824 (4 skipped) + 229 + 1106 pass, database tests 259 pass (run after the local migration).

**Preview check** (the owner's Chrome, local database, this branch's server):
- Jobs list, desktop: the columns Job, Score, CV, Application and the Open button line up; 375 px: one card per job, round score badge, pills on one line, Open at full width (283 x 44). No sideways scrolling at either width, nothing overlapping.
- Tailored job page, desktop and 375 px: score band, coach line, the three buttons (44 px high on the phone, full width), the folded job row (opens, one column on the phone), the template line, the CV read-only. No sideways scrolling.
- Real API paths that had only run against stand-ins: `GET /v1/jobs` gives score 94 and `["en"]` for the tailored job; `GET /v1/jobs/:id/score` gives the same answer with no `?cv=`, with the copy's id, with an unknown id and with junk; an editor save with changed text sets `stale: true` and keeps the number; Re-check from the page took about 6 seconds, read "Checking" while disabled, cleared the notice and wrote the copy's `score`; a save with identical text leaves `stale` false; Re-check with an unknown id answers 404 and without a login 401.
- `/cvs` lands on Jobs; the menu reads My CV, Jobs, Account; the base CV's header has Template and Export; the dropdown has the five statuses.
- Not seen live: the language switch (the local job has one copy; creating a second would add data and an AI call) and the Continue tailoring state. Both are covered by tests only.

**Open, for the owner:**
1. Layout switch (Task 4, open b), measured: a tailored job's page shows the old layout with a "Tailor my CV" button from the moment the job arrives until its score arrives, then switches. Locally that is about 40 ms. On the hosted API it lasts as long as the score request. Not changed: holding a skeleton there would also change how an untailored job's page loads, which the plan says stays as it is.
2. "Try again" for a missing base score stores its answer under the current address; on a tailored job with no base score and `?cv=` naming a copy other than the one saved last, the page can show the other copy until the next load (security review, low).
3. Pressing the language button that is already pressed and then Re-check within a split second drops that Re-check's answer from the page; the server has saved it and the next load shows it (fix review, low).
4. From the tasks: R18 (a `needs_text` job shows nothing in the CV column), R20 (the shortened after-export lines), R16 (the copies list is requested twice on a tailored job's page), Task 2 open b (a re-tailor or a guided-review decision changes the wording without setting the edited flag), Task 7 open a (`GET /v1/tailored` is unused by the web now).
5. Not done, each needs the owner's yes: pushing the branch, a PR, either migration on the hosted database (the API first, then the status migration).

**Cost line:** weekly usage 28 % (all models) and 55 % (Fable) when first read after Task 6, 30 % and 58 % at the end; the start of the part was not read. Review agents: 9 (3 Sonnet per task, 6 Opus: 1 whole branch, 4 security, 1 fix). Guard denials: 0. Claude context used: 45 % of the session's window.

# Follow-up (2026-11-13): Tasks 8 to 13

The owner answered the open points on 13 Nov; the answers reached this build through the session "Website review", which also reported: the branch is pushed and is draft PR 60 at `c0a7cff` (checked: true), the owner said "Start the build". Builder: Claude with `claude-build`. Follow-up base `c0a7cff`.

## Rulings

- R24 (Task 8): the label is `jobs.cv.needsText`, "Can't be tailored yet" / "Nu poate fi adaptat încă". It settles R18.
- R25 (Task 9): the export dialog also has a Close button (the way out on a phone, where there is no Escape key), and it shows the export's own result lines: "Downloaded: …", the two-page notices and the failure line. It offers no template choice (the copy's saved template is used), no cover-letter files and no AI-guess warning; those stay on the export page, which the tailored CV's own page still links to.
- R26 (Task 9): Export on the job page is disabled until the copy's CV has loaded, and stays disabled when it failed to load. Before, it was a link that worked without the CV (R13); the dialog makes the file in the browser and needs the content.
- R27 (Task 9): the base CV's after-export line is "Done. Your base CV stays in My CV." (Romanian names the menu entry in quotes). The tailored line stays "Good luck with this one." This replaces R20.
- R28 (Task 10): "a re-tailor that puts the copy back to the base wording" is `restartWithSteering` (changing the tone or the extra answers). A re-tailor of picked steps (`POST /v1/tailored/:id/retailor`, the "Tailor again" button) changes no wording when it starts, so it sets no mark; each step it accepts saves a new score. Tests are in `apps/api/test/tailor-redo.test.ts`, where the steering restart is tested, not in `tailor-retailor.test.ts` as first listed.
- R29 (Task 10): the mark is set through an optional `scoreStale: true` on the repo's `saveTailoredCv`; a review decision sets it only when the content really changed (`sameCv`), so Keep leaves it alone.
- R30 (Task 11): the placeholder shows while `score.isLoading` (first fetch, no answer yet). In `job-page.test.tsx` the helper `ready()` now waits for that first answer, because 18 existing tests looked at the untailored layout the instant the header appeared; `header()` is the old behaviour.
- R31 (Task 13, a fix to Task 9): on a 375 px screen the export dialog's "Downloaded: …" line made the dialog scroll sideways, because the file's name has no spaces to break at. The line now carries the class `job-export-file` with `overflow-wrap: anywhere` (`TailoredJobView.tsx`, `jobs.css`). Seen fixed in the browser; a layout rule, so no unit test.

## Task 8: A job that needs its text says so in the Jobs list — done
session: Build tailored job flow, part 2 · builder: claude
commit: 822f287 (base af97ff6) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Task 9: Export from the tailored job's page — done
session: Build tailored job flow, part 2 · builder: claude
commit: c8a5d35 (base f556ed8) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: not yet seen in a browser (Task 13): the dialog at 375 px, and a real PDF and Word file from it.

## Task 10: The edited mark also covers re-tailoring and review decisions (API) — done
session: Build tailored job flow, part 2 · builder: claude
commit: 6613290 (base db4c570) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
changes what two routes write, for the owner: `PATCH /v1/tailored/:id/review` and `POST /v1/tailor-runs/:id/steering` now also set `tailored_cvs.score_stale`. No migration, no RLS change, same ownership checks.
open: R28, for the owner to confirm: "Tailor again" on picked steps sets no mark when it starts.

## Task 11: A placeholder while the first score answer loads (web) — done
session: Build tailored job flow, part 2 · builder: claude
commit: 8b62b47 (base 6613290) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: not yet seen in a browser (Task 13).

## Hand-over after Task 11 (2026-11-13)

Four tasks were built in this session, so the rest goes to a fresh one, as the skill says. Left: Task 12, Task 13 (preview check) and the end of run. Everything after `c0a7cff` is local, not pushed.
- What Task 12 removes is already looked up, and how the preview check was done last time (the owner's Chrome, a 375 px frame inside the tab) is written down: see the hand-over note `tailored-job-flow-part-3-handover.md` in the shared notes folder of this group of sessions.
- Checks on `8b62b47`: typecheck clean, lint clean, tests 446 + 829 (4 skipped) + 229 + 1116 pass. Two editor typing tests and one export-fitting test time out at 5 s when the machine is busy; they pass when the web suite runs alone.
- End of run: full tests once; one whole-branch review on Opus for Tasks 8 to 13 (base `c0a7cff`); a security review, because Task 10 changes what two routes write and Task 12 removes a route; progress blocks; the cost line.
- Ask the owner before the push. Another session relayed that the owner approved pushing to PR 60; the owner has not said it to the build session itself. No migration on the hosted database, no merge.

## Task 12: Remove the unused list of all tailored CVs (API) — done
session: Build tailored job flow, part 3 · builder: claude
commit: 7a497ee (base 8bd2f64) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
searched again on 13 Nov before removing: nothing in the repo calls `GET /v1/tailored` or `listAllTailoredCvs` (web, `apps/extension` and the rest; the extension has no mention of tailored CVs at all). A route is gone, for the owner: `GET /v1/tailored` now answers 404 like any unknown address (401 without a login). No migration, no RLS change.
open: none

## Task 13: Preview check of the follow-up — done
session: Build tailored job flow, part 3 · builder: claude
commit: (the R31 fix and this block, see the log) · reviews: covered by the whole-branch review · fix rounds: 1 (R31) · guard denials: 0

Where: the owner's Chrome (Claude in Chrome), this branch's server (launch entry `resumora-tailored-job`), local database, 13 Nov. Docker Desktop and the local database were not running; started both (no reset; `supabase migration up` found nothing to add). Desktop width = the Chrome window as it was (2276 px wide page); 375 px = a 375 px frame of the same address inside the tab, as last time.

The local account has one job (Lifecycle Operations Lead) with two copies already: English (original, score 94) and Romanian (translated from it today, score 69). So no second-language copy was created and no AI call was made in this check.

Seen, at both widths unless said:
- Placeholder (Task 11): opening the job shows the header (title, facts) with the loading bars under it, then the tailored layout. "Tailor my CV" never showed in between. 375 px: the same, page 351 px wide inside a 372 px frame.
- Language switch: English and Romanian buttons above the CV. Romanian → English changed the score 69 → 94, the coach line and the CV; the address got `?cv=`. The old score and CV stayed on screen until the new score arrived; for about 80 ms after that the CV area showed its loading bars until the new CV arrived (never the other copy's CV under the new number).
- Export dialog (Task 9): "Download your CV", Download PDF, Download Word, Close; buttons 44 px high. While a file is made both buttons and Close are off and the pressed one reads "Preparing the PDF…" / "Preparing the Word file…"; then the tightened-spacing notice and "Downloaded: {name}". Real files landed in the Downloads folder: a PDF (262,597 bytes, starts with %PDF) and a Word file (254,700 bytes, a zip holding `word/document.xml` and the photo).
- Found and fixed (R31): at 375 px the "Downloaded: …" line made the dialog scroll sideways. After the fix the name wraps and nothing scrolls sideways.
- Jobs list: desktop columns (score 69, "Tailored CV" with EN, RO, "Not applied", Open); 375 px a card, title wraps inside it, Open 44 px high. No sideways scrolling.
- No sideways scrolling and nothing overlapping on the job page or the list at either width (no element reaches past the frame's right edge).

Not seen in the browser, with the reason:
- "Can't be tailored yet" (Task 8): the local account has no job that needs its text. Covered by the unit tests only.
- "Edited since last score" after a guided-review decision (Task 10): neither copy has an unchecked AI guess, so the guided review has nothing to open. Sending a decision straight to the API for an already checked item was refused by this session's permission check, and I left it there. Covered by the API tests only.
- Continue tailoring: needs an unfinished tailoring run. The local data has none, and starting one ("Tailor again") creates a new run and asks the AI for proposals, which nobody approved. Covered by the unit tests only.

Left behind on this machine: four test downloads in the Downloads folder (two PDFs ending in "(4)" and "(5)", two Word files), and Docker Desktop running.
open: the three checks above, for the owner to do or to approve the data they need.
