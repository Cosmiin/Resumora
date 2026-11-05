# Job capture: link input, AI extraction and the Chrome extension

Status: draft for review · 2026-11-05 · builds on the rebuild design (plan 4 "Jobs", plan 5 "Extension")
Follows decisions 0001 (API in the middle), 0002 (API acts as the user), 0004 (work goes through a queue), 0006 (version check), 0007 (one AI gateway), 0008 (new migration per change).

## Why

Tailoring a CV to a job (the next big feature) needs the job first, in a clean, structured form. Job seekers find jobs on many sites, often behind a login (LinkedIn, Indeed). This project gives them two ways to save a job to **their own** job list in Resumora:

1. **Paste a link** on the website. The API reads the page; if it can't, the user pastes the text.
2. **Click the Chrome extension** on a job page. It reads what the user sees, including pages that need a login, and sends it to the API.

Both go through **one** AI step that turns the page into a structured job (title, company, requirements split into must/nice, and so on).

## Users

Individual job seekers. Every job belongs to exactly one user; nobody else can see it. No sharing, no teams, no recruiter accounts.

## Scope

**In:**
- the `jobs` table with RLS and a daily limit;
- the `JobExtraction` schema in `packages/shared`;
- `POST/GET/PATCH/DELETE /v1/jobs`, `PUT /v1/jobs/:id/text`, `POST /v1/jobs/:id/retry`;
- the `resumora-jobs` queue and worker (fetch, clean, extract);
- the `/jobs` page: link input, list, job view, edit, delete, paste fallback;
- the Chrome extension (Manifest V3), loaded unpacked, with sign-in through the web app;
- an extraction eval set (`npm run eval:jobs`).

**Out (later specs):**
- tailoring and scoring a CV against a job (`POST /v1/jobs/:id/tailor`, `tailored_cvs`);
- application tracking (status, notes, dates);
- Chrome Web Store publishing (store listing, privacy policy, review);
- other browsers;
- paid scraping or proxy services.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Where the AI runs | Always on the API, via `callModel` (task `job_extract`) | No AI keys in the browser; one extraction path for both entry points |
| What the extension does | Reads the page (text, title, URL, JSON-LD) and sends it; no AI | Works on login-only pages; keeps the extension small |
| Sync or queue | Queue, like CV imports. `POST` saves a row and returns at once; a worker does the rest | The extension popup closes when it loses focus, which would kill a long request; retries need no new capture |
| Link fails | Status `needs_text`: the user pastes the job text, or uses the extension | Big job boards block server fetches; the user always has a way forward |
| Duplicates | Same user + same normalized URL returns the existing job | Avoids double rows and double AI cost |
| Structured data | If the page has schema.org `JobPosting` JSON-LD, it goes to the AI as a strong hint | Free accuracy on Greenhouse, Lever, Workday and many company sites |
| Extension sign-in | Hand-off from the signed-in web app via `externally_connectable` | One sign-in system; the extension never sees a password |
| Extension permissions | `activeTab`, `scripting`, `storage`; no host permissions | Reads a page only when the user clicks; no "all your data" warning |
| Distribution | Load unpacked for now | Store publishing is a later concern |

This replaces the placeholder `jobs` shape in the rebuild design (`description text, requirements jsonb`) with the model below.

## Architecture and data flow

```
Link input (web /jobs)            Chrome extension (popup)
  POST /v1/jobs {url}               capture: url, title, pageText, jsonLd
        │                           POST /v1/jobs {url, pageText, jsonLd}
        └──────────────┬──────────────┘
                       ▼
 API: verify JWT → validate body → normalize URL
      → existing job for (user, url_normalized)? → 200 {id, existing:true} (no run used)
      → daily limit → insert jobs row (status=queued, source=link|extension) → enqueue → 202 {id}
                       ▼
 Worker (resumora-jobs):
   status=processing
   no pageText? → fetch URL (SSRF guard, 10s, 2 MB, text/html)
        → blocked/empty → status=needs_text, error_code=fetch_blocked|page_empty, stop
   HTML → text, keep JSON-LD JobPosting; cap text at 30k chars; save raw_text
   callModel(task "job_extract", schema JobExtraction)
        → isJobPosting=false → status=failed, error_code=not_a_job
        → ok → write title/company/location/extracted, status=ready
        → error after callModel retries → status=failed, error_code=ai_failed
                       ▼
 Web: GET /v1/jobs (polls while any row is queued/processing) · GET/PATCH/DELETE /v1/jobs/:id
```

New pieces:
- `supabase/migrations/<ts>_jobs.sql`: table, indexes, RLS, daily-limit check.
- `packages/shared`: `JobExtraction`, `CreateJobBody`, `JobPatchBody`, `Job` (zod + types).
- `apps/api/src/jobs/`: `routes.ts`, `repo.ts`, `supabase-repo.ts`, `consumer.ts`, `process.ts`, `fetch-page.ts` (SSRF guard + fetch), `html-to-text.ts`, `normalize-url.ts`, `prompts.ts`. Same layout as `apps/api/src/imports/`.
- `apps/web`: `/jobs` page (list + link input), job view/edit, `/connect-extension` page.
- `apps/extension`: MV3 manifest, popup, capture function, session storage.

## Data model

### Table `jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid, fk `auth.users`, not null | owner |
| `source` | text check in (`link`, `extension`) | |
| `url` | text not null | as given |
| `url_normalized` | text not null | see below |
| `status` | text check in (`queued`, `processing`, `ready`, `needs_text`, `failed`) | |
| `error_code` | text null | `fetch_blocked`, `page_empty`, `not_a_job`, `ai_failed` |
| `raw_text` | text null | cleaned text sent to the AI, max 30k chars; kept for retries; never logged |
| `json_ld` | jsonb null | the chosen schema.org `JobPosting` object, if the page had one; never returned to the browser |
| `attempts` | int default 0 | worker attempts, as in `cv_imports` |
| `title`, `company`, `location` | text null | copied out of `extracted` for sorting and search |
| `extracted` | jsonb null | a valid `JobExtraction` |
| `edited_by_user` | boolean default false | |
| `version` | int default 1 | last save wins with a version check (0006) |
| `created_at`, `updated_at` | timestamptz | |

- Unique index on (`user_id`, `url_normalized`).
- Index on (`user_id`, `created_at desc`) for the list.
- RLS: select, insert, update and delete only where `user_id = auth.uid()`. The worker uses the service role, like the import worker.
- Daily limit: see `job_runs` below.

### Table `job_runs`

One row each time a job is queued for extraction: on create, on `PUT /text`, and on `retry`. Duplicates and edits add no row.

On create, the row is added by an `after insert` trigger on `jobs`, in the same statement as the job. If the limit trigger raises `job_limit`, the job insert is undone too, so no job is left without a run. `PUT /text` and `retry` insert their `job_runs` row before changing the job's status.

| Column | Type |
|---|---|
| `id` | uuid pk |
| `user_id` | uuid, fk `auth.users`, not null |
| `job_id` | uuid, fk `jobs` on delete set null |
| `created_at` | timestamptz default now() |

- RLS: insert and select only where `user_id = auth.uid()`; no update or delete.
- A before-insert trigger raises `job_limit` when the user already has `JOBS_PER_DAY` rows in the last 24 hours. The route checks the same count first for a friendly message. Deleting a job does not give a run back.

**URL normalization:** lowercase scheme and host; drop the fragment; drop tracking params (`utm_*`, `ref`, `refId`, `trk`, `trackingId`, `src`, `source`, `gclid`, `fbclid`); sort the remaining params; drop a trailing slash. LinkedIn job URLs reduce to `https://www.linkedin.com/jobs/view/<id>`.

### `JobExtraction` schema

```
title: string
company: string | null
location: string | null
workMode: "onsite" | "hybrid" | "remote" | "unknown"
employmentType: "full_time" | "part_time" | "contract" | "internship" | "temporary" | "unknown"
seniority: "intern" | "junior" | "mid" | "senior" | "lead" | "unknown"
salary: { min: number | null, max: number | null, currency: string | null, period: "hour" | "day" | "month" | "year" | null } | null
summary: string                    // 2–3 sentences
responsibilities: string[]
requirements: { text: string, kind: "must" | "nice", category: "skill" | "experience" | "education" | "language" | "certification" | "other" }[]
benefits: string[]
applyBy: string | null             // ISO date
isJobPosting: boolean
```

Sizes: max 40 responsibilities, 60 requirements, 30 benefits, each item max 500 characters.

### Extraction rules (`prompts.ts`)

- Copy facts from the page. Never invent a company, salary, date or requirement.
- Use `unknown` or `null` when the page doesn't say.
- Keep the posting's original language.
- A requirement is `must` unless the page marks it optional ("nice to have", "a plus", "preferred", "bonus").
- One requirement per item; split lists that mix several.
- Ignore page chrome: navigation, cookie banners, "similar jobs", ads.
- If a JSON-LD `JobPosting` is given, trust it for title, company, location, salary and dates, and use the text for the rest.
- Set `isJobPosting: false` for pages that are not a single job posting (search results, company home pages, articles).

## API

All errors use `{ error: { code, message, requestId } }`. All routes need `Authorization: Bearer <jwt>` and act as the user.

| Route | Body / result | Notes |
|---|---|---|
| `POST /v1/jobs` | `{ url, pageText?, jsonLd? }` → `202 { id }` or `200 { id, existing: true }` | `pageText` max 60k chars, body max ~100 KB; `pageText` under 200 chars → `text_too_short` |
| `GET /v1/jobs?limit=&cursor=` | → `{ items, nextCursor }`; each item is `{ id, status, errorCode, title, company, location, source, url, createdAt }` (camelCase, like the other API responses) | newest first, ordered by (`created_at` desc, `id` desc); `limit` 1–100, default 50; `nextCursor` is an opaque string for the next page, or `null` on the last page; a bad `limit` or `cursor` → 400 `invalid_request` |
| `GET /v1/jobs/:id` | → full job, with the saved text as `rawText` (the list never carries it); never `jsonLd` | 404 if not the user's |
| `PATCH /v1/jobs/:id` | `{ version, extracted }` → updated job | only when `ready`; validates `JobExtraction`; sets `edited_by_user`; 409 on version mismatch |
| `PUT /v1/jobs/:id/text` | `{ text }` → `202` | only when `needs_text` or `failed`; saves text, re-queues |
| `POST /v1/jobs/:id/retry` | → `202` | only when `failed` with `ai_failed`; re-queues using `raw_text`; counts toward the limit |
| `DELETE /v1/jobs/:id` | → `204` | |

CORS: allow the web app origin and the extension origin `chrome-extension://<EXTENSION_ID>` (configured).

## Link input (web)

- The `/jobs` page has a URL field and an **Add job** button above the list.
- The client checks it is an `http(s)` URL, then calls `POST /v1/jobs { url }`.
- The new row appears at once as "Reading job…". The list polls `GET /v1/jobs` every 3 s while any row is `queued` or `processing`, and stops after 2 minutes.
- Duplicate: "Already in your list" with a link to that job.

### Server fetch (`fetch-page.ts`)

- Only `http:` and `https:`, only ports 80 and 443.
- **SSRF guard:** reject hostnames that are IP literals or resolve to private, loopback, link-local or metadata ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`), and `localhost`. Follow at most 3 redirects, checking each target the same way.
- 10 s timeout, 2 MB cap, `text/html` only, a browser-like User-Agent.
- 401/403/429/999, a login page, or less than 200 characters of text after cleaning → `needs_text`.

### HTML → text (`html-to-text.ts`)

- Pull out every `<script type="application/ld+json">` and keep the first object (or `@graph` item) with `@type` `JobPosting`.
- Remove `script`, `style`, `noscript`, `nav`, `header`, `footer`, `aside`, `form`; keep headings and list items on their own lines; collapse whitespace.

### Paste fallback (`needs_text`)

The row shows "We couldn't read this page." with a textarea **Paste the job description**, a **Save** button, and the hint "or open the page and use the Resumora extension". Saving calls `PUT /v1/jobs/:id/text`.

## Job list and job view

- **List:** title, company, location, source icon, date, and a status badge (Reading… / Needs text / Failed). Newest first, 50 at a time with **Load more** while `nextCursor` is set. Polling reloads only the first page (new jobs always land there).
- **View:** all extracted fields; requirements grouped as **Must have** and **Nice to have**; a link to the original posting.
- **Edit:** a form over the same fields; requirements can be added, removed, and switched between must and nice. Save sends `PATCH` with `version`.
- **Delete:** confirm, then `DELETE`.
- **Failed:** the message for the `error_code`, plus **Try again** (for `ai_failed`) or **Delete**.

## Chrome extension (`apps/extension`)

- Manifest V3; permissions `activeTab`, `scripting`, `storage`; no host permissions; `externally_connectable.matches` = the web app origin only.
- Build-time config from `.env.example`: API base URL, web URL, Supabase URL and anon key. No secrets.
- Loaded unpacked for development and testing. The extension ID is pinned with a `key` in the manifest so CORS and `externally_connectable` stay stable.

### Capture (on Save job)

`chrome.scripting.executeScript` on the active tab returns:
- `url`: `location.href`
- `title`: `document.title`
- `jsonLd`: the parsed contents of all `application/ld+json` scripts (errors skipped)
- `pageText`: the user's text selection if it has 200+ characters, otherwise `document.body.innerText`; capped at 60k characters

Pages the extension can't script (`chrome://`, the Web Store, PDF viewer) show "Resumora can't read this page."

### Popup states

| State | Shows |
|---|---|
| Not signed in | **Sign in to Resumora** |
| Ready | page title, **Save job**, and "Tip: select the job text first on cluttered pages" |
| Saving | spinner |
| Saved | "Saved. Resumora is reading it." + **Open in Resumora** |
| Already saved | "Already in your list" + **Open it** |
| Error | the API message + **Try again** |
| Footer | signed-in email, **Sign out** |

### Sign-in hand-off

1. **Sign in** opens `<web>/connect-extension` in a new tab. The user signs in there if needed.
2. The page calls `chrome.runtime.sendMessage(EXTENSION_ID, { type: "session", access_token, refresh_token })`.
3. The extension's background service worker checks that the sender origin is the web app, stores the session in `chrome.storage.local`, and replies `ok`. The page shows "Extension connected. You can close this tab."
4. The extension uses supabase-js (`persistSession` on `chrome.storage.local`, `autoRefreshToken`) for fresh tokens and sends `Authorization: Bearer <access_token>`.
5. **Sign out** in the popup clears the stored session (local sign-out; the website session stays).
6. If refreshing fails, the popup goes back to "Not signed in".

## Errors

| Where | Code | HTTP / status | User sees |
|---|---|---|---|
| POST | `invalid_url` | 400 | "This doesn't look like a job link." |
| POST | `text_too_short` | 400 | "Not enough text on this page. Select the job description and try again." |
| POST | `payload_too_large` | 413 | "This page is too large to send." |
| POST/PUT text/retry | `job_limit` | 429 | "You can add up to 30 jobs per day." |
| POST | duplicate | 200 `existing: true` | "Already in your list" |
| GET list | `invalid_request` | 400 | "Something went wrong loading your jobs. Reload the page." |
| PATCH | `version_conflict` | 409 | "This job changed elsewhere. Reload to see the latest." |
| PATCH/PUT/retry | `wrong_status` | 409 | "This job can't be changed right now." |
| Worker | `fetch_blocked`, `page_empty` | `needs_text` | paste box |
| Worker | `not_a_job` | `failed` | "This page doesn't look like a job posting." |
| Worker | `ai_failed` | `failed` | "We couldn't read this job." + Try again |
| Worker crash | up to 3 attempts in total (2 retries, like imports), then `ai_failed` | `failed` | as above |

## Limits and cost

| Limit | Value |
|---|---|
| Extraction runs per user per day (create, paste, retry) | `JOBS_PER_DAY = 30` rows in `job_runs`, route + database |
| `pageText` from the extension | 60k chars; request body ~100 KB |
| Server fetch | 10 s, 2 MB, 3 redirects |
| Text sent to the AI | 30k chars after cleaning |
| AI output | `maxOutputTokens` 2,000 |
| Polling | every 3 s, stop after 2 min |

**Cost target:** the average `job_extract` cost per job, read from `ai_calls` after the first eval run with the chosen model, is written here before phase 1 is marked done. Target to fill in: **≤ $___ per job**. Each call is logged in `ai_calls` (task, provider, model, time, tokens; never the page text).

## Testing

**Unit (vitest)**
- URL normalization: tracking params, fragments, LinkedIn job URLs, param order.
- SSRF guard: private IPv4/IPv6, `localhost`, metadata IP, other ports, `file:`/`ftp:`, redirect to a private address.
- HTML → text: removed tags, kept structure, `JobPosting` found in plain and `@graph` JSON-LD.
- `JobExtraction` schema: valid, missing fields, oversized lists.
- Extension capture function on a fixture DOM: selection vs. whole page, cap, broken JSON-LD.

**API (with fake repo and mocked `callModel`)**
- Each route: happy path, 401 without a token, 404 for another user's id.
- Duplicate path; daily limit; body too large; text too short.
- Worker status changes: `queued` → `processing` → `ready`; fetch blocked → `needs_text`; `not_a_job`; AI error → `failed`; paste → re-queued → `ready`; retry uses `raw_text` with no fetch.

**Database (`supabase test db`)**
- RLS: user B can't select, update or delete user A's job.
- Unique (`user_id`, `url_normalized`).
- The `job_runs` trigger raises `job_limit` on the 31st run in 24 hours; user B can't read user A's runs.

**Extraction eval (`npm run eval:jobs`)**
- About 15 saved fixtures: Greenhouse, Lever, Workday, a LinkedIn page text (extension-style), Indeed, a small company page without JSON-LD, a non-English posting, a posting with a salary, one with "nice to have" items, a search-results page and a blog article (both `not_a_job`).
- Checks per fixture: `title` and `company` match; `isJobPosting` matches; must/nice counts within ±1 of expected; no salary invented when none is stated.
- Pass bar: all `isJobPosting` correct and at least 13 of 15 fully passing.

**Extension (manual checklist)**
1. Load unpacked; popup shows "Not signed in".
2. Sign in through `/connect-extension`; popup shows the email.
3. Save a job on Greenhouse, LinkedIn (signed in) and a company page; each appears in `/jobs` and reaches `ready`.
4. Select only the job text on a cluttered page, save; the extraction uses the selection.
5. Save the same job again → "Already in your list".
6. Open `chrome://extensions` → "Resumora can't read this page."
7. Sign out → "Not signed in"; the website stays signed in.

## Acceptance criteria

1. **Link OK:** given a signed-in user, when they add a readable job link, then a job appears at once as "Reading job…" and becomes `ready` with title, company and requirements filled in.
2. **Link blocked:** given a link the server can't read, when the worker runs, then the job shows "We couldn't read this page" with a paste box; when the user pastes the text, then the job becomes `ready`.
3. **Extension capture:** given a signed-in extension on a job page, when the user clicks **Save job**, then the popup says "Saved" and the job appears in that user's `/jobs` list and becomes `ready`.
4. **Selection capture:** given the user selected the job text (200+ characters), when they save, then only the selection is sent.
5. **Login-only page:** given a LinkedIn job page the user is signed in to, when they save it with the extension, then it becomes `ready` without the server fetching LinkedIn.
6. **Duplicate:** given a job already saved, when the same URL (with different tracking params) is added through either entry point, then no new row is created and the user is pointed to the existing job.
7. **Not a job:** given a search-results page, when it is captured, then the job ends `failed` with "This page doesn't look like a job posting."
8. **Limit:** given a user with 30 extraction runs in the last 24 hours, when they add a job, paste text, or press Try again, then they get the `job_limit` message and no AI call is made.
9. **Edit:** given a `ready` job, when the user corrects fields and saves, then the changes persist and `edited_by_user` is true; a stale `version` gets a 409.
10. **Delete:** given a job, when the user deletes it, then it is gone from the list and the database.
11. **Isolation:** given two users, user B can never list, read, change or delete user A's jobs, through the API or directly in the database.
12. **Extension sign-in and sign-out:** the extension signs in only through `/connect-extension` from the web app origin, refreshes its token on its own, and **Sign out** leaves the website session alone.
13. **SSRF:** given a link to a private or metadata address, when it is added, then no request is made to that address and the user gets `invalid_url`.
14. **Eval:** `npm run eval:jobs` meets its pass bar, and the cost target above is filled in from `ai_calls`.

## Build order

Each phase is its own plan for `codex-build`.

1. **Core (pasted text):** migration (`jobs`, `job_runs`) + RLS + limit trigger; shared schemas + URL normalization; `POST /v1/jobs` accepting `pageText`; `GET/PATCH/DELETE`; queue + worker + `callModel` + prompts; eval set and cost target. Criteria 7–11, 14.
2. **Link input:** `fetch-page.ts` with the SSRF guard, `html-to-text.ts`, `needs_text` + `PUT /text` + retry; the `/jobs` page UI (list, view, edit, delete, paste box). Criteria 1, 2, 6, 13.
3. **Extension:** MV3 popup, capture function, `/connect-extension` hand-off, CORS for the extension origin, manual checklist. Criteria 3–5, 12.

Pasted text comes first because both entry points end up producing text for the same AI step; phases 2 and 3 are only new ways to get that text in.
