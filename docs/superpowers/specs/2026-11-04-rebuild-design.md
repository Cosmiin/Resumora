# Resumora rebuild — design

Status: agreed direction (4 Nov 2026). Source audit: [docs/audit-2026-11-04.md](../../audit-2026-11-04.md).

## Why
The current `main` (54k lines code, 41k lines tests, 71 tables) is built like a financial ledger
for a one-CV-per-user app. The guards are the main source of bugs and agent confusion, and a removal
migration actively forbids the job feature we need. We rebuild lean on a branch and port the good parts.

## Product (v1)
- Sign up / sign in / reset password (email + password).
- Upload a CV (PDF or DOCX) → AI extracts it → user reviews → it becomes **My CV**.
- Edit My CV in a form editor with live preview; autosave.
- **Improve with AI** per experience: questions → proposed bullets → accept / keep mine.
- Skills suggestions (non-blocking list the user accepts item by item).
- 1–2 templates, PDF export (browser print).
- Simple version history with restore.

Directly after v1: **job tailoring** (critical) + browser extension. Then Cloudflare deploy + Stripe.
Later: RO/EN language versions, photo, OCR for scanned PDFs, voice dictation.

## Decisions
| Topic | Decision |
|---|---|
| Strategy | Lean rebuild on branch `rebuild/*`; old code stays on `main` and is ported by copying specific files |
| Runtime | Node 24 LTS, npm workspaces |
| Frontend | React 19 + Vite, React Router, TanStack Query, Vitest + Testing Library, ESLint with `react-hooks` |
| API | Cloudflare Worker with Hono, run locally with `wrangler dev`; Cloudflare Queues for imports (later plan) |
| Database / auth / files | Supabase: local via Supabase CLI (Docker) for development; hosted project `aquvhqbkvrtzhbmezkci` later |
| Auth model | Browser signs in with `supabase-js`; sends `Authorization: Bearer <jwt>` to the Worker; Worker verifies with `supabase.auth.getClaims` and queries Supabase **as the user** so RLS applies. Same model works for the extension. No cookies/CSRF layer. |
| Validation | `zod` schemas in `packages/shared`, used by web, API and as JSON Schema for model output (`z.toJSONSchema`) |
| AI | One `callModel({ task, schema, messages })`: OpenRouter primary, OpenAI fallback; retry on 429/5xx/timeout/invalid JSON; every call logged to `ai_calls` |
| Concurrency | **Last save wins, but warn**: each CV row has `version int`. `PUT` sends the version it started from; mismatch → `409` → UI offers "Load latest" / "Keep mine" |
| History | Snapshot into `base_cv_versions` on import, before accepting AI changes, on restore, and at most once every 10 minutes during autosave. Keep the newest 50. |
| Tailored CVs | Own content row in `tailored_cvs`, linked to `job_id` and the `base_version` it was copied from |
| PDF export | Browser print with print CSS (free, no Browser Rendering dependency) |
| Copy | All UI strings in `apps/web/src/i18n/en.ts` via a tiny `t()`; Romanian file added with language versions |
| Language in code | Plain words: "version check", "request id", "timeout". Not "fence", "receipt", "settlement", "provenance". |

## Architecture
```
apps/web (Vite SPA) ──supabase-js──► Supabase Auth
      │  Bearer JWT
      ▼
apps/api (Hono Worker) ──user-scoped supabase client (RLS)──► Postgres + Storage
      │                └─ Queue consumer (imports) ──► OpenRouter / OpenAI
packages/shared  (zod schemas + types shared by web, api, extension)
apps/extension   (later: reads job page, POST /v1/jobs)
```

## CV content (`packages/shared/src/cv.ts`)
```ts
type YearMonth = string;               // "YYYY-MM", "YYYY" or ""
type CvContent = {
  schemaVersion: 1;
  locale: "en" | "ro";
  basics: { fullName; firstName; lastName; titles: string[] /* max 2 */;
            email; phone; location; website; linkedin; summary };                    // strings
  experience: { id; company; title; location; startDate: YearMonth; endDate: YearMonth;
                current: boolean; description; bullets: { id; text }[] }[];
  education: { id; school; degree; field; startDate: YearMonth; endDate: YearMonth; notes }[];
  technicalSkills:    { id; name }[];  // tools, software, languages, platforms, technologies
  professionalSkills: { id; name }[];  // work capabilities, domain expertise, interpersonal, self-management
  unclearSkills:      { id; name }[];  // too vague to classify: kept and shown for the user to sort
  languages: { id; name; level }[];
  certifications: { id; name; issuer; date: YearMonth }[];
  projects: { id; name; description; url }[];
  custom: { id; title; details }[];    // sections that fit nowhere else, original heading kept
};
```
**Import rules** (owner's structure, changed in Plan 2):
- Skills are classified by meaning, not by the CV's heading. A skill is never in two groups. Labels are short recruiter terms.
- Text is copied word for word in the source language. Improving the wording is a separate step (Plan 3).
- Name parts are filled only when clear. Dates are kept only when stated.
- Anything left out is reported as a warning.
Every list item has a stable `id` (`crypto.randomUUID()`), so tailored CVs and AI proposals can be diffed per item.
Limits: strings ≤ 2,000 chars (summary/description ≤ 4,000), ≤ 40 items per list, ≤ 20 bullets per experience,
serialized content ≤ 256 KB.

## Data model (target; each plan adds its tables)
```sql
base_cvs        (user_id uuid pk → auth.users, content jsonb, version int, updated_at timestamptz)      -- plan 1
base_cv_versions(id uuid pk, user_id, content jsonb, reason text, created_at)                          -- plan 1
cv_imports      (id, user_id, storage_path, file_name, status text, error text, result jsonb,
                 attempts int, created_at, updated_at)                                                 -- plan 2
ai_calls        (id, user_id, task text, provider text, model text, status text, error text,
                 duration_ms int, input_tokens int, output_tokens int, created_at)                     -- plan 1 (table), plan 2 (writes)
jobs            (id, user_id, url, title, company, description text, requirements jsonb, created_at)   -- plan 4
tailored_cvs    (id, user_id, job_id, base_version int, content jsonb, score jsonb, version int, ...)  -- plan 4
```
RLS on every table: `user_id = auth.uid()`. One SQL function only where atomicity is needed (`save_base_cv`).

## API surface
| Method & path | Plan |
|---|---|
| `GET /health` | 1 |
| `GET /v1/cv` · `PUT /v1/cv` | 1 |
| `GET /v1/cv/history` · `GET /v1/cv/history/:id` · `POST /v1/cv/history/:id/restore` | 1 |
| `POST /v1/imports` · `GET /v1/imports/:id` · `POST /v1/imports/:id/apply` | 2 |
| `POST /v1/ai/experience/questions` · `POST /v1/ai/experience/rewrite` · `POST /v1/ai/skills` | 3 |
| `POST /v1/jobs` · `GET /v1/jobs` · `POST /v1/jobs/:id/tailor` · `GET/PUT /v1/tailored/:id` | 4 |

Errors are always `{ error: { code, message, requestId } }`, and every 5xx is logged with the request id.

## Testing policy
- Test behaviour a user or API client can observe. No tests of dev tooling, timers-for-their-own-sake or race permutations.
- Each feature: happy path + the realistic failure paths (validation, 401, 409, provider failure).
- Database: pgTAP tests for RLS isolation and `save_base_cv`.
- Target: a few hundred lines of tests per plan, suite under 30 seconds.

## Port from `main`
- `packages/contracts/src/intelligence/*prompt*.ts`, `experience-rubric.ts`: prompt wording for extraction / assessment (plans 2–3).
- `apps/api/src/intelligence/operations.ts`: "is this a CV?" admit step + extraction prompt (plan 2).
- `apps/web/src/templates/templates.css` + `registry.ts`: template styles (plan 3).
- `apps/web/src/design/*.css`: design tokens (plan 1).

## Roadmap
1. **Foundation**: workspace, shared schema, DB baseline, API with auth + My CV + history, web app with auth, editor, autosave, conflict warning, history.
2. **Import**: upload to Storage → Queue → text extraction (unpdf / mammoth) → admit + extract (organized into skill groups) → review → apply; adds `callModel`.
3. **AI + output**: Improve with AI per experience, skills suggestions, templates, PDF export.
4. **Jobs + tailoring**: job entity, requirement extraction, score, tailored CV as diff to accept.
5. **Extension**: Chrome extension capturing job pages, signs in with the same Supabase session flow.
6. **Ship**: Cloudflare deploy (Workers + Pages), hosted Supabase migration, Stripe subscriptions.

## Open questions
- UI language for launch: English first, or Romanian first?
- Sign-in with Google at launch? (Easy with Supabase; affects plan 1 auth screen only.)
