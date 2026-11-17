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

- Later the same day the owner set the remaining Worker secrets (AI keys and model names, `SUPABASE_SERVICE_ROLE_KEY`)
  and, by their account, the Site URL and Redirect URLs in Supabase Authentication.

## Hosted database brought up to date on 2026-11-16
- Migrations 20261108000000 to 20261112000100 are applied; `supabase db push --remote --dry-run` reports up to date (24 in all).
- One manual repair: `20261108030000_cv_photos.sql` failed because a `cv-photos` bucket from 2026-10-29 (before the
  rebuild) already existed. The bucket was updated to the migration's settings (private, 2 MB, jpeg/png/webp), the
  four "own cv photos" policies were created by hand, and the migration was marked applied with
  `supabase migration repair`. The migration file is unchanged. The one old file in that bucket was left in place.

## Tested on https://resumora.pages.dev (owner's account, Chrome) on 2026-11-16
- CV import of `cv-weak-en.pdf`: 3 roles found in about 8 seconds, on the Workers Free plan.
- Job added by hand, analysed and scored (match 46 of 100).
- Tailoring: language and keyword steps, first role question generated.
- Not tested: sign-up of a new account, password-reset email, export, photo upload, voice, the extension, large CV files.

## Published from main on 2026-11-17 (owner asked)
- Pull requests 64 (go-live) and 65 (phones) merged; main at `6905c78`. `npm run typecheck`, `npm run lint` and
  `npm test` pass on that commit.
- Hosted database: `20261117000000_enrich_path_ai_tasks.sql` applied; `supabase db push --remote --dry-run` reports
  up to date (25 in all).
- Worker `resumora-api` and the Pages project `resumora` published from `6905c78`. The live site now equals main.
  This replaces the two publishes of the night before, which were local merges on no branch (`0321353`, `f09b746`;
  see the mobile-fluid and company-guess progress files).
- Tested on the live site (owner's account, Chrome): import of `cv-weak-en.pdf`, the enrichment start screen, the
  companies step, the tools step and question 1 of 8. `ai_calls` has rows for `enrich_companies` and `enrich_tools`.
- Seen in `ai_calls` during that test: the first `enrich_tools` call (OpenRouter, google/gemini-3.1-flash-lite)
  failed with HTTP 400 and the OpenAI fallback answered; one `enrich_score` call got HTTP 429 and the others passed.
- Not tested: questions 2 to 8 and the review step on the live site, the phone changes on a real phone.

## Open (owner)
- The first `enrich_tools` call is rejected by OpenRouter (HTTP 400) and only works through the fallback. Seen once.
- The extension starts on the Local environment; live users have to switch to Hosted.
- Supabase's built-in email sender only sends a few emails per hour.
- Larger CV files may still exceed the Workers Free CPU limit (10 ms per request); only a 63 KB PDF was tried.
