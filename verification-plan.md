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

The initial four-adapter limitation and committed localhost ZIP described above are superseded by the review changes recorded below. Full analysis, translation, tailoring and catalog lifecycle are
owned by the queued vacancy lane; capture performs no AI and does not enable paid policy. Billing,
photo, PDF/template and unrelated import regression categories are not affected here. No additional
framework/hosting/queue service was introduced. Ordinary Store installation still requires an
actual published listing; the provided ZIP is explicitly for local developer unpacked loading.


## Review fix scope (supersedes initial distribution/coverage claims)

The source now emits the downloadable ZIP in the site build using required exact public APP_ORIGIN/API_ORIGIN values and a fixed manifest public key. There is no committed local archive. A standalone package command remains available; local Vite serves a generated local package. The default API accepts the shared packaged identity without per-user operator registration. Production setup, any eventual Store identity adoption/publication and installed Chrome verification remain operator-owned and unperformed.

Focused regression scenarios execute two configured site builds and inspect their emitted ZIP contracts (origin, fixed identity, host policy, file allowlist, deterministic bytes), refuse an unconfigured release, and fetch the local generated download. Collector fixtures now include Lever, Workday, SmartRecruiters, iCIMS, Oracle/Taleo, SuccessFactors, Workable, Recruitee, BambooHR, Personio, Teamtailor, Indeed, structured-only unknown hosts and bounded generic heading/section fallback. These are synthetic DOM checks with mocked visibility, not live or installed-Chrome evidence. API cases cover default identity pairing/CORS and explicit structured locations; queue cases cover third-attempt acceptance through terminal polling without redelivery. The old ZIP hash above belongs only to the original superseded local archive.

Review fix verification in the isolated worktree: `node --experimental-strip-types --test apps/extension/tests/*.test.mjs apps/api/tests/extension.test.mjs` passed 45 tests; `npm test --workspace @resumora/web -- src/components/ExtensionPage.test.tsx` passed 4 tests; `git diff --check` passed. Package tests exercised the real Vite build twice with synthetic HTTPS origins, refused a missing-origin release and fetched the development ZIP over local HTTP. No full repository test/lint suite, cloud action, Store action or installed-browser check ran in this review phase.


## Local-scope and ownership repair evidence

Focused review verification: `node --experimental-strip-types --test apps/extension/tests/*.test.mjs apps/api/tests/extension.test.mjs` passed 69 tests. This includes the prior incomplete-section and inert HTML-separator regressions, local recommendation/profile exclusion, delayed tab lookup and extraction across account/generation changes, serialized connection/queue commits, correctly unknown certification/candidate-language labels, and two synthetic HTTPS site builds with their generated package contracts. `git diff --check` passed.

The standalone ignored local developer ZIP was regenerated explicitly for `http://127.0.0.1:5173` (14,178 bytes, stable identity `nijbkdlbbeepfncgdldnmppflmkjmhpj`). Release builds continue to regenerate for their configured public origins; this local artifact is not a production or Store package. Setup and extension README describe the local extraction and ownership boundaries and retained original structured data. No full repository suite, installed Chrome, live account/platform, cloud action, deployment or Store publication was performed in this repair.

## 30 October full Job Workflow scope (supersedes extension-only scope)
High risk: tenant/auth/CSRF, URL SSRF, immutable source/candidate evidence, stale concurrent writes and provider operation accounting. Affected: immediate paste/URL/extension intake, separate source/extraction/manual-review versions, semantic profile-vs-visible-CV coverage, optional stateful suggestions, full P08 section proposals accepted into existing independent job documents. Downloads/languages owns renderer/translation, import owns import/enrichment changes; this lane owns one final integration at stable handed-off heads.

Development checks: existing API connected/extension/database/job-intake and directly added workflow cases; extension snapshot/queue/worker/package fixtures; web connected/job-adapter and workflow UI cases; native SQL capture/job-documents plus workflow ownership/replay/CAS/source-fence cases. Essential anonymous/foreign tenant/CSRF/origin/oversize/injection/logout/accountswitch/retry-vs-new-intent/stale-source/Base/proposal/usage boundaries. Synthetic injected outputs only, paid inference OFF. URL acquisition must refuse unsafe/private/redirect/type/size/timeout destinations and offer paste/extension fallback. Source text retained exactly; AI references must resolve to eligible saved facts, source quotes and component IDs. Matching percentages are deterministic documented evidence coverage, never hiring probability.

Consolidated integration owner: this lane once import and downloads/languages stable handoffs exist: import/review -> saved Base/Q&A -> capture -> extraction/review -> match -> selective job tailoring -> independent save/reopen/history/account separation -> actual PDF/translation when available. Feature-worker evidence reused; mandatory broader no-mistakes/CI owned by pipeline after explicit Firstmate instruction. Billing/payment remains N/A (deferred); cloud/deploy/live provider/Store actions unauthorized. Real installed Chrome/live ATS quality remains unverified; approved synthetic isolated localhost browser exception only.

## Current lifecycle correction (latest owner policy, 30 October)
The preceding full-workflow/history language is superseded for tailored documents: exactly one CURRENT accepted CV per owned job+document locale (ro/en), no historical content or restore endpoint/UI. `20261030011000_p7_current_job_documents.sql` is a destructive FORWARD REVIEW ARTIFACT: it projects each current accepted document, strips Base/import/raw Q&A context, removes old tailored versions and retires historical RPC grants. No owner/hosted migration executed. Import owns full Base deletion/default-state fence; downloads owns translation/export selectors. Internal `prepare_job_documents_for_base_removal` has no PUBLIC/anon/authenticated execution grant.

Direct evidence: current document native-PG suite passed 4/4 (6 including native invariant checks), including seeded two-version forward preservation, old-content/private-context absence, SQL/TS projection parity, per-locale overwrite/CAS/replay, foreign-account/legacy-history/helper denial and independent load/save after synthetic Base removal. Log `current-documents-sql-3.log` in private task evidence. Current adapter web suite passed 7/7; connected workflow web passed 16/16 before latest adapter replacement (same panel). Shared API workflow cases passed 14/14 after current-document integration. Types passed. Evidence is local synthetic only and not final pipeline/head assurance.

Remaining integration: consume import-owned current/default Base helper when handed over; use actual stable downloads/import heads for ONE consolidated browser/PDF integration. Real model quality, installed Chrome/account flow and hosted activation remain unverified. Mandatory no-mistakes is not started and will own review/fixes/push/PR/CI only after implementation completion and Firstmate instruction.

## Stable correction checkpoint for downstream integration

Latest authority remains current-only job+locale, no tailored history. Source pin exports now include CurrentJobWrite, CurrentJobSourcePin and shape-only isCurrentJobSourcePin. CurrentJobDocument.fingerprint hashes the CURRENT accepted content/presentation; provenance.sourceFingerprint is a distinct historical Base hash. Downloads owns the atomic sourceCurrent alternative/translation extension; current direct manual route does not yet accept that alternative.

Authoritative internal current_job_document_row is shared by public current reads and workflow request/settlement/acceptance. Default source is primary, explicit locale is exact, new generation target is explicit/Base language. Source and target current IDs are separately pinned. Native RO-primary/EN-updated-last case passed, including stale-source and stale-target outcomes.

Compact affected ledger (Node22.23.4; synthetic only; logs under /home/cosmin/firstmate/data/resumora-job-extension):

| Check | Observed result / applicability | Evidence |
| --- | --- | --- |
| npm run typecheck | Passed with primary/source-target pin correction | workflow-types-primary.log |
| Job workflow API contracts + real configured-runner seam with injected transport | 21 passed before primary-route correction; existing provider cap 8000 exercised, no real network | workflow-api-provider-seam.log |
| Combined connected/extension/job/workflow API | 41 passed after main account-header fixture repair; later added API cases 18/20/21 passed in focused runs | workflow-api-integration-2.log, workflow-api-boundaries.log |
| Native workflow | 7 passed after membership/replay/source-version/current guards; new selector covered in current-doc suite | workflow-sql-ownership-final.log |
| Native current document + seeded forward migration | 8 passed + 2 native invariants at primary correction; includes CAS race, foreign source/photo, no Base archive, SQL/TS projection parity, post-Base-removal save and primary/EN stale pins | current-documents-sql-primary-1.log |
| Web connected/current adapter/extension entry | 27 passed; later no-history App assertion 1 passed (7 unrelated skipped) | workflow-web-final.log, current-ui-no-history-final.log |
| Extension queue/worker/package | 14 passed; real configured builds, fixed archive allowlist and generated ZIP contracts | workflow-extension-package.log |
| Collector fixtures | 28 passed; ambiguity/selection/oversize/private-data/separator cases | workflow-snapshot-1.log |
| Actual pinned Chrome156 localhost | Synthetic product paste/save/review/match/summary acceptance/current save passed; 390px width=scrollWidth=390; collector real-DOM complete/ambiguous/selection/privacy/structured-separator checks passed. Backend transport mocked, NOT installed-extension/account/provider assurance. | browser-proof/journey-3.out, journey-result.txt, collector-result.txt, desktop.png, mobile.png |
| Build | Passed configured site + Worker dry run before final small source/target metadata and UI corrections; mandatory pipeline build remains required | workflow-build.log |

Development reruns were limited to changed contracts/new security cases; earlier passing unchanged proofs were reused. Old history/restore tests were replaced by current-only behavior under later owner authority. The original cancelled no-mistakes run was never resumed or passed. No new run has started.

Remaining: exact stable import/default-Base deletion fence and downloads30020000 handoffs, followed by this lane's ONE consolidated product integration/PDF/translation pass. Current Base source consumers still need final reconciliation with import's owned active/default state contract; no duplicate deletion implementation was added. Native test runner currently exercises through P7; integrated later migration phases must be included when downstream heads land. Existing installed-Chrome auth/live ATS/model quality/cloud scheduling/configuration remain explicitly unverified. Final no-mistakes/CI owns broader review, fixes, lint, push and PR after complete handoff/instruction.

### Final affected API/presentation correction

The new primary-RO-source/independent-EN-target regression exposed absent optional presentation values being assigned as explicit `undefined` during acceptance of an existing current document. Preserve absence for photo/template fields; the existing wire validator now accepts that path. `node --experimental-strip-types --test apps/api/tests/job-workflow.test.mjs`: 22 passed (`workflow-api-primary-final-2.log`). `npm run typecheck`: passed (`workflow-types-presentation-final.log`). These reruns cover the changed acceptance path; prior unchanged SQL/browser evidence remains applicable.

Actual approved synthetic Chrome at localhost15413 rendered `/extension` and exposed the real developer ZIP link and explicit unpublished Store/developer-loading disclosures (`browser-proof/site-extension-snapshot.txt`). HTTP download produced a 13-entry allowlisted source package (manifest v3, version0.1.0, local configured API origin), with no environment/session/credential files. It is not installed-Chrome authorization proof. No broader integration has been repeated: frozen import/default-Base and downloads heads are still required from Firstmate before the single consolidated integration and final pipeline handoff.

### Frozen bounded legacy-canonical preservation correction

High-risk current-document/data-integrity/auth boundary, owned by job lane; no general renderer. Added forward review artifact30012000, exact deferred import purge-authority call, strict converter and whole-account preflight/collision refusal, existing current-store transfer with exact photo refs, application current link/opaque historical sent metadata and converted-family legacy command retirement. Import owns subsequent full canonical/profile/analysis DELETE closure, final truthful refusal UI and actual Base lifecycle state; no deletion is executed by this migration or transfer helper. No owner/cloud apply.

Affected native checks: `python3 scripts/db/test.py --suite legacy-preservation` with the task-private relocated PG16.15 binary/share/library arguments: **10 passed** (`legacy-preservation-final-2.log`), covering wire-valid identity, plain contacts/skills/user summary, hidden context exclusion, exact current photo, equivalent-head deduplication, differing-content refusal, unsupported-head full rollback, ambiguous legacy primary refusal, immutable sent metadata/current application links, public legacy command retirement after transfer and anonymous/foreign/missing/stale authority rejection. `--suite job-documents` rerun because the transfer guard changed: **8 passed + 2 native invariants** (`current-documents-legacy-seam-2.log`), including current-only CAS/tenant/source pins, seeded forward projection and post-Base-removal independent save/photo protection. Both private Unix sockets only, no hosted credentials/TCP/paid provider. Native fixture supplies only the exact import guard seam when later import migration is absent; full final import purge still needs consolidated integration. `git diff --check` passed.

No unrelated web/API/build/extension checks repeated for this SQL-only correction. Unsupported conversion cases are explicit in docs/setup/job-workflow.md. Downloads frozen dependency now known: f66a6e485cb9d5b6a1553ad6f9b191c67d089c2c; final import deletion head still awaited for one consolidated integration. No new no-mistakes run started; final mandatory review/fixes/CI remain pipeline-owned after complete handoff/instruction.
