# Job capture: closed ads, trailing job lists, Local not set up

Group D of the 2026-11-10 manual test (points #7 and #8 in `manual-testing-notes-2026-11-10.md`, workspace folder).
Feature tag: `job-capture-closed-ads`. One worktree, tasks in order (Task 2 uses Task 1's field; Task 3 is independent).

Owner-decided behaviour:
1. A closed job ad (the page says the position is no longer open, e.g. bestjobs.eu "This position is no longer open for recruitmentâ€¦") is saved and read like any other job, never marked failed, and the job page shows a clear "no longer open" notice.
2. Trailing lists of other jobs ("Similar jobs", "Next job", "See all" plus job titles) are removed before the AI reads the ad.
3. The extension popup says when **Local** isn't set up in the build (missing anon key), as it already does for Hosted.

Page shape seen on a live bestjobs.eu ad (2026-11-10): the ad text, then an H3 "Similar jobs" with 4 job cards, "See all", a "Next job" link with the next job's title, a "Jobs in" grid of city/category links, then the cookie banner. The page has no `<main>`/`<article>`, so the extension reads `body`, and `blockText` puts each heading on its own line.

## Task 1: Closed ads are jobs, and trailing job lists are cut before the AI reads the page

---
files: [packages/shared/src/jobs.ts, apps/api/src/jobs/process.ts, apps/api/src/jobs/prompts.ts, apps/api/test/jobs-process.test.ts, apps/api/test/jobs-consumer.test.ts]
new_files: []
deps: false
size: 70
---

**Goal:** the job extraction treats a closed ad as a job posting and reports that it is closed, and the text the AI reads stops before any trailing list of other jobs.
- Add an optional `positionClosed` boolean to `JobExtractionSchema` (missing means open). Stored extractions saved before this change, and the ~20 existing test fixtures typed as `JobExtraction`, have no such field; they must keep compiling, loading, saving (PATCH) and tailoring unchanged, so no fixture outside this scope is edited.
- The model call in `processJob` uses the shared schema extended with `positionClosed` as a required boolean, so the strict structured-output schema sent to the model lists it as required.
- Prompt (`jobExtractPrompt`): a page that says the position is closed or no longer accepting applications is still a job posting (`isJobPosting: true`) with `positionClosed: true`; otherwise `positionClosed: false`. Bump `JOB_PROMPT_VERSION` to `job.v3`.
- In `buildJobUserPrompt`, cut the page text at the first line that is exactly (trimmed, case-insensitive) "Similar jobs", "Next job" or "See all", dropping that line and everything after it. The stored `raw_text` stays as captured.

**Acceptance tests:**
- test: a fictional page text shaped like the bestjobs example (ad body with "This position is no longer open for recruitment", then "Similar jobs", four job titles, "See all", "Next job", a job title, "Jobs in", city names) builds a prompt that contains the ad body and none of the lines from "Similar jobs" on.
- test: a page with none of the marker lines builds the same prompt as today.
- test: a line that only contains a marker phrase inside a sentence ("See all benefits below") is not cut.
- test: `processJob` with a model answer of `isJobPosting: true, positionClosed: true` returns `ok: true` with `positionClosed: true` (not `not_a_job`).
- test: an extraction object without `positionClosed` (an old stored row) parses with `JobExtractionSchema` and reads as not closed.
- test: the JSON schema in the model request for `job_extract` has `positionClosed` among its required properties.
- typecheck passes with the existing `JobExtraction` fixtures untouched (risk check: e.g. `packages/shared/src/jobs.test.ts:7`, `apps/api/test/jobs-consumer.test.ts:13`, `apps/web/src/jobs/job-edit.test.tsx:16`).

**Out of scope:** the extension reader, link-fetch reader, the web app, the job list, any new status or error code, other marker phrases or languages.

## Task 2: Job page shows a "no longer open" notice

---
files: [apps/web/src/jobs/JobPage.tsx, apps/web/src/i18n/en-jobs.ts, apps/web/src/jobs/job-page.test.tsx]
new_files: []
deps: false
size: 30
---

**Goal:** when a ready job's extraction has `positionClosed: true`, the job page shows a clear notice near the top that the position is no longer open for applications. Everything else on the page works as for any job (tailoring, editing, status).

**Acceptance tests:**
- test: a ready job with `positionClosed: true` shows the notice text.
- test: a ready job with `positionClosed: false`, and one whose extraction has no `positionClosed` field, show no notice (show it only when the field is `true`).
- test: editing and saving a closed job keeps `positionClosed: true` in what is sent.

**Out of scope:** the jobs list page, filters, badges elsewhere, letting the user toggle the flag, other languages than the existing i18n file.

## Task 3: Extension popup flags Local as not set up

---
files: [apps/extension/src/popup/view.ts, apps/extension/src/popup/view.test.ts]
new_files: []
deps: false
size: 20
---

**Goal:** in the sign-in view's "Connect to" select, an environment that isn't configured in the build is labelled "(not set up in this build)" and disabled, for Local as well as Hosted (today the check is `env.id === "hosted" && !env.configured`).

**Acceptance tests:**
- test: with Local unconfigured (no local anon key), the Local option reads "Local (not set up in this build)" and is disabled.
- test: with Local configured, the Local option reads "Local" and is enabled (today's behaviour).
- test: Hosted keeps today's behaviour.

**Out of scope:** sign-in error messages, the environment config, the build, auth code.
