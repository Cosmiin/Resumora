# Job capture extension verification handoff

Scope: explicit click MV3 snapshot, persistent capture-only connection under existing web login,
owned draft acceptance independent of Base, durable deterministic outbox, developer ZIP and actual
site entry. Migration `20261028040000_p5_job_capture.sql` is review-only, after pending migrations;
no hosted apply, secret provisioning, deployment, paid inference or Store publication occurred.

Risk: **high** identity/ownership/credential boundary; **moderate** extraction/distribution.
Existing authentication and user-scoped persistence are reused. The server-only secret permits
only dedicated capture RPCs; it is never an arbitrary JWT/database proxy. Credentials cannot read
CVs, edit career data, administer accounts or spend on AI. Full threat/route contract and operator
readiness are in [job-extension.md](docs/setup/job-extension.md).

## Focused development evidence

Checks ran against the implementation tree committed with this plan, using Node 22.23.4 and
synthetic local inputs only. Firstmate's private task-data evidence ledger records the resulting
commit and full logs. Passing evidence remains applicable except where explicitly superseded.

| Check | Result | Execution owner / rerun reason |
| --- | --- | --- |
| API `auth.test.mjs`, `connected.test.mjs`, original seven extension cases | 34 passed | Extension worker; initial integration. Existing transient-refresh test takes ~51 s; no broad rerun afterward. |
| API `extension.test.mjs connected.test.mjs database.test.mjs job-intake.test.mjs` | 32 passed | Extension worker; nullable/manual fallback and deterministic metadata changes. |
| API focused `--test-name-pattern='confirmation callback replacement' tests/extension.test.mjs` | 1 passed | Extension worker; new callback account-replacement fence. Earlier fixture rejected `/signup?redirect_to=…` by matching the whole URL; diagnostic isolated this, pathname matching fixed it. Security assertion retained. |
| Web `src/components/connected.test.tsx src/components/ExtensionPage.test.tsx` | 16 passed | Extension worker; final manual recovery without Base, script-as-data, install/download/Store state and revoke UI. |
| Extension queue + rendered snapshot fixtures | 12 passed; later selected queue/snapshot/worker run 13 passed | Extension worker; queue restart/TTL/retention and worker execution changes. Synthetic DOM layout is explicitly mocked, not Chrome verification. |
| Extension `tests/worker.test.mjs tests/package.test.mjs` | 2 passed | Extension worker; final alarm recovery, actual worker handlers with mocked Chrome/Auth, reproducible fixed archive allowlist. |
| Native PG `scripts/db/test.py --suite capture` | 7 passed | Extension worker; forward migration, capability/replay/concurrency/ownership/outbox and manual/latest Base association. Disposable PostgreSQL 16.15, private Unix socket; no hosted DB. |
| `npm run typecheck` and `npm run build` | Passed | Extension worker; final code. Build includes Wrangler **dry run**, not deployment. |
| `git diff --check` | Passed | Extension worker; final whitespace inspection. |
| Local HTTP `/extension` and `/downloads/resumora-extension.zip` | Both 200; ZIP bytes match public artifact; frame header DENY | Extension worker; final regenerated package. Task-owned port 5189 stopped after check; shared 5173/8787 untouched. |

Final ZIP: 11,581 bytes; SHA256
`40164b4ff47e09cc4224a9f4d900477d13b254ec1f1375f0a4af1aa772c63f24`.
Archive allowlist: manifest/config, four bundled JS files, popup HTML/CSS, three original PNG icons,
README and MIT license. No private env/session files, dependencies or filesystem-discovered assets.
`npm run package --workspace @resumora/extension` reproducibly rebuilds it.

## Essential assertions covered

- Existing session and CSRF authorize pairing; anonymous, foreign Origin/extension/device,
  malformed inputs and foreign selectors are refused. Exact CORS includes no wildcard/credentials.
- S256 proof, one-use code, expiry, concurrent exchange replay and worker-secret enforcement.
  Only hashes are persisted server-side; extension stores no Supabase/user-session credentials.
- Logout, login/callback replacement, session-race fence, explicit disconnect, expired access and
  revoked renewal fail closed. Account switches cannot reassign queued pages to a new owner.
- A commits before processing, B can commit while A is processing, and late A cannot overwrite B.
  An ambiguous retry preserves ID/body and one job; intentional recapture gets a separate draft.
  Worker recreation uses persisted queue; accepted processing uses durable database leases.
- No Base is required. Latest saved Base association is server-resolved. Retry does not silently
  acquire a newer Base or create another draft. Foreign CV/job/account authority is rejected.
- Bounded transport, attempts/backpressure, TTL/discard, outbox lease expiry/stale settlement,
  retry exhaustion, unavailable responses and no false server-saved state before acknowledgement.
- Synthetic Greenhouse/Ashby, rendered LinkedIn/BestJobs and generic main/article fixtures;
  hidden/forms/navigation/comments excluded, source data preserved, no source code execution,
  no body-wide scrape, clear restricted/dynamic/frame/manual fallback. Unknowns stay unknown;
  general skills are not silently classified as required/preferred, and salary is never inferred.

## Validation ownership and limits

Firstmate invokes native no-mistakes after this implementation handoff. That pipeline owns further
review, fixes, lint, push, PR and mandatory CI; no worker pipeline has started. CI includes the
extension tests and existing API/web checks. Existing database CI runs full migration/RLS/upgrade
checks and then the added P5 capture suite. Broader unchanged regressions are reserved for CI.

Unverified: actual installed Chrome `launchWebAuthFlow`, extension Origin/CORS/permissions/worker
lifecycle, live ATS compatibility, hosted SQL/RLS/PostgREST configuration, real provider revocation,
hosted framing/proxy/cron headers and deployment. No live or signed-in browser action was performed;
the worker test mocks Chrome and the DOM tests mock layout. No end-to-end browser/cloud latency
claim. Latest measured local SQL acceptance was **20.96 ms**, including a local `psql` process;
this establishes only the local synthetic persistence boundary's observed timing.

Other ATS adapters remain planned. Full analysis, translation, tailoring and catalog lifecycle are
owned by the queued vacancy lane; capture performs no AI and does not enable paid policy. Billing,
photo, PDF/template and unrelated import regression categories are not affected here. No additional
framework/hosting/queue service was introduced. Ordinary Store installation still requires an
actual published listing; the provided ZIP is explicitly for local developer unpacked loading.
