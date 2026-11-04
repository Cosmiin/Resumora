# Owner-run CV import and enrichment AI evaluation

This is a procedure for the owner's later real-provider evaluation. Agents make no real requests. **Paid inference stays OFF in source and shared environments. No ready live AI link, hosted setup, model entitlement or extraction quality has been verified.** The illustrative local address below becomes usable only after the prerequisites and private configuration are complete. Deterministic injected-provider tests check application behavior; they do not establish whether a model reads a scan or Word file accurately.

## Readiness and approval

Before starting, coordinate with Firstmate and the setup owners:

- Identify the exact feature commit to evaluate (`git rev-parse HEAD` in the evaluation checkout). Feature integration/merge requires separate approval; this guide neither merges nor authorizes deployment. Do not test an older preview and report it as this feature.
- An authorized database operator must have separately approved/applied the connected editor/AI schema and `20261028030000_p4_cv_import_enrichment.sql`, respecting migration order and the photo-reserved `20261028020000` slot. The prepared migration defines a private `cv-imports` Storage bucket bounded to 10,000,000 bytes, owned reads/inserts/cleanup and no overwrite. Migration files and local SQL tests are not hosted permission evidence.
- The approved server-only `AI_WORKER_SECRET` and its matching authorized hash must already be provisioned through the private process in [connected setup](cv-import-enrichment.md#owner-configuration-paid-mode-remains-off). A key alone is insufficient. Do not inspect secret tables, copy another instance's credential files or print secret values.
- Reuse [existing authentication, callback and CSRF protection](authentication.md). Use an approved confirmed test account with synthetic data and verify its tenant privately. No service-role key or browser bearer-token form is needed. Do not create hosted accounts, send confirmation/recovery email or change callback settings implicitly. Those actions retain their separate authorization requirements.
- The owner privately configures Worker-only `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `AI_WORKER_SECRET`, `AI_PROCESSING_POLICY`, `OPENROUTER_ENDPOINT`, `OPENROUTER_MODEL` and `OPENAI_MODEL`. Configure stage models `OPENROUTER_CV_ADMISSION_MODEL`, `OPENROUTER_CV_EXTRACTION_MODEL`, `OPENAI_CV_ADMISSION_MODEL` and `OPENAI_CV_EXTRACTION_MODEL`. The example config contains placeholders, not working model choices. PDF models/endpoint must support the implemented native PDF/file route, including scans; direct OpenAI stage models must support the implemented Responses DOC/DOCX file route. Word has no fallback. Entitlement, compatibility, quality and latency require this owner evaluation.

Do not read keys into chat, shell arguments, Git, frontend variables, screenshots or logs. Never log raw prompts, CVs, provider responses or callback query strings. This procedure adds no service, dashboard adapter, hosted migration or deployment.

## Isolate the local instance

`AI_PAID_INFERENCE` is **instance-wide**, not scoped to a user or an action. Do not turn it on in a shared/deployed Worker or restart another person's preview. Existing ports **5173/8787 must remain undisturbed**.

Use a coordinated isolated checkout with its own ignored `apps/api/.dev.vars`, local Wrangler state and owner-controlled test browser session. Ports share host cookies: use a dedicated owner test browser session so signing in/out cannot replace the shared preview's cookies. Do not copy an existing browser profile or cookies. This is owner browser work, not agent access authorization.

For example, reserve free loopback ports **15173** (web) and **18787** (Worker). Check availability without stopping existing processes; if occupied, coordinate different ports and update every origin/proxy reference consistently. Bind only `127.0.0.1`, never the LAN, a tunnel or a public preview. In the isolated checkout:

1. Check `git check-ignore apps/api/.dev.vars`, then privately configure that instance only, preserving the approved auth bindings and keeping `AI_PAID_INFERENCE=off` explicit. `APP_ORIGIN` and `API_ORIGIN` must both be `http://127.0.0.1:15173`, the browser-facing proxy origin, rather than the Worker port. `.dev.vars` overrides Wrangler's checked-in OFF variable. No `VITE_*` secrets.
2. Use the existing confirmed-account login. If signup/recovery callbacks will be needed, the auth owner must separately approve the exact evaluation callback origins first: `http://127.0.0.1:15173/v1/auth/callback/confirm` and `http://127.0.0.1:15173/v1/auth/callback/recovery`, without wildcards or query suffixes. The documented default 5173 allowlist is not proof these alternative URLs work; preserve existing approved entries and stop if the evaluation origin cannot be supported.
3. In that checkout only, create `apps/web/vite.owner-eval.config.mts` with the following public configuration. Keep it uncommitted and remove it after the session. It inherits the existing filesystem/secret-denial rules and changes only the local port/proxy.

```ts
import { mergeConfig } from 'vite';
import base from './vite.config';
export default mergeConfig(base, {
  server: {
    host: '127.0.0.1',
    port: 15173,
    strictPort: true,
    proxy: {
      '/v1': { target: 'http://127.0.0.1:18787', changeOrigin: false },
    },
  },
});
```

Start only the isolated pair, from its repository root in two terminals:

```sh
cd apps/api
../../node_modules/.bin/wrangler dev --local --ip 127.0.0.1 --port 18787
```

```sh
cd apps/web
../../node_modules/.bin/vite --config vite.owner-eval.config.mts
```

Do not use the root `npm run dev` launcher here: it pins the shared default ports. Confirm both startup addresses are the reserved loopback ports before using the application. No public URL is created. The health endpoint proves process health only, not auth, Storage or AI readiness.

## OFF → owner-enabled local evaluation → OFF

1. **OFF baseline:** sign into the isolated app at the coordinated origin. With `AI_PAID_INFERENCE=off`, an explicit synthetic upload must return `AI_DISABLED` before private source upload/provider dispatch. Questions/rewrite also return `AI_DISABLED`; the older scoped wording endpoint uses `enhancementDisabled`. Observe the safe response code in browser developer tools without copying request payloads/tokens. Manual edits and saved answers remain available. Have the authorized operator record the bounded test-tenant/time attempt baseline below. An auth/CSRF/configuration failure is a prerequisite failure, not evidence of the OFF guard.
2. **Owner enablement:** only after the baseline passes, privately change the isolated instance's `AI_PAID_INFERENCE` to `on`. Stop/restart only that pair. Do not change the checked-in default, global environment, shared preview, hosted bindings or any other instance. Keep the model/policy identifiers and UTC start time in a private evaluation sheet; no secret values.
3. Run the bounded sequence below yourself. A configuration, authentication, ownership, malformed-output or provider failure is a stop-and-record result. Do not loosen guards or re-key an ambiguous action to force a success. Status inspection/reopen is available without redispatch; cancellation is best effort and cannot undo a provider charge.
4. **Restore OFF even on failure or early stop:** stop the isolated pair, privately restore `AI_PAID_INFERENCE=off`, and restart only that pair. Verify an explicit synthetic upload and career action again return `AI_DISABLED` and create no new attempt reservations. Earlier attempts may settle later; a late result update does not authorize another call. Record UTC end time and the OFF result. Stop only the processes started for this evaluation and remove the temporary public Vite config. Keep private configuration ignored. Do not restart shared previews.

## Synthetic fixtures and a bounded run

Create five small readable fictional CVs and one fictional invoice. Keep a private answer sheet with every expected name, employer, date, role, contribution, skill and deliberate omission. Include diacritics, a partial date, a missing end date and an explicitly unmeasured result. No real personal data. Keep files well below resource limits for this quality run:

| Fixture | What the owner checks |
| --- | --- |
| Text PDF CV | Actual readable text maps to the correct fields and numeric contribution order. |
| Scanned PDF CV | Image-only pages are read natively; transcription/evidence uncertainty is visible and manually compared with the page. |
| Mixed PDF CV | Both image and text pages contribute; no silently omitted page or doubled contribution. |
| DOCX CV | Correct native text reading and excerpt evidence with `page: null`; no invented pagination. |
| Legacy DOC CV | A genuine small Word/OLE file, not a renamed DOCX; conservative rejection is reported honestly. |
| Non-CV PDF invoice | Admission is `not_cv` or `uncertain`, with a reason; stronger extraction does not run. |

All formats have a **10,000,000-byte** source limit. PDF admits at most **exactly 10 parsed pages**, including scanned/mixed pages; 11 must be rejected before AI. Word is bounded by text/container limits, **not pages**: DOCX relevant text ≤40,000 characters plus expansion/XML bounds; DOC WordDocument bytes ≤40,000 and metadata ≤160,000. See [input bounds](cv-import-enrichment.md#runtime-and-input-bounds). Do not use pathological compressed or near-limit files as a live quality experiment; boundary/resource verification is separate. A simple ten-page PDF can be one of the three PDF CV fixtures if the owner wants that boundary in this run, without an extra upload.

Run each fixture **once**, inspect its existing operation if the outcome is unknown, and stop early on a problem. If all five CVs are admitted, they use at most ten primary stages (five admission + five extraction). The invoice adds one admission; one question request and one rewrite request add two: **13 primary stages**. Only the six PDF CV stages, one invoice admission and two career stages are eligible for at most one availability fallback each: **≤9 fallbacks, ≤22 attempts total**. Four Word stages are direct-only. This is an action/attempt ceiling for this chosen sequence, **not a monetary budget** or a promise of model price. Failed admissions reduce the count. Do not force fallback, automatically rerun, upload a second copy to bypass unknown status, use the old wording action, or regenerate questions/rewrite during this bounded session. Additional live actions require a newly agreed scope/count.

For each fixture and career action, record only synthetic fixture label, operation ID, safe status/error, UTC times and pass/fail observations privately:

- Compare every extracted field with the answer sheet and original page/excerpt. Reject invented names, employers, dates, numbers, skills, merged roles or overconfident scan transcription. A plausible CV and valid source IDs/numeric checks do not prove factual grounding. Missing/uncertain facts must remain missing/pending. Non-CV/uncertain admission stops extraction. Record quality failures even when schema validation passes.
- Follow the [implemented section review and acceptance contract](cv-import-enrichment.md#customer-journey-and-saved-truth). Compare automatic acceptance and staged fields against the fixture answer sheet and source evidence. Supply missing mandatory synthetic fields before a full checkpoint. Reopen the saved CV and check acceptance/confirmation state, pending facts, facts/sources and unrelated presentation/photo settings. This is editor-draft persistence, not canonical publication.
- Follow the [enrichment journey](cv-import-enrichment.md#customer-journey-and-saved-truth) using one saved eligible role and **Improve** once. Check relevance to the selected role and prior answers, neutral options and no preselection. Where the returned selection modes permit, save choice-only, multiple-choice plus text, zero-choice/text-only answers; if no multiple mode is returned, record it rather than spend another request. Verify exact question/options/selections/text after reopen. Optional **Add to CV** and removal of that copy must preserve the original Q&A.
- Complete that question batch and wait for autosave and its automatic rewrite. This consumes the single rewrite request budgeted above; do not also request a proposal manually. If generation fails, stop and record it under the existing no-regeneration ceiling. The before/after must be pending and the preview unchanged. Inspect all assertions against the whole role and answers, edit the proposal, then **Reject** and verify facts/Q&A remain. Use existing **Undo last change** to restore that same pending review; do not request another proposal. **Accept** it and verify it renders once as the complete experience, keeping original facts and saved Q&A. Add/change/remove a contribution or confirmed answer and verify stale wording yields to current originals. Hiding cited evidence must also suppress accepted wording. Unsupported edited numeric claims must be refused, but semantic invention can still require human rejection.
- While a career request is pending, navigation or a newer edit must prevent the late result from replacing the draft. Do not issue extra live requests just to exercise races; deterministic regressions cover those interleavings. Preserve the latest edit if such a race occurs naturally.

## Inspect actual attempts and unknown cost

The **admin usage dashboard remains unconnected** and cannot supply real totals. An authorized DB operator may inspect only the bounded test tenant and the recorded UTC evaluation window through the existing operations/attempts tables. Do not grant a browser reporting port, read secret tables, dump entire tables or log raw prompts/CVs. The following is a read-only example for the operator's existing authorized SQL client; bind `test_tenant`, `started_utc` and `ended_utc` privately as typed parameters (the notation shown is psql variables). Do not put credentials on the command line.

```sql
SELECT o.id AS operation_id, o.created_at, o.import_id,
       o.target_id AS stage_or_career_target, o.policy, o.route_kind,
       a.id AS attempt_id,
       a.start_data->>'provider' AS provider,
       a.start_data->>'modelRequested' AS model_requested,
       a.start_data->>'startedAt' AS started_at,
       a.result_data->>'modelResolved' AS model_resolved,
       a.result_data->>'status' AS status,
       a.result_data->>'errorCode' AS error_code,
       a.result_data->'usage' AS usage,
       a.result_data->'reportedCost' AS reported_cost,
       a.result_data->>'estimatedNanoUsd' AS estimated_nano_usd
FROM app.ai_enhancement_operations o
LEFT JOIN app.ai_enhancement_attempts a
  ON a.tenant_id = o.tenant_id AND a.operation_id = o.id
WHERE o.tenant_id = :'test_tenant'::uuid
  AND o.created_at >= :'started_utc'::timestamptz
  AND o.created_at < :'ended_utc'::timestamptz
  AND (o.import_id IS NOT NULL
       OR o.policy LIKE '%:questions' OR o.policy LIKE '%:rewrite')
ORDER BY o.created_at, o.id, a.id
LIMIT 50;
```

Use a dedicated synthetic test tenant and a narrow window so these rows represent only this run. Import operations carry `import_id` and `target_id` of `admit`/`extract`; career operations carry the saved role target and policy suffix `:questions`/`:rewrite`. The owner can correlate these with their private operation/fixture sheet. The limit is above the planned 22 attempts; reaching it means the scope is not understood, not that the first 50 are a complete spend report.

Inspect both primary and any fallback rows, even when the user action succeeded. `start_data` has requested provider/model/start time; `result_data` has resolved model, status, normalized token usage and any reported/estimated cost. A reserved attempt without a result, timeout, absent usage or absent cost is **unknown liability, not zero**. A failed or cancelled action can still cost money. Costs are alternatives: use `reportedCost.nanoUsd` when present, otherwise `estimatedNanoUsd`; **never add reported and estimated costs for the same attempt**. Nano-USD is one billionth of USD. Keep unknown rows separate rather than folding them into a reassuring total. Cross-check privately against the provider's own billing/usage, allowing for settlement delay; this app is not an authoritative accrued-spend monitor.

## Timing during an already-authorized evaluation

Use the [bounded import timing events](cv-import-timing.md) to separate upload/enqueue acknowledgement, preflight, reservations, provider round-trip/body completion, validation, settlement, durable review publication and browser observation. The independent local import worker must be running with the isolated instance's owner-provided bindings, as described in [background import setup](cv-import-background.md#worker-execution); upload intake never performs inline AI. Do not reuse another instance's private bindings or add request-triggered worker execution.

Capture one already-authorized representative synthetic import first. Keep browser and server durations separate. Exact queue residence requires the existing authorized operator query linked from the timing guide, not new browser access. Missing events and unfinished attempts stay unknown. Synthetic transports prove boundaries only; no hosted speed improvement has been established. The six-minute processing, 240-second extraction attempt and 330-second extraction stage limits are ceilings, not expected latency.

## Record the outcome and remaining gaps

Record commit, synthetic fixture labels, model/policy identifiers, observations, bounded attempt evidence, unknown costs, and verified OFF shutdown in a private owner evaluation sheet. Do not publish credential values, raw provider data, CVs or authentication artifacts. A failed case is useful evidence; it is not a reason to weaken admission, evidence, ownership or confirmation guards.

This run does not close periodic raw-source cleanup scheduling, hosted Auth/Storage/RLS acceptance, pathological/hosted Worker resource limits, broader scan/Word quality or `cfb` maintenance. Those remain activation gaps before real personal data. Passing a few synthetic files does not establish compliance, retention, broad document accuracy or production readiness. The later prompt/output/apply-back workshop remains separate. The owner executes the real requests; agents perform none under this guide.
