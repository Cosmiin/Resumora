# Job extension: save jobs from any page with one click

Status: draft for review · 2026-11-06 · replaces phase 3 ("Extension") of `2026-11-05-job-capture-design.md` and drops its phase 2 server fetch for now.
Follows decisions 0001 (API in the middle), 0002 (API acts as the user), 0004 (work goes through a queue).

## Why

Most job seekers find jobs on LinkedIn, behind a login. A server can't read those pages; the user's own browser can. The Resumora Chrome extension reads the job ad the user is looking at and saves it to their Resumora job list with one click. It becomes the main way to add a job. Pasting the description by hand stays as a fallback.

The goal is a **reliable** first version: every click ends in a clear result (saved, already saved, couldn't read, or a specific error), and no click silently loses or duplicates a job.

## What changes from the 2026-11-05 spec

| Topic | 2026-11-05 spec | Now | Why |
|---|---|---|---|
| Ways to add a job | Paste a link (server fetches it) or extension | **Extension**, with the paste form (link + description) as a fallback | Server fetch fails on the sites that matter most; the extension doesn't |
| Server fetch (phase 2) | `fetch-page.ts`, `needs_text`, `PUT /text`, retry | **Not built now.** A link is still required with pasted text | Out of scope; may come back later as its own spec |
| Extension sign-in | Hand-off from the web app (`/connect-extension`) | **Email and password in the extension popup**, through Supabase | The user's choice: simplest, no extra web page or messaging |
| Saving | Popup with a **Save job** button | **The popup opens on a Capture button** (changed 2026-11-07 after the first Chrome test; it first saved on open) | Saving on open gave no sense of cause and effect; the user wanted an explicit action and visible loading |
| Selected text | 200+ selected characters replace the page text | **Ignored.** The reader always picks the text | The user's choice: one predictable behavior |
| Calling the API | CORS allows `chrome-extension://<id>`, pinned extension key | **Host permissions for Resumora's own API origins only**; the background script's requests are not subject to CORS | No API change or redeploy needed, for local or hosted |
| Environments | One build-time config | **A Local / Hosted switch** in the popup | Test locally, then try it on the real account |
| Distribution | Load unpacked | Load unpacked, **dev only** | Unchanged |

## Scope

**In**
- `apps/extension`: Manifest V3 extension (popup, background service worker, page readers), built with Vite, loaded unpacked.
- A LinkedIn reader and a general reader for every other page.
- Sign-in with Resumora email and password, kept per environment.
- A Local / Hosted switch.
- Web app: the **Add a job** dialog leads with the extension guide; the paste form becomes a collapsible fallback; `/jobs?add=<url>` opens the dialog with the link filled in and the paste form open.

**Out**
- Server-side fetching of links, `needs_text` handling, `PUT /v1/jobs/:id/text`, retry.
- Opening links in a background tab from the web app ("Flow A").
- Chrome Web Store publishing, other browsers, mobile.
- Signing up or resetting a password from the extension (the popup links to the web app for both).
- Any API or database change.

## User experience

### Extension popup

The popup always shows the environment badge (**Local** / **Hosted**) in its header. When signed in, its footer shows the signed-in email and **Sign out**.

| State | When | Shows |
|---|---|---|
| Signed out | No session for the chosen environment | Email, password, **Sign in**; a **Connect to** select (Local / Hosted); links "Create an account" and "Forgot password" that open the web app |
| Checking | Popup opened (or sign-in finished) on an `http(s)` page while signed in | Small spinner, "Checking this page…" (the page is read and checked in the extension; no API call) |
| Ready to capture | The check finds a job ad | "Capture this job", the page's host and path, a **Capture** button |
| Not a job ad | The page has 200+ characters but the check finds no sign of a job ad (added 2026-11-07) | "This doesn't look like a job ad", "Resumora can only read job ads. If this is one, you can still capture it.", a small **Capture anyway** link-style button that runs the normal capture |
| Capturing | **Capture** clicked | The button disabled, with a spinner and "Capturing…" inside it, for at least 500 ms |
| Saved | API returned `202` | "Saved", "Resumora is reading the ad. Title and requirements appear in a few seconds.", **Open in Resumora** |
| Already saved | API returned `existing: true` | "Already in Resumora", "You saved this job earlier. Nothing new was added.", **Open it** |
| Couldn't read | The reader found under 200 characters | "Couldn't read this ad", "The page shows too little text. It may need a sign-in, or it isn't a job ad.", **Paste it in Resumora** |
| Can't read this page | `chrome://`, Chrome Web Store, PDF viewer, `file://`, or script injection fails | "Resumora can't read this kind of page." |
| Not saved | Any API or network error | "Not saved", the message for the error (see Errors), **Try again** |

Rules:
- **Capture is explicit.** Opening the popup while signed in never saves by itself. On `http(s)` pages it first checks the page, then shows **Capture**, **Not a job ad**, **Couldn't read** (under 200 characters) or **Can't read this page** (script injection fails); any other page shows "Can't read this page" at once.
- **The job check** (in the extension, instant, free) passes a page if any of: JSON-LD with `@type` `JobPosting`; a known job-site host; or at least two job signals (job words in English or Romanian, or a job-like URL path). It is a guess, so **Capture anyway** stays available; the server's own "not a job posting" check remains the backstop.
- **Couldn't read** never calls the API, so it doesn't use one of the 30 daily runs.
- **Open in Resumora / Open it** opens `<web>/jobs/<id>` in a new tab. **Paste it in Resumora** opens `<web>/jobs?add=<encoded url>`.
- **Try again** repeats whatever failed: after a failed save it repeats the whole save (read the page again, then send); after a failed page check it repeats only the check and never saves.
- Switching the environment shows that environment's state (signed in or not); sessions are kept separately.
- Signing in does not save automatically; it runs the same page check as opening the popup (Capture, Not a job ad, Couldn't read or Can't read this page), and the user clicks **Capture** or **Capture anyway**.

### Web app: Add a job dialog

- Top: a box "Save jobs with the Resumora extension" with three steps (install the extension, sign in with your Resumora account, click the Resumora icon on any job ad, LinkedIn included, then **Capture**) and a **How to install (dev)** toggle that shows the load-unpacked steps inline.
- Below: **Or paste it yourself**, collapsed by default, holding the current form (link + description, same validation: valid `http(s)` link, at least 200 characters).
- Opened from `/jobs?add=<url>`: the dialog opens with the paste section expanded, the link filled in, and focus in the description field. The `add` parameter is removed from the address after opening, so a reload doesn't reopen it.
- The line "Soon a link alone will be enough: Resumora will read the page for you." is removed.

## Architecture

```
apps/extension/
  manifest.json         MV3; permissions: activeTab, scripting, storage; host_permissions: the configured API and Supabase origins only
  src/config.ts         the two environments, from build-time env (VITE_*)
  src/background.ts     message handler: getState, signIn, signOut, setEnvironment, saveActiveTab
  src/auth.ts           one Supabase client per environment, session in chrome.storage.local
  src/save.ts           saveActiveTab: inject reader → check length → POST /v1/jobs → result
  src/api.ts            POST /v1/jobs with the Bearer token; maps responses to results
  src/readers/index.ts  picks the reader for the page; the file injected into the tab
  src/readers/linkedin.ts
  src/readers/generic.ts
  src/popup/            popup.html + popup.ts (plain TypeScript, no framework)
  .env.example          VITE_LOCAL_* and VITE_HOSTED_* values (URLs and publishable keys only)
  README.md             build and load-unpacked steps
```

- The popup only renders state and sends messages to the background script. All logic (auth, reading, API calls) lives in the background script, so a popup that closes mid-save doesn't break the save.
- `packages/shared` provides `CreateJobBodySchema` and the response types. The extension validates its request body with the same schema before sending.
- Built with Vite into `apps/extension/dist`: `background.js`, `reader.js` (one self-contained file), `popup.html` + `popup.js`, `manifest.json`.

### Environments (`config.ts`)

| | Local | Hosted |
|---|---|---|
| API | `http://127.0.0.1:8788` | `VITE_HOSTED_API_URL` |
| Web app | `http://127.0.0.1:5173` | `VITE_HOSTED_WEB_URL` |
| Supabase | `VITE_LOCAL_SUPABASE_URL` (default `http://127.0.0.1:54321`) | `VITE_HOSTED_SUPABASE_URL` |
| Publishable key | `VITE_LOCAL_SUPABASE_ANON_KEY` | `VITE_HOSTED_SUPABASE_ANON_KEY` |

- Values come from `apps/extension/.env` (gitignored). Only `.env.example` is committed. These are public browser values, not secrets; no service-role key ever goes in the extension.
- `host_permissions` is generated at build time from these origins, so the extension can call nothing else.
- The chosen environment is stored in `chrome.storage.local` (`env`: `local` | `hosted`, default `local`).

### Sign-in (`auth.ts`)

- One supabase-js client per environment, created with a `chrome.storage.local` storage adapter and a storage key per environment, `persistSession: true`, `autoRefreshToken: false`.
- Sign in: `signInWithPassword({ email, password })`. The password is never stored; only Supabase's session (access and refresh token) is kept.
- Before each API call: `getSession()`, which refreshes an expired access token with the refresh token. (Background refresh timers don't survive MV3 service workers going to sleep, so refreshing on demand is the reliable choice.)
- API `401`: refresh once and retry the request once. If that fails, clear the session and show **Signed out** with "Your sign-in expired. Sign in again."
- Sign out: `signOut({ scope: "local" })` for that environment only; the website session is untouched.

### Saving (`save.ts`)

1. Get the active tab. If its URL isn't `http(s)`, show **Can't read this page**.
2. `chrome.scripting.executeScript({ target: { tabId }, files: ["reader.js"] })`, which returns `{ url, pageText, jsonLd }`. If injection throws, show **Can't read this page**.
3. Trim `pageText`. If it's under 200 characters, show **Couldn't read**.
4. Cap `pageText` at 30,000 characters (the API keeps only 30k, and this keeps the body under the 100 KB limit even for non-Latin text). Keep at most 20 JSON-LD items (the schema limit).
5. Validate the body with `CreateJobBodySchema`, then `POST /v1/jobs` with `Authorization: Bearer <access_token>` and a 20-second timeout.
6. Map the response (see Errors) and show the result.

A second click while a save is running for the same tab joins that save instead of sending another request.

### Readers

Both readers are pure functions of `(document, location)`, with no Chrome APIs, so they're tested against saved HTML in jsdom.

**`readers/index.ts`** uses the LinkedIn reader on `www.linkedin.com` pages under `/jobs/`. If it returns nothing, it falls back to the general reader.

**`readers/linkedin.ts`**
- Job id: from `/jobs/view/<id>` or the `currentJobId` query parameter (search and collections pages, where the ad is in the right-hand pane).
- `url`: always `https://www.linkedin.com/jobs/view/<id>/`, so the same job saved from search, a collection or its own page is one job (the API's normalization then matches).
- `pageText`: the top card (title, company, location, work mode) followed by the job description. The CSS selectors for both live in one ordered list at the top of the file; the first that matches wins.
- No job id, or no description container → return nothing (fall back to general).

**`readers/generic.ts`**
- `jsonLd`: every `script[type="application/ld+json"]`, parsed; broken JSON is skipped.
- `pageText`: the text of `main`, else `[role=main]`, else `article`, else `body`, after removing `nav`, `header`, `footer`, `aside`, `script`, `style`, `noscript` and `form` from a clone (never from the live page); whitespace collapsed, headings and list items kept on their own lines.
- `url`: `location.href`.

### Web app changes (`apps/web/src/jobs`)

- `AddJobDialog.tsx`: the extension guide on top; the paste form in a collapsible section; accepts an optional initial link that fills the link field and opens the section.
- `JobsPage.tsx`: reads `add` from the query string; if it's a valid `http(s)` link, opens the dialog with it, then removes the parameter with `replace`.
- `i18n/en-jobs.ts`: new strings for the guide; the "Soon a link alone…" string removed.

## Errors

| Case | Source | Popup shows |
|---|---|---|
| `202` | API | Saved |
| `200 { existing: true }` | API | Already saved |
| `invalid_url` | API 400 | "This doesn't look like a job link." |
| `text_too_short` | API 400 | Couldn't read (same as the local check) |
| `payload_too_large` | API 413 | "This page is too large to send." |
| `job_limit` | API 429 | The API's message ("You can add up to 30 jobs per day.") |
| `401` after one refresh and retry | API | Signed out, "Your sign-in expired. Sign in again." |
| Any other API error | API | "Something went wrong. Try again." plus the request id in small text |
| Network failure or timeout | fetch | Local: "Can't reach Resumora. Is the app running?" · Hosted: "Can't reach Resumora. Check your connection." |
| Wrong email or password | Supabase | "Wrong email or password." |
| Unconfirmed email | Supabase | "Confirm your email first, then sign in." |

The popup never shows raw exception text.

## Testing

**Unit (vitest, `apps/extension`)**
- LinkedIn reader on saved HTML fixtures: a `/jobs/view/<id>` page, a search page with `currentJobId`, a collections page, and a page with no description container (→ nothing). Checks the canonical URL and that the text holds the title, company and description but not the feed or "people also viewed".
- General reader on fixtures: a `main` page, a page with no `main`, nav and footer removed, JSON-LD (plain, `@graph`, broken), and that the live document is unchanged.
- `save.ts` with fake Chrome and fetch: non-http tab, injection failure, short text (no fetch made), the text cap, each API response row in the Errors table, `401` → refresh → retry, `401` twice → signed out, network failure, and a double click (one request).
- `auth.ts`: sessions kept per environment; sign out clears only one.

**Fixtures**
HTML fixtures are saved job pages trimmed to the parts the readers use. Every personal detail (the viewer's name, photo, profile links, connections) is replaced with fictional values before a fixture is committed.

**Web (vitest, existing `jobs-page.test.tsx`)**
- The dialog shows the guide; the paste section is collapsed by default and still validates as before.
- `/jobs?add=<url>` opens the dialog with the link filled in and the section open, then the parameter is gone; an invalid `add` value is ignored.

**Manual checklist (Chrome, local first, then hosted)**
1. Build, then load `apps/extension/dist` unpacked; the popup shows Signed out with **Local**.
2. Sign in with a local account; the footer shows the email.
3. Click the icon on a LinkedIn job page (signed in to LinkedIn) → Saved; the job appears in `/jobs` and becomes ready.
4. Same LinkedIn job from the search results pane → Already saved.
5. A Greenhouse or Lever job and a company career page → Saved, then ready.
6. `https://example.com` → "This doesn't look like a job ad" on open, with **Capture anyway**; a page with under 200 characters → Couldn't read on open; **Paste it in Resumora** opens the dialog with the link filled in.
7. `chrome://extensions` → Can't read this page.
8. Stop the local API, click → "Can't reach Resumora. Is the app running?"
9. Switch to **Hosted** → Signed out (separate session); sign in, save one job, check it in the hosted app.
10. Sign out → Signed out; the website stays signed in.

## Acceptance criteria

1. **LinkedIn:** given a signed-in extension and a LinkedIn job page the user is signed in to, when they click the icon, then the popup says Saved and the job becomes ready in their `/jobs` list, with no server request to LinkedIn.
2. **One job per LinkedIn ad:** the same ad saved from its own page, a search pane and a collection gives one job (Already saved on the second and third).
3. **Other sites:** a job on a non-LinkedIn page is saved by the general reader and becomes ready.
4. **Couldn't read:** a page with under 200 characters of text gives Couldn't read, makes no API call, and **Paste it in Resumora** opens the paste form with the link filled in.
5. **Errors:** every row of the Errors table shows its message; no click ends without a visible result.
6. **Sign-in:** the user signs in with email and password in the popup; the password is not stored; an expired token is refreshed on its own; sign out leaves the website signed in.
7. **Environments:** Local and Hosted keep separate sessions, the badge always shows which is active, and jobs go only to the chosen one.
8. **Permissions:** the extension reads a page only after a click on it (`activeTab`) and can call only the configured Resumora and Supabase origins.
9. **Web fallback:** the Add a job dialog shows the extension guide first and the paste form as a fallback that still requires a link.
10. **No server changes:** the API, database and migrations are unchanged.

## Build order

One plan for `codex-build`, in this order:

1. Extension scaffold: Vite build, manifest generated from config, `.env.example`, README, empty popup that loads.
2. Readers with fixtures and tests.
3. Auth and environment switch with tests.
4. `save.ts` + `api.ts` with tests, and the popup states.
5. Web dialog changes with tests.
6. Manual checklist in Chrome, supervised through Claude in Chrome.
