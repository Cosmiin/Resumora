# Job extension: save jobs from any page with one click

Branch `rebuild/job-extension`, based on `main` at 7dde331. Built with the `codex-build` skill in the worktree `resumora-job-extension`.
Spec (binding): `docs/superpowers/specs/2026-11-06-job-extension-design.md`. Where this plan and the spec differ, this plan wins; every difference is listed under "Decisions this plan adds".

**Goal:** a Manifest V3 Chrome extension in `apps/extension` (dev only, loaded unpacked) that saves the job ad on the current page to Resumora with one click on its icon, plus the **Add a job** dialog changes in the web app. No API or database change.

**Architecture:** the popup only renders state and sends messages; the background service worker owns sign-in (supabase-js, session in `chrome.storage.local`, one per environment), page reading (an injected reader script) and the `POST /v1/jobs` call. Readers are pure functions of `(document, location)`, tested in jsdom. Everything Chrome-specific is injected, so tests use fakes.

**Tech stack:** TypeScript, Vite 8.3.5, Vitest 5.1.0, jsdom 30.1.3, `@supabase/supabase-js` 2.119.0, zod 4.6.7, `@resumora/shared`. Same versions as the web app; all already in `package-lock.json`.

## Rules for every task

- Do not open `.env*`, `.dev.vars` or other secret files. Use `.env.example` files only.
- No new dependency outside the list above. No `@types/chrome`: `apps/extension/src/chrome.d.ts` declares only the Chrome APIs the code uses (`runtime.onMessage`, `runtime.sendMessage`, `storage.local`, `tabs.query`, `tabs.create`, `scripting.executeScript`).
- No framework in the popup: plain TypeScript and DOM. All popup copy comes from `apps/extension/src/copy.ts`, exactly as written in this plan.
- The popup never shows raw exception text.
- Code that needs Chrome or `fetch` takes them as parameters (dependency injection); tests pass fakes. No test touches the network.
- Files under ~300 lines. Plain words in names and comments.
- The API, `supabase/` and `packages/shared` are not changed.

## Decisions this plan adds

1. **Reader injection is two calls.** A bundled IIFE file returns nothing as its completion value, so `background.ts` runs `executeScript({ files: ["reader.js"] })`, which sets `globalThis.__resumoraReadPage`, then `executeScript({ func: () => globalThis.__resumoraReadPage() })`, whose result is `{ url, pageText, jsonLd }`. The global is set by `src/reader-entry.ts`; `src/readers/index.ts` stays pure.
2. **Two Vite builds:** `vite build` (popup + background, ES modules; the service worker is `"type": "module"`) and `vite build -c vite.reader.config.ts` (reader, one self-contained IIFE). `npm run build -w apps/extension` runs both.
3. **A "Ready" view** the spec doesn't name: shown after signing in, and when the popup opens signed in on an environment just switched to. Copy below.
4. **Body size guard:** after the 30,000-character cap, if the JSON body is over 100,000 bytes (UTF-8), drop `jsonLd`; if still over, show "This page is too large to send." without calling the API.
5. **Hosted not configured:** if any `VITE_HOSTED_*` value is missing, Hosted shows in the **Connect to** select as disabled with "(not set up in this build)", and none of its origins enter `host_permissions`.
6. "Create an account" and "Forgot password" both open `<web>/login` (the login page switches modes itself).
7. `/jobs?add=<value>`: the parameter is removed with `replace` whether or not the value is a valid link; an invalid value opens nothing.

## Review focus

Conditions the spec implies but no spec test names; each has a test in the task that owns it.
1. Hosted values missing from `.env` → build still works, Hosted disabled, no empty origin in `host_permissions` (Task 1).
2. LinkedIn `currentJobId` that isn't all digits, or a `/jobs/view/` slug like `/jobs/view/data-engineer-at-acme-4012345678/` → the id is the trailing digits or nothing, never a wrong id (Task 2).
3. A page whose capped text plus JSON-LD is over 100 KB in UTF-8 (e.g. Japanese text, large JSON-LD) → saved without JSON-LD, never a `413` (Task 4).
4. Refresh token revoked or expired while the service worker slept → "Your sign-in expired. Sign in again.", session cleared for that environment only (Tasks 3, 4).
5. Popup closed during a save, then reopened → the first save still finishes, and the reopen joins it if still running (no second request) (Task 4).

---

## Task 1: Extension scaffold — build, generated manifest, environments, empty popup

---
files: [apps/extension/package.json, apps/extension/tsconfig.json, apps/extension/vite.config.ts, apps/extension/vite.reader.config.ts, apps/extension/.env.example, apps/extension/README.md, apps/extension/src/chrome.d.ts, apps/extension/src/environments.ts, apps/extension/src/environments.test.ts, apps/extension/src/manifest.ts, apps/extension/src/manifest.test.ts, apps/extension/src/config.ts, apps/extension/src/background.ts, apps/extension/src/reader-entry.ts, apps/extension/src/readers/index.ts, apps/extension/popup.html, apps/extension/src/popup/popup.ts, apps/extension/src/popup/popup.css, package-lock.json]
new_files: [apps/extension/package.json, apps/extension/tsconfig.json, apps/extension/vite.config.ts, apps/extension/vite.reader.config.ts, apps/extension/.env.example, apps/extension/README.md, apps/extension/src/chrome.d.ts, apps/extension/src/environments.ts, apps/extension/src/environments.test.ts, apps/extension/src/manifest.ts, apps/extension/src/manifest.test.ts, apps/extension/src/config.ts, apps/extension/src/background.ts, apps/extension/src/reader-entry.ts, apps/extension/src/readers/index.ts, apps/extension/popup.html, apps/extension/src/popup/popup.ts, apps/extension/src/popup/popup.css]
deps: true
size: 300
---

**Goal:** `npm run build -w apps/extension` produces `apps/extension/dist` with `manifest.json`, `background.js`, `reader.js`, `popup.html`, `popup.js` (plus CSS), loadable unpacked, whose popup shows "Resumora" and the environment badge.

- `package.json`: name `@resumora/extension`, private, `"type": "module"`, scripts `build` (`vite build && vite build -c vite.reader.config.ts`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`). Dependencies `@resumora/shared: "*"`, `@supabase/supabase-js: 2.119.0`, `zod: 4.6.7`; devDependencies `jsdom: 30.1.3`, `vite: 8.3.5`. Update `package-lock.json` with `npm install --offline` (or `--prefer-offline`); every version is already in the lockfile.
- `tsconfig.json` extends `../../tsconfig.base.json`, includes `src` and the two Vite configs, `lib` with `DOM` and `WebWorker`.
- `src/environments.ts` (pure, no `import.meta`):
  - `type EnvId = "local" | "hosted"`
  - `interface EnvConfig { id: EnvId; label: "Local" | "Hosted"; apiUrl: string; webUrl: string; supabaseUrl: string; supabaseKey: string; configured: boolean }`
  - `environmentsFrom(env: Record<string, string | undefined>): Record<EnvId, EnvConfig>`. Local: `apiUrl` `http://127.0.0.1:8788`, `webUrl` `http://127.0.0.1:5173`, `supabaseUrl` `VITE_LOCAL_SUPABASE_URL` or `http://127.0.0.1:54321`, `supabaseKey` `VITE_LOCAL_SUPABASE_ANON_KEY` or `""`; `configured` when the key is non-empty. Hosted: `VITE_HOSTED_API_URL`, `VITE_HOSTED_WEB_URL`, `VITE_HOSTED_SUPABASE_URL`, `VITE_HOSTED_SUPABASE_ANON_KEY`; `configured` only when all four are non-empty and the three URLs parse as `https:`. Trailing slashes are removed from URLs.
- `src/manifest.ts`: `buildManifest(envs: Record<EnvId, EnvConfig>): object` returning MV3: `name` "Resumora", `version` "0.1.0", `description` "Save the job ad you're looking at to Resumora.", `action: { default_popup: "popup.html", default_title: "Save this job to Resumora" }`, `background: { service_worker: "background.js", type: "module" }`, `permissions: ["activeTab", "scripting", "storage"]`, `host_permissions`: `<origin>/*` for `apiUrl` and `supabaseUrl` of each configured environment, deduplicated, sorted. No `content_scripts`, no `<all_urls>`.
- `vite.config.ts`: inputs `src/background.ts` → `background.js` and `popup.html` → `popup.html`. `popup.html` sits at the package root (`apps/extension/popup.html`, loading `src/popup/popup.ts`) because Vite keeps an HTML input's path relative to its root; a nested HTML input would land at `dist/src/popup/popup.html` and break the manifest. Output to `dist` with fixed names (no hashes); a small inline plugin writes `dist/manifest.json` from `buildManifest(environmentsFrom(loadEnv(mode, __dirname, "VITE_")))`. Vitest config lives here too: `environment: "jsdom"`. `vite.reader.config.ts`: library build of `src/reader-entry.ts`, format `iife`, `dist/reader.js`, `emptyOutDir: false`.
- `src/config.ts`: `export const environments = environmentsFrom(import.meta.env)`.
- `src/background.ts`: registers a `chrome.runtime.onMessage` listener that answers `{ type: "ping" }` with `{ ok: true }` (replaced in Task 3).
- `src/readers/index.ts`: exports `type ReaderResult = { url: string; pageText: string; jsonLd: unknown[] }` and a stub `readPage(doc: Document, loc: Location): ReaderResult` returning `{ url: loc.href, pageText: "", jsonLd: [] }`. `src/reader-entry.ts` sets `globalThis.__resumoraReadPage = () => readPage(document, location)`.
- Popup: `popup.html` (header with "Resumora" and a badge element, a `main` for views, a footer), `popup.ts` sets the badge text to the stored environment's label (`chrome.storage.local` key `env`, default `local`), `popup.css` 320 px wide, system font.
- `.env.example`: the six `VITE_*` names with placeholder values and one comment line: "Public browser values only. Never a service-role key."
- `README.md`: build (`npm run build -w apps/extension`), load unpacked (`chrome://extensions` → Developer mode → Load unpacked → `apps/extension/dist`), reload after each build, and that `.env` holds the values from `.env.example`.

**Acceptance tests:**
- `src/environments.test.ts`: with no values, Local has the three default URLs and `configured: false`; with `VITE_LOCAL_SUPABASE_ANON_KEY` set, Local is configured; Hosted with all four `https` values is configured and has no trailing slashes; Hosted missing any one value, or with an `http:` URL, is `configured: false`.
- `src/manifest.test.ts`: only Local configured → `host_permissions` equals `["http://127.0.0.1:54321/*", "http://127.0.0.1:8788/*"]`; both configured → also the two hosted origins, no duplicates when API and Supabase share an origin; never `<all_urls>`, never an empty or `undefined` entry; `permissions` is exactly `["activeTab", "scripting", "storage"]`; `background.type` is `"module"`.
- `npm run build -w apps/extension` succeeds with no `.env` file, and `dist/` contains `manifest.json`, `background.js`, `reader.js`, `popup.html`, `popup.js`.
- Root `npm test`, `npm run typecheck` and `npm run lint` pass.

**Out of scope:** reading pages, sign-in, saving, the web app.

## Task 2: Page readers with fixtures

---
files: [apps/extension/src/readers/index.ts, apps/extension/src/readers/linkedin.ts, apps/extension/src/readers/generic.ts, apps/extension/src/readers/readers.test.ts, apps/extension/src/readers/fixtures/linkedin-view.html, apps/extension/src/readers/fixtures/linkedin-search.html, apps/extension/src/readers/fixtures/linkedin-collection.html, apps/extension/src/readers/fixtures/linkedin-no-description.html, apps/extension/src/readers/fixtures/generic-main.html, apps/extension/src/readers/fixtures/generic-no-main.html, apps/extension/src/readers/fixtures/generic-jsonld.html]
new_files: [apps/extension/src/readers/linkedin.ts, apps/extension/src/readers/generic.ts, apps/extension/src/readers/readers.test.ts, apps/extension/src/readers/fixtures/linkedin-view.html, apps/extension/src/readers/fixtures/linkedin-search.html, apps/extension/src/readers/fixtures/linkedin-collection.html, apps/extension/src/readers/fixtures/linkedin-no-description.html, apps/extension/src/readers/fixtures/generic-main.html, apps/extension/src/readers/fixtures/generic-no-main.html, apps/extension/src/readers/fixtures/generic-jsonld.html]
deps: false
size: 450
---

**Checked on live LinkedIn (2026-11-06, Claude, read-only, in the user's Chrome):** the current UI has **no** stable class names (hashed classes such as `fa4lje`), no `h1`, and none of the old selectors (`#job-details`, `.jobs-description__content`, `.job-details-jobs-unified-top-card__*`) match. Search results now live at `/jobs/search-results/?currentJobId=<id>`. Stable markers, the same on the search pane and on `/jobs/view/<id>/`:
- the details pane is the `[data-testid="lazy-column"]` element that contains an `h2` whose trimmed text is "About the job" (the search page has 3 lazy columns; only this one has the heading);
- the description is the first `[data-testid="expandable-text-box"]` inside that heading's section (within 3 ancestors of the `h2`); its full text (~6,000 chars) is in the DOM even while collapsed behind "… more", so nothing is clicked;
- the top card (title, company, location, work mode, ~450–520 chars) is everything in the details pane **before** the heading; the title is a link `a[href*="/jobs/view/"]` in it;
- after the description come other `h2` sections (company, hiring team, similar jobs), which must not be in `pageText`.

**Goal:** `readPage(doc, loc)` returns `{ url, pageText, jsonLd }` for any page, using the LinkedIn reader on `www.linkedin.com` under `/jobs/` and the general reader otherwise or when LinkedIn returns `null`.

- `src/readers/generic.ts`:
  - `collectJsonLd(doc: Document): unknown[]` — every `script[type="application/ld+json"]` parsed with `JSON.parse`; broken JSON skipped; at most 20 items.
  - `blockText(root: Element): string` — text with whitespace collapsed inside lines; `h1`–`h6`, `li`, `p`, `div`, `section`, `br`, `tr`, `dd`, `dt` each start a new line; empty lines collapsed; trimmed.
  - `readGeneric(doc: Document, loc: Location): ReaderResult` — picks `main`, else `[role=main]`, else `article`, else `body`; works on `cloneNode(true)` with `nav, header, footer, aside, script, style, noscript, form` removed; `url` is `loc.href`; `jsonLd` from `collectJsonLd`. Never mutates the live document.
- `src/readers/linkedin.ts`:
  - `linkedInJobId(loc: Location): string | null` — from `/jobs/view/<id>` (the id is the run of digits at the end of the path segment, so `/jobs/view/data-engineer-at-acme-4012345678/` gives `4012345678`) or from the `currentJobId` query parameter when it is all digits; otherwise `null`.
  - `readLinkedIn(doc: Document, loc: Location): ReaderResult | null` — `null` when no id, no "About the job" heading, or no description box. `url` is `https://www.linkedin.com/jobs/view/<id>/`. `pageText` is `blockText` of the top card, a blank line, then `blockText` of the description. Constants at the top of the file: `ABOUT_JOB_HEADINGS = ["about the job"]` (compared lower-cased and trimmed), `DETAILS_PANE = '[data-testid="lazy-column"]'`, `DESCRIPTION_BOX = '[data-testid="expandable-text-box"]'`. The top card is taken with a DOM `Range` from the start of the details pane to just before the heading, on cloned contents (the live page is not changed). Text comes from `textContent`-based `blockText` (jsdom has no `innerText`). A LinkedIn UI in another language has a different heading, so it falls back to the general reader; that's accepted.
- `src/readers/index.ts`: `readPage` as described; `ReaderResult` exported from here.
- Fixtures: hand-built HTML in LinkedIn's current structure (hashed class names like `fa4ayy`, the markers above, an "… more" button next to a description box holding the whole text, two other `lazy-column`s on the search fixture with job cards, and after the description `h2` sections "About the company" and "People also viewed"), with a feed, a nav with a fictional viewer name ("Alex Example") and profile link, around a fictional job "Senior Data Engineer" at "Northwind Labs", Bucharest, Hybrid. No real person, company page or profile from LinkedIn. Each fixture under 15 KB.

**Acceptance tests (`src/readers/readers.test.ts`, jsdom; each fixture loaded into a fresh `JSDOM` with its own URL):**
- View page `https://www.linkedin.com/jobs/view/4012345678/?trk=x`: url `https://www.linkedin.com/jobs/view/4012345678/`; text contains "Senior Data Engineer", "Northwind Labs" and a description sentence; text does not contain "People also viewed", feed text, or "Alex Example".
- Search page `.../jobs/search-results/?currentJobId=4012345678&keywords=data`: same url as the view page; text holds the selected job only, not the other job cards in the list columns, nor "About the company".
- Collection page `.../jobs/collections/recommended/?currentJobId=4012345678`: same url.
- `currentJobId=abc` and a slug view path: `linkedInJobId` gives `null` and the trailing digits respectively.
- No description container: `readLinkedIn` returns `null` and `readPage` returns the generic result with `url` equal to `location.href`.
- Generic `main` page: text from `main` only; nav and footer text absent; a heading and two list items each on their own line.
- Generic page with no `main`: text from `body` with nav, header, footer, aside, form removed.
- JSON-LD: a plain `JobPosting` object, an `@graph` document (kept as one item, unchanged), and a broken script → two items.
- The live document's `body.innerHTML` is identical before and after `readPage`.

**Out of scope:** Chrome APIs, injection, length checks (Task 4), saving.

## Task 3: Sign-in and the environment switch

---
files: [apps/extension/src/storage.ts, apps/extension/src/auth.ts, apps/extension/src/auth.test.ts, apps/extension/src/messages.ts, apps/extension/src/handler.ts, apps/extension/src/handler.test.ts, apps/extension/src/background.ts, apps/extension/src/copy.ts]
new_files: [apps/extension/src/storage.ts, apps/extension/src/auth.ts, apps/extension/src/auth.test.ts, apps/extension/src/messages.ts, apps/extension/src/handler.ts, apps/extension/src/handler.test.ts, apps/extension/src/copy.ts]
deps: false
size: 380
---

**Goal:** the background script signs in and out per environment and remembers the chosen environment.

- `src/storage.ts`: `interface KeyValueStorage { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }`; `chromeStorage(): KeyValueStorage` over `chrome.storage.local`; `memoryStorage(): KeyValueStorage` for tests; `getEnvId(s: KeyValueStorage): Promise<EnvId>` (key `env`, default `local`, unknown value → `local`); `setEnvId(s, id): Promise<void>`.
- `src/auth.ts`: `createAuth(deps: { storage: KeyValueStorage; environments: Record<EnvId, EnvConfig>; fetch?: typeof fetch }): Auth` where
  - `Auth = { email(env: EnvId): Promise<string | null>; signIn(env: EnvId, email: string, password: string): Promise<{ ok: true; email: string } | { ok: false; message: string }>; signOut(env: EnvId): Promise<void>; accessToken(env: EnvId): Promise<{ token: string } | { expired: true } | { offline: true } | null>; refresh(env: EnvId): Promise<string | null> }`
  - One supabase-js client per environment, created lazily, with `auth: { storage: <adapter over deps.storage>, storageKey: "resumora-auth-<env>", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }` and `global: { fetch: deps.fetch }` when given.
  - `email` makes no network call and never refreshes: it reads the stored session JSON under that environment's storage key and returns its `user.email`, or `null` when absent or unreadable. (Calling `getSession()` here would let a rejected refresh delete the session while the popup opens, so the save could no longer tell "expired" from "never signed in".)
  - `accessToken` uses `getSession()` (refreshes an expired token): a session → `{ token }`; no session and no error → `null` (never signed in); no session **with** an error (supabase-js 2.119.0 returns `session: null` plus the error when the refresh is rejected, `GoTrueClient.ts` `__loadSession`) → `{ expired: true }`, after removing that environment's storage key — except when that error is a network failure (`isAuthRetryableFetchError`), which keeps the session and gives `{ offline: true }`. `refresh` uses `refreshSession()` and returns `null` on any error; `signOut` uses `signOut({ scope: "local" })` and also removes that environment's storage key if anything remains.
  - `signIn` maps errors: `invalid_credentials` → `copy.wrongPassword`; `email_not_confirmed` → `copy.confirmEmail`; a network failure → `copy.cantReach(env)`; anything else → `copy.somethingWrong`. The password is never written to storage.
- `src/copy.ts`: every popup string. This task adds: `wrongPassword` "Wrong email or password.", `confirmEmail` "Confirm your email first, then sign in.", `cantReach(env)` Local "Can't reach Resumora. Is the app running?" / Hosted "Can't reach Resumora. Check your connection.", `somethingWrong` "Something went wrong. Try again.", `signInTitle` "Sign in to Resumora", `email` "Email", `password` "Password", `signIn` "Sign in", `connectTo` "Connect to", `notSetUp` "(not set up in this build)", `createAccount` "Create an account", `forgotPassword` "Forgot password", `signOut` "Sign out", `readyTitle` "You're signed in", `readyText` "Open a job ad and click the Resumora icon to save it.", `expired` "Your sign-in expired. Sign in again.".
- `src/messages.ts`: `type Request = { type: "getState" } | { type: "signIn"; email: string; password: string } | { type: "signOut" } | { type: "setEnvironment"; env: EnvId } | { type: "saveActiveTab" }`; `interface PopupState { env: EnvId; email: string | null; environments: { id: EnvId; label: string; configured: boolean }[] }`; `type SignInReply = { ok: true; state: PopupState } | { ok: false; message: string }`.
- `src/handler.ts`: `createHandler(deps: { storage: KeyValueStorage; auth: Auth; environments: Record<EnvId, EnvConfig> }): (req: Request) => Promise<unknown>` answering `getState` → `PopupState`, `signIn` → `SignInReply` (on the stored env), `signOut` → `PopupState`, `setEnvironment` → `PopupState` (refuses an unconfigured env by leaving the stored one), `saveActiveTab` → `{ kind: "error", message: copy.somethingWrong }` until Task 4.
- `src/background.ts`: wires `createHandler` with `chromeStorage()` to `chrome.runtime.onMessage` (returns `true`, answers through `sendResponse`; a thrown error answers `{ kind: "error", message: copy.somethingWrong }`).

**Acceptance tests:**
- `src/auth.test.ts` (real supabase-js, fake `fetch` answering `/auth/v1/token?grant_type=password` with a session for `a@example.test`, `/auth/v1/logout` with 204): signing in on Local leaves Hosted signed out; signing in on both keeps two sessions under two keys; `signOut("local")` keeps the Hosted session and email; the stored values contain no password; a `400 invalid_credentials` answer → "Wrong email or password."; `400 email_not_confirmed` → "Confirm your email first, then sign in."; a rejected `fetch` → the Local cant-reach text; a stored session whose access token is expired and whose refresh is answered `400 refresh_token_not_found` → `email` first still returns the address with no fetch made, then `accessToken` gives `{ expired: true }` and the key is gone, while the other environment's session stays; the same expired session whose refresh `fetch` rejects (network) → `{ offline: true }` and the key is kept.
- `src/handler.test.ts` (fake `Auth`): `getState` defaults to `local`; `setEnvironment("hosted")` when Hosted is not configured leaves `local`; when configured, returns Hosted with that environment's email; `signIn` returns the new state with the email; `signOut` returns `email: null`.

**Out of scope:** the popup UI (Task 4), saving, the web app.

## Task 4: Saving, the API call, and the popup states

---
files: [apps/extension/src/api.ts, apps/extension/src/api.test.ts, apps/extension/src/save.ts, apps/extension/src/save.test.ts, apps/extension/src/handler.ts, apps/extension/src/handler.test.ts, apps/extension/src/background.ts, apps/extension/src/messages.ts, apps/extension/src/copy.ts, apps/extension/src/popup/popup.ts, apps/extension/src/popup/view.ts, apps/extension/src/popup/view.test.ts, apps/extension/src/popup/popup.css, apps/extension/popup.html]
new_files: [apps/extension/src/api.ts, apps/extension/src/api.test.ts, apps/extension/src/save.ts, apps/extension/src/save.test.ts, apps/extension/src/popup/view.ts, apps/extension/src/popup/view.test.ts]
deps: false
size: 650
---

**Goal:** one click on the icon saves the page's job and the popup shows one of the spec's states, every time.

- `src/api.ts`: `postJob(deps: { fetch: typeof fetch; apiUrl: string; token: string; body: CreateJobBody; timeoutMs?: number }): Promise<ApiOutcome>`, timeout default 20,000 ms through `AbortController`. `ApiOutcome = { kind: "saved"; id: string } | { kind: "existing"; id: string } | { kind: "unauthorized" } | { kind: "failed"; status: number; code: string | null; message: string | null; requestId: string | null } | { kind: "network" }`. `202` → saved; `200` with `existing: true` → existing; `401` → unauthorized; other statuses parse `ErrorBodySchema` from `@resumora/shared` (`requestId` falls back to the `x-request-id` header); a thrown or aborted fetch → network.
- `src/save.ts`: `createSaver(deps: { activeTab(): Promise<{ id: number; url?: string } | null>; runReader(tabId: number): Promise<ReaderResult>; auth: Pick<Auth, "accessToken" | "refresh" | "signOut">; fetch: typeof fetch; environment(): Promise<EnvConfig> }): { saveActiveTab(): Promise<SaveResult> }`.
  - `SaveResult` (in `messages.ts`): `{ kind: "saved"; openUrl: string } | { kind: "existing"; openUrl: string } | { kind: "couldntRead"; pasteUrl: string } | { kind: "cantRead" } | { kind: "signedOut"; message: string | null } | { kind: "error"; message: string; requestId: string | null }`. `openUrl` is `<webUrl>/jobs/<id>`; `pasteUrl` is `<webUrl>/jobs?add=<encodeURIComponent(url)>`.
  - Steps, in order: no tab or a URL that isn't `http:`/`https:` → cantRead; `runReader` throws → cantRead; trimmed `pageText` under 200 characters → couldntRead (no `fetch`, no token read); cap `pageText` at 30,000 characters and `jsonLd` at 20 items; body over 100,000 UTF-8 bytes → drop `jsonLd`, still over → error "This page is too large to send." (no `fetch`); `CreateJobBodySchema.safeParse` fails → error `copy.somethingWrong`; `accessToken` is `null` → signedOut with `message: null`; `{ expired: true }` → signedOut with `copy.expired`; `{ offline: true }` → error `copy.cantReach(env)` (no fetch, session kept); `postJob`; on `unauthorized`, `refresh` then one retry; a failed refresh or a second `unauthorized` → `signOut(env)` and signedOut with `copy.expired`.
  - Mapping: saved/existing as above; `invalid_url` → "This doesn't look like a job link."; `text_too_short` → couldntRead; `payload_too_large` → "This page is too large to send."; `job_limit` → the API's message; any other failure → `copy.somethingWrong` with its `requestId`; network → `copy.cantReach(env)`.
  - Joining: while a save for a tab id is running, another `saveActiveTab` for the same tab returns the same promise.
- `src/handler.ts`: `saveActiveTab` calls the saver. `src/background.ts` wires `activeTab` (`chrome.tabs.query({ active: true, currentWindow: true })`), `runReader` (Decision 1) and `fetch`.
- `src/popup/view.ts`: `renderView(root: HTMLElement, view: View, actions: ViewActions): void`, a pure DOM renderer. `type View = { kind: "signedOut"; state: PopupState; message: string | null; error: string | null } | { kind: "ready"; state: PopupState } | { kind: "saving"; where: string } | SaveResult`. `ViewActions = { signIn(email: string, password: string): void; setEnvironment(env: EnvId): void; signOut(): void; openTab(url: string): void; retry(): void }`. Copy per state, exactly:
  - Signed out: `signInTitle`, the message above the form when present (e.g. `expired`), labelled Email and Password fields (`type="email"`, `type="password"`, `autocomplete` set), **Sign in**, the **Connect to** select (Hosted disabled with `notSetUp` when not configured), links **Create an account** and **Forgot password** → `<webUrl>/login`, the error under the form when present.
  - Saving: a spinner (`role="status"`), "Saving this job…", and `where` (host + path).
  - Saved: "Saved", "Resumora is reading the ad. Title and requirements appear in a few seconds.", button **Open in Resumora**.
  - Already saved: "Already in Resumora", "You saved this job earlier. Nothing new was added.", button **Open it**.
  - Couldn't read: "Couldn't read this ad", "The page shows too little text. It may need a sign-in, or it isn't a job ad.", button **Paste it in Resumora**.
  - Can't read: "Resumora can't read this kind of page."
  - Error: "Not saved", the message, the request id in small text when present ("Request id: <id>"), button **Try again**.
  - Ready: `readyTitle`, `readyText`.
- `src/popup/popup.ts`: on open, `getState`; header badge shows the environment label; footer shows the email and **Sign out** when signed in. Signed in → Saving (host + path of the active tab) → `saveActiveTab` → result. Signed out → form; a successful sign-in → Ready (no save). Switching environment → that environment's state (Ready if signed in there, else the form). Sign out → the form. Try again → Saving → `saveActiveTab`. Links and buttons open tabs with `chrome.tabs.create`. A `signedOut` save result shows the form with its message.

**Acceptance tests:**
- `src/api.test.ts`: each status above maps to its outcome; `requestId` read from the body and, without a body, from `x-request-id`; a fetch that never resolves ends as network after the timeout (fake timers); the `Authorization` header is `Bearer <token>` and the URL is `<apiUrl>/v1/jobs`.
- `src/save.test.ts` (fake Chrome deps, fake `fetch`): a `chrome://extensions` tab → cantRead, no fetch; `runReader` throws → cantRead; 199 trimmed characters → couldntRead with the encoded `pasteUrl`, no fetch, `accessToken` not called; a 40,000-character text is sent as 30,000; 25 JSON-LD items are sent as 20; 30,000 Japanese characters plus 20 large JSON-LD items → sent without `jsonLd`; each row of the spec's Errors table gives its result and exact text; `401` → refresh → retry succeeds → saved; `401` twice → `signOut` called and signedOut with "Your sign-in expired. Sign in again."; refresh fails → the same; `accessToken` gives `{ expired: true }` → signedOut with the same text and no fetch; `{ offline: true }` → the cant-reach text, no fetch, `signOut` not called; network failure on Local and on Hosted → the two cant-reach texts; two calls without awaiting → one fetch, both get the same result; a call after the first finished → a second fetch.
- `src/popup/view.test.ts` (jsdom): each view renders its exact title and text and its one button or link; buttons call the right action with the right URL; the signed-out view's Hosted option is disabled when not configured; the error view shows the request id only when present; no view shows a stack or `Error:` text.
- `npm run build -w apps/extension` succeeds; root tests, typecheck and lint pass.

**Out of scope:** the web app (Task 5), reader changes, any API change.

## Task 5: Web — the Add a job dialog leads with the extension

---
files: [apps/web/src/jobs/AddJobDialog.tsx, apps/web/src/jobs/JobsPage.tsx, apps/web/src/jobs/jobs-page.test.tsx, apps/web/src/i18n/en-jobs.ts, apps/web/src/styles/jobs.css]
new_files: []
deps: false
size: 200
---

**Goal:** the dialog shows the extension guide first and the paste form as a collapsed fallback; `/jobs?add=<url>` opens it ready to paste.

- `AddJobDialog` gains an optional prop `initialUrl?: string`. When given, the paste section starts open, the link field holds it, and focus goes to the description field. Otherwise focus behaves as today and the section starts closed.
- Top box: title, three numbered steps, and a **How to install (dev)** toggle (`button` with `aria-expanded`, controls a list) showing four load-unpacked steps. Remove the "Soon" badge and the `jobs.dialog.linkSoon` line.
- **Or paste it yourself**: a `button` with `aria-expanded` that shows/hides the existing form. Validation, submit, duplicate and error behaviour are unchanged.
- `JobsPage`: reads `add` from the query string with React Router; if it parses as an `http:`/`https:` URL, opens the dialog with `initialUrl`; in every case removes `add` with `setSearchParams(..., { replace: true })`, keeping other parameters.
- `i18n/en-jobs.ts`: remove `jobs.dialog.linkSoon` and `jobs.dialog.extText`; keep `jobs.soon` (the job page uses it); set or add exactly:
  ```
  jobs.dialog.extTitle: Save jobs with the Resumora extension
  jobs.dialog.extStep1: Install the Resumora extension for Chrome.
  jobs.dialog.extStep2: Sign in with your Resumora account.
  jobs.dialog.extStep3: Click the Resumora icon on any job ad, LinkedIn included.
  jobs.dialog.installToggle: How to install (dev)
  jobs.dialog.install1: Run npm run build -w apps/extension.
  jobs.dialog.install2: Open chrome://extensions and turn on Developer mode.
  jobs.dialog.install3: Click Load unpacked and choose the apps/extension/dist folder.
  jobs.dialog.install4: Pin the Resumora icon to the toolbar.
  jobs.dialog.pasteToggle: Or paste it yourself
  ```
- Styles in `apps/web/src/styles/jobs.css`, existing tokens only.

**Acceptance tests (`jobs-page.test.tsx`, existing mocks):**
- The dialog shows "Save jobs with the Resumora extension" and the three steps; "Soon a link alone…" is gone; the install steps are hidden until **How to install (dev)** is pressed (`aria-expanded` flips).
- The paste section is collapsed by default (link field not in the document or not visible); after **Or paste it yourself**, the existing validation tests pass unchanged (they now open the section first).
- Rendering at `/jobs?add=https%3A%2F%2Fexample.com%2Fjob%2F1` opens the dialog with the link field equal to `https://example.com/job/1`, the section open, focus in the description field, and the router location without `add`.
- `/jobs?add=not-a-link` and `/jobs?add=ftp%3A%2F%2Fx` open no dialog and remove `add`.
- All web tests, typecheck and lint pass.

**Out of scope:** the extension, the API, other pages.

## Task 6: Web — sign-in returns to the page that asked for it (from the whole-branch review)

---
files: [apps/web/src/auth/RequireAuth.tsx, apps/web/src/auth/LoginPage.tsx, apps/web/src/auth/auth.test.tsx]
new_files: []
deps: false
size: 60
---

**Goal:** **Paste it in Resumora** opens `<web>/jobs?add=<url>`; when the website is signed out, `RequireAuth` sends the user to `/login` and, after signing in, `LoginPage` always goes to `/cv`, so the link is lost (acceptance criterion 4). After this task, signing in returns to the page that was asked for, query string included.

- `RequireAuth`: `<Navigate to="/login" replace state={{ from: location }} />` with `location` from `useLocation()`.
- `LoginPage`: when signed in, navigate to `from.pathname + from.search` taken from `useLocation().state`, **only** when `from.pathname` is a string starting with `/` and not with `//`; otherwise `/cv` as today. Router state, never a URL parameter, so a link from outside can't choose the destination (no open redirect).
- Nothing else in sign-in, sign-up or password reset changes.

**Acceptance tests (`apps/web/src/auth/auth.test.tsx`):**
- Signed out at `/jobs?add=https%3A%2F%2Fexample.com%2Fjob%2F1` → the login page shows; after a successful sign-in the router is at `/jobs` with `add=https%3A%2F%2Fexample.com%2Fjob%2F1` in the query string.
- Signing in from `/login` opened directly → `/cv` as before.
- Router state `{ from: { pathname: "//evil.example" } }` → `/cv`.
- All existing auth and web tests pass.

**Out of scope:** the extension, the API, other auth flows.

## Task 7: Extension — supabase requests time out (from whole-branch review 2)

---
files: [apps/extension/src/auth.ts, apps/extension/src/auth.test.ts]
new_files: []
deps: false
size: 50
---

**Goal:** a stalled supabase request (token refresh during a save, or sign-in) can no longer leave the popup spinning: supabase-js has no request timeout, and `postJob`'s 20-second timeout only starts after `accessToken()` returns.

- `createAuth` passes supabase-js a `global.fetch` that wraps `deps.fetch ?? fetch` and aborts each request after 20,000 ms (`AbortSignal.timeout(20_000)`, combined with any signal the caller passed via `AbortSignal.any`). Export the constant `AUTH_TIMEOUT_MS = 20_000`.
- No other change: an aborted request already surfaces as a network failure, so `accessToken` gives `{ offline: true }` (session kept) and `signIn` gives the cant-reach text.

**Acceptance tests (`auth.test.ts`, fake timers):**
- A stored session with an expired access token and a fake `fetch` that never answers the refresh (it only rejects when its signal aborts) → `accessToken` resolves `{ offline: true }` after 20 s, and the key is kept.
- `signIn` with a fake `fetch` that never answers → after 20 s the result is `{ ok: false, message: "Can't reach Resumora. Is the app running?" }` on Local.
- All existing tests pass.

**Out of scope:** everything else.

---

## Task 8: Extension — saving calls fetch unbound (from manual checklist step 3)

---
files: [apps/extension/src/api.ts, apps/extension/src/api.test.ts]
new_files: []
deps: false
size: 20
---

**Goal:** in Chrome every save failed with "Can't reach Resumora" and no request reached the API. `postJob` calls `deps.fetch(url, …)`, so the native `fetch` runs with `this = deps` and Chrome throws `TypeError: Illegal invocation`, which the `catch` maps to `{ kind: "network" }`. Confirmed live: `({fetch}).fetch('/')` throws "Illegal invocation" in Chrome; a plain call works. Unit tests missed it because they pass `vi.fn()`.

- In `postJob`, take `fetch` out of `deps` into a local constant (`const { fetch: send } = deps;`) and call it as a plain function, `send(url, init)`. Nothing else changes.

**Acceptance tests (`api.test.ts`):**
- A fake `fetch` written as `function (this: unknown, …) { if (this !== undefined) throw new TypeError("Illegal invocation"); return Promise.resolve(new Response(JSON.stringify({ id: "j1" }), { status: 202 })); }` → `postJob` returns `{ kind: "saved", id: "j1" }` (not `network`).
- All existing tests pass.

**Out of scope:** everything else, including `background.ts` and `auth.ts`.

---

## Task 9: Extension — the popup opens on a Capture button (user request after checklist step 3)

---
files: [apps/extension/src/popup/popup.ts, apps/extension/src/popup/view.ts, apps/extension/src/popup/view.test.ts, apps/extension/src/popup/popup.css, apps/extension/src/copy.ts]
new_files: []
deps: false
size: 170   # raised from 140: two fix-round regression tests (popup state races), product code ~100 lines
---

**Goal:** opening the popup while signed in no longer saves at once. It shows the page and a **Capture** button; clicking it shows clear loading, then the existing result views. See the spec's "Extension popup" table (rows *Ready to capture* and *Capturing*) and rules, updated 2026-11-07.

- **New view `capture`** (replaces the signed-in use of `ready`): heading "Capture this job", a paragraph with the active tab's host + path, and a primary button **Capture**. Remove the `ready` view and its copy if nothing else uses it.
- **Popup start, signed in:** query the active tab (`chrome.tabs.query({ active: true, currentWindow: true })`). If its URL is `http:` or `https:` → the `capture` view. Otherwise → the existing `cantRead` view at once. No `saveActiveTab` message is sent until **Capture** is clicked.
- **After a successful sign-in:** the same choice (`capture` or `cantRead`) instead of the old Ready view.
- **Clicking Capture:** re-render the capture view with the button `disabled`, `aria-busy="true"`, containing the existing `.spinner` element and the text "Capturing…"; then send `saveActiveTab`. Show the result no earlier than **500 ms** after the click (wait for both the reply and a 500 ms timer). Keep the existing stale-response guard (the counter) so a late reply never overwrites a newer view. A failed or invalid reply shows the error view as today.
- **Try again** on the error view repeats the capture (same disabled button + spinner + 500 ms minimum), as `retry` does today.
- **CSS:** the spinner fits inside the button (about 14 px, inline, next to the text); a disabled button looks visibly disabled. Under `prefers-reduced-motion: reduce` the spinner doesn't rotate (as now), and the "Capturing…" text and disabled button still show.
- **Copy (`copy.ts`):** add `captureTitle: "Capture this job"`, `capture: "Capture"`, `capturing: "Capturing…"`; `saving` may be removed if unused. Result texts unchanged.

**Acceptance tests (`view.test.ts`, fake timers where timing matters):**
- Signed in, active tab `https://www.linkedin.com/jobs/view/123/` → shows "Capture this job", `www.linkedin.com/jobs/view/123/`, an enabled **Capture** button, and **no** `saveActiveTab` message was sent.
- Signed in, active tab `chrome://extensions/` → shows "Resumora can't read this kind of page." and no **Capture** button; no `saveActiveTab` sent.
- Click **Capture** → the button is disabled, has `aria-busy="true"`, contains a `.spinner` and "Capturing…", and exactly one `saveActiveTab` was sent; a second click while busy sends nothing more.
- The reply `{ kind: "saved", openUrl }` arrives after 50 ms → still "Capturing…" at 499 ms; "Saved" with **Open in Resumora** at 500 ms. A reply arriving after 800 ms shows "Saved" when it arrives.
- Error reply → "Not saved" + **Try again**; clicking **Try again** shows the busy button again and sends a second `saveActiveTab`.
- Sign-in success on an `https` tab → the Capture view (not "You're signed in"), no save sent.
- The existing tests for sign-in, environment switch, sign-out, expired sign-in and startup retry are updated only where they assumed save-on-open, and still pass. All other tests pass.

**Out of scope:** `background.ts`, `save.ts`, `handler.ts`, the web app (including the Add a job dialog wording), and any change to the result views' texts.

---

## Task 10: Extension — check the page on open; warn when it isn't a job ad (from checklist step 6)

---
files: [apps/extension/src/job-check.ts, apps/extension/src/job-check.test.ts, apps/extension/src/save.ts, apps/extension/src/save.test.ts, apps/extension/src/messages.ts, apps/extension/src/handler.ts, apps/extension/src/handler.test.ts, apps/extension/src/popup/popup.ts, apps/extension/src/popup/view.ts, apps/extension/src/popup/view.test.ts, apps/extension/src/popup/popup.css, apps/extension/src/copy.ts]
new_files: [apps/extension/src/job-check.ts, apps/extension/src/job-check.test.ts]
deps: false
size: 280
---

**Goal:** `https://example.com` (917 characters of a multilingual notice) passed the 200-character rule, was saved, and only the server's AI said "doesn't look like a job posting". The popup must tell the user up front. See the spec's "Extension popup" table (rows *Checking*, *Ready to capture*, *Not a job ad*) and the rules *Capture is explicit* and *The job check*, updated 2026-11-07.

- **`job-check.ts`** exports a pure `looksLikeJob(read: ReaderResult): boolean`. True if any of:
  1. any `jsonLd` item (including inside `@graph` arrays, and `@type` given as a string or an array) has type `JobPosting`;
  2. the URL host is a known job site: `linkedin.com` with a path starting `/jobs/`, or a host equal to or ending in `.` + one of `greenhouse.io`, `lever.co`, `myworkdayjobs.com`, `ashbyhq.com`, `smartrecruiters.com`, `workable.com`, `recruitee.com`, `teamtailor.com`, `personio.de`, `personio.com`, `bamboohr.com`, `ejobs.ro`, `bestjobs.eu`, `hipo.ro`; or `indeed.com` with a path starting `/viewjob` or `/rc/clk`;
  3. at least **2 job signals**, where each distinct phrase below found in `pageText` counts 1 (case-insensitive; compare with diacritics removed, so `cerințe` matches `cerinte`), and a URL path containing a segment `job`, `jobs`, `career`, `careers`, `cariere`, `vacancy`, `vacancies`, `position`, `positions` or `posting` counts 1. English: `responsibilities`, `requirements`, `qualifications`, `apply now`, `apply for this`, `benefits`, `full-time`, `full time`, `part-time`, `salary`, `job description`, `about the role`, `what you'll do`, `what you will do`, `years of experience`, `we offer`. Romanian: `responsabilitati`, `cerinte`, `aplica`, `beneficii`, `norma intreaga`, `salariu`, `descrierea jobului`, `oferim`, `experienta`.
  Keep the lists as two exported constant arrays at the top of the file.
- **`save.ts`:** add `checkActiveTab(): Promise<CheckResult>` next to `saveActiveTab`, using the same deps: non-`http(s)` tab or a reader failure → `{ kind: "cantRead" }`; trimmed text under 200 → `{ kind: "couldntRead", pasteUrl }` (same URL as the save path); `looksLikeJob` false → `{ kind: "notJob" }`; otherwise `{ kind: "capture" }`. It never calls auth or the API. `saveActiveTab` is unchanged (Capture anyway relies on it not checking).
- **`messages.ts`:** add request `{ type: "checkActiveTab" }` and `export type CheckResult = { kind: "capture" } | { kind: "notJob" } | { kind: "couldntRead"; pasteUrl: string } | { kind: "cantRead" }`. **`handler.ts`:** route it to `saver.checkActiveTab()`.
- **Popup:** where Task 9 shows the capture view after `tabs.query` (on start and after sign-in, i.e. `showState`), first show a new `checking` view (the existing `.spinner` + "Checking this page…"), send `checkActiveTab`, then show: `capture` → the existing capture view (host + path); `notJob` → a new `notJob` view; `couldntRead` / `cantRead` → the existing views. An invalid reply or a thrown send → the error view. Use the same version guard so a late check reply never overwrites a newer view.
- **New `notJob` view:** heading "This doesn't look like a job ad", paragraph "Resumora can only read job ads. If this is one, you can still capture it.", and a button **Capture anyway** styled as a text link (class `link-button`). Clicking it runs exactly the Task 9 capture (busy state with spinner + "Capturing…", 500 ms minimum, then the result).
- **Copy:** `checking: "Checking this page…"`, `notJobTitle`, `notJobText`, `captureAnyway: "Capture anyway"`.

**Acceptance tests:**
- `job-check.test.ts`: example.com-like text (English + Arabic + Chinese "This domain is for use in documentation examples without needing permission…", 900+ characters, URL `https://example.com/`) → false. JSON-LD `JobPosting` (top-level, in `@graph`, and `@type: ["JobPosting"]`) → true. `https://boards.greenhouse.io/acme/jobs/1` with no keywords → true. `https://www.linkedin.com/jobs/view/1/` → true. A company page `https://acme.example/careers/data-engineer` whose text has "requirements" → true (path + 1 word). Text with "Cerințe" and "Beneficii" on `https://firma.example/` → true. Text with only "salary" on `https://news.example/article` → false.
- `save.test.ts`: `checkActiveTab` returns `cantRead` for `chrome://extensions/`, `couldntRead` for short text, `notJob` for the example.com fixture, `capture` for a JSON-LD job page; auth and fetch are never called.
- `handler.test.ts`: `checkActiveTab` is routed to the saver.
- `view.test.ts`: signed in on an `https` tab → "Checking this page…" first, then the capture view after a `{ kind: "capture" }` reply; a `{ kind: "notJob" }` reply → the heading, the text, and a **Capture anyway** button, with no `saveActiveTab` sent; clicking **Capture anyway** → busy state, one `saveActiveTab`, result after 500 ms; `couldntRead` reply → **Paste it in Resumora**; a late check reply after the user switched environment does not overwrite the newer view. Task 9 tests are updated only where they now need the check reply first. All other tests pass.

**Out of scope:** `background.ts` (the saver is already wired with `runReader`), the readers themselves, the API, the web app.

---

## Task 11: Extension — reopening the popup during a capture joins it (from whole-branch review 4)

---
files: [apps/extension/src/save.ts, apps/extension/src/save.test.ts, apps/extension/src/messages.ts, apps/extension/src/popup/popup.ts, apps/extension/src/popup/view.test.ts]
new_files: []
deps: false
size: 70
---

**Goal:** the popup closes when the user clicks elsewhere. If it is reopened while a capture for the same environment + tab is still running, `checkActiveTab` runs and the popup shows **Capture**, so the running capture's result (Saved / error) is never shown. Before Task 9, reopening joined the running save (the saver keeps `running` per `env:tabId`).

- **`save.ts`:** at the start of `checkActiveTab`, after resolving the active tab and environment, if `running` has an entry for the same `env:tabId` key, return `{ kind: "capturing" }` without reading the page.
- **`messages.ts`:** add `{ kind: "capturing" }` to `CheckResult`.
- **Popup:** on a `capturing` check reply, show the Task 9 busy capture view (disabled button, spinner, "Capturing…") and send `saveActiveTab`, which returns the running promise; show its result exactly as a normal capture does (500 ms minimum, same version guard). Use the page host + path the popup already has for the view.

**Acceptance tests:**
- `save.test.ts`: while a `saveActiveTab` for the tab is pending, `checkActiveTab` returns `{ kind: "capturing" }` and does not run the reader again; after it settles, `checkActiveTab` returns the normal result.
- `view.test.ts`: a `{ kind: "capturing" }` check reply → the busy capture view and exactly one `saveActiveTab`; its `{ kind: "saved" }` reply → "Saved" (after the 500 ms minimum).
- All other tests pass.

**Out of scope:** everything else.

---

## Task 12: Extension — joining a capture never starts a new save (from whole-branch review 5)

---
files: [apps/extension/src/save.ts, apps/extension/src/save.test.ts, apps/extension/src/messages.ts, apps/extension/src/handler.ts, apps/extension/src/handler.test.ts, apps/extension/src/popup/popup.ts, apps/extension/src/popup/view.test.ts]
new_files: []
deps: false
size: 80
---

**Goal:** after Task 11, a reopened popup gets `{ kind: "capturing" }` and then sends `saveActiveTab`. If the original capture settles between those two messages, `saveActiveTab` starts a second save: a second POST, and the popup shows "Already in Resumora" instead of "Saved", without a new Capture click.

- **`messages.ts`:** add request `{ type: "joinCapture" }`.
- **`save.ts`:** keep the last settled result per `env:tabId` key (set when the running promise settles; replaced when a new save for that key starts). Add `joinCapture(): Promise<SaveResult>`: resolve the active tab and environment like `saveActiveTab`; if a save for the key is running, return that promise; else if a last result exists for the key, return it; else return `{ kind: "error", message: copy.somethingWrong, requestId: null }`. It never reads the page, calls auth or posts.
- **`handler.ts`:** route `joinCapture` to `saver.joinCapture()`.
- **Popup:** on a `capturing` check reply, send `joinCapture` instead of `saveActiveTab`; everything else (busy view, 500 ms minimum, version guard, result display) stays as in Task 11.

**Acceptance tests:**
- `save.test.ts`: while a save is pending, `joinCapture` returns the same result as the pending save and the fetch mock is called once in total; after the save settled, `joinCapture` returns that settled result and fetch is still called once; with no save ever made for the tab, `joinCapture` returns the error result and never calls the reader or fetch.
- `handler.test.ts`: `joinCapture` is routed to the saver.
- `view.test.ts`: a `capturing` check reply → exactly one `joinCapture` and no `saveActiveTab`; its `saved` reply → "Saved" after the 500 ms minimum.
- All other tests pass.

**Out of scope:** everything else.

---

## Task 13: Extension — captures are keyed by page, not only by tab (from whole-branch review 6)

---
files: [apps/extension/src/save.ts, apps/extension/src/save.test.ts]
new_files: []
deps: false
size: 50
---

**Goal:** the saver keys `running` (and Task 12's last results) by `env:tabId`. If the user starts a capture, navigates the same tab to another job before it settles, and reopens the popup, `checkActiveTab` reports `capturing` and `joinCapture` returns the previous job's result ("Saved") while the current job is unsaved. The same happens on LinkedIn search results, where only `currentJobId` in the URL changes.

- In `save.ts`, build the key from the environment, the tab id **and the tab's URL** as returned by `activeTab()` (e.g. `` `${env.id}:${tab.id}:${tab.url}` ``), and use that one key for `running`, the last results, `checkActiveTab` and `joinCapture`. Nothing else changes.

**Acceptance tests (`save.test.ts`):**
- A save for tab 1 at URL A is pending; the active tab becomes tab 1 at URL B → `checkActiveTab` does not return `capturing` (it reads the page and returns the normal result), and `joinCapture` returns the error result without touching the reader or fetch.
- Same tab and same URL → still `capturing`, and `joinCapture` returns the pending result (Task 12 behaviour unchanged).
- Two `saveActiveTab` calls for the same tab at URLs A and B start two separate saves (fetch called twice).
- All other tests pass.

**Out of scope:** everything else.

---

## After the build: manual checklist in Chrome (Claude with the user)

Not a Codex task. Claude runs it with the user through Claude in Chrome (the user's own Chrome), local first, then hosted. **The user does the steps only a person can:** loading the unpacked extension, clicking the toolbar icon (no tool can click it, and `activeTab` only grants access after that click), and typing their password into the popup. Claude prepares each page, tells the user exactly what to click, reads what the popup shows from the user's report or a screenshot, and checks the web side (the job in `/jobs`, its status reaching ready) in Chrome.

Setup (user): `supabase start`, `npm run dev`, `apps/extension/.env` filled from `.env.example`, `npm run build -w apps/extension` in the worktree, load `dist` unpacked.

Then the spec's checklist, steps 1–10, recording each result (pass / fail + what was seen) in `docs/plans/2026-11-06-job-extension.progress.md`. A failed step becomes a fix task in this plan (Codex builds it), then the step is repeated. The LinkedIn steps (3, 4) also confirm the reader selectors on live pages.
