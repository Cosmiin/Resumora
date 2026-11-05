# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clean, running Resumora skeleton on which a signed-in user edits **My CV** with autosave, a "saved in another tab" warning, and version history, fully local.

**Architecture:** npm workspaces with `packages/shared` (zod CV schema), `apps/api` (Hono on Cloudflare Workers via `wrangler dev`, verifying Supabase JWTs and querying Supabase as the user so RLS applies) and `apps/web` (Vite + React SPA using `supabase-js` for auth). Local Supabase via the Supabase CLI.

**Tech Stack:** Node 24 LTS, TypeScript 5.9, zod 4, Hono 4, wrangler 4, @supabase/supabase-js 2, React 19, Vite, React Router 7, TanStack Query 5, Vitest, Testing Library, ESLint 9 + eslint-plugin-react-hooks, pgTAP (via `supabase test db`).

**Spec:** [docs/superpowers/specs/2026-11-04-rebuild-design.md](../specs/2026-11-04-rebuild-design.md)

## Prerequisites (owner installs once, outside the plan)
- Node 24 LTS (e.g. `winget install OpenJS.NodeJS.LTS`), then `node --version` → `v24.x`.
- Docker Desktop (running), then Supabase CLI (`npm i -g supabase` or `scoop install supabase`), then `supabase --version`.
- Wrangler is a dev dependency of `apps/api`; no global install needed.

## Global Constraints
- Branch `rebuild/foundation`; `main` is never modified. Old code is read with `git show main:<path>`.
- Install exact versions (`.npmrc`: `save-exact=true`; no `engine-strict`). `.nvmrc`: `24`.
- Ports: web `http://127.0.0.1:5173`, API `http://127.0.0.1:8788`, Vite proxies `/v1` and `/health` to the API.
- Secrets only in `apps/api/.dev.vars` (ignored) and `apps/web/.env.local` (ignored, public values only: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Both have committed `*.example` files.
- Error body shape everywhere: `{ "error": { "code": string, "message": string, "requestId": string } }`.
- CV limits: strings ≤ 2,000 chars, `basics.summary` and `projects[].description` ≤ 4,000, lists ≤ 40 items, bullets ≤ 20 per experience, serialized body ≤ 256 KB (`413 content_too_large`).
- History: snapshot on restore and at most once per 10 minutes during saves; keep newest 50 per user.
- UI strings live in `apps/web/src/i18n/en.ts`; components call `t("key")`.
- Plain naming: no "fence", "receipt", "settlement", "provenance", "lease" in code, tests or commits.
- Conventional commit subjects, one line, e.g. `feat(api): add PUT /v1/cv with version check`.

## Review Focus
1. Typing while a save is in flight → saves are serialized and each uses the version returned by the previous save; the user never gets a 409 caused by their own tab. (Task 6, `serializes saves`.)
2. Access token expires mid-session → API returns 401, client refreshes the session once and retries; only a second 401 signs the user out. (Task 5, `retries once after refresh`.)
3. Oversized CV (> 256 KB) → `413 content_too_large`, nothing saved, UI shows a readable message. (Task 4, `rejects oversized content`.)
4. Content failing the schema (e.g. 41 experiences) → `400 invalid_content` with the first failing path in `message`, nothing saved. (Task 4, `rejects invalid content`.)
5. Closing the tab with unsaved edits → browser "leave site?" prompt while dirty or saving; none when saved. (Task 6, `warns before unload when dirty`.)

---

## File Structure
```
package.json, tsconfig.base.json, .nvmrc, .npmrc, .gitignore, eslint.config.js
AGENTS.md, README.md
packages/shared/  src/cv.ts (schema, types, emptyCv, newId), src/api.ts (response schemas), src/index.ts
supabase/         config.toml, migrations/20261104000000_baseline.sql, tests/database/baseline.test.sql, seed.sql
apps/api/         wrangler.jsonc, .dev.vars.example, src/index.ts (worker entry), src/app.ts (createApp),
                  src/errors.ts, src/auth.ts, src/cv/repo.ts (interface + memory impl), src/cv/supabase-repo.ts,
                  src/cv/routes.ts, test/*.test.ts
apps/web/         index.html, vite.config.ts, .env.example, src/main.tsx, src/router.tsx, src/i18n/en.ts,
                  src/lib/supabase.ts, src/lib/api.ts, src/auth/AuthProvider.tsx, src/auth/LoginPage.tsx,
                  src/auth/RequireAuth.tsx, src/cv/useMyCv.ts, src/cv/useAutosave.ts, src/cv/Editor.tsx,
                  src/cv/sections/*.tsx, src/cv/ConflictBanner.tsx, src/cv/HistoryDrawer.tsx,
                  src/styles/tokens.css (ported), src/styles/app.css, src/**/*.test.tsx
```

---

### Task 1: Clean slate, workspace and shared CV schema

**Files:**
- Delete: everything tracked except `docs/audit-2026-11-04.md`, `docs/superpowers/**`, `.github/` (rewritten below), `LICENSE` if present.
- Create: root files listed above, `packages/shared/{package.json,tsconfig.json,src/cv.ts,src/api.ts,src/index.ts}`
- Create: `.github/workflows/ci.yml` (Node 24: `npm ci && npm run lint && npm run typecheck && npm test`)
- Test: `packages/shared/src/cv.test.ts`

**Interfaces:**
- Produces (from `@resumora/shared`):
  - `CvContentSchema` (zod), `type CvContent = z.infer<typeof CvContentSchema>`
  - `emptyCv(locale?: "en" | "ro"): CvContent`
  - `newId(): string` (wraps `crypto.randomUUID()`)
  - `MAX_CV_BYTES = 256 * 1024`
  - `CvResponseSchema` = `{ content: CvContent, version: number, updatedAt: string }`, `type CvResponse`
  - `HistoryItemSchema` = `{ id: string, reason: "autosave" | "restore" | "import" | "ai", createdAt: string }`, `type HistoryItem`
  - `ErrorBodySchema` = `{ error: { code: string, message: string, requestId: string } }`
- Root scripts: `dev` (`concurrently -n api,web "npm run dev -w apps/api" "npm run dev -w apps/web"`), `test` (`npm test --workspaces --if-present`), `typecheck`, `lint`, `build`, `db:start` (`supabase start`), `db:reset` (`supabase db reset`), `db:test` (`supabase test db`).

- [ ] **Step 1:** `git rm -r -q` the old tree (keep the paths above), commit `chore: clear old implementation (kept on main)`.
- [ ] **Step 2:** Create root workspace files and `packages/shared` package (`"name": "@resumora/shared"`, `"type": "module"`, `"main": "src/index.ts"`, vitest as dev dependency). Run `npm install`. Expected: no errors.
- [ ] **Step 3: Write the failing tests** in `cv.test.ts`:
  - `emptyCv parses`: `CvContentSchema.parse(emptyCv())` does not throw; `emptyCv().schemaVersion === 1`; `emptyCv("ro").locale === "ro"`.
  - `rejects too many experiences`: 41 items → `safeParse(...).success === false` and the issue path starts with `["experience"]`.
  - `rejects too many bullets`: one experience with 21 bullets → fails.
  - `rejects bad dates`: `startDate: "2024-13"` and `"24-01"` fail; `"2024-01"` and `""` pass.
  - `rejects long summary`: 4,001 chars fails, 4,000 passes.
  - `newId is unique`: 100 calls → 100 distinct values.
- [ ] **Step 4:** Run `npm test -w packages/shared`. Expected: FAIL (module not found).
- [ ] **Step 5:** Implement `cv.ts` and `api.ts` per the Interfaces block and the spec's CV content shape. `YearMonth` = `z.string().regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/)`. All objects `.strict()`.
- [ ] **Step 6:** Run `npm test -w packages/shared && npm run typecheck`. Expected: PASS.
- [ ] **Step 7:** Write `AGENTS.md` (≤ 30 lines: stack, prerequisites, `npm run db:start`, `npm run dev`, where things live, testing policy and naming rule from Global Constraints) and `README.md` (what Resumora is, quick start, link to spec). Commit `feat(shared): add CV schema and workspace skeleton`.

### Task 2: Database baseline

**Files:**
- Create: `supabase/config.toml` (via `supabase init`, then set `[auth] site_url = "http://127.0.0.1:5173"`, `additional_redirect_urls = ["http://127.0.0.1:5173/**"]`, `[auth.email] enable_confirmations = false` for local)
- Create: `supabase/migrations/20261104000000_baseline.sql`
- Test: `supabase/tests/database/baseline.test.sql`

**Interfaces:**
- Produces tables `public.base_cvs`, `public.base_cv_versions`, `public.ai_calls` with columns from the spec; RLS enabled; policies `user_id = auth.uid()` for select/insert/update (no delete on `base_cvs`; `base_cv_versions` also allows delete so the security-invoker functions can trim to 50; `ai_calls` select-only for users).
- Produces function `public.save_base_cv(p_content jsonb, p_expected_version int) returns table(version int, updated_at timestamptz, conflict boolean)`, `security invoker`, `set search_path = ''`:
  - No row yet and `p_expected_version = 0` → insert with `version = 1`.
  - Row exists and `version = p_expected_version` → update content, `version + 1`, `updated_at = now()`; if the newest `base_cv_versions` row for the user is older than 10 minutes (or none) insert a snapshot with `reason = 'autosave'`; then delete snapshots beyond the newest 50.
  - Otherwise → return the current `version`, `updated_at`, `conflict = true`, change nothing.
- Produces function `public.restore_base_cv(p_version_id uuid, p_expected_version int)` with the same return shape; snapshots the current content with `reason = 'restore'` before replacing it.

- [ ] **Step 1: Write the failing pgTAP tests** (`begin; select plan(N); ... select * from finish(); rollback;`), creating two users in `auth.users` and switching with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'`:
  - first save with expected 0 returns `version = 1, conflict = false`;
  - save with expected 1 returns `version = 2`; save with expected 1 again returns `conflict = true` and content unchanged;
  - user B `select count(*) from base_cvs` → 0 while user A has a row; user B `save_base_cv` creates B's own row only;
  - two saves within 10 minutes create exactly 1 snapshot;
  - 55 snapshots inserted for A (with backdated `created_at`) then one save → 50 remain;
  - `restore_base_cv` sets content to the snapshot content, bumps version, adds a `restore` snapshot.
- [ ] **Step 2:** `npm run db:start && npm run db:test`. Expected: FAIL (relation does not exist).
- [ ] **Step 3:** Write the migration per Interfaces.
- [ ] **Step 4:** `npm run db:reset && npm run db:test`. Expected: all tests pass.
- [ ] **Step 5:** Commit `feat(db): add baseline schema with RLS and versioned save`.

### Task 3: API skeleton with auth and error handling

**Files:**
- Create: `apps/api/{package.json,tsconfig.json,wrangler.jsonc,.dev.vars.example}`, `src/index.ts`, `src/app.ts`, `src/errors.ts`, `src/auth.ts`
- Test: `apps/api/test/app.test.ts`

**Interfaces:**
- `.dev.vars.example`: `SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_ANON_KEY=<from supabase status>`, `APP_ORIGIN=http://127.0.0.1:5173`.
- `type Env = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; APP_ORIGIN: string }`
- `type AuthUser = { id: string; token: string }`
- `type AppDeps = { verifyToken(token: string): Promise<AuthUser | null>; cvRepo(user: AuthUser): CvRepo; log(entry: Record<string, unknown>): void }` (`CvRepo` from Task 4; until then the type is imported from `src/cv/repo.ts` stub).
- `createApp(deps: AppDeps): Hono` — middleware order: request id (`crypto.randomUUID()`, response header `x-request-id`), CORS for `APP_ORIGIN` only (needed later for the extension; same-origin via proxy locally), `/health` (public), `/v1/*` requires `Authorization: Bearer`.
- `class ApiError extends Error { constructor(status: number, code: string, message: string) }`; `app.onError` maps `ApiError` to its status, `ZodError` to `400 invalid_content`, anything else to `500 internal` and calls `deps.log({ level: "error", requestId, path, error: String(err), stack })`.
- `src/auth.ts`: `supabaseVerifier(env): AppDeps["verifyToken"]` using `createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY).auth.getClaims(token)`; returns `null` on any failure.
- `src/index.ts`: `export default { fetch: (req, env, ctx) => createApp(realDeps(env)).fetch(req, env, ctx) }`.

- [ ] **Step 1: Write the failing tests** using `app.request()` and fake deps:
  - `health is public`: `GET /health` → 200 `{ ok: true }`, has `x-request-id`.
  - `v1 requires a token`: `GET /v1/cv` without header → 401, body matches `ErrorBodySchema`, `code === "unauthorized"`.
  - `invalid token is rejected`: `verifyToken` returns null → 401.
  - `unexpected errors are logged`: a test-only route throwing `new Error("boom")` → 500 `code === "internal"`, `log` called once with `level: "error"` and the same `requestId` as the body.
- [ ] **Step 2:** `npm test -w apps/api`. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces. `npm run dev -w apps/api` = `wrangler dev --port 8788`.
- [ ] **Step 4:** `npm test -w apps/api`. Expected: PASS. Then with `.dev.vars` filled: `npm run dev -w apps/api` and `curl http://127.0.0.1:8788/health` → `{"ok":true}`.
- [ ] **Step 5:** Commit `feat(api): add worker skeleton with auth and error handling`.

### Task 4: My CV and history endpoints

**Files:**
- Create: `apps/api/src/cv/repo.ts`, `src/cv/supabase-repo.ts`, `src/cv/routes.ts`; modify `src/app.ts` to mount routes.
- Test: `apps/api/test/cv.test.ts` (memory repo), `apps/api/test/supabase-repo.test.ts` (runs only when `SUPABASE_TEST_URL` is set; uses local stack and a user created with `auth.admin` via the local service key from `supabase status`).

**Interfaces:**
- ```ts
  interface CvRepo {
    get(): Promise<{ content: CvContent; version: number; updatedAt: string }>;          // returns emptyCv() with version 0 if none
    save(content: CvContent, expectedVersion: number): Promise<SaveResult>;
    listHistory(): Promise<HistoryItem[]>;                                               // newest first
    getHistory(id: string): Promise<{ content: CvContent; createdAt: string } | null>;
    restore(id: string, expectedVersion: number): Promise<SaveResult>;
  }
  type SaveResult = { ok: true; version: number; updatedAt: string } | { ok: false; version: number; updatedAt: string };
  function memoryCvRepo(): CvRepo;                    // test double implementing the same rules as the SQL functions
  function supabaseCvRepo(env: Env, user: AuthUser): CvRepo;   // calls save_base_cv / restore_base_cv RPCs
  ```
- Routes: `GET /v1/cv` → `CvResponseSchema`. `PUT /v1/cv` body `{ content, version }` → 200 `{ version, updatedAt }` or 409 `{ error: { code: "version_conflict", ... }, current: { version, updatedAt } }`. `GET /v1/cv/history` → `{ items: HistoryItem[] }`. `GET /v1/cv/history/:id` → `{ content, createdAt }` or 404 `not_found`. `POST /v1/cv/history/:id/restore` body `{ version }` → same as PUT.
- Body size checked from `content-length` and the actual text length before parsing: > `MAX_CV_BYTES` → 413 `content_too_large`.

- [ ] **Step 1: Write the failing tests** (`cv.test.ts`):
  - `new user gets an empty CV`: GET → `version 0`, `content` equals `emptyCv()` apart from ids.
  - `save then load`: PUT version 0 → 200 version 1; GET returns the saved content and version 1.
  - `stale version conflicts`: PUT version 0 again → 409 `version_conflict`, `current.version === 1`.
  - `rejects invalid content`: 41 experiences → 400 `invalid_content`, `message` contains `experience`; a following GET is unchanged.
  - `rejects oversized content`: 300 KB body → 413 `content_too_large`.
  - `history restore`: after saves, `GET /history` lists items; restore with the current version → 200 and GET returns the snapshot content; restore with a stale version → 409.
  - `unknown history id`: → 404 `not_found`.
- [ ] **Step 2:** `npm test -w apps/api`. Expected: FAIL.
- [ ] **Step 3:** Implement repo interface, memory repo, routes (zod-validate with shared schemas), then `supabaseCvRepo`.
- [ ] **Step 4:** `npm test -w apps/api`. Expected: PASS. With local stack running: `SUPABASE_TEST_URL=http://127.0.0.1:54321 npm test -w apps/api` runs `supabase-repo.test.ts` (`save → get → conflict → restore` against real RPCs). Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): add My CV and history endpoints with version check`.

### Task 5: Web app shell with authentication

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,.env.example}`, `src/main.tsx`, `src/router.tsx`, `src/i18n/en.ts`, `src/lib/supabase.ts`, `src/lib/api.ts`, `src/auth/{AuthProvider.tsx,LoginPage.tsx,RequireAuth.tsx}`, `src/styles/{tokens.css,app.css}` (tokens from `git show main:apps/web/src/design/<file>.css`).
- Test: `src/lib/api.test.ts`, `src/auth/auth.test.tsx`

**Interfaces:**
- `t(key: keyof typeof en, vars?: Record<string, string | number>): string`
- `supabase` client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- `class ApiClientError extends Error { status: number; code: string; body: unknown }`
- `apiFetch<T>(path: string, init: RequestInit & { schema: z.ZodType<T> }): Promise<T>` — adds `Authorization: Bearer <session.access_token>`; on 401 calls `supabase.auth.refreshSession()` once and retries; second 401 → `supabase.auth.signOut()` and throws `ApiClientError(401, "unauthorized")`; non-2xx → `ApiClientError` with parsed error body; 2xx → `schema.parse(json)`.
- `useAuth(): { session: Session | null; loading: boolean; signIn(email, password); signUp(email, password); resetPassword(email); signOut() }`
- Routes: `/login`, `/reset-password`, `/` → redirect to `/cv`, `/cv` (protected; Task 6 fills it).

- [ ] **Step 1: Write the failing tests:**
  - `api.test.ts` (mock `fetch` and the supabase module): `adds bearer token`; `retries once after refresh` (401 then 200 → resolves, `refreshSession` called once); `signs out after second 401`; `maps error body` (409 body → `ApiClientError` with `code "version_conflict"`).
  - `auth.test.tsx`: `redirects to login when signed out` (render `/cv` → login heading visible); `shows readable error on wrong password` (signIn rejects with `Invalid login credentials` → text from `t("auth.wrongCredentials")`); `signed-in user sees the app`.
- [ ] **Step 2:** `npm test -w apps/web`. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces. Vite proxy `/v1` and `/health` → `http://127.0.0.1:8788`, `server.host = "127.0.0.1"`, `port 5173`. Add `eslint.config.js` rules `react-hooks/rules-of-hooks: error`, `react-hooks/exhaustive-deps: error`.
- [ ] **Step 4:** `npm test -w apps/web && npm run lint`. Expected: PASS. Manual: `npm run db:start && npm run dev`, sign up at `http://127.0.0.1:5173/login`, land on `/cv`.
- [ ] **Step 5:** Commit `feat(web): add app shell with Supabase sign-in`.

### Task 6: CV editor with autosave and conflict warning

**Files:**
- Create: `src/cv/useMyCv.ts`, `src/cv/useAutosave.ts`, `src/cv/Editor.tsx`, `src/cv/sections/{Basics,Experience,Education,Skills,Languages,Certifications,Projects}.tsx`, `src/cv/ConflictBanner.tsx`
- Test: `src/cv/useAutosave.test.ts`, `src/cv/editor.test.tsx`

**Interfaces:**
- `useMyCv(): UseQueryResult<CvResponse>` (key `["cv"]`).
- `type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict"`
- `useAutosave(opts: { initial: CvResponse; save(content: CvContent, version: number): Promise<{ version: number; updatedAt: string }>; delayMs?: number /* 1000 */ }): { content: CvContent; setContent(next: CvContent): void; status: SaveStatus; conflict: { version: number; updatedAt: string } | null; loadLatest(): Promise<void>; keepMine(): Promise<void> }`
  - Debounced: one save `delayMs` after the last change. At most one save in flight; changes during a save trigger one more save after it finishes, using the version that save returned.
  - 409 (`ApiClientError` with `code "version_conflict"`; `conflict` is taken from `err.body.current`) → `status "conflict"`, stop autosaving until the user picks. `loadLatest` refetches and replaces local content. `keepMine` re-sends local content with `conflict.version`.
  - Registers `beforeunload` (prevent default) while status is `dirty`, `saving` or `conflict`.
- `Editor` renders sections as plain controlled inputs; list sections support add / remove / move up / move down; new items get `newId()`.
- `ConflictBanner` text: `t("cv.conflict.title")` = "This CV was saved in another tab or device.", buttons "Load latest" / "Keep my version".
- Save status shown in the header: "Saved" / "Saving…" / "Unsaved changes" / "Couldn't save — retrying" (error retries after 5 s).

- [ ] **Step 1: Write the failing tests** (fake timers only in `useAutosave.test.ts`):
  - `saves once after typing stops`: 5 changes within 1 s → `save` called once with the last content.
  - `serializes saves`: change, advance 1 s (save A pending), change again, resolve A with version 2 → second save called with version 2; never two saves in flight.
  - `conflict pauses autosave`: save rejects with `ApiClientError(409)` → status `conflict`; further changes don't call `save`; `keepMine()` calls `save` with the conflict version.
  - `warns before unload when dirty`: dispatching `beforeunload` while dirty sets `defaultPrevented`; after saved it does not.
  - `editor.test.tsx`: `adds an experience and a bullet` (click "Add experience", type company, click "Add bullet", type → content has 1 experience with 1 bullet); `shows conflict banner` (save returns 409 → banner text visible; click "Load latest" → inputs show server content).
- [ ] **Step 2:** `npm test -w apps/web`. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** `npm test -w apps/web`. Expected: PASS. Manual: two tabs on `/cv`, edit in tab A, wait for "Saved", edit in tab B → banner appears in B.
- [ ] **Step 5:** Commit `feat(web): add CV editor with autosave and conflict warning`.

### Task 7: History drawer and end-to-end check

**Files:**
- Create: `src/cv/HistoryDrawer.tsx`; modify `src/cv/Editor.tsx` (header button "History").
- Test: `src/cv/history.test.tsx`

**Interfaces:**
- `HistoryDrawer({ open, onClose, currentVersion, onRestored(res: CvResponse): void })` — lists items (`GET /v1/cv/history`) with relative time and reason label; "Preview" loads `GET /v1/cv/history/:id` into a read-only summary (name, headline, experience titles); "Restore" calls `POST .../restore` with `currentVersion`, then refetches `["cv"]` and calls `onRestored`.

- [ ] **Step 1: Write the failing tests:** `lists versions newest first`; `restore replaces the editor content` (mock API: restore 200 → editor inputs show snapshot content, status "Saved"); `restore conflict shows banner` (restore 409 → conflict banner).
- [ ] **Step 2:** `npm test -w apps/web`. Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** Full check: `npm run lint && npm run typecheck && npm test && npm run db:test`. Expected: all pass, total test run under 30 s (excluding Supabase startup).
- [ ] **Step 5:** Manual end-to-end on a fresh stack (`npm run db:reset && npm run dev`): sign up → fill basics + one experience → reload page (content persists) → wait 10+ minutes or adjust a snapshot's `created_at` in Studio → edit → History shows 2 entries → restore older → content reverts.
- [ ] **Step 6:** Commit `feat(web): add version history with restore`. Open PR `rebuild/foundation` → `main` as draft (do not merge; `main` stays until the rebuild reaches parity).
