# Resumora — current-state handoff

Updated 4 November 2026. Read this file, then [the environment guide](setup/environment.md), before changing or running the project.

## Product scope

Resumora is an authenticated Base CV application. The supported core is authentication, CV ingestion, manual Profile editing and enrichment of the Base CV. Each account has one Base CV. A second upload requires explicitly removing the existing Base CV first; account access is preserved.

Import supports PDF and Word documents, background processing and recoverable review. Experience enrichment retains confirmed answers separately from proposed wording; the user explicitly accepts wording into the CV. Skills improvement extracts from accepted experience and cleans up the combined inventory. Content-language detection, language versions, saved history and document presentation support these flows.

Current requirements live in [the product description](product/prd.md), [CV journeys](product/customer-journeys.md), and the linked frontend contracts. Dated files under `archive/` are historical evidence, not a roadmap or an active task list. Do not restart work from their unchecked steps or old launch instructions.

## Skills improvement contract

- Only an explicit click starts a new improvement. Opening a screen or refreshing must not start paid generation.
- All Profile mutation is blocked during preparation, model calls and result saving. Existing skills remain visible until successful publication.
- An attempt has one absolute deadline: 90 seconds from the click. Its deadline is saved with its operation ID; refresh does not reset it.
- At expiry, discard that attempt's progress, abort browser requests/polling, preserve the previous skills and unlock Profile editing. A later click creates a new operation ID. Old receipts with no deadline are discarded rather than given a new window.
- Late responses cannot publish a discarded result or unlock/overwrite a newer attempt. The save acknowledgement also checks wall-clock expiry, independently of browser timers.
- An already-dispatched database save retains its identity for reconciliation. Discarding it removes its right to publish skills, not the evidence needed to determine what the database saved. The retained draft is saved against the acknowledged revision. During a connection failure, persistence confirmation and another generation can wait for save recovery; editing is unlocked. Do not claim a remote rollback completed without acknowledgement.
- Provider work already dispatched can still finish and record accounting. The deadline prevents it from changing the Profile; it cannot guarantee upstream computation or billing stopped.

The 90 seconds is a ceiling, not a target duration or a measured provider-latency claim. See [Improve skills](frontend/improve-skills.md) for the response contract and inventory rules.

## Source and handoff state

The complete source is in this working tree, including substantial retained local CV, enrichment and language changes. The branch HEAD alone does not represent the running application. Preserve modified and untracked files; do not reset, clean, or replace the checkout with HEAD.

A local Git handoff checkpoint is recorded at `refs/codex/skills-handoff-20261104`. It contains the complete source and this documentation without changing the active branch or staging area. It is a local reference, not a pushed branch or deployed release. When transferring the project, transfer this ref or the full non-ignored source tree; handing over Markdown alone explains the project but does not reproduce the software.

Private runtime bindings, installed dependencies, build outputs, hosted data and provider credentials are not part of the source handoff. Configure the destination deliberately; do not copy secret values into the Markdown or source control.

## Architecture

| Location | Responsibility |
| --- | --- |
| `apps/web/src/App.tsx` | Editor composition, saves, navigation and mutation guards |
| `apps/web/src/workspace` | Per-account document lifecycle, saved head, unresolved writes and history |
| `apps/web/src/components/ImproveSkills.tsx` | Skills attempt UI, deadline and stale-response fencing |
| `apps/web/src/base/intelligence.ts` | Intelligence HTTP client and receipt recovery |
| `apps/api/src` | Authenticated Worker API, persistence gateways and provider operations |
| `packages/contracts/src` | Shared CV model, transport validation and intelligence contracts |
| `supabase/migrations` | Ordered database history; preserve migration order |
| `scripts/import-worker.mjs` | Background CV import processing |

The durable adapter is used by the application. Memory adapters and synthetic provider transports are test infrastructure. Saving a draft, accepting generated wording and publishing canonical facts are distinct operations. Revision checks, idempotent request identities, account isolation and late-result guards protect those boundaries.

## Runtime

The active app runs in Linux/WSL at `http://127.0.0.1:15173/#/profile`. The local API runs on 8787. `resumora-dev.service` manages the frontend, API and one CV import processor. Hosted Supabase provides authentication, database and storage; configured OpenRouter/OpenAI services supply model calls.

Use Node 22.23.4 from `.nvmrc` and the existing npm workspaces. Runtime configuration belongs only in the ignored `apps/api/.dev.vars`. Start, inspect and stop using `npm run dev:start`, `npm run dev:doctor`, `npm run dev:status` and `npm run dev:stop`. Do not start duplicate manual processes. The [environment guide](setup/environment.md) is authoritative for this machine; [local development](setup/local-development.md) explains clean-checkout setup and checks.

## Verification evidence

The skills regression checks cover the 90-second lock and release, a fresh operation after expiry, ignored late responses, persisted deadline roundtrips, expired receipt recovery, React StrictMode recovery, cancellation during polling, late save acknowledgements, timer suspension and stalled request preparation.

Final verification on 4 November 2026:

| Check | Result |
| --- | --- |
| Frontend suite, `npm run test --workspace @resumora/web -- --maxWorkers=2` | 848 tests passed across 82 files |
| API suite, `npm test --workspace @resumora/api` | 459 tests passed |
| Workspace typecheck | Passed |
| Frontend production build and API dry-run bundle | Passed; existing large-chunk warning remains |
| Current documentation links and anchors | No broken local targets |
| Whitespace check | Passed |
| Independent skills lifecycle review | Findings fixed and rechecked |

The new deadline/lifecycle regressions were observed failing before their fixes. The final frontend run used the settled source after review corrections. Automated suites use synthetic inputs; they do not establish hosted provider quality, live latency or a real microphone round trip. No database schema change was needed for the optional deadline metadata.

The read-only environment check on 4 November confirmed the correct checkout/service, pinned Node, reachable frontend-to-API session endpoint and one import worker. AI is configured on locally; that check did not invoke providers or process a CV. No hosted mutation, paid inference, deployment or push was performed for this handoff.
