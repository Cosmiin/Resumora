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

## Checks

```sh
npm run lint && npm run typecheck && npm test
npm run db:test           # database tests (needs db:start)
```

See [AGENTS.md](AGENTS.md) for conventions.
