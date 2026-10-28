# Connected vacancies and scoped wording

The application now offers authenticated paste intake, account-owned draft save/list/detail,
manual review and a pinned immutable **editor draft** association. Raw text is preserved exactly;
a source URL is metadata only. Saving a capture does not require title/company. Review requires
both from the user, and optionally exact required/preferred excerpts. Unclassified text stays
unclassified. No extraction, ATS score, scraping, extension, canonical CV publication or application
submission is implemented here. The list shows metadata for the latest 50 captures, with titles
limited to 200 characters for display. Opening a job reads its complete owned detail, including
the original source text, full title and requirements.

The new migration `20261028010000_p3_connected_jobs_ai.sql` is prepared, not applied remotely.
It reuses `jobs`, `confirm_job`, normalized requirements, sources and spans; focused context rows
pin `editor_draft_snapshots.id` and revision. The existing client canonical `baseCv` triple is
rejected by this API. It cannot be inferred from the editor draft. All RPCs resolve the authenticated
personal workspace; no client tenant/owner ID or service role is accepted.

## Enhancement behavior

Optional server-only `AI_REASONING_EFFORT` configures the shared runner; see the [effort binding, endpoint mapping and compatibility limits](cv-import-enrichment.md#optional-reasoning-effort). Omit it to retain provider defaults. No client override is accepted.

`POST /v1/enhancement` is session/CSRF protected. `AI_PAID_INFERENCE` defaults OFF and must be
exactly `on` to permit provider execution. With OFF, the authenticated endpoint returns HTTP503
`enhancementDisabled`, even with ambient keys. No provider call is needed to discover this state.
Missing configuration returns `enhancementUnconfigured`; ownership and snapshot revision are
verified before operation reservation. Only saved scoped confirmed/authored context, bullets and
independently confirmed answers are projected. Identity/contact fields, employer, raw source and
job text are omitted. Free text may still contain personal information: this is data minimization,
not anonymization or PII detection. Privacy review must address personal information embedded in
scoped free text before real-data use. The current enhancement is scoped career wording, not job tailoring.

The runner sends real HTTPS Chat Completions requests, with an injected transport for offline
checks: OpenRouter primary, direct OpenAI one fallback. Fallback occurs only for transport
availability, timeout with time remaining, or bare 502/503/504. Provider errors, auth, policy,
refusal, unsupported/invalid output, redirects and total deadline/caller cancellation stop it.
OpenRouter internal fallbacks are disabled and one endpoint is pinned. Both routes use static
structured schema, no streaming/tools, `store:false`, 256 output tokens, 32KiB request, 64KiB
response, 5 seconds per attempt and 12 seconds total. Cancellation is best effort and can leave
provider charges unknown. No retries or hidden quality/model escalation occur.

Wording is intentionally constrained: select up to three source facts, optionally remove initial
“I”/“Eu”, capitalize initial letters, normalize terminal punctuation and join with semicolons.
Original single-fact quotations remain valid. This produces concise composed contributions;
it cannot perform free paraphrase, tense correction, semantic entailment or infer qualifications,
metrics or titles. Structured validation rejects every novel wording outside that grammar. Prompt
injection is treated as data, and validation never trusts a model's assertion of grounding. Users
must inspect meaning and sources. This limit is visible in the UI.

Only **Accept wording** saves an approved presentation overlay through existing autosave/version
persistence; facts and answer records remain unchanged. Preview falls back to original visible content if
source text/confirmation or cited-field visibility changes. Accepted wording also respects its output
field's visibility. Editable previews show accepted wording with original text editing available
under **Edit original text**; removing accepted wording
restores original display. This does not confirm career facts or canonical claims. Proposals are
not durably stored before acceptance, and cancelled/replayed operations do not regenerate them.

## Durable operation/attempt accounting

The focused migration binds each operation ID to the verified user/snapshot/revision/target/policy
and reserves separate primary/fallback attempts using existing UsageLedger types. Replays never dispatch another provider
request. A crash after reservation remains an unknown liability; do not re-key an ambiguous request
automatically. Tokens, allowlisted model/request IDs and numeric reported router costs are recorded;
no prompt, CV text, raw response, credentials or provider diagnostics enter accounting. Optional
OpenRouter routing/provider metadata stays null when absent or not a safe identifier and does not invalidate
an otherwise matching-model, valid-ID, stopped and grounded completion. Provider
response uniqueness prevents double ingestion. Missing direct-provider prices, absent usage and
all timeout costs stay unknown, not zero. Reported numeric costs finer than nano-USD or in
unsupported forms also stay unknown. Reported and estimated costs are alternatives, not added.
No monetary quota/budget product or admin aggregation adapter is added. Existing admin stays honestly
unconnected until its report port is supplied. These are low token/time limits, **not a monetary cap**.
Future monetary budget enforcement must reserve liability for both attempts, retain unknown primary
charges, and stop when account or total budget cannot be established.

Accounting mutation RPCs require `AI_WORKER_SECRET` in addition to the verified user token. The
migration installs **no** secret/hash. A separately approved owner DB setup must install the SHA256
hash of a random 32+ character server secret in `app.ai_worker_authorization`, with no browser
access. The same plaintext is a Worker secret only. This prevents authenticated clients from
forging usage. Do not put provider keys into this table. No new user authentication system is added.

## Owner configuration; paid mode remains OFF

No private key file was read, no `.dev.vars` edited, no provider call made and no hosted setup
verified during this implementation. Never paste values into chat, shell arguments, Git, Vite
variables, screenshots or logs. No credential is browser-side.

Use the normal local Worker and its existing [authentication configuration](authentication.md#local-configuration).
Before creating a local credential file, check the ignored path from the repository root:

```sh
git check-ignore apps/api/.dev.vars
```

The owner can privately edit that ignored file with owner-only permissions. Preserve existing
authentication settings and secret values. When provider configuration is needed, add Worker-only
bindings named `OPENROUTER_API_KEY`, `OPENAI_API_KEY` and `AI_WORKER_SECRET` through the approved
private setup path. The fallback OpenAI key is used only for direct OpenAI, never uploaded to
OpenRouter. Keep `AI_PAID_INFERENCE=off` explicit in the file; `.dev.vars` overrides Wrangler's
checked-in variables. Do not source or copy another credential file through a helper.

Run `npm run dev` from the repository root. It starts the pinned `wrangler dev --local` from
`apps/api` with `apps/api/wrangler.jsonc`, which loads adjacent `apps/api/.dev.vars` into the Worker's `env`.
The frontend uses port 5173 and proxies `/v1` to the Worker on port 8787. Restart the development pair after
configuration changes. Authentication still requires the Supabase/session settings, and write
requests still require the existing same-origin/CSRF protection. Signed-in vacancy intake does
not need provider keys. With paid mode OFF, enhancement returns `enhancementDisabled` even when
keys are configured; startup alone proves neither authenticated integration nor provider validity.

Non-secret placeholder fields are in `apps/api/fixtures/worker-config.example.json`. For a later
authorized deployment, configure Worker secrets named `OPENROUTER_API_KEY`, `OPENAI_API_KEY` and
`AI_WORKER_SECRET` through private interactive Cloudflare secret input, never source or CLI literals.
Do not upload now. `AI_PAID_INFERENCE=off` remains the checked-in default. Model snapshots,
OpenRouter endpoint slug and `AI_PROCESSING_POLICY` must be deliberately configured server-side;
there is no implicit model choice, pricing promise or activation from key presence.

Configured global endpoints are `https://openrouter.ai/api/v1/chat/completions` and
`https://api.openai.com/v1/chat/completions`. Strict EU-only is no longer an activation requirement.
Global processing can involve non-EU countries; OpenRouter no-collection/ZDR request preferences and
OpenAI `store:false` do not establish EU-only processing, legal compliance, contracts or account
retention entitlements. A policy reference records configuration, not proof of compliance. The older
strict-EU rehearsal is historical groundwork, not the activation rule for this endpoint.

Official references fetched publicly 2026-10-28: [OpenRouter request/routing format](https://openrouter.ai/docs/api_reference/overview),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[OpenAI storage control](https://developers.openai.com/api/docs/guides/migrate-to-responses).
No signed-in browser/account inspection, live entitlement, model compatibility or quality test is claimed.

## Offline checks

```sh
node --experimental-strip-types --test apps/api/tests/connected.test.mjs apps/api/tests/enhancement.test.mjs apps/api/tests/cv.test.mjs
npm run test --workspace @resumora/web -- src/components/connected.test.tsx
npm run typecheck
python3 scripts/db/test.py --pg-bin /path/to/postgresql/16/bin --suite connected
```

Use synthetic fixtures/injected transports only. SQL runner creates its own private Unix-socket
cluster with fake Auth subjects; it never accepts hosted credentials. Required CI runs broader
regression and populated upgrade checks. Cloud migration application, hosting/account/real-auth
verification and paid/live smoke need separate owner authorization.

## PDF/enrichment follow-up seam

The [connected CV import/enrichment integration](cv-import-enrichment.md) now adds text/scanned/mixed PDFs, native Word reading, evidence review and AI-guided questions through a separate structured operation. This earlier scoped composition endpoint retains its own limits. Reuse authenticated routes, bounded
provider transport and durable operation/attempt reservation; implement a distinct extraction
schema and operation kind. Do not pass PDF contents through the constrained prose-composition
validator, infer confirmation from extraction, or store generated questions as accepted facts.
Preserve page/excerpt evidence and separately saved user answers; canonical publication remains
an explicit validated step. Token/output limits and text-only Chat Completions here are unsuitable
for whole-document vision/OCR without a separately reviewed adapter and cost bounds.
