# Resumora — guide for AI agents and contributors

CV builder: each user has one **My CV**; import PDF/DOCX, edit, improve with AI, tailor to jobs, export PDF.
Design: `docs/superpowers/specs/2026-11-04-rebuild-design.md`. Current plan: `docs/superpowers/plans/`.

## Stack
- `packages/shared` — zod schemas + types shared by web, API and extension (`CvContentSchema`, API responses)
- `apps/api` — Cloudflare Worker (Hono), run locally with `wrangler dev` on :8787
- `apps/web` — React 19 + Vite SPA on :5173 (React Router, TanStack Query); proxies `/v1` to the API
- `supabase/` — Postgres migrations, RLS, pgTAP tests; Supabase Auth + Storage
- Auth: browser signs in with supabase-js and sends `Authorization: Bearer <jwt>`; the API queries Supabase as that user (RLS)

## Run
- Prereqs: Node 24 (`.nvmrc`), Docker Desktop, Supabase CLI
- `npm install` · `npm run db:start` · copy `apps/api/.dev.vars.example` → `.dev.vars` and `apps/web/.env.example` → `.env.local` with values from `supabase status`
- `npm run dev` (API + web) · open http://127.0.0.1:5173

## Check before committing
`npm run lint && npm run typecheck && npm test` (+ `npm run db:test` for SQL changes)

## Conventions
- Plain words in code, tests and commits: "version check", "request id", "timeout". Never "fence", "receipt", "settlement", "provenance", "lease".
- Saving: last save wins, but `PUT` sends the version it started from; mismatch → 409 and the UI warns.
- Errors: `{ error: { code, message, requestId } }`; every 5xx is logged with its request id.
- UI strings go in `apps/web/src/i18n/en.ts`.
- New DB change = new migration file; never edit an applied one.
- Test behaviour a user or API client can see (happy path + realistic failures). No tests for tooling or timing permutations.
- Keep files focused (< ~300 lines). Prefer editing an existing module over adding a new layer.
- Conventional commits, one-line subject: `feat(api): ...`, `fix(web): ...`.
- Old implementation lives on `main` for reference only: `git show main:<path>`.
