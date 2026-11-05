# Job capture, step 1.5: the /jobs web UI (pasted text)

Branch `rebuild/jobs-ui`, based on `rebuild/jobs-core`. Built with the `codex-build` skill.
Spec (binding): `docs/superpowers/specs/2026-11-05-job-capture-design.md` ("Job list and job view", "Errors", "API"). Approved mockup v2: https://claude.ai/artifact/B67D4d78pXtGYndquTq4Gm. Where this plan and the spec differ, this plan wins (it records the user's later choices).

**Goal:** a signed-in user opens **Jobs** in the top bar, sees their saved jobs, adds one by pasting its link and text, opens a job on its own page with two tabs (the ad exactly as pasted, and the AI summary), edits the summary, and deletes jobs. It uses only the phase 1 API, plus one small change: `GET /v1/jobs/:id` also returns the saved text. No link-only adding, no retry, no paste box for `needs_text`, no extension, no tailoring (later phases).

Rules for every task:
- Copy the existing web patterns: API calls through `apiFetch`/`authedFetch` in `apps/web/src/lib/api.ts` (like `apps/web/src/imports/imports-api.ts`); data through `@tanstack/react-query` keyed by user id (like `useMyCv` in `apps/web/src/cv/CvPage.tsx`); polling with `refetchInterval` (like `apps/web/src/imports/ImportScreen.tsx`); every page inside `AppShell`; all copy through `t()` from keys in `apps/web/src/i18n/en-jobs.ts`; colours only from the tokens in `apps/web/src/styles/tokens.css`.
- Tests use Vitest + Testing Library, behaviour a user sees (roles, names, text), and mock `apps/web/src/jobs/jobs-api.ts` with `vi.mock` the way `apps/web/src/imports/imports.test.tsx` mocks `imports-api.ts`.
- Accessible: real buttons and links, labelled fields, the dialog is `role="dialog"` with `aria-modal`, focus moves into it and back to **Add job** when it closes, Escape closes it; tabs use `role="tablist"`/`tab`/`tabpanel` with `aria-selected`, and Left/Right arrow keys move between tabs.
- No new dependencies. Files under ~300 lines. Plain words in code.
- Do not open `.env*`, `.dev.vars` or other secret files.

## Task 1: API — the single-job response includes the saved text

---
files: [packages/shared/src/jobs.ts, packages/shared/src/jobs.test.ts, apps/api/src/jobs/supabase-repo.ts, apps/api/src/jobs/memory-repo.ts, apps/api/test/jobs.test.ts, apps/api/test/jobs-repo.test.ts, docs/superpowers/specs/2026-11-05-job-capture-design.md]
new_files: []
deps: false
size: 60
---

**Goal:** `GET /v1/jobs/:id` (and the job `PATCH /v1/jobs/:id` returns) carries `rawText: string | null`, the text saved in `jobs.raw_text` (the pasted text, first 30,000 chars). The list (`GET /v1/jobs`) does **not** carry it.
- `packages/shared/src/jobs.ts`: `JobSchema` gains `rawText: z.string().nullable()`. `JobListItemSchema` is unchanged.
- `apps/api/src/jobs/supabase-repo.ts`: `get()` selects `raw_text` and passes it as `rawText`. `LIST_COLUMNS` and `list()` are unchanged.
- `apps/api/src/jobs/memory-repo.ts`: `get()` returns the row's `rawText`.
- `jsonLd`/`json_ld` stays private everywhere.
- Spec, "API" table, row `GET /v1/jobs/:id`: change "→ full job without `raw_text`" to "→ full job, with the saved text as `rawText` (the list never carries it); never `jsonLd`".

**Acceptance tests:**
- `apps/api/test/jobs.test.ts`: the `publicFields` helper is split so list responses still contain neither `rawText` nor `jsonLd`, and job responses contain no `jsonLd`/`json_ld`. The detail test asserts `rawText` equals the posted `pageText`; the PATCH test asserts the updated job still carries `rawText`. Another user's id still gets 404.
- `apps/api/test/jobs-repo.test.ts`: the list-privacy test keeps checking that list items have no `rawText`/`raw_text`/`jsonLd`/`json_ld`, while `repo.get()` now has `rawText` equal to the created text and still no `jsonLd`/`json_ld`/`raw_text`.
- `packages/shared/src/jobs.test.ts`: `JobSchema` accepts a job with `rawText: null` and one with a string, and rejects one without `rawText`.
- All existing API and shared tests pass; typecheck passes.

**Out of scope:** the web app, the worker, migrations, the list response.

## Task 2: Web — jobs API client and the jobs copy

---
files: [apps/web/src/jobs/jobs-api.ts, apps/web/src/jobs/jobs-api.test.ts, apps/web/src/i18n/en-jobs.ts, apps/web/src/i18n/en.ts]
new_files: [apps/web/src/jobs/jobs-api.ts, apps/web/src/jobs/jobs-api.test.ts, apps/web/src/i18n/en-jobs.ts]
deps: false
size: 200
---

**Goal:** `apps/web/src/jobs/jobs-api.ts` exports, each validating the response with a schema from `@resumora/shared`:
- `listJobs(cursor?: string): Promise<JobListPage>` → `GET /v1/jobs?limit=50` (plus `&cursor=` URL-encoded when given).
- `getJob(id): Promise<Job>` → `GET /v1/jobs/:id` (id URL-encoded).
- `createJob(url, pageText): Promise<{ id: string; existing: boolean }>` → `POST /v1/jobs { url, pageText }`; the `202 { id }` response becomes `existing: false`, the `200 { id, existing: true }` response `existing: true`. Define the response schema locally in this file.
- `patchJob(id, version, extracted): Promise<Job>` → `PATCH /v1/jobs/:id { version, extracted }`.
- `deleteJob(id): Promise<void>` → `DELETE /v1/jobs/:id`; resolves on 204, throws `ApiClientError` (with the server's code) otherwise. Use `authedFetch` + `errorOf`, since a 204 has no JSON body.

`apps/web/src/i18n/en-jobs.ts` exports `jobsEn`, spread into `en` in `apps/web/src/i18n/en.ts` the way `enrichSectionsEn` is (and `"nav.jobs": "Jobs"` added next to `"nav.myCv"` in `en.ts`). It holds every string Tasks 3–5 need, exactly:
```
jobs.title: Jobs
jobs.add: + Add job
jobs.search: Search your jobs
jobs.searchPlaceholder: Search by title, company or place
jobs.noMatch: No jobs match "{q}".
jobs.empty.title: No jobs yet
jobs.empty.text: Save the jobs you are interested in. Resumora pulls out the title, company and requirements, so you can tailor your CV to each one.
jobs.loadMore: Load more
jobs.badge.reading: Reading job…
jobs.badge.failed: Failed
jobs.stillReading: Still reading. Reload the page to check again.
jobs.loadError: Something went wrong loading your jobs. Reload the page.
jobs.retry: Try again
jobs.dialog.title: Add a job
jobs.dialog.close: Close
jobs.dialog.url: Link to the job ad
jobs.dialog.text: Job description
jobs.dialog.textPlaceholder: Open the job ad, select all its text and paste it here.
jobs.dialog.countLow: {n} of at least 200 characters
jobs.dialog.count: {n} characters
jobs.dialog.linkSoon: Soon a link alone will be enough: Resumora will read the page for you.
jobs.dialog.duplicate: Already in your list.
jobs.dialog.openIt: Open it
jobs.dialog.extTitle: Save jobs in one click
jobs.dialog.extText: The Resumora extension for Chrome saves the job you are looking at, even on LinkedIn.
jobs.dialog.cancel: Cancel
jobs.dialog.submit: Add job
jobs.soon: Soon
jobs.error.invalid_url: This doesn't look like a job link.
jobs.error.text_too_short: Not enough text on this page. Select the job description and try again.
jobs.error.payload_too_large: This page is too large to send.
jobs.error.job_limit: You can add up to 30 jobs per day.
jobs.error.version_conflict: This job changed elsewhere. Reload to see the latest.
jobs.error.wrong_status: This job can't be changed right now.
jobs.error.not_a_job: This page doesn't look like a job posting.
jobs.error.ai_failed: We couldn't read this job.
jobs.error.generic: Something went wrong. Please try again.
job.back: ← All jobs
job.notFound: This job isn't in your list.
job.reading.title: Reading this job
job.reading.text: This takes a few seconds. You can go back to your list meanwhile.
job.failed.notAJob: Check that you pasted a single job ad, then delete this and add it again.
job.failed.other: Delete it and add it again.
job.original: View original posting
job.edit: Edit
job.delete: Delete
job.deleteConfirm: Delete this job?
job.deleteCancel: Cancel
job.tailor.title: Tailor your CV to this job
job.tailor.text: Resumora will match your CV against these requirements and suggest changes.
job.tailor.button: Tailor your CV →
job.tabs: Job
job.tab.ad: Job ad
job.tab.summary: Summary
job.ad.legend: The ad exactly as you pasted it.
job.ad.missing: The original text isn't available for this job.
job.must: Must have
job.nice: Nice to have
job.mustCount: Must have ({n})
job.niceCount: Nice to have ({n})
job.none: None listed.
job.summary: Summary
job.requirements: Requirements
job.responsibilities: What you would do
job.benefits: Benefits
job.editedByYou: Summary edited by you
job.readByAi: Summary read by AI. Check it against the ad.
job.applyBy: Apply by {date}
job.workMode.onsite: On-site
job.workMode.hybrid: Hybrid
job.workMode.remote: Remote
job.workMode.unknown: Not stated
job.type.full_time: Full time
job.type.part_time: Part time
job.type.contract: Contract
job.type.internship: Internship
job.type.temporary: Temporary
job.type.unknown: Not stated
job.seniority.intern: Intern
job.seniority.junior: Junior
job.seniority.mid: Mid-level
job.seniority.senior: Senior
job.seniority.lead: Lead
job.seniority.unknown: Not stated
job.period.hour: hour
job.period.day: day
job.period.month: month
job.period.year: year
job.category.skill: Skill
job.category.experience: Experience
job.category.education: Education
job.category.language: Language
job.category.certification: Licence or certificate
job.category.other: Other
edit.job.title: Edit the summary
edit.job.hint: Fix anything the AI got wrong. The ad you pasted stays as it is.
edit.job.jobTitle: Job title
edit.job.company: Company
edit.job.location: Location
edit.job.workMode: Work mode
edit.job.type: Type
edit.job.seniority: Seniority
edit.job.summary: Summary
edit.job.salaryMin: Salary from
edit.job.salaryMax: Salary to
edit.job.currency: Currency
edit.job.period: Per
edit.job.periodNone: Not stated
edit.job.applyBy: Apply by
edit.job.requirements: Requirements ({n})
edit.job.requirement: Requirement {n}
edit.job.kind: Must or nice
edit.job.mustShort: Must
edit.job.niceShort: Nice
edit.job.category: Category
edit.job.remove: Remove requirement {n}
edit.job.addRequirement: + Add requirement
edit.job.responsibilities: What you would do
edit.job.benefits: Benefits
edit.job.onePerLine: One per line.
edit.job.titleRequired: Give the job a title.
edit.job.reload: Reload
edit.job.save: Save
edit.job.saving: Saving…
edit.job.cancel: Cancel
```
(Key on the left, English text on the right; `{name}` placeholders are filled by `t()`.)

**Acceptance tests** (`apps/web/src/jobs/jobs-api.test.ts`, stubbing `fetch` and the Supabase session the way `apps/web/src/lib/api.test.ts` does):
- `listJobs()` calls `/v1/jobs?limit=50`; `listJobs("a b")` calls `/v1/jobs?limit=50&cursor=a%20b`; both return the parsed page.
- `createJob` returns `{ id, existing: false }` for a 202 `{ id }` and `{ id, existing: true }` for a 200 duplicate; it sends `{ url, pageText }` as JSON with `POST`.
- `patchJob` sends `PATCH` with `{ version, extracted }`; a 409 throws `ApiClientError` with code `version_conflict`.
- `deleteJob` resolves on 204 and throws `ApiClientError` with code `not_found` on a 404 error body.
- `getJob` URL-encodes the id.
- All existing web tests pass; typecheck passes (every key is a valid `MessageKey`).

**Out of scope:** pages, routes, styles.

## Task 3: The /jobs list page and the Add job dialog

---
files: [apps/web/src/jobs/JobsPage.tsx, apps/web/src/jobs/AddJobDialog.tsx, apps/web/src/jobs/jobs-page.test.tsx, apps/web/src/styles/jobs.css, apps/web/src/main.tsx, apps/web/src/router.tsx, apps/web/src/layout/AppShell.tsx]
new_files: [apps/web/src/jobs/JobsPage.tsx, apps/web/src/jobs/AddJobDialog.tsx, apps/web/src/jobs/jobs-page.test.tsx, apps/web/src/styles/jobs.css]
deps: false
size: 450
---

**Goal:** a signed-in user at `/jobs` sees their jobs as a full-width list and adds a job from a dialog, as in mockup v2.
- **Route and nav:** `router.tsx` adds `{ path: "/jobs", element: <JobsPage /> }` inside the `RequireAuth` children. `AppShell` gets a second `NavLink` "Jobs" (`nav.jobs`) to `/jobs`, after "My CV". `main.tsx` imports `./styles/jobs.css`. (Added during the build: both nav links ask `app.leaveUnsaved` when the CV editor has unsaved changes, like Sign out, since the editor drops a pending autosave on unmount; `en.ts` gained that key.)
- **Page head:** `<h1>` "Jobs" and a primary **+ Add job** button.
- **List:** first page from `listJobs()` in a query keyed `["jobs", userId]` (`userId` as in `useMyCv`). Each job is one row: a link to `/jobs/:id` showing the title (or, when there is no title yet, the link's host without `www.`), "company · location" (or the host), a badge ("Reading job…" for `queued`/`processing`, "Failed" for `failed`, none otherwise), and the date (`createdAt` formatted with `toLocaleDateString` in `en-GB`, day and short month).
- **Load more (one infinite query, changed during the build):** the list is one `useInfiniteQuery` keyed `["jobs", userId]` (`listJobs(pageParam)`, next param = `nextCursor`). **Load more** calls `fetchNextPage()` while `hasNextPage`. Rows are all pages' items de-duplicated by id. A refetch reloads every loaded page in order from the new cursors, so an added or removed job never leaves a gap or a duplicate. (Hand-kept extra pages had gaps and races in three review rounds.)
- **Polling:** while any loaded row is `queued` or `processing`, the query refetches every 3 s; this reloads all loaded pages, usually one, and replaces the spec's "polling reloads only the first page". Polling stops 2 minutes after it started; the 2-minute window starts again after each successful add. Once stopped with rows still busy, a line under the list says "Still reading. Reload the page to check again."
- **Search:** a `type="search"` field labelled "Search your jobs" filters the loaded rows, case-insensitively, by title, company, location and link host. No match shows `No jobs match "{q}".` While a search is active, Load more is hidden.
- **Empty:** no jobs → "No jobs yet", the text, and a second **+ Add job** button. **Error:** the list query fails → `role="alert"` "Something went wrong loading your jobs. Reload the page." with a **Try again** button that refetches.
- **Add job dialog** (`AddJobDialog.tsx`): opens from either Add button. Fields "Link to the job ad" (`type="url"`) and "Job description" (textarea), a live counter (`{n} of at least 200 characters` under 200 trimmed chars, else `{n} characters`, `n` formatted with `toLocaleString("en")`), the "Soon a link alone…" hint, the extension card ("Save jobs in one click" + "Soon" tag + text; not a link), **Cancel** and **Add job**. Client checks before sending: the link must parse with `new URL()` and use `http:`/`https:`, else the `invalid_url` message under the link field (`aria-invalid`, `aria-describedby`); the trimmed text must be ≥ 200 chars, else the `text_too_short` message. Submit calls `createJob(url.trim(), text)`. While sending, Add job is disabled.
  - `existing: false` → close the dialog, clear it, refetch the list, restart the polling window; the new row shows "Reading job…".
  - `existing: true` → keep the dialog open with `role="status"` "Already in your list." and an **Open it** link to `/jobs/:id`.
  - Errors → `role="alert"` in the dialog with the message for the code (`jobs.error.<code>` for `invalid_url`, `text_too_short`, `payload_too_large`, `job_limit`; `api.network` for `network`; else `jobs.error.generic`). The fields keep their text.
  - Escape, the × button, Cancel or a click on the backdrop closes it; focus returns to the Add button that opened it. While open, the page behind is `inert`.
- **Styles** (`jobs.css`): the mockup v2 look (list rows as cards, badges, dialog over a scrim, extension card with dashed border), using only token variables. Works at 375 px width without horizontal scroll.

**Acceptance tests** (`apps/web/src/jobs/jobs-page.test.tsx`, rendering `routes` with `createMemoryRouter` at `/jobs` the way `apps/web/src/auth/auth.test.tsx` does, with a signed-in session):
- Lists jobs from `listJobs` with title, company · location and the right badges; a row links to `/jobs/<id>`; a job without a title shows the link host.
- The "Jobs" nav link has `aria-current="page"` on `/jobs`.
- Load more appears only with a `nextCursor`, calls `listJobs(cursor)`, appends the rows and disappears on the last page; a job present on both pages is shown once.
- Search filters rows and shows the no-match line.
- Empty and error states (Try again refetches).
- With fake timers: a `queued` job makes the list refetch after 3 s; after it turns `ready` polling stops; with a job that stays `processing`, polling stops after 2 minutes and the "Still reading" line appears.
- Dialog: opens and focuses the link field; a bad link and a 150-char text each show their message without calling `createJob`; a valid add calls `createJob`, closes the dialog and refetches; a duplicate shows "Already in your list." with an Open it link to the job; a `job_limit` error shows its message; Escape closes and focus returns to Add job.
- All existing web tests pass (including `auth.test.tsx`); typecheck passes.

**Out of scope:** the job page (`/jobs/:id` route comes in Task 4), editing, server-side search, link-only adding.

## Task 4: The /jobs/:id job page — tabs, marked ad, delete

---
files: [apps/web/src/jobs/JobPage.tsx, apps/web/src/jobs/JobAd.tsx, apps/web/src/jobs/JobSummary.tsx, apps/web/src/jobs/marks.ts, apps/web/src/jobs/marks.test.ts, apps/web/src/jobs/job-page.test.tsx, apps/web/src/styles/jobs.css, apps/web/src/router.tsx]
new_files: [apps/web/src/jobs/JobPage.tsx, apps/web/src/jobs/JobAd.tsx, apps/web/src/jobs/JobSummary.tsx, apps/web/src/jobs/marks.ts, apps/web/src/jobs/marks.test.ts, apps/web/src/jobs/job-page.test.tsx]
deps: false
size: 450
---

**Goal:** `/jobs/:id` shows one job on its own page, as in mockup v2.
- **Route:** `router.tsx` adds `{ path: "/jobs/:id", element: <JobPage /> }` inside `RequireAuth`. Data from `getJob(id)` in a query keyed `["job", userId, id]`.
- **Always:** a "← All jobs" link to `/jobs`. Loading shows `app.loading`. A 404 shows "This job isn't in your list." with the back link; other errors show `jobs.loadError` with Try again.
- **Busy** (`queued`/`processing`): badge "Reading job…", heading "Reading this job", the text, View original posting. Refetches every 3 s, stopping after 2 minutes (then the "Still reading…" line).
- **Failed:** badge "Failed", heading = the `jobs.error.<errorCode>` message (`jobs.error.ai_failed` for an unknown or null code), the follow-up line (`job.failed.notAJob` for `not_a_job`, else `job.failed.other`), View original posting, Delete.
- **Ready:** `<h1>` title, "company · location"; **Edit** (a button that does nothing yet, wired in Task 5) and **Delete**; fact chips for work mode, type and seniority (`unknown` hidden), salary when `min` or `max` is set (`7,000–9,000 RON / month`: numbers `toLocaleString("en")`, joined with an en dash, currency and `/ period` only when present), and "Apply by {date}"; the Tailor banner ("Tailor your CV to this job" + "Soon" tag, the text, and a **disabled** "Tailor your CV →" button); the tabs **Job ad** (default) and **Summary**; a footer with View original posting (`target="_blank" rel="noopener noreferrer"`) and "Summary edited by you" or "Summary read by AI…" from `editedByUser`.
- **Job ad tab** (`JobAd.tsx`): the legend (a green "Must have" and an amber "Nice to have" sample mark, then `job.ad.legend`) and `rawText` as plain text with line breaks kept (`white-space: pre-wrap`), never as HTML. Requirements are marked with `<mark>` elements (class by kind, `title` "Must have"/"Nice to have"). `rawText` null → `job.ad.missing`.
- **marks.ts:** `markRequirements(text, requirements): { text: string; kind?: "must" | "nice" }[]` — segments that join back to exactly `text`. Each requirement's trimmed text is looked up case-insensitively (first occurrence); longer requirement texts are placed first; a match that overlaps an earlier one is skipped; blank requirement texts are ignored; requirements not found are simply not marked.
- **Summary tab** (`JobSummary.tsx`): Summary paragraph, Requirements as two boxes "Must have (n)" and "Nice to have (n)" (each item with its category label in small text; "None listed." when empty), "What you would do" list, "Benefits" list (hidden when empty).
- **Delete:** the button turns into "Delete this job?" with **Delete** and **Cancel**. Delete calls `deleteJob(id)`, removes the job from the `["jobs", userId]` cache, and navigates to `/jobs`. A failure shows the error message in `role="alert"` and keeps the job.
- **Styles** (`jobs.css`, added to): page header, chips, Tailor banner, tabs, the ad panel, `mark.must` (pine) and `mark.nice` (marigold) with an underline so the colour is not the only signal, the two requirement boxes; works at 375 px.

**Acceptance tests:**
- `apps/web/src/jobs/marks.test.ts`: the segments always join back to the input; case-insensitive match; overlap skipped; longer first ("Strong SQL skills" and "SQL" → one mark on the longer text); blank and missing requirements ignored; text with no requirements → one unmarked segment.
- `apps/web/src/jobs/job-page.test.tsx` (routes in `createMemoryRouter` at `/jobs/<id>`):
  - ready job: title, chips (no "Not stated"), formatted salary, disabled Tailor button, Job ad tab selected with the pasted text and marks for a must and a nice requirement; clicking Summary (and pressing Right arrow) shows the two requirement boxes with counts.
  - `rawText: null` shows the missing-text line.
  - busy job polls every 3 s and shows the ready job when it arrives; failed `not_a_job` job shows its message and Delete.
  - 404 shows "This job isn't in your list."
  - Delete → confirm → calls `deleteJob` and lands on `/jobs`; Cancel keeps the job; a failed delete shows the error.
  - clicking a row on `/jobs` opens the job page (routes wired together).
- All existing web tests pass; typecheck passes.

**Out of scope:** the edit form (Task 5), Try again for failed jobs, tailoring, link-only adding.

## Task 5: Edit the job summary

---
files: [apps/web/src/jobs/JobEditForm.tsx, apps/web/src/jobs/job-edit.test.tsx, apps/web/src/jobs/JobPage.tsx, apps/web/src/styles/jobs.css]
new_files: [apps/web/src/jobs/JobEditForm.tsx, apps/web/src/jobs/job-edit.test.tsx]
deps: false
size: 350
---

**Goal:** **Edit** on a ready job replaces the tabs with a form over the extracted fields; **Save** sends `PATCH` with the job's `version`.
- Form fields, all pre-filled from `job.extracted`: Job title, Company, Location, Work mode / Type / Seniority (selects over the enum values with the `job.workMode.*`, `job.type.*`, `job.seniority.*` labels), Summary (textarea), Salary from / Salary to (number inputs) / Currency (text) / Per (select with "Not stated" + the periods), Apply by (`type="date"`), Requirements (one row each: text input labelled "Requirement {n}", a Must/Nice switch of two `aria-pressed` buttons in a group labelled "Must or nice", a Category select, a × remove button labelled "Remove requirement {n}"; **+ Add requirement** adds a blank must/skill row and is disabled at 60), What you would do and Benefits (textareas, one item per line, with the "One per line." hint). Inputs for list items have `maxLength={500}`. `isJobPosting` is kept as it was.
- **Save:** blank title (after trim) → "Give the job a title." and no request. Otherwise build the `JobExtraction`: trim text fields; empty company/location/currency → `null`; blank requirement rows and blank lines dropped; responsibilities capped at 40 and benefits at 30; salary → `null` when min, max, currency and period are all empty, else numbers or `null`; empty Apply by → `null`. Call `patchJob(id, version, extracted)`; while saving the button says "Saving…" and is disabled. Success → put the returned job in the `["job", userId, id]` cache, update the title/company/location of that row in the `["jobs", userId]` cache, leave edit mode and show the Summary tab.
- **Errors** in `role="alert"` above the buttons: `version_conflict` → its message and a **Reload** button that refetches the job and leaves edit mode (edits discarded); `wrong_status` → its message; `network` → `api.network`; anything else → `jobs.error.generic`. The form keeps its values.
- **Cancel** leaves edit mode without saving.

**Acceptance tests** (`apps/web/src/jobs/job-edit.test.tsx`):
- Edit shows the form pre-filled; switching a requirement from Must to Nice and saving sends `patchJob(id, 1, …)` with that requirement as `nice`; after success the Summary tab shows the new counts and "Summary edited by you" (from the returned job).
- Removing and adding requirements; a blank added row is dropped from the request.
- Responsibilities typed on three lines with a blank line in between send exactly three items.
- Blank title shows "Give the job a title." and sends nothing.
- Empty salary fields send `salary: null`; "7000" and "RON" with "month" send `{ min: 7000, max: null, currency: "RON", period: "month" }`.
- `version_conflict` shows its message; Reload refetches the job and leaves edit mode. `wrong_status` shows its message.
- Cancel leaves edit mode without calling `patchJob`.
- All existing web tests pass; typecheck passes.

**Out of scope:** autosave, editing the pasted ad, unsaved-changes warnings on navigation, tailoring.

## Task 6: Keep the job list on screen when a background refetch fails

---
files: [apps/web/src/jobs/JobsPage.tsx, apps/web/src/jobs/jobs-page.test.tsx, docs/plans/jobs-ui.md]
new_files: []
deps: false
size: 40
---

**Goal:** fix the whole-branch review finding. `JobsPage.tsx` shows the load-error state whenever `query.isError` is true, so a failed background refetch (polling, or a page after the first failing to reload) hides rows the user already sees. Show the error state (with Try again) only when there is no list data yet. When data exists and a refetch fails, keep the rows and show a small `role="status"` line under the list with `jobs.loadError` and a **Try again** button that refetches; the line goes away after a successful refetch. Polling keeps its 3 s / 2 minute rules. (This task's `docs/plans/jobs-ui.md` change records the Task 3 build decisions; it is already made.)

**Acceptance tests** (`apps/web/src/jobs/jobs-page.test.tsx`):
- With rows shown, a refetch that rejects keeps every row visible and shows the status line with Try again; Try again refetches and, on success, removes the line.
- With no data yet, a failed first load still shows the `role="alert"` error with Try again (existing test).
- All existing web tests pass; typecheck passes.

**Out of scope:** anything else in the list, the job page, the API.
