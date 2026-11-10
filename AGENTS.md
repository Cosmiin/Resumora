# Resumora — guide for AI agents and contributors

CV builder: each user has one **My CV**; import PDF/DOCX, edit, improve with AI, tailor to jobs, export PDF.
Design: `docs/superpowers/specs/2026-11-04-rebuild-design.md`. Current plan: `docs/superpowers/plans/`.

## Stack
- `packages/shared` — zod schemas + types shared by web, API and extension (`CvContentSchema`, API responses)
- `apps/api` — Cloudflare Worker (Hono), run locally with `wrangler dev` on :8788
- `apps/web` — React 19 + Vite SPA on :5173 (React Router, TanStack Query); proxies `/v1` to the API
- `supabase/` — Postgres migrations, RLS, pgTAP tests; Supabase Auth + Storage
- Import: `POST /v1/imports` stores the file in the private `cv-imports` bucket and queues it (Cloudflare Queue `resumora-imports`, simulated by `wrangler dev`). The same Worker consumes it: `apps/api/src/imports/` (text → "is this a CV?" → extraction → `toCvContent`). The **import rules** (skill groups, word-for-word copying, dates, names) live in `apps/api/src/imports/prompts.ts`.
- AI: every model call goes through `apps/api/src/ai/call-model.ts` (OpenRouter, then OpenAI) and is logged to `ai_calls`.
- Auth: browser signs in with supabase-js and sends `Authorization: Bearer <jwt>`; the API queries Supabase as that user (RLS)

## Run
- Prereqs: Node 26 LTS (`.nvmrc`), Docker Desktop, Supabase CLI
- `npm install` · `npm run db:start` · copy `apps/api/.dev.vars.example` → `.dev.vars` and `apps/web/.env.example` → `.env.local` with values from `supabase status`
- `npm run dev` (API + web) · open http://127.0.0.1:5173

## Check before committing
`npm run lint && npm run typecheck && npm test` (+ `npm run db:test` for SQL changes)

## Conventions
- Plain words in code, tests and commits: "version check", "request id", "timeout". Never "fence", "receipt", "settlement", "provenance", "lease".
- Saving: last save wins, but `PUT` sends the version it started from; mismatch → 409 and the UI warns.
- Errors: `{ error: { code, message, requestId } }`; every 5xx is logged with its request id.
- UI strings go in `apps/web/src/i18n/en.ts`.
- Skills are three groups: `technicalSkills`, `professionalSkills`, `unclearSkills` (to be sorted by the user). Never merge them back into one list.
- Only the import queue consumer and the `ai_calls` log use `SUPABASE_SERVICE_ROLE_KEY`; request handlers always query as the user.
- New DB change = new migration file; never edit an applied one.
- Test behaviour a user or API client can see (happy path + realistic failures). No tests for tooling or timing permutations.
- Keep files focused (< ~300 lines). Prefer editing an existing module over adding a new layer.
- Conventional commits, one-line subject: `feat(api): ...`, `fix(web): ...`.

## Keep it small
- Build the smallest change that does what the task asks. No helpers, options, layers, abstractions or files the task doesn't need, and no refactors on the side.
- Find the closest existing code that does something similar and follow its pattern.

## Test only as much as the change needs
- Text, styling, translation, docs and config changes need no new tests: the typecheck is enough.
- For a small behaviour change, one test of the main case is usually enough. Add more only for logic, data, database rules and shared code, and only for failures that can really happen.
- While working, run the tests that cover what you changed (`npx vitest related --run <files>` inside the package), not the whole suite. The full suite runs once before merging.

## Known traps
- Run `npm run typecheck` after changing a shared or API type: the unit tests miss type errors.
- Never run `npm run db:reset` or `supabase migration down` on a local database you need: both wipe its data. Apply new migrations with `npx supabase migration up`.
- To change an SQL function's signature, drop the old function first (Postgres keeps both as overloads), then grant execute again.
- When saving an item, cancel its pending detail queries too, not only the list query: a late refetch can overwrite what was just saved.
- When a background refetch fails, keep the cached content on screen; show an error state only when there's no cached data.
- Don't navigate away or reload while an autosave or reload is pending: unmounting clears the save timer, and a late reload can close a form the user just reopened.
- Paginate, or state a cap for, any list that grows: PostgREST's `max_rows = 1000` silently cuts longer results.
- Give each auth request a timeout and the whole session lookup one too: Supabase retries token refreshes, so per-request timeouts alone can add up to a hang.
- Editor typing tests can time out when another test run is using the machine. Rerun once before treating a failure as a regression.

## Architecture companion
The owner doesn't write code and learns the architecture through the `/architecture` panel, which reads these files:
- **Decision records** (`docs/decisions/NNNN-short-title.md`, format in `docs/superpowers/specs/2026-11-04-architecture-companion-design.md`): add one when you make an architectural choice (new table, route, service, changed security rule, new dependency with a structural role). Fill `affects` with real names (`table:x`, `route:/v1/x`, `file:path`). If it replaces one, set the old one's `status: replaced-by-NNNN`.
- **Concept cards** (`docs/learning/concepts/<id>.md`) and **progress** (`docs/learning/progress.json`): when your work touches a concept, read its `seen` count and teach by it, then add 1 and set `lastSeen` (at most once per concept per day):
  - 0 → write the card if missing; give the full explanation
  - 1 → a one-sentence reminder plus where it appears this time
  - 2 → a new angle: how it connects to a related card
  - 3 → ask the card's check question; reveal the answer when asked
  - 4 → tell them it's now learned ✓ and link the card from then on
- Explain in plain words; jargon only when it's the concept being taught.
