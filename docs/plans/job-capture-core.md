# Job capture, phase 1: core (pasted text)

Branch `rebuild/jobs-core`, based on `rebuild/enrichment`. Built with the `codex-build` skill.
Spec (binding): `docs/superpowers/specs/2026-11-05-job-capture-design.md`, phase 1 of "Build order".

**Goal of the phase:** a signed-in user sends a job's page text to `POST /v1/jobs`; a queue worker turns it into a structured job with AI (`callModel`, task `job_extract`); the user can list, read, edit and delete their jobs. No link fetching, no web UI, no extension (phases 2 and 3).

Rules for every task:
- Follow the layout and style of `apps/api/src/imports/` (repo interface + memory repo + Supabase repo, routes with injected deps, consumer with ack/retry).
- Errors use `ApiError(status, code, message)` from `apps/api/src/errors.ts`, with codes and messages exactly as in the spec's Errors table.
- Exact limits: `JOBS_PER_DAY = 30`; `pageText` 200–60,000 chars after trim; request body max 100 KB; text sent to the AI max 30,000 chars; `maxOutputTokens: 2000`; `resumora-jobs` queue `max_batch_size: 1`, `max_retries: 2` (3 attempts in total).
- Page text and `raw_text` are never logged. No new dependencies. Files under ~300 lines. Plain words in code.
- Do not open `.env*`, `.dev.vars` or other secret files.

## Task 1: Database — jobs, job_runs, daily limit and RLS

---
files: [supabase/migrations/20261107000000_jobs.sql, supabase/tests/database/jobs.test.sql]
new_files: [supabase/migrations/20261107000000_jobs.sql, supabase/tests/database/jobs.test.sql]
deps: false
size: 220
---

**Goal:** One new migration adds `public.jobs` and `public.job_runs` exactly as the spec's "Data model" describes (all columns of the `jobs` table, including `json_ld jsonb null` and `attempts int not null default 0`; `user_id default auth.uid()` on both tables; check constraints on `status`, `source` and `error_code`; unique (`user_id`, `url_normalized`); index (`user_id`, `created_at desc`) on `jobs`, (`user_id`, `created_at`) on `job_runs`; `job_runs.job_id references jobs(id) on delete set null`; `updated_at` maintained the way `cv_imports` does it).
RLS is on for both. `jobs`: select/insert/update/delete only where `user_id = auth.uid()`. `job_runs`: select/insert only, no update or delete. Grants follow the pattern in `supabase/migrations/20261105000000_imports.sql`.
Two trigger functions, both `security invoker` with `set search_path = ''`:
- `check_job_limit()`, `before insert on job_runs`: same shape as `check_import_limit()` in `supabase/migrations/20261105010000_import_limit.sql` (advisory lock on `hashtext('job_runs:' || new.user_id::text)`, count the user's rows from the last 24 hours, `raise exception 'job_limit' using errcode = 'P0001'` when the count is already 30).
- `add_job_run()`, `after insert on jobs`: inserts `(user_id, job_id)` = `(new.user_id, new.id)` into `public.job_runs`. Because it runs in the same statement, a `job_limit` error also undoes the job insert.
The timestamp `20261107000000` must sort after the `20261106*` enrichment migrations already on this branch.

**Acceptance tests** (`supabase/tests/database/jobs.test.sql`, pgTAP, in the style of `supabase/tests/database/imports.test.sql`: begin, plan, switch between two authenticated users by JWT claims, finish, rollback):
- User A inserts a job (`source 'extension'`, `status 'queued'`) → lives; exactly one `job_runs` row exists for it.
- User A inserts another job with the same `url_normalized` → throws SQLSTATE `23505`.
- User B: select on A's job is empty; update and delete of A's job affect 0 rows; select on A's `job_runs` is empty.
- User A: update and delete on their own `job_runs` row affect 0 rows.
- With 30 `job_runs` rows for A in the last 24 hours, a new job insert throws `job_limit`, and A's job count is unchanged.
- A run older than 24 hours does not count toward the limit.
- Deleting a job keeps its `job_runs` row, with `job_id` null.
- `status 'done'` and `source 'email'` are rejected by check constraints.
- `npm run db:reset && npm run db:test` passes for all database test files.

**Out of scope:** API code, shared schemas, any change to existing migrations or tables.

## Task 2: Shared job schemas and URL normalization

---
files: [packages/shared/src/jobs.ts, packages/shared/src/jobs.test.ts, packages/shared/src/index.ts]
new_files: [packages/shared/src/jobs.ts, packages/shared/src/jobs.test.ts]
deps: false
size: 260
---

**Goal:** `packages/shared/src/jobs.ts` exports the zod schemas and helpers the API (and later the web app and extension) share, re-exported from `packages/shared/src/index.ts` with `export * from "./jobs.ts";`. Each schema exports its type too (`JobExtraction`, `JobStatus`, …).
- `JobExtractionSchema`: exactly the spec's `JobExtraction` fields and enums. Caps: max 40 responsibilities, 60 requirements, 30 benefits, each item max 500 chars. `title` may be empty here (a non-job page can come back with `title: ""` and must still parse, so the worker can report `not_a_job`).
- `JobStatusSchema` = `queued | processing | ready | needs_text | failed`; `JobSourceSchema` = `link | extension`; `JobErrorCodeSchema` = `fetch_blocked | page_empty | not_a_job | ai_failed`.
- `CreateJobBodySchema` = `{ url: http(s) URL, max 2048 chars; pageText?: string, trimmed, 200–60,000 chars; jsonLd?: unknown[], max 20 items }`.
- `JobPatchBodySchema` = `{ version: int ≥ 1; extracted: JobExtraction }`, where `extracted.title` must be non-blank after trim (a user can't save a job without a title).
- `JobListItemSchema` = `{ id, status, errorCode, title, company, location, source, url, createdAt }`; `JobSchema` = list item + `{ extracted: JobExtraction | null; editedByUser: boolean; version: number; updatedAt }`.
- `normalizeJobUrl(url: string): string`: the spec's "URL normalization" rules, using `URL`. It throws on an invalid URL.
- `findJobPosting(jsonLd: unknown[]): Record<string, unknown> | null`: the first object, or `@graph` item, whose `@type` is `"JobPosting"` or an array containing it.

**Acceptance tests** (`packages/shared/src/jobs.test.ts`):
- `normalizeJobUrl("HTTPS://Example.com/jobs/1/?utm_source=x&b=2&a=1#apply")` → `"https://example.com/jobs/1?a=1&b=2"`.
- Each tracking param named in the spec is removed; other params stay.
- `normalizeJobUrl("https://www.linkedin.com/jobs/view/senior-dev-at-acme-4012345678/?trk=abc&refId=x")` and `normalizeJobUrl("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678")` both → `"https://www.linkedin.com/jobs/view/4012345678"`.
- `CreateJobBodySchema` rejects `url: "ftp://x"`, a 199-char `pageText` and a 60,001-char `pageText`; it accepts a 200-char `pageText`.
- `JobExtractionSchema` rejects 61 requirements and a 501-char responsibility; it accepts a minimal valid object, and one with `title: ""` and `isJobPosting: false`.
- `JobPatchBodySchema` rejects `extracted.title: "  "`.
- `findJobPosting` finds a top-level `JobPosting`, one inside `@graph`, one with `@type: ["JobPosting"]`, and returns null for `[{ "@type": "Organization" }]`.
- All existing shared tests pass.

**Out of scope:** API code, database, HTML parsing, fetching URLs.

## Task 3: Job repository (memory and Supabase)

---
files: [apps/api/src/jobs/repo.ts, apps/api/src/jobs/memory-repo.ts, apps/api/src/jobs/supabase-repo.ts, apps/api/test/jobs-repo.test.ts, apps/api/test/supabase-repo.test.ts]
new_files: [apps/api/src/jobs/repo.ts, apps/api/src/jobs/memory-repo.ts, apps/api/src/jobs/supabase-repo.ts, apps/api/test/jobs-repo.test.ts]
deps: false
size: 450
---

**Goal:** Data access for jobs, shaped like `apps/api/src/imports/repo.ts`, `memory-repo.ts` and `supabase-repo.ts`. The tables come from `supabase/migrations/20261107000000_jobs.sql`; the types come from `packages/shared/src/jobs.ts`.

`repo.ts` exports:
- `JOBS_PER_DAY = 30` and `type JobMessage = { jobId: string; userId: string }`.
- `type JobRepo` (acts as one signed-in user):
  - `create(input: { id: string; source: JobSource; url: string; urlNormalized: string; rawText: string; jsonLd: Record<string, unknown> | null }): Promise<{ id: string; existing: boolean }>`. On a unique violation it returns the existing job's id with `existing: true`. On `job_limit` it throws `ApiError(429, "job_limit", "You can add up to 30 jobs per day.")`.
  - `findByUrl(urlNormalized: string): Promise<string | null>`
  - `countRunsSince(iso: string): Promise<number>`
  - `list(): Promise<JobListItem[]>`, newest first
  - `get(id: string): Promise<Job | null>`
  - `patch(id: string, expectedVersion: number, extracted: JobExtraction): Promise<"ok" | "conflict" | "wrong_status" | "not_found">`. Only a `ready` job can be patched. On `ok` it also sets `title`, `company` and `location` from `extracted`, sets `edited_by_user = true`, and adds 1 to `version`.
  - `remove(id: string): Promise<boolean>`
- `type JobWork = { id: string; userId: string; rawText: string; jsonLd: Record<string, unknown> | null }`.
- `type JobAdmin` (service role, used by the worker): `start(id): Promise<JobWork | null>` (sets `processing` and adds 1 to `attempts`; returns null if the job is missing or not `queued`/`processing`), `finish(id, extracted: JobExtraction): Promise<void>` (sets `ready`, `title`, `company` and `location`), `fail(id, code: JobErrorCode): Promise<void>` (sets `failed` and `error_code`), `logCall(entry: AiCallLog): Promise<void>`.

`memory-repo.ts` exports `memoryJobs(opts: { now?: () => Date })`, returning `{ repoFor(userId: string): JobRepo; admin: JobAdmin; rows; runs }`. It enforces the unique URL per user and the 30-runs-in-24-hours limit the same way the database does: a refused create leaves no row.
`supabase-repo.ts` exports `supabaseJobRepo(env: SupabaseEnv, user: AuthUser): JobRepo` and `supabaseJobAdmin(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">): JobAdmin`, set up the same way as `supabaseImportRepo` and `supabaseImportAdmin`. `jsonLd` is stored in `jobs.json_ld`. `raw_text` and `json_ld` are never part of `list()` or `get()` results.

**Acceptance tests** (`apps/api/test/jobs-repo.test.ts`; add the Supabase error-mapping cases to `apps/api/test/supabase-repo.test.ts` the way it already tests the import repo):
- Two `create` calls with the same `urlNormalized` → the second returns `{ id: <first id>, existing: true }`, and there is one row.
- The 31st `create` within 24 hours throws `job_limit` and leaves 30 rows; a run older than 24 hours doesn't count.
- `patch` with a stale version → `"conflict"`; on a `queued` job → `"wrong_status"`; on success `title` follows `extracted.title` and `version` goes up by 1.
- `repoFor(B).get(<A's id>)` → null; `repoFor(B).remove(<A's id>)` → false; `repoFor(B).list()` doesn't include A's jobs.
- `admin.start` on a deleted job → null.
- The Supabase repo maps an error with message `job_limit` to `ApiError` 429 `job_limit`, and code `23505` to the existing-job result.
- All existing API tests pass.

**Out of scope:** routes, `app.ts`, `index.ts`, the queue, AI calls, database changes.

## Task 4: The /v1/jobs routes

---
files: [apps/api/src/jobs/routes.ts, apps/api/src/app.ts, apps/api/src/index.ts, apps/api/src/env.ts, apps/api/wrangler.jsonc, apps/api/test/jobs.test.ts, apps/api/test/app.test.ts, apps/api/test/imports.test.ts, apps/api/test/cv.test.ts, apps/api/test/fixtures.ts]
new_files: [apps/api/src/jobs/routes.ts, apps/api/test/jobs.test.ts]
deps: false
size: 420
---

**Goal:** `apps/api/src/jobs/routes.ts` exports `jobRoutes(deps: { repoFor(c: Context<AppEnv>): JobRepo; queue: { send(message: JobMessage): Promise<void> }; now(): Date })`, mounted at `/v1/jobs` in `createApp`. `AppDeps` gains `jobRepo(user: AuthUser): JobRepo` and `jobQueue: { send(message: JobMessage): Promise<void> }`. The CORS `allowMethods` in `app.ts` gains `"PATCH"`. `env.ts` gains `JOBS: Queue<JobMessage>`; `wrangler.jsonc` gains the producer `{ "binding": "JOBS", "queue": "resumora-jobs" }` (the consumer comes in a later task); `realDeps` in `index.ts` wires `supabaseJobRepo` and `env.JOBS.send`. Test files that build `AppDeps` are updated so they still typecheck.

The repo comes from `apps/api/src/jobs/repo.ts` (`JobRepo`, `JobMessage`, `JOBS_PER_DAY`) and the memory version from `apps/api/src/jobs/memory-repo.ts` (`memoryJobs`). Schemas and helpers come from `packages/shared` (`CreateJobBodySchema`, `JobPatchBodySchema`, `normalizeJobUrl`, `findJobPosting`).

Routes, as in the spec's API table, phase 1 only:
- `POST /`: body over 100 KB → `413 payload_too_large` (check `content-length`, then the actual body size). Invalid or non-http(s) URL → `400 invalid_url`. Missing `pageText`, or under 200 chars → `400 text_too_short` (phase 1 has no server fetch). Then in this order:
  1. `findByUrl(normalizeJobUrl(url))`. If a job exists → `200 { id, existing: true }`; no run is used and nothing is queued.
  2. `countRunsSince(now − 24 h) >= JOBS_PER_DAY` → `429 job_limit`.
  3. `create` with `source: "extension"`, `rawText` = `pageText` cut to 30,000 chars, and `jsonLd` = `findJobPosting(body.jsonLd ?? [])`. If it returns `existing: true` → `200 { id, existing: true }`.
  4. `queue.send({ jobId, userId })` → `202 { id }`. If `send` throws, `remove(id)` and rethrow (the client gets 500 and can try again).
- `GET /` → `JobListItem[]`. `GET /:id` → `Job`, or 404 `not_found`. Neither returns `raw_text` or `json_ld`.
- `PATCH /:id` with `JobPatchBodySchema`: `conflict` → `409 version_conflict`; `wrong_status` → `409 wrong_status`; `not_found` → 404; `ok` → 200 with the updated `Job`.
- `DELETE /:id` → 204, or 404.

**Acceptance tests** (`apps/api/test/jobs.test.ts`, set up like `apps/api/test/imports.test.ts`: `memoryJobs`, fake `verifyToken`, captured queue messages, fixed clock):
- POST valid → 202; one queued message `{ jobId, userId }`; the row is `queued` with `source: "extension"`.
- POST the same URL with different `utm_*` params → 200 `existing: true`, no new message.
- POST with 30 runs today → 429 `job_limit`; no message, no new row.
- POST a 199-char `pageText` → 400 `text_too_short`; `url: "javascript:alert(1)"` → 400 `invalid_url`; a 101 KB body → 413 `payload_too_large`.
- POST when `queue.send` rejects → 500, and the job row is gone.
- GET list → only the caller's jobs, newest first. GET `/:id` of another user's job → 404. No response contains `rawText`, `raw_text`, `jsonLd` or `json_ld`.
- PATCH with a stale version → 409 `version_conflict`; on a `queued` job → 409 `wrong_status`; ok → 200 with `editedByUser: true`.
- DELETE → 204, then GET → 404.
- `OPTIONS /v1/jobs/x` from `appOrigin` with `Access-Control-Request-Method: PATCH` → `access-control-allow-methods` includes `PATCH`.
- No token → 401.
- `npm run typecheck` passes and all existing API tests pass.

**Out of scope:** the queue consumer and AI extraction, link fetching (`PUT /:id/text`, `POST /:id/retry`), the extension's CORS origin, web UI.

## Task 5: Extraction worker

---
files: [apps/api/src/jobs/prompts.ts, apps/api/src/jobs/process.ts, apps/api/src/jobs/consumer.ts, apps/api/src/index.ts, apps/api/wrangler.jsonc, apps/api/test/jobs-process.test.ts, apps/api/test/jobs-consumer.test.ts]
new_files: [apps/api/src/jobs/prompts.ts, apps/api/src/jobs/process.ts, apps/api/src/jobs/consumer.ts, apps/api/test/jobs-process.test.ts, apps/api/test/jobs-consumer.test.ts]
deps: false
size: 400
---

**Goal:** The `resumora-jobs` queue is consumed by the same Worker, and each message turns a queued job into a `ready` or `failed` one. The building blocks come from earlier tasks: `JobAdmin`, `JobMessage` and `JobWork` from `apps/api/src/jobs/repo.ts`; `supabaseJobAdmin` from `apps/api/src/jobs/supabase-repo.ts`; `JobExtractionSchema` from `packages/shared`. `callModel` and `ModelDeps` come from `apps/api/src/ai/call-model.ts`.
- `prompts.ts`: `JOB_PROMPT_VERSION = "job.v1"`; `jobExtractPrompt` (the system prompt: the spec's "Extraction rules", one rule per line); `buildJobUserPrompt(work: { rawText: string; jsonLd: Record<string, unknown> | null }): string`, which puts a labeled JSON-LD block first when present, then the page text.
- `process.ts`: `processJob(deps: { model: ModelDeps }, work: JobWork): Promise<{ ok: true; extracted: JobExtraction } | { ok: false; code: "not_a_job" | "ai_failed" }>`. It calls `callModel` with `task: "job_extract"`, `schema: JobExtractionSchema`, `maxOutputTokens: 2000` and `userId: work.userId`. `isJobPosting: false` → `not_a_job`. A blank `title` (after trim) with `isJobPosting: true` → `ai_failed`. `callModel` throwing → `ai_failed`.
- `consumer.ts`: `handleJobMessage(deps: { admin: JobAdmin; model: ModelDeps; log: LogFn }, msg: Pick<Message<JobMessage>, "body" | "attempts" | "ack" | "retry">): Promise<void>`, with the same retry policy as `handleImportMessage` in `apps/api/src/imports/consumer.ts`. If `start` returns null, it acks and does nothing more. On success it calls `finish` and acks. On `not_a_job`/`ai_failed` it calls `fail` and acks. On an unexpected error before attempt 3 it calls `retry({ delaySeconds: 10 })`; at attempt 3 it calls `fail(id, "ai_failed")` and acks.
- `index.ts`: `queue(batch, env)` sends `resumora-jobs` batches to `handleJobMessage` and `resumora-imports` batches to `handleImportMessage`. Any other queue name is logged and acked. Put this in an exported `dispatchBatch` so it can be tested. The handler type becomes `ExportedHandler<Env, ImportMessage | JobMessage>`.
- `wrangler.jsonc`: consumer `{ "queue": "resumora-jobs", "max_batch_size": 1, "max_retries": 2 }`, so even a crashed Worker gets at most 3 deliveries in total, matching the consumer's 3 attempts.

**Acceptance tests** (`apps/api/test/jobs-process.test.ts`, `apps/api/test/jobs-consumer.test.ts`, fake `ModelDeps` as in `apps/api/test/imports.test.ts`):
- `buildJobUserPrompt` puts the JSON-LD before the text, and has no JSON-LD block when `jsonLd` is null.
- `processJob`: a valid extraction → `ok: true`; `isJobPosting: false` → `not_a_job`; `title: " "` with `isJobPosting: true` → `ai_failed`; a throwing model → `ai_failed`. The fake model sees `task === "job_extract"` and `maxOutputTokens === 2000`, and the page text never appears in a log entry.
- `handleJobMessage`: `start` → null gives an ack and no model call; success → `finish` + ack; `not_a_job` → `fail(id, "not_a_job")` + ack; an unexpected error at attempt 1 → `retry`, at attempt 3 → `fail(id, "ai_failed")` + ack.
- `dispatchBatch` sends a `resumora-jobs` message to the job handler and never to the import handler, and a `resumora-imports` message the other way round.
- `npm run typecheck` passes and all existing API tests pass.

**Out of scope:** running against real AI providers, the eval set, link fetching, the stale-job sweep.

## Task 6: Extraction eval set

---
files: [apps/api/eval/jobs/run.eval.ts, apps/api/eval/jobs/cases, apps/api/package.json, package.json]
new_files: [apps/api/eval/jobs/run.eval.ts, apps/api/eval/jobs/cases]
deps: false
size: 600
---

**Goal:** `npm run eval:jobs` runs `processJob` (from `apps/api/src/jobs/process.ts`) with real providers over 15 saved cases, the same way `apps/api/eval/import/run.eval.ts` runs the import eval. Scripts: `apps/api/package.json` gets `"eval:jobs": "vitest run --config vitest.eval.config.ts eval/jobs"`; the root `package.json` gets `"eval:jobs": "npm run eval:jobs -w apps/api"`.
Each case is a folder `apps/api/eval/jobs/cases/<case>/` with `page.txt`, an optional `jsonld.json`, and `expected.json` = `{ isJobPosting: boolean; title?: string; company?: string | null; must?: number; nice?: number; salary?: boolean }`. The 15 cases are realistic fictional postings and pages, with no real people's data: Greenhouse-style (with JSON-LD), Lever-style (with JSON-LD), Workday-style, LinkedIn page text (lots of page chrome), Indeed-style, a small company page without JSON-LD, a Romanian posting, a posting with a stated salary, a posting with "nice to have" items, 4 more ordinary postings in different fields, a job search-results page, and a blog article (the last two are `isJobPosting: false`).
For each case the eval checks: `isJobPosting` matches; for postings, `title` and `company` match case-insensitively, the `must`/`nice` counts are within ±1, and `salary` is null when `expected.salary` is false. At the end it prints the pass count and the average input/output tokens per case.

**Acceptance tests:**
- `npm run typecheck` passes; the eval file is excluded from `npm test` the same way the import eval is.
- A dry check that loads every case folder and validates each `expected.json` (run as part of the eval, before any model call) passes.
- Running the eval against real providers is done afterwards by Claude in a checkout with keys; it is not part of this task.

**Out of scope:** prompt changes, API routes, database.

## Task 7: Paginate the job list

---
files: [packages/shared/src/jobs.ts, packages/shared/src/jobs.test.ts, apps/api/src/jobs/repo.ts, apps/api/src/jobs/memory-repo.ts, apps/api/src/jobs/supabase-repo.ts, apps/api/src/jobs/routes.ts, apps/api/test/jobs-repo.test.ts, apps/api/test/jobs.test.ts, apps/api/test/supabase-repo.test.ts, docs/superpowers/specs/2026-11-05-job-capture-design.md, docs/plans/job-capture-core.md]
new_files: []
deps: false
size: 260
---

**Why:** the branch review found that `list()` in `apps/api/src/jobs/supabase-repo.ts` has no limit while PostgREST caps every response at `max_rows = 1000` (`supabase/config.toml`), so `GET /v1/jobs` silently dropped older jobs. The spec (API table, "Job list and job view", Errors table) now defines keyset pagination; the spec and this plan file are already edited by Claude and must not be changed by the build.

**Goal:**
- `packages/shared/src/jobs.ts`: `JobListQuerySchema` = `{ limit: integer 1–100 from a query string, default 50; cursor?: string, max 200 chars }`; `JobListPageSchema` = `{ items: JobListItem[]; nextCursor: string | null }`. Export the types.
- `apps/api/src/jobs/repo.ts`: `type JobCursor = { createdAt: string; id: string }`; `encodeJobCursor(c: JobCursor): string` (base64url of JSON) and `decodeJobCursor(s: string): JobCursor | null`. Decode returns null unless both hold: `createdAt` is a UTC ISO-8601 timestamp (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|\+00:00)$/`, the form Supabase returns) whose first 19 characters equal `new Date(createdAt).toISOString().slice(0, 19)` (this rejects `2026-02-30…`, `…T99:…` and other values Postgres would refuse); and `id` is a UUID (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), because `jobs.id` is a `uuid` column. This strict check matters twice: the values go into a PostgREST filter string, and a value Postgres rejects would turn into a 500 instead of a 400. Tests that page through the memory repo use UUID ids. `JobRepo.list` becomes `list(page: { limit: number; after: JobCursor | null }): Promise<{ items: JobListItem[]; next: JobCursor | null }>`.
- Order is `created_at desc, id desc`. With `after`, return only rows strictly after it in that order: `created_at < after.createdAt`, or `created_at = after.createdAt and id < after.id`. Fetch `limit + 1` rows to know whether `next` is set; `next` is the last returned row's `{ createdAt, id }`.
- `supabase-repo.ts`: build the cursor from the raw `created_at` string the database returns (never round-trip it through `Date`, which drops microseconds and would skip or repeat rows). Use `.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)` and, with `after`, `.or(...)` with both values double-quoted in the filter.
- `memory-repo.ts`: the same order and cursor rule over its rows.
- `routes.ts`: `GET /` parses the query with `JobListQuerySchema`; a bad `limit`, or a `cursor` that `decodeJobCursor` rejects → `400 invalid_request` with the spec's message. Responds `{ items, nextCursor: next ? encodeJobCursor(next) : null }`.

**Acceptance tests:**
- Shared: `limit` "0", "101" and "abc" are rejected; a missing `limit` gives 50.
- `decodeJobCursor`: round-trips `encodeJobCursor`; returns null for garbage, for a non-UUID `id` (including one containing `,` `)` or `"`), for a non-UTC or non-ISO `createdAt`, and for `2026-02-30T00:00:00Z` and `2026-01-01T99:00:00Z`.
- Memory repo: 5 jobs, `limit: 2` → pages of 2, 2, 1 with the last `next` null, no job repeated or skipped, newest first; two jobs with the same `created_at` are both returned once across a page boundary (ordered by `id` desc).
- Supabase repo (`apps/api/test/supabase-repo.test.ts`, with the existing fake client style): the query asks for `limit + 1` rows ordered by `created_at` then `id` descending, and the `next` cursor keeps the exact `created_at` string the fake returned (with microseconds).
- Routes: `GET /v1/jobs?limit=2` → 2 items and a `nextCursor`; following it returns the rest and then `nextCursor: null`; `?limit=500` and `?cursor=bad` → 400 `invalid_request`; another user's jobs never appear; no response contains `rawText`, `raw_text`, `jsonLd` or `json_ld`.
- Update the existing list tests in `apps/api/test/jobs-repo.test.ts` and `apps/api/test/jobs.test.ts` to the new shapes.
- `npm run typecheck` passes and all existing tests pass.

**Out of scope:** database changes (the `(user_id, created_at desc)` index already serves this order), web UI, other routes.
