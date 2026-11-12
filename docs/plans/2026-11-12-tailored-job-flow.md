# Tailored job flow

Owner's picks (2026-11-12), from the decision page https://claude.ai/artifact/GP2K6o95ssKu3q43qHbE82 (mock screens: workspace `mockups/phase3/tailored-job-flow.html`; spec: workspace `tailored-job-flow-design-2026-11-12.md`). Briefs must be complete on their own: Codex can't open the workspace files.

What changes for a person:
- A job that has a tailored CV shows that CV on its page (read-only), with its latest score, and Edit CV, Export, Change template and Tailor again next to it. Must-haves and About the job are folded behind one row.
- After a hand edit the score shows "Edited since last score" with a Re-check button. Nothing re-scores by itself.
- A job with CVs in two languages gets a language switch on its page.
- The Jobs list shows each job's latest score, whether a tailored CV exists, and the application status: columns on desktop, cards on a phone.
- The application dropdown holds Not applied, Applied, Interview, Offer, Rejected. "Tailored" is never set by hand or by the app.
- My CVs is gone: page and menu entry. `/cvs` leads to Jobs.

Rules:
- **A job is tailored** when it has a `tailor_runs` row with `status = 'done'` and `kind in ('tailor', 'retailor', 'section')`. The API reports it as `hasTailoredCv`. Nothing else decides it (not the dropdown, not a score existing).
- **An unfinished run** is what `JobPage` already uses: the run this browser remembers (`remembered(jobId)` in `tailor/TailorFlow.tsx`), fetched with `getRun`, not done and with a `currentSection`. Don't add a server-side notion of it.
- A job that is not tailored keeps today's page, unchanged.
- No new limits, quotas or thresholds on Re-check beyond what scoring in the accept flow already has.
- Copy: English strings are given below word for word. Romanian strings go into the matching `ro-*.ts` file using the words that dictionary already uses for the same things (tailored CV, score, apply); the owner reads Romanian and checks them.
- Phone layout uses the breakpoint `styles/jobs.css` already uses (`max-width: 900px`). No sideways scrolling at 375 px; buttons and tappable rows at least 44 px high.
- **Release order, for the owner:** the API from Task 1 must be live before Task 1's migration runs on the hosted database. Today's API writes the status `tailored` when a run finishes (`apps/api/src/tailor/accept.ts:216`); the new check constraint would reject that write.

Feature id for cost tags: `tailored-job-flow`. Branch `feat/tailored-job-flow`, worktree `resumora-tailored-job`, from `origin/main`.

Order: one lane, in plan order. Tasks 1 to 3 each touch `packages/shared` or a migration; Tasks 4, 5 and 6 all touch `JobPage.tsx`, `jobs.css` and the jobs dictionaries; Tasks 4 and 7 both touch `useCvDoc.ts`. Continue in a fresh session after Task 4.

Before the PR: open the tailored job page and the Jobs list in the preview at 375 px wide and at desktop width, and check there is no sideways scrolling and nothing overlaps.

Review focus (each has a test in the task named):
- A tailored copy with no score of its own, such as a translated copy → a dash and Re-check, never another copy's number (Tasks 2, 5).
- `?cv=` naming a CV of another job or of another person → treated as absent; no data of that CV in the response (Task 2).
- A browser tab opened before the release sends the status `tailored` → rejected with the normal validation error; the page shows its existing save error (Task 1).
- Re-check fails → the old number stays on screen (Task 5).
- A long title or company on a phone card wraps inside the card (Task 6).

## Task 1: Application status keeps five values

---
files: [packages/shared/src/jobs.ts, packages/shared/src/jobs.test.ts, apps/api/src/tailor/accept.ts, apps/api/test/jobs.test.ts, apps/web/src/jobs/JobPage.tsx, apps/web/src/jobs/JobsPage.tsx, apps/web/src/i18n/en-jobs.ts, apps/web/src/i18n/ro-jobs.ts, apps/web/src/jobs/job-page.test.tsx, apps/web/src/jobs/jobs-page.test.tsx]
new_files: [supabase/migrations/20261112000000_application_status.sql]
deps: false
size: 90
tests: normal
---

**Goal:** the application status says only how the application is going.
- The shared status enum (`packages/shared/src/jobs.ts:41`) becomes `saved | applied | interview | offer | rejected`. The stored value `saved` stays; only its label changes.
- Migration: set `application_status = 'saved'` on every job where it is `'tailored'`, then replace the check constraint on `jobs.application_status` (added inline in `20261108000000_tailoring.sql:4`; confirm its name, by default `jobs_application_status_check`) with the five values. Don't touch `version` or `updated_at`.
- `apps/api/src/tailor/accept.ts:216-217` stops setting the status when a run finishes. Remove that write and whatever exists only to serve it.
- `JobPage`'s dropdown (`JobPage.tsx:237`) lists the five values. Labels: `saved` → "Not applied", the other four as today.
- `JobsPage` (`JobsPage.tsx:171-188`): remove the badge and the "View" action that depend on the status `tailored`; a job that had them now looks like any other ready job. The other status badges stay. (Task 6 rebuilds the row.)
- Remove the `tailored` status label from both dictionaries.

**Acceptance tests:**
- Shared: the status schema accepts each of the five values and rejects `tailored`.
- API: `PATCH /v1/jobs/:id` with `applicationStatus: "tailored"` answers with the same validation error an unknown status gets; with `"applied"` it saves.
- API: finishing a tailoring run on a job whose status is `saved` leaves the status `saved`.
- Database: after the migration a row that held `tailored` holds `saved`; inserting `tailored` fails the check.
- Web: the dropdown shows exactly Not applied, Applied, Interview, Offer, Rejected, and choosing Applied saves it (existing status tests stay green, adjusted for the labels).

**Out of scope:** an applied date, the new list row (Task 6), any "Tailored CV" pill (Tasks 4 and 6).

## Task 2: Score of one tailored copy, "edited since last score", Re-check (API)

---
files: [packages/shared/src/tailor.ts, apps/api/src/jobs/routes.ts, apps/api/src/tailor/repo.ts, apps/api/src/tailor/supabase-repo.ts, apps/api/src/tailor/memory-repo.ts, apps/api/src/tailor/tailored-routes.ts, apps/api/src/tailor/accept.ts, apps/api/test/jobs.test.ts]
new_files: [supabase/migrations/20261112000100_tailored_score_stale.sql]
deps: false
size: 170
tests: normal
---

**Goal:** the score endpoint answers for one tailored copy and says whether that copy was edited by hand since its score; a new route re-scores it.
- Migration: `alter table public.tailored_cvs add column score_stale boolean not null default false;`. No policy change.
- The score response (`packages/shared/src/tailor.ts:79`, today `{ base, tailored }`) gains three required fields:
  - `tailoredCvId: string | null`: the copy the tailored score belongs to;
  - `stale: boolean`: true when that copy's `score_stale` is true, or when the copy has no score at all;
  - `hasTailoredCv: boolean`: the rule at the top of this plan.
- `GET /v1/jobs/:id/score` takes an optional `?cv=<tailoredCvId>`. The copy is the job's tailored CV with that id; when `cv` is absent, or names no CV of this job owned by the caller, it is the job's copy with the newest `updated_at`. A job with no tailored CV: `tailoredCvId: null`, `tailored: null`, `stale: false`.
- `tailored` is the newest `match_scores` row with `target = 'tailored'` and `tailored_cv_id` = the copy's id. If the copy has none, use the copy's own `score` column. If that is empty too, `tailored: null` and `stale: true`. Never fall back to another copy's score.
- `POST /v1/jobs/:id/score` (computes a missing base score) answers in the same new shape.
- Saving a tailored score (`saveScore` with target `tailored`) also sets that copy's `score_stale = false`. This covers the accept flow (`accept.ts:184`) and Re-check.
- `PUT /v1/tailored/:id` (hand edits, `tailored-routes.ts:60`) sets `score_stale = true` when the saved content differs from the stored content. A save with identical content leaves the flag alone.
- New `POST /v1/tailored/:id/score` (Re-check): same login and ownership check as `PUT /v1/tailored/:id`. It scores the copy's current content against its job the way the accept flow does (`accept.ts:176-184`), saves the score to `match_scores` and to the copy's `score` column, clears `score_stale`, and returns the score response for that copy. Failures use the error codes the accept flow's scoring already uses.

**Acceptance tests:**
- A job with an English and a Romanian copy, each with its own score: `?cv=<ro id>` returns the Romanian score and `tailoredCvId` = the Romanian id; without `cv` it returns the copy saved last.
- A copy with no `match_scores` row and an empty `score` column: `tailored: null`, `stale: true`, while the other copy's score is untouched.
- `?cv=` naming a CV of another job, or of another user: answered as if `cv` were absent; nothing from that CV appears.
- `PUT /v1/tailored/:id` with changed content → the next GET has `stale: true`. With identical content → `stale` stays false.
- `POST /v1/tailored/:id/score` → a new `match_scores` row for that copy, `stale: false`, and the response carries the new total. By another user → the same answer `PUT` gives for a CV that isn't theirs.
- Accepting a tailoring suggestion on a copy whose flag was true → `stale: false`.
- `hasTailoredCv` is false with only a `running` run, true once a `tailor` run is `done`, and false when the only `done` run is of kind `translate` or `cover_letter`.
- Database: the new column exists and defaults to false.

**Out of scope:** scoring logic, prompts and weights; any limit on how often Re-check runs; the web (Tasks 4 and 5).

## Task 3: The Jobs list carries each job's latest score and tailored languages (API)

---
files: [packages/shared/src/jobs.ts, packages/shared/src/jobs.test.ts, apps/api/src/jobs/routes.ts, apps/api/src/tailor/repo.ts, apps/api/src/tailor/supabase-repo.ts, apps/api/src/tailor/memory-repo.ts, apps/api/test/jobs.test.ts]
new_files: []
deps: false
size: 110
tests: normal
---

**Goal:** `GET /v1/jobs` returns what the list needs in the same response.
- `JobListItem` (`packages/shared/src/jobs.ts:69`) gains two optional fields, always present in this route's answer:
  - `score: number | null`;
  - `tailoredLanguages: string[]` (the tailor language codes).
- New tailor-repo function `summaries(jobIds: string[]): Promise<Map<string, { score: number | null; tailoredLanguages: string[] }>>`, called once per list page from the route (`apps/api/src/jobs/routes.ts:72`), which merges the result into the items.
- For a tailored job (rule at the top): `tailoredLanguages` = the languages of all its tailored CVs, and `score` = the total of the newest tailored score of the copy with the newest `updated_at` (chosen as in Task 2, including the fallback to the copy's `score` column).
- For any other job: `tailoredLanguages: []` and `score` = the total of its newest base score, or null.
- `summaries` uses a fixed number of database queries per call, whatever the number of jobs. Never one query per job.

**Acceptance tests:**
- A list with a tailored job (base 69, tailored copy 84), an untailored scored job (61) and a job still being read: scores 84, 61, null; `tailoredLanguages` `["en"]`, `[]`, `[]`.
- A tailored job with English (score 84, saved earlier) and Romanian (score 80, saved last): `score` 80, `tailoredLanguages` holds both.
- A job with a tailored score but no `done` run: `score` is its base score and `tailoredLanguages` is `[]`.
- With the Supabase repo and 20 jobs, the number of queries `summaries` issues is the same as with 1 job.
- Another user's scores and CVs never appear in the caller's list.

**Out of scope:** unfinished-run information (it comes from the browser, see Rules), sorting or filtering by score, the web (Task 6).

## Task 4: Tailored job page: the CV, the latest score, folded job details (web)

---
files: [apps/web/src/jobs/JobPage.tsx, apps/web/src/jobs/jobs-api.ts, apps/web/src/cvs/useCvDoc.ts, apps/web/src/styles/jobs.css, apps/web/src/i18n/en-jobs.ts, apps/web/src/i18n/ro-jobs.ts, apps/web/src/jobs/job-page.test.tsx]
new_files: [apps/web/src/jobs/TailoredJobView.tsx]
deps: false
size: 230
tests: normal
---

**Goal:** when the score response says `hasTailoredCv`, `JobPage` renders the tailored layout (new component `TailoredJobView`) in place of the band and the two columns. Everything else on `JobPage` (loading, failed, editing, delete dialog, the untailored layout) stays as it is.

Layout, top to bottom (mock: variant "A · CV first"):
1. Header as today, plus a pill "Tailored CV" in the facts row, and the Application dropdown at the right of the header (the same control and `changeStatus` handler `JobPage` has today; it no longer appears inside About this job in this layout).
2. Score band, the existing `.job-band`: `MatchNumber` with the response's `tailored` score; under it the small line "Latest score, from your tailored CV". When `tailored` is null the number shows "–".
   - Coach line from `mustCount(requirements, tailored)`: all met → "All {total} must-haves covered."; otherwise "{met} of {total} must-haves covered. Still open: {texts}." with the first two unmet requirement texts joined by ", ", then " and {n} more" when there are more. No must-haves → no coach line.
   - Buttons: "Edit CV" (primary), "Export", "Tailor again".
3. One row, closed on load: a button with `aria-expanded`, text "The job: must-haves, nice-to-haves, keywords and the full ad", and "Show" / "Hide". Open, it shows what the page shows today: `MustHaves` with `NiceToHave`, and the About this job section (`JobSummary`, `Keywords`, Edit, Delete, the "read by AI / edited by you" line), all fed the `tailored` score.
4. CV bar: "Template: {template name} · Change template" (link).
5. The CV: `CvDocument` in the copy's template, inside the same `.cvs-preview` wrapper `TemplatePage` uses (pattern: `apps/web/src/cvs/TemplatePage.tsx:81`). Read-only; no editor controls.

Data:
- `getJobScore(id, cvId?)` adds `?cv=` when given and parses the new response shape from Task 2. The query key includes the copy id.
- The copy on screen is the response's `tailoredCvId`. Load its document with `useCvDoc`, which gains an optional argument: `useCvDoc(cvId?: string)`; when given it replaces the `?cv=` search value. Its other callers stay unchanged.
- Links come from the loaded doc's `links`: Edit CV → `links.open`, Export → `links.export`, Change template → `links.template`, Tailor again → `links.open` with `&retailor=1` added.
- While the document loads: the band is already visible and the CV area shows the page's skeleton. If it fails to load: a notice with Retry in the CV area; the band and the job row keep working.

Phone (`max-width: 900px`): the band becomes one column in the order number, coach line, buttons, each button full width; the open job row stacks its two panels; the CV bar wraps.

**Acceptance tests:**
- `hasTailoredCv: true`, base 69, tailored 84: the page shows 84 and no 69 anywhere; "Edit CV", "Export", "Tailor again" and "Change template" point at `/jobs/:id/cv?cv=<id>`, `.../cv/export?cv=<id>`, `/jobs/:id/cv?cv=<id>&retailor=1` and `.../cv/template?cv=<id>`.
- The job row is closed on load (`aria-expanded="false"`, no must-have list in the page); a click opens it and shows the must-haves ticked from the tailored score (a requirement met only in the tailored score shows as met).
- Coach line: 6 of 7 met → "6 of 7 must-haves covered. Still open: {that requirement}."; 7 of 7 → "All 7 must-haves covered."
- The CV's name and a bullet from the tailored content are on the page, and no text field or editor button is inside the CV.
- `hasTailoredCv: false` with a tailored score present (first run under way): today's layout, unchanged (existing tests stay green).
- The Application dropdown in the header saves a change.
- The CV document fails to load: the score and buttons still show, with a Retry notice where the CV would be.

**Out of scope:** the language switch, the edited notice and Re-check, the Continue tailoring state (all Task 5); the Jobs list.

## Task 5: Language switch, Re-check, Continue tailoring (web)

---
files: [apps/web/src/jobs/TailoredJobView.tsx, apps/web/src/jobs/JobPage.tsx, apps/web/src/jobs/jobs-api.ts, apps/web/src/styles/jobs.css, apps/web/src/i18n/en-jobs.ts, apps/web/src/i18n/ro-jobs.ts, apps/web/src/jobs/job-page.test.tsx]
new_files: []
deps: false
size: 150
tests: normal
---

**Goal:** the three remaining states of the tailored layout.
- **Language switch.** Shown in the CV bar only when `listTailored(jobId)` returns more than one copy. One button per copy, labelled with the language name the app already uses for tailored CVs, the selected one `aria-pressed="true"`. Choosing a copy puts `?cv=<id>` on the job URL (replacing the history entry), and the score, coach line, ticks, keyword marks, template line, the CV and all four links follow it. With no `?cv=`, the page shows the copy the API picks (saved last).
- **Edited since last score.** When the response has `stale: true`, the band shows the text "Edited since last score" and a button "Re-check" beside the number; the number keeps its normal style. When `tailored` is null the text is "No score yet" with the same button.
  - Re-check calls `POST /v1/tailored/:id/score` (new `recheckScore(cvId)` in `jobs-api.ts`). While it runs the button is disabled and reads "Checking". On success the returned response replaces the cached score, so the number, coach line, ticks and marks update and the notice goes away.
  - On failure the old number stays, and "Couldn't check the score." appears with a "Try again" button that repeats the call.
- **Tailoring again in progress.** When the layout is tailored and `JobPage`'s unfinished-run query has a run: the primary button is "Continue tailoring" → `/jobs/:id/tailor`, with the existing step line under it (`job.tailor.step`), and "Edit CV" becomes a normal button. "Tailor again" is hidden while a run is unfinished.

**Acceptance tests:**
- Two copies: the switch shows both languages; choosing the second puts its id in `?cv=`, requests the score with that id, and shows that copy's score and CV text. One copy: no switch.
- `stale: true`: the notice and Re-check show next to 84. Re-check succeeding with 88 → the page shows 88 and no notice. Failing → 84 is still shown, with "Couldn't check the score." and "Try again".
- `tailored: null`, `stale: true`: "–", "No score yet" and Re-check.
- While Re-check runs the button is disabled and reads "Checking"; a second click sends nothing.
- A remembered unfinished run on a tailored job: "Continue tailoring" is the primary button with the step line, "Edit CV" is still there, "Tailor again" is not.

**Out of scope:** creating a language copy (stays on the tailored CV's page), automatic re-scoring, changing how runs are remembered.

## Task 6: Jobs list: score, CV and application; cards on a phone (web)

---
files: [apps/web/src/jobs/JobsPage.tsx, apps/web/src/jobs/JobPage.tsx, apps/web/src/styles/jobs.css, apps/web/src/i18n/en-jobs.ts, apps/web/src/i18n/ro-jobs.ts, apps/web/src/jobs/jobs-page.test.tsx]
new_files: [apps/web/src/tailor/open-run.ts]
deps: false
size: 170
tests: normal
---

**Goal:** each job in the list shows five parts (mock: "A · Columns" on desktop, "B · Cards" on a phone).

| Part | Content |
|---|---|
| Job | Title (the link to the job, as today) with company and place under it |
| Score | `item.score`, or "–" when null |
| CV | In this order: an unfinished run → "Tailoring, step {n} of {total}"; `tailoredLanguages` not empty → a pill "Tailored CV" and the codes in capitals ("EN, RO"); job `ready` → "Base CV"; `queued` or `processing` → "Reading the ad"; `failed` or `needs_text` → the text the row shows today |
| Application | A pill with the status label ("Not applied", "Applied", ...) for ready jobs; empty otherwise |
| Action | "Continue" (primary, → `/jobs/:id/tailor`) with an unfinished run; otherwise "Open" (→ the job) for ready jobs; today's action for failed and needs-text jobs |

- Unfinished run: move the query function from `JobPage.tsx:51-58` into `apps/web/src/tailor/open-run.ts` as `fetchOpenRun(jobId): Promise<Run | null>` (the run type `getRun` returns) and use it from both pages. `JobsPage` calls it only for jobs that have a remembered run id in this browser, so most lists make no extra request.
- Desktop (wider than 900px): one grid row per job with a header row "Job, Score, CV, Application". The header row is `aria-hidden`; each cell carries its label as visually hidden text so a screen reader hears "Score 84".
- Phone (`max-width: 900px`): one card per job: the score in front in a round badge, then the title and company, then the CV and Application pills on one wrapping line, then the action button at full width. The header row is not shown.
- Under the list, once: "Score: from the tailored CV when the job has one, otherwise from your base CV."
- The date the row shows today may go if the columns leave no room; the title link, delete and any existing row actions for failed jobs stay.

**Acceptance tests:**
- Items with (score 84, `["en","ro"]`, `applied`), (78, `["en"]`, `saved`), (61, `[]`, `saved`), (null, `[]`, processing): the rows read "84 · Tailored CV · EN, RO · Applied", "78 · Tailored CV · EN · Not applied", "61 · Base CV · Not applied", "– · Reading the ad".
- A job with a remembered unfinished run at section 2 of 5: "Tailoring, step 2 of 5" and a "Continue" link to `/jobs/:id/tailor`; a job without one issues no run request.
- Each score cell has the hidden label "Score"; the header row is `aria-hidden`.
- A title of 120 characters wraps inside its cell or card; the list never scrolls sideways (assert the title element has no `nowrap` and the row uses `minmax(0, …)` tracks or `min-width: 0`).
- `JobPage` still shows Continue for a remembered run (existing tests stay green after the function moved).

**Out of scope:** sorting or filtering, an applied date, changing what Open does.

## Task 7: Remove My CVs (web)

---
files: [apps/web/src/router.tsx, apps/web/src/layout/AppShell.tsx, apps/web/src/cvs/MyCvsPage.tsx, apps/web/src/cvs/cvs.test.tsx, apps/web/src/cvs/TemplatePage.tsx, apps/web/src/cvs/ExportPage.tsx, apps/web/src/cvs/useCvDoc.ts, apps/web/src/cv/Editor.tsx, apps/web/src/styles/cvs.css, apps/web/src/i18n/en-cvs.ts, apps/web/src/i18n/ro-cvs.ts]
new_files: []
deps: false
size: 130
tests: light
---

**Goal:** the My CVs page and its menu entry are gone, and nothing links to it.
- Delete `MyCvsPage.tsx`. In `router.tsx:35`, `/cvs` becomes `<Navigate to="/jobs" replace />`.
- `AppShell.tsx:35`: remove the My CVs link. The menu reads My CV, Jobs, Account.
- `TemplatePage.tsx:29` (the shared missing / error state): its link goes to the job (`/jobs/:id`, text "Back to the job") for a tailored CV and to `/cv` ("Back to my CV") for the base CV.
- `ExportPage.tsx:74` (after an export): the same two targets and texts.
- `Editor.tsx:315-322` (base CV header): add a "Template" link to `/cv/template` beside the existing Export link, in the same style.
- Remove what only My CVs used: `listAllTailored`, `ListItemSchema` and `TailoredListItem` in `useCvDoc.ts` if nothing else imports them, its styles in `cvs.css`, its strings in both dictionaries, and its tests in `cvs.test.tsx`. Tests in that file for the Template and Export pages stay.

**Acceptance tests:**
- Visiting `/cvs` lands on `/jobs`.
- After exporting a tailored CV the page offers "Back to the job" → `/jobs/:id`; for the base CV, "Back to my CV" → `/cv`.
- The menu has no My CVs entry, and no `to="/cvs"` or `"/cvs"` link target is left in `apps/web/src` outside the redirect.

**Out of scope:** the API route `GET /v1/tailored`, which the web no longer calls after this task. It stays; removing it is listed as open for the owner.
