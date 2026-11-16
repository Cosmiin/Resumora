# Resumora

Build one strong CV, then tailor it to every job you apply for.

- **My CV** — import your existing CV (PDF or Word), review it, edit it with live preview.
- **Improve with AI** — answer a few questions per role and get stronger bullet points.
- **Tailor to a job** — a browser extension captures a job page; Resumora scores your CV against it and proposes a tailored version you accept item by item.
- **Export** — clean templates, PDF download.

> This branch is a lean rebuild. See the [design](docs/superpowers/specs/2026-11-04-rebuild-design.md) and the [audit](docs/audit-2026-11-04.md) that led to it.

## Quick start

Prerequisites: Node 26 LTS, Docker Desktop, Supabase CLI.

```sh
npm install
npm run db:start          # local Supabase (prints URL + keys)
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env.local
# fill both with the values from `supabase status`
npm run dev               # API on :8788, web on :5173
```

Open http://127.0.0.1:5173.

### CV import (AI)

Import reads the uploaded PDF or Word file and uses AI to organize it. Add to `apps/api/.dev.vars`:

- `SUPABASE_SERVICE_ROLE_KEY`: the service role key from `supabase status` (used only by the import worker).
- `OPENROUTER_API_KEY` + `OPENROUTER_MODEL`, and/or `OPENAI_API_KEY` + `OPENAI_MODEL`. OpenRouter is tried first and OpenAI if it fails. Pick models that support structured output (JSON schema).

After pulling a change to the CV format, run `npm run db:reset` (local data is test data until launch).

## Checks

```sh
npm run lint && npm run typecheck && npm test
npm run db:test           # database tests (needs db:start)
```

## Going live

The live site is https://resumora.pages.dev. It has three parts: the website on Cloudflare Pages (project `resumora`), the API as a Cloudflare Worker (`resumora-api`, with the queues `resumora-imports` and `resumora-jobs`), and the hosted Supabase project.

The browser only talks to the website's address: `apps/web/functions/v1` forwards every `/v1/*` request to the Worker through the `API` binding in `apps/web/wrangler.jsonc`.

Publish in this order, from a checkout of `main`:

```sh
npx supabase db push --remote --dry-run       # database: lists new migrations; drop --dry-run to apply (needs `supabase link`)
(cd apps/api && npx wrangler deploy)          # API

# Website. The values below are public browser values (hosted Supabase URL and anon key).
export VITE_SUPABASE_URL=https://<project>.supabase.co VITE_SUPABASE_ANON_KEY=<anon key>
export VITE_HOSTED_SUPABASE_URL=$VITE_SUPABASE_URL VITE_HOSTED_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
export VITE_HOSTED_WEB_URL=https://resumora.pages.dev VITE_HOSTED_API_URL=https://resumora.pages.dev
npm run package -w @resumora/extension        # the extension download offered by the site
npm run build -w apps/web
(cd apps/web && npx wrangler pages deploy --branch main)
```

Shell variables win over `apps/web/.env.local`, so a local file never leaks into a live build.

The Worker reads its settings (the names in `apps/api/.dev.vars.example`) from Worker secrets: set them with `npx wrangler secret put <NAME>` in `apps/api`. `APP_ORIGIN` is the website's address. They survive later deploys.

See [AGENTS.md](AGENTS.md) for conventions.
