# Resumora setup guide

Initial research: **24 October 2026**; authentication status updated **25 October 2026**. This guide is preparation, not execution authorization; the [database guide](docs/database/README.md) owns the separately approved database scope and current implementation status. The [authentication setup](docs/setup/authentication.md) records the proposed email/password and reset flow, Worker session boundary and Google-later plan. No working auth implementation is included.

Earlier read-only dashboard inspection verified **Resumora**, project ref `aquvhqbkvrtzhbmezkci`, **West EU (Ireland)**, **Free Plan**, **Email enabled** and **Confirm email enabled**. Empty/development use remains owner-reported; RLS, storage, login and delivery are unverified. The dashboard's `PRODUCTION` label does not establish real production data. Reuse this project; no duplicate or upgrade. This branch adds credential-file ignore protection, pending merge. Owner chose initial email tests for **only the owner/project team**, with actual eligibility/delivery still to verify; no external testers or paid SMTP configuration now.

## 1. Verified state and stack fit

Indicators: **READY** = repository material inspected; **OWNER-CONFIRMED** = reported by the owner, not independently verified; **MISSING** = implementation/configuration absent from this checkout; **UNVERIFIED** = account/resource existence or suitability not checked; **DECISION** = owner choice still needed. READY never means an integration passed.

| Item | Indicator and repository evidence | Consequence |
| --- | --- | --- |
| Product, contracts and visual direction | **READY for planning:** [PRD](docs/product/prd.md), [canonical schemas](schemas/cv/v1/README.md), [design adoption](docs/frontend/design-system-adoption.md) | Reuse contracts and visual assets; JSON schemas are not database migrations. |
| Supplied frontend | **READY as reference; MISSING product integration:** [kit entry point](references/design-system/cvizat/source/ui_kits/web-app/index.html) loads React/ReactDOM and Babel from CDNs; [adoption guide](docs/frontend/design-system-adoption.md) records the kit's adoption constraints | Adopt components deliberately into the [local workspace](docs/setup/local-development.md). Do not publish the discovery repository root. |
| Executable prototype | **READY as synthetic browser demo:** [README](README.md), [prototype source](prototype/app.js), [package manifest](prototype/package.json) | Local browser state and simulated operations; package scripts only run prototype checks. No real login, extraction, model, payment or PDF integration. |
| API/database/deployment | **LOCAL FOUNDATION:** [React/Worker workspace](docs/setup/local-development.md), health endpoint, local proxy and Wrangler dry-run configuration exist. See the [database guide](docs/database/README.md) for SQL implementation status; Worker Auth/database integration and hosted deployment remain unimplemented | Use the local workspace without cloud credentials; follow the database guide for its separate verification and execution boundary. |
| Local credential protection | **PREPARED on this branch:** [root ignore rules](.gitignore) protect `.env*` and `.dev.vars*` at every depth; no credential files added | Verify ignored filenames and no tracked matches before future credential entry. Ignore rules do not untrack existing files. |
| Dedicated Supabase project | **Dashboard-verified:** Resumora, `aquvhqbkvrtzhbmezkci`, West EU (Ireland), Free; Email and Confirm email enabled (25 October 2026) | Empty/development use owner-reported; machine region code, RLS/storage policies, login and email delivery unverified. Reuse existing project. |
| Other cloud resources/accounts | **UNVERIFIED:** no account inventory is tracked; [architecture](research/architecture/README.md) explicitly describes discovery | Cloudflare/AI/Stripe resources may exist. Confirm Resumora ownership and environment before reuse. Never reuse CVTailor or shared tooling accounts by assumption. |
| Release/privacy/commercial policy | **DECISION:** [D-01–14 register](research/strategy/publication/docs/product/decisions.md), [security proposal](research/architecture/security-ops.md), [cost model](research/costs/README.md) | Region/residency, retention, upload/OCR/export breadth, quotas, access and prices remain open. This guide closes none of them. |

The preferred **Pages frontend → Worker API → Supabase Postgres/Auth** remains the hosting design. The [local foundation](docs/setup/local-development.md) establishes the frontend toolchain; hosted deployment and reference-component adoption remain separate work. The current prototype could be served as static files, which would only publish the demonstration.

Concrete boundaries:

- Pages serves browser assets; it does not turn the reference into an application. Browser configuration is public. Keep AI, privileged database access, authorization and payment verification in the Worker.
- Workers is an isolate runtime. `nodejs_compat` does not provide a normal Node host: `node:child_process` is a nonfunctional stub. Native Poppler, LibreOffice, Tesseract and local Chromium subprocesses cannot be assumed to work. Bounded JavaScript/WASM PDF/DOCX parsing requires later CPU/memory/package checks; manual/paste recovery stays available. [Workers Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- The free Worker allowance is **10 ms CPU/request, 128 MB memory and 100,000 requests/day**. Network waits do not count as CPU; parsing, validation and signing do. Free-tier feasibility is unproven by this repository. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- PDF export needs a real renderer. The architecture prefers remote Browser Run; it consumes a separate browser quota and introduces document processing outside the database. An EU database alone does not settle all processing residency: D-08 remains open. [Existing architecture/privacy analysis](research/architecture/security-ops.md)
- Supported alternative for discussion: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) can colocate frontend assets and API, simplifying origins. It changes the requested Pages split and is not selected here. Existing [option C](research/architecture/proposal.md) retains an EU Node document worker + Supabase if native parsing or processing requirements demand it; host cost/operations require approval. No switch is automatic.

## 2. Setup order and first safe owner step

Credential-file ignores are included on this branch, pending merge. Do not enter credentials or change hosted settings as part of this preparation; approved database access and execution follow the [database runbook](docs/database/runbook.md).

- [x] **Inventory:** existing project identity, displayed Ireland region, Free plan, Email and Confirm email enabled verified read-only.
- [x] **Prepared:** credential ignores and [email/password/reset setup](docs/setup/authentication.md); no real credential files.
- [ ] **Next configuration dependency:** establish real app/API origins and working Worker callback routes, then configure the exact Site URL/redirect allowlist. Prototype preview routes are not auth callbacks.
- [ ] **Initial email tests:** owner/project-team recipients only; verify authorized addresses, limits and actual delivery when implementation exists. External recipients require an approved SMTP approach later.
- [x] **Local foundation:** see [local development](docs/setup/local-development.md) for the implemented workspace and its checks.
- [ ] **Feature implementation:** session controls, product UI and application integration tests; see the [database guide](docs/database/README.md) for SQL/RLS verification. Production remains separate.
- [ ] **Later milestones:** Cloudflare hosting, private storage, AI, rendering, billing, Google and external SMTP only when their features are approved.

## 3. Initial development preparation cards

### A. Local workspace and credential handling

**Purpose / dependent feature:** the [local foundation](docs/setup/local-development.md) provides the frontend/API workspace. The reference/demo remains separate. No new hosting account or API token is required for local development.

**Official entry points:** [Vite environment handling](https://vite.dev/guide/env-and-mode), [Wrangler local secrets](https://developers.cloudflare.com/workers/configuration/secrets/). There is no dashboard for local files. The local foundation now uses `apps/web/` and `apps/api/`; see [local development](docs/setup/local-development.md) for exact install, run and verification commands. It has no working authentication or database connection.

1. The authorized local foundation uses pinned React/Vite/TypeScript and Wrangler workspaces. Run its documented local checks before adding features. No scaffolder, automatic deployment, cloud login or provider credential is required.
2. Before entering any value, verify the branch's root `.env*` and `.dev.vars*` ignore rules cover the intended file paths. No placeholder exceptions or credential files are added; the change remains pending merge.
3. Verify ignore coverage first with `git check-ignore <local-file-path>` and check `git status --short`. Expected: each actual local configuration file is ignored and absent from tracked changes. Store secrets in a password manager and local owner-readable files (for example mode `0600`); never paste secrets into chat, screenshots, shell arguments, logs or PRs.
4. Follow the [local configuration and secret boundaries](docs/setup/local-development.md#configuration-and-secrets) when a feature needs environment files. Do not mix server secrets into the frontend directory/build. [Secret file rules](https://developers.cloudflare.com/workers/configuration/secrets/)
5. Keep separate dev/production values and synthetic development data. Future Cloudflare Worker secrets belong in the Worker secret store; deployment credentials belong in a protected CI secret store only if automation is approved.

**Values / verification:** see the exact proposed matrix in section 5. `VITE_*` values are embedded into client output and readable by visitors. Even an encrypted build setting becomes public if code bundles it. Future verification should inspect a synthetic build for accidental secret exposure; no build was run for this guide. [Vite security notes](https://vite.dev/guide/env-and-mode)

### B. Supabase development database and account/project

**Purpose / dependent feature:** managed Postgres holds career facts, versions, jobs and tenant ownership; Auth supplies user identity. The [database guide](docs/database/README.md) owns the relational implementation and migration contracts. Supabase is required when persistence/Auth integration begins, not for reading code.

**Official entry/navigation:** [Supabase](https://supabase.com/), [Dashboard](https://supabase.com/dashboard) → appropriate organization → existing Resumora development project. The [React quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs) supplies client integration guidance; its new-project creation step is unnecessary here.

1. Reuse the existing project: the dashboard verified Resumora, Free and West EU (Ireland); dedicated purpose and empty development use remain owner-confirmed. Machine region code, permissions and policies remain unverified. Owner retains billing/control; use named team members, MFA and the narrowest supported roles. Free-plan role granularity differs from paid project-scoped access, so do not assume fine-grained project roles are available. [Access control](https://supabase.com/docs/guides/platform/access-control)
2. **Hosted path:** select that existing project after local secret-ignore protections are verified. Keep its Free plan; no additional development project or database password reset is required. Reuse the verified displayed Ireland location; inspect account permissions and feature-relevant settings when needed without revealing credentials; keep any existing database password in its owner's password manager, never chat or frontend configuration.
3. **Local database verification:** follow the [database guide](docs/database/README.md#local-verification) for the implemented native runner and prerequisites.
4. For hosted public configuration, open the project's **Connect** dialog for URL/publishable key; **Settings → API Keys** lists current and legacy keys. Copy directly into approved local storage, never chat. Default to `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the server; follow the [frontend configuration boundary](docs/setup/local-development.md#configuration-and-secrets). [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
5. Prefer Supabase's HTTPS client/Data API boundary for the first Worker integration. Its adapter/connection path remains future work; the [SQL command contract](docs/database/api.md) owns the implemented transaction and privilege boundary, and the [runbook](docs/database/runbook.md) owns migration access. Do not request a database password, `DATABASE_URL` or Supabase management token as default app configuration.

**Sensitive distinction:** `sb_publishable_…` is public application identification, not authorization. `sb_secret_…` bypasses RLS and is server-only; do not create one unless a specific privileged job requires it. Legacy `anon` is public, while legacy `service_role` is privileged/server-only. Prefer modern key types; an existing suitable legacy integration requires an explicit compatibility review rather than blind rotation. [Key types](https://supabase.com/docs/guides/getting-started/api-keys)

**Future non-destructive verification:** inspect project health and actual region in the dashboard; for local, inspect CLI status and Studio without sharing its printed keys. Once client code exists, read an intentionally allowed synthetic record with a user session; expected: correct dev project, no production data, no admin key needed. API-key presence alone does not verify RLS or Auth.

### C. Supabase Auth and tenant protection

**Purpose / dependent feature:** account registration/login, session validation and isolating every user's CV/job data. No additional identity SaaS is required for initial email/password development.

**Official entry/navigation:** [Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls): selected dev project → **Authentication → URL Configuration**. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) is the database authorization mechanism; the implemented policy boundary is documented in the [SQL access contract](docs/database/api.md#granted-reads-and-access).

1. Use the proposed Worker-managed HttpOnly session boundary in [authentication setup](docs/setup/authentication.md), which defines email/password signup/login, verified recovery and update, CSRF/origin checks, refresh/logout and Google later. It remains unimplemented.
2. Configure the actual local Site URL and exact Worker callback URLs only after the workspace implements them; use the proposed route inventory in [authentication setup](docs/setup/authentication.md), not the prototype preview URL. When dev hosting exists, add its exact callback to the **dev** project allowlist. Production gets its own Site URL/allowlist; do not allow arbitrary `*.pages.dev` callbacks against production. [Redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls)
3. Owner chose only owner/project-team recipients initially. Verify their authorized membership and actual email receipt when testing is approved; use synthetic application data. Hosted default SMTP is limited to team addresses and currently **2 messages/hour**, with no delivery SLA; it cannot support ordinary external testers. Do not grant project membership just to bypass this limit. Use approved custom SMTP before external email signups. [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)
4. For future Worker JWT verification, inspect the project's signing algorithm and use asymmetric signing keys/JWKS or the supported Auth verification client. Proposed public values: `SUPABASE_JWT_ISSUER` and `SUPABASE_JWKS_URL` in section 5. Validate issuer, audience, expiry and signature; parsing a JWT alone is insufficient. Do not request a legacy shared `JWT_SECRET`. Do not rotate an existing project's keys during inventory. [Signing-key verification](https://supabase.com/docs/guides/auth/signing-keys)
5. Follow the [SQL access contract](docs/database/api.md#granted-reads-and-access) when integrating authenticated requests. Verify hosted policies/grants through the [database runbook](docs/database/runbook.md); local SQL evidence does not establish hosted protection.

**Values / future verification:** URL, publishable key, issuer/JWKS URL and origins are public; session/access/refresh tokens are sensitive runtime data, not static environment variables. With previously seeded synthetic tenants A/B, verify login/refresh/logout, own-record reads, denied anonymous reads and denied B-record reads. Read-only checks leave data unchanged; separate write-policy tests will still be required before launch. Expected: no cross-tenant records, invalid/expired tokens rejected, callbacks stay on the intended origin. Nothing is connected today.

### D. Cloudflare account, Pages and Git integration

**Purpose / dependent feature:** host the future compiled frontend and provide controlled preview builds. **Needed at hosting milestone**, not to begin local backend design/development. Account/resource readiness is UNVERIFIED.

**Official entry/navigation:** [Cloudflare Dashboard](https://dash.cloudflare.com/) → account → **Workers & Pages → Create application → Pages → Import an existing Git repository**, as documented in the [React Pages guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/). Do not submit creation/deployment during inventory.

1. Check the existing appropriate account/Pages project first. If absent, request approval for resource creation/Git installation and reuse the existing private `Cosmiin/Resumora` repository; no replacement repository is needed.
2. When approved, authorize the Cloudflare Workers & Pages GitHub App for **Only select repositories → Cosmiin/Resumora**. Review the app's requested permissions; do not grant all repositories or unrelated organizations. GitHub navigation: **Settings → Applications → Cloudflare Workers & Pages → Configure → Repository access** (organization context if applicable). [GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
3. Use the [local workspace and build instructions](docs/setup/local-development.md) as the source for application paths and commands. At the hosting milestone, verify monorepo dependency installation from the root lockfile, the Pages build/output settings and intended production branch. No hosted Pages settings were created. The shell is not the implemented CV product. Do not deploy the entire discovery repository, archive or local files.
4. Before the first approved build, set public frontend variables separately for Preview and Production. Cloudflare docs currently show both **Settings → Environment variables** for builds and **Settings → Variables and Secrets → Add** in the bindings guide; the signed-in UI variant is unverified. Use the selected Pages project's settings and confirm the target environment. [Build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/), [variables](https://developers.cloudflare.com/pages/functions/bindings/)
5. Review automatic deployment/branch controls before connecting production. Git integration triggers builds on pushes; Git-integrated projects cannot later be converted into Direct Upload projects. A custom domain is unnecessary initially (`pages.dev` is available). [Git integration and controls](https://developers.cloudflare.com/pages/configuration/git-integration/)

**Values / verification:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`: public, future build settings/local web file. No AI/Stripe/admin secrets belong here. Future read-only checks: view the selected repository, branch, build settings and environment; after an approved deployment, open the dev URL/deep link and inspect API target. Expected: the intended dev app, correct dev API, no private credentials/CV artifacts in static output. This guide performs no build/deploy.

### E. Cloudflare Worker API and server configuration

**Purpose / dependent feature:** server authorization, bounded AI calls, job logic and billing verification. Needed when backend code is implemented; local Worker development can precede hosted deployment.

**Official entry/navigation:** [Workers dashboard setup](https://developers.cloudflare.com/workers/get-started/dashboard/): account → **Workers & Pages → Create application**; choose the future Worker application's repository/configuration. Its Deploy action creates a live deployment: wait for separate approval. Prefer a local Worker workspace and mocks first.

1. Reuse a suitable Resumora dev Worker or, after approval, create the application (proposed `resumora-api-dev`). Production must have separate configuration/secrets. The local foundation has a development-only `apps/api/wrangler.jsonc` and reviewed compatibility date; no account, hosted route or remote binding is configured.
2. Set public server configuration from section 5; allow only the intended web origins. Decide cookie domain/SameSite/CORS/CSRF behavior for separate Pages/Worker origins before login integration. CORS does not replace authorization. Keep private responses out of shared caches, following the [security proposal](research/architecture/security-ops.md).
3. Add only the secrets actually required by the feature. Dashboard: **Workers & Pages → Worker → Settings → Variables and Secrets → Add → Secret**; the documented final **Deploy** action applies changes and must wait for deployment authorization. Locally use `apps/api/.dev.vars`. Worker reads bindings through `env`; browser builds do not receive them. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
4. For initial Supabase user-scoped access use public project configuration + the validated user session, not a secret/service-role key. Add `SUPABASE_SECRET_KEY` only for an approved privileged operation with tenant checks/minimal exposure. Never place it in Pages build settings, frontend code or an extension.
5. Do not create a Cloudflare API token merely to configure the dashboard. If CI deployment is later approved, scope a dedicated token to the relevant account and operations: Workers Scripts Edit for Worker publication; Pages Edit only for Pages automation; zone/DNS/route rights only if that exact deployment needs them. Account-level script access may cover more than one Worker; do not describe it as Worker-specific isolation. Use expiry and protected CI environment approvals. [Token creation](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/), [script-only template](https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/)

**Values / future verification:** proposed public vars `APP_ENV`, `APP_ORIGIN`, `ALLOWED_ORIGINS`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, issuer/JWKS URL; server secrets only when needed. `CLOUDFLARE_API_TOKEN` is a deployment credential, not a Worker runtime secret; `CLOUDFLARE_ACCOUNT_ID` is a public identifier. After approved code/hosting, read a non-sensitive health endpoint and make an unauthenticated request to a protected endpoint. Expected: healthy dev API, protected request rejected, secret values absent from responses/logs. End-to-end functionality remains unverified until implemented.

## 4. Feature-triggered and production services — prepare later

### Private upload/export storage: when retaining file bytes

**Purpose:** source PDF/DOCX uploads and retained PDF exports, not manual text-only work. Reuse Supabase Storage rather than adding R2/S3 by default. Proposed buckets: `cv-uploads` and `cv-exports`; retention, quotas and MIME/size limits remain D-02/04/08 decisions.

1. In the approved dev project's **Storage**, inspect existing buckets first. When approved, create the required bucket(s), keep **Public disabled**, and apply approved MIME/size limits. Supabase supports dashboard bucket creation; the exact current create-button label was not verified. [Bucket creation](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
2. Implement owner-scoped policies on `storage.objects`, opaque account-scoped paths, bounded signed download URLs and deletion/retention behavior before using real documents. Secret keys bypass storage RLS too. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
3. Configure proposed `SUPABASE_UPLOAD_BUCKET=cv-uploads` / `SUPABASE_EXPORT_BUCKET=cv-exports` as public server config; no new storage credential is needed for user-scoped access. With an existing synthetic object, later verify A can download its own file, B/anonymous cannot, and an expired signed URL fails. Expected: private access only; no public export URLs. Upload/write/delete checks require separate synthetic integration tests.

### AI provider: when extraction/generation using models begins

**Purpose:** structured proposals and selective rewrites. The [provider contract](research/architecture/provider-adapter-v2.md) prefers direct OpenAI first; no router, vector DB or commercial ATS API is required for deterministic matching. Mock outputs are sufficient initially.

The [OpenAI/admin preparation guide](docs/setup/openai-admin.md) owns the current synthetic preview, supported configuration, secure project-key setup and remaining integration requirements. Follow it rather than adding a configurable provider URL or enabling billing/inference as a setup check.

Before extraction/generation is separately approved:

1. Approve exact endpoint/model, minimal input, retention/residency terms and usage ceilings. `store:false` does not itself guarantee zero retention or EU-only processing. API data is not used for training by default; abuse monitoring can retain content for up to 30 days and endpoint exceptions apply. [Official data controls](https://developers.openai.com/api/docs/guides/your-data)
2. Implement application quotas, token limits and a stop switch; provider alerts alone do not enforce them. Verify configuration read-only first; a later explicitly approved synthetic API call must return schema-valid output with usage recorded. That call consumes quota/possibly money and is not a non-destructive setup verification. [Spend controls](https://developers.openai.com/api/docs/guides/production-best-practices)

### PDF export, parsing and OCR: when file features begin

**Purpose:** a machine-readable PDF from an approved immutable CV snapshot, plus bounded input extraction. The kit's Download timer is not a renderer. Text PDF/DOCX libraries need package/runtime proof; no hosted parsing/OCR subscription is mandatory. Manual recovery remains a product path.

1. Approve file formats/size/page limits and processing boundary. Try Worker-compatible parsing with synthetic fixtures in a later bounded implementation task. If native tools/OCR are required, compare the existing EU Node fallback with a separately approved document provider; do not provision both.
2. For Browser Run, use the existing Cloudflare account and follow [Get started](https://developers.cloudflare.com/browser-run/get-started/). Proposed Worker browser binding: `BROWSER` in future Wrangler configuration (a binding, not a string/secret). A Worker binding path avoids embedding an external REST API credential; if REST access is chosen instead, use a dedicated account-scoped token with **Browser Rendering Edit**, server-only, and reassess the setup.
3. Do not run the tutorial's remote development/deployment steps during inventory: remote browser tests consume the real quota. After authorization, render one synthetic document, independently extract its text and check Romanian diacritics, reading order, pagination, links and private-contact exclusions. Expected: actual readable bytes, versioned renderer/template and measured browser seconds; not a simulated success badge. Read-only setup verification is limited to inspecting binding/configuration and plan quota. [Browser quota/pricing](https://developers.cloudflare.com/browser-run/pricing/)

### Stripe: when implementing subscription billing

**Purpose:** hosted checkout, subscription state and verified payment events. No Stripe account or payment card is a prerequisite for career-record development. Commercial prices/quotas/cancellation terms remain D-05/07 decisions; this guide approves none.

1. Inventory existing appropriate accounts; when billing work is approved, select a separate **sandbox** in [Stripe Dashboard](https://dashboard.stripe.com/) and open [API keys](https://dashboard.stripe.com/apikeys). Test keys/data are separate from live mode and do not process real payments. Prefer a restricted server key with only the necessary billing permissions. [Stripe key types/sandboxes](https://docs.stripe.com/keys)
2. Put proposed `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in API `.dev.vars` / Worker secrets. Optional `VITE_STRIPE_PUBLISHABLE_KEY` is public and only needed if browser Stripe.js is used; a hosted redirect flow may not need it. Proposed server `STRIPE_PRICE_1M`, `STRIPE_PRICE_3M`, `STRIPE_PRICE_6M` are public identifiers with a server allowlist, created only after term/price decisions.
3. When an endpoint exists, **Workbench → Webhooks → Create an event destination → Your account**, choose relevant events and compatible payload/API version, then **Webhook endpoint** and the approved dev HTTPS URL. Store that endpoint's signing secret directly in the Worker secret store. A local Stripe CLI listener has a different signing secret. [Webhook setup](https://docs.stripe.com/webhooks)
4. Read-only future setup check: confirm sandbox mode, configured destination and key permission names without revealing values. Later approved synthetic billing tests must cover raw-body signature validation, duplicate/out-of-order events and authoritative entitlements; success redirects never grant access. Live activation, business identity/bank/tax details and live keys wait for commercial approval. No real charge is needed to prove sandbox behavior.

### Other milestones

| Trigger | Resource/setup, configuration and expected verification |
| --- | --- |
| External email signup/password reset | Approve a sender domain and SMTP provider. Obtain SMTP host/port/user/password, configure domain records in the DNS provider, then selected Supabase project → Authentication settings → custom SMTP. The exact SMTP submenu label is unverified; use the [official SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp). Keep password/API key in Supabase's SMTP settings/password manager, not the web app; proposed local-only names `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` only if the local stack needs them. Verify settings/domain status read-only; sending a controlled confirmation/reset email is a later authorized delivery test. Provider/cost decision deferred. |
| Branded public site | Inventory existing domain/registrar first. Pages project → **Custom domains → Set up a domain**; DNS changes/registration cost need approval. `APP_ORIGIN`/callback URLs then change together. A subdomain can use CNAME; apex Pages setup has Cloudflare nameserver requirements. [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/). Later verify DNS/TLS and callback origins. No domain purchase now. |
| Social login | Only if approved; configure the selected OAuth provider and Supabase Auth provider settings. Provider-specific navigation/client permissions are unverified until chosen. Client ID is public, client secret stays in Supabase provider settings, not `VITE_*`. Request basic sign-in scopes only; verify synthetic login and exact callback. Supabase [redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls). Google/Microsoft/LinkedIn APIs are not initial requirements. |
| Chrome job capture / URL import | D-01/14 remain unresolved. Follow [extension/capture boundary](research/architecture/extension-billing.md): deliberate capture, minimal permissions, exact callback, paste fallback. No extension store registration, scraping service or LinkedIn account access needed now. Publishing fees/current store labels require later official verification. URL fetch remains off until SSRF/network controls are proven. |
| Production operations | Approve backups of both DB and object bytes, restore procedure, retention/deletion, redacted logs, alerts and incident ownership from [security/ops](research/architecture/security-ops.md). Free infrastructure is not a recovery plan. Built-in provider metrics first; third-party monitoring optional. Any vendor DSN/client identifier may be public; ingestion/admin tokens remain server/CI secrets. Provider, navigation, retention and price remain unselected/unverified. |

## 5. Proposed variable names and exact storage boundaries

The [local configuration contract](docs/setup/local-development.md#configuration-and-secrets) owns current settings; the [OpenAI/admin setup contract](docs/setup/openai-admin.md#secure-owner-setup-only-when-needed) owns supported provider and owner-verifier variables. **The integration names below remain proposals.** Configure only rows needed by the current feature. Placeholder notation such as `<DEV_PROJECT_URL>` or `<SERVER_SECRET_SET_LOCALLY>` is deliberately not a credential. Do not create actual environment files from this document during the preparation task.

| Proposed name | Classification / source | Proposed local location | Future hosted location / timing |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Public project URL; Supabase Connect dialog | `apps/web/.env.local` | Pages Preview/Production build settings; if Vite/direct browser client selected |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public publishable key; legacy `anon` only after compatibility review | Same web file | Same Pages build settings; RLS remains mandatory |
| `VITE_API_BASE_URL` | Public API origin, only if future deployment requires a separate origin; unused by the local proxy | Same web file, only if implemented | Corresponding dev/prod Worker origin in Pages build settings |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Public server project configuration | `apps/api/.dev.vars` | Worker plain variables, each environment |
| `APP_ORIGIN`, `ALLOWED_ORIGINS` | Public; exact web origin, proposed comma-separated allowlist interpreted by future code | Same API file | Worker variables; no arbitrary origins with credentials |
| `SUPABASE_SECRET_KEY` | **Privileged secret**, bypasses RLS; only approved admin/job operation | Same API file if justified | Worker **Secret**; never frontend/build/extension |
| `SUPABASE_UPLOAD_BUCKET`, `SUPABASE_EXPORT_BUCKET` | Public identifiers; proposed `cv-uploads`, `cv-exports` | Same API file, when storage needed | Worker variables |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **Secrets**, sandbox initially; API key and endpoint signing secret are different | Same API file, billing milestone | Worker **Secrets**, separate test/live |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Public test/live publishable key, only if browser integration needs it | Web file, billing milestone | Pages build setting; no secret key beside it |
| `STRIPE_PRICE_1M`, `STRIPE_PRICE_3M`, `STRIPE_PRICE_6M` | Public identifiers, server allowlist; prices unselected | API file when approved | Worker variables; separate sandbox/live objects |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Public account ID + **secret deployment token** | Protected deployment shell/password manager only when automation approved | Protected CI environment secrets; never browser or app runtime |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Host/port/from public configuration; user/password sensitive | Only local mail configuration if needed; never web file | Hosted Auth SMTP values in Supabase settings; password secret |

`BROWSER` is a proposed addition to the existing Worker configuration, not an environment string/key. Database password, `DATABASE_URL`, Supabase personal access token and legacy `service_role`/JWT secret are **not requested by default**. If later tooling genuinely needs privileged credentials, keep them in dedicated local/CI secret storage with separate approval and minimal scope; do not add a frontend-prefixed version. Supabase-generated asymmetric private signing keys stay with Supabase. [Signing keys](https://supabase.com/docs/guides/auth/signing-keys)

Preview builds use dev resources; production uses separate approved resources/secrets. Never copy real CVs into development. Never commit `.env`, `.env.local`, `.dev.vars`, credential exports or screenshots containing secrets. Do not print file contents to “verify” configuration. Verify names/presence, provider identity, ignored status and behavior instead.

## 6. Costs, free tiers and approval boundaries

Published list prices below were checked **24 October 2026**. Currency is USD unless RON is named; tax/FX and optional services are excluded. Quotas may be shared across an account/organization: check existing usage before assuming availability. These are infrastructure estimates, not a budget or customer subscription prices. Recheck provider checkout/limits before any approval.

| Service | Free/development allowance and limits | Later cost exposure / official source |
| --- | --- | --- |
| Local design/mock work | No new cloud spend. Existing machine/tool resources only | No paid service required. Local containers consume developer disk/RAM; runtime licensing depends on chosen runtime. [Local Supabase](https://supabase.com/docs/guides/local-development) |
| Hosted Supabase Free | $0; 2 active projects; 500 MB DB/project, 1 GB files, 50,000 MAU, 5 GB egress + 5 GB cached egress; inactivity pause after 1 week | Pro starts $25/month with compute credits; extra projects/compute/overages/add-ons can add cost. Free is not production uptime or backup assurance. [Pricing](https://supabase.com/pricing), [billing units](https://supabase.com/docs/guides/platform/billing-on-supabase) |
| Pages Free | 500 builds/month, one concurrent build; 20,000 files/site, 25 MiB/file | Functions consume Workers quota; store no private documents among static assets. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Workers Free / Paid | Free: 100,000 requests/day, 10 ms CPU/request, 128 MB | Paid minimum $5/account/month; 10 million requests + 30 million CPU-ms/month included, then $0.30/million requests + $0.02/million CPU-ms. No upgrade approved. [Limits](https://developers.cloudflare.com/workers/platform/limits/), [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Browser Run | Free: 10 browser minutes/day and 3 concurrent browser sessions; daily time cannot be pooled into a monthly allowance | Workers Paid: 10 browser hours/month + 10 monthly-average concurrent browsers; then $0.09/hour and $2/additional average concurrent browser. Quick Actions charge browser time; session usage also has concurrency billing. [Pricing](https://developers.cloudflare.com/browser-run/pricing/) |
| OpenAI API | Mock development costs $0 in inference; do not assume trial credits or free private inference | Model/endpoint and token usage determine cost. Formula: `input_tokens × input_rate / 1,000,000 + output_tokens × output_rate / 1,000,000`, plus applicable tools/cache/region charges. Illustrative current standard short-context `gpt-6-luna`: $0.10 input / $0.50 output per million tokens; 5,000 input + 1,000 output = $0.001/request, 1,000 requests = $1, before retries, other operations and surcharges. This is arithmetic, not a model selection or quality/budget approval. [Official pricing](https://developers.openai.com/api/docs/pricing) |
| Stripe | Sandbox tests do not process payments | Romanian standard EEA card illustration: 1.5% + RON 1/transaction; Billing pay-as-you-go adds 0.7% of Billing volume. Other cards, tax, FX, disputes and products differ. Do not choose commercial amounts from this fee example. [Romania pricing](https://stripe.com/en-ro/pricing), [sandbox keys](https://docs.stripe.com/keys) |
| SMTP/domain/OCR/Node fallback/monitoring/backups | Not required for initial mock/manual development | No vendor, plan or estimate selected; quote after feature/privacy/volume requirements are approved. Do not enable optional subscriptions to complete a checklist. |

Sizing examples are **assumptions**, not observed usage: 25 synthetic pilot users × 10 MB retained originals = 250 MB before exports/versions; 100 × 10 MB = 1,000 MB, leaving essentially no headroom under a nominal 1 GB allowance. If a PDF session took 10 seconds, 600 seconds/day allows at most 60 such sessions before setup/retries/other account usage; actual timing is unmeasured. Frontend requests, authentication, polling and retries all contribute API traffic; parsing may exceed CPU limits long before the request quota. The existing [v1.2 cost model](research/costs/README.md) remains a dated scenario, not a current invoice or spending authority.

No card or paid plan is a prerequisite for the recommended inventory/local/mock path. This task did not verify account-specific signup/card eligibility; if a provider requests payment details or a paid tier, stop for approval rather than treating it as mandatory setup. Provider budget alerts are not necessarily hard caps; check the specific enforcement mechanism and retain app-side quotas/stop controls.

## 7. Completion checklist for the eventual implementation handoff

- [x] Dedicated purpose/empty development use owner-confirmed; dashboard verified Resumora, Free, West EU (Ireland), Email and Confirm email enabled. No working integration claimed.
- [x] Credential-file ignores prepared on this branch; no credentials added. Exact machine region code, permissions, policies and application connectivity remain unverified.
- [ ] Existing hosted development route documented, exact region checked and processing/retention decisions recorded; local alternative available, production separate.
- [x] Frontend framework/workspace/build established in the [local foundation](docs/setup/local-development.md).
- [ ] Reference licensing and component adoption resolved; no prototype mistaken for a production app.
- [ ] Ignored local configuration paths verified before any credentials are entered; browser/public versus server/secret boundaries reviewed.
- [ ] Dev database/Auth identity and future RLS verification plan ready; no privileged browser key or default shared JWT secret.
- [ ] Hosting/Git permission plan ready for approval; no automatic deployment caused by this guide.
- [ ] Upload/PDF/AI/billing/email resources requested only at their milestones with approved usage/cost/data boundaries.

**Validation:** initial provider/cost research dates remain as stated above. The authentication update uses official Auth references, local-link/whitespace checks, filename-only ignore checks and tracked-file safety inspection. No auth implementation tests, installation, migration, provider setting change or deployment is claimed. See [authentication setup](docs/setup/authentication.md) for the current preparation status and future test matrix.
