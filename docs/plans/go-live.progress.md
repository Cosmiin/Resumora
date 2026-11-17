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

## Open (owner)
- The extension starts on the Local environment; live users have to switch to Hosted.
- Supabase's built-in email sender only sends a few emails per hour.
- Larger CV files may still exceed the Workers Free CPU limit (10 ms per request); only a 63 KB PDF was tried.
