# Go live on Cloudflare Pages: progress

No plan file: one task, asked for directly by the owner on 2026-11-16.

## Task 1: Website on Cloudflare Pages forwards API requests to the Worker — done
session: Go live on Cloudflare Pages · builder: claude
commit: 3f9ca00 (base 2e3f988) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

## Published on 2026-11-16 (from this branch)
- Queues `resumora-imports` and `resumora-jobs` created; Worker `resumora-api` deployed.
- Pages project `resumora` created and deployed: https://resumora.pages.dev (`/v1/*` reaches the Worker).
- Worker secrets set: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_ORIGIN` (public values).

## Open (owner)
- Worker secrets still missing: the AI keys and model names, `SUPABASE_SERVICE_ROLE_KEY`.
- Hosted database: 13 migrations waiting (20261108000000 to 20261112000100), not applied.
- Supabase Authentication: Site URL and Redirect URLs still point at the local address.
- Not tested end to end on the live site yet. CV import may exceed the Workers Free CPU limit (10 ms per request).
- The extension starts on the Local environment; live users have to switch to Hosted.
