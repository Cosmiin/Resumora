# Connected Job Workflow readiness

Implementation is local/tested with synthetic inputs. Inference remains **off** in the checked-in Worker configuration. No cloud migration, provider call, deployment or Store publication was performed. Stripe is deferred. Apply nothing to a hosted/owner database from this guide without the separate activation safeguards.

## Capture and processing

- Authenticated `POST /v1/jobs` saves the exact pasted source immediately, without Base. Request ID retries return the same durable draft; a new intentional capture gets its own draft.
- `POST /v1/jobs/url` saves a URL receipt before retrieval. Only exact vendor-owned public Greenhouse/Ashby/Lever/SmartRecruiters hosts are fetchable; redirects, auth pages, private/arbitrary destinations and oversized/unreliable content fail closed. A single structured posting is required. A saved URL is never presented as an extracted advert. Retry public retrieval, paste or extension fallback remains available.
- The MV3 extension uses its narrow existing account/device capture connection. Its collector prefers one bounded primary description or one unambiguous structured posting. Ambiguous/split pages require explicit selection/manual paste; no broad main/body scan, form/storage/account collection or automatic application. Installed Chrome/live ATS compatibility remains unverified.
- A durable worker operation is queued after capture. Request acknowledgement never waits for AI. The existing scheduled handler drains bounded work, and supported request execution contexts can wake one worker. Processing can continue after navigating away. Production/runtime scheduling is not established by a unit test.
- P05 extraction, reviewed manual corrections and original source remain separate. Source-span quotes, complete compound requirements, multiple categories, explicit priority, contextual emphasis, employment/geographic restrictions and uncertainty are validated. Manual corrections/reopening invoke no AI. Re-extraction cannot replace manual review.

`GET /v1/jobs/:job/workflow` is read-only. `.../review`, `/extract`, `/fetch`, `/match`, `/prepare`, `/tailor`, `/clarify`, `/action`, `/source`, `/cancel`, `/accept` use authenticated Origin/CSRF-checked POSTs. Account/job selectors are resolved by the existing user-scoped gateway; no page-supplied tenant authority. `/prepare` queues one semantic batch and then one P08 proposal, with no mandatory Suggestions detour.

## Matching and tailoring

Runtime prompt/schema sources are `apps/api/src/jobs/operations.ts` (`jobPrompts`, `jobSchemas`), with executable synthetic examples in `apps/api/tests/job-workflow.test.mjs`. P05 is `vacancy-extraction/3`; semantic P06 is `job-evidence-match/1`; P08 is `job-tailor/1`. P03 remains career questions, not the full tailoring operation.

Matching compares eligible confirmed/authored Base facts and exact saved career answers against complete employer capabilities. Actual accepted CV text is a separate scope. Generated job wording never establishes new career facts. Deterministic `compatibility-1.1.0` aggregation retains the existing 30/25/15/10/10/5/5 category baseline, priority 3/2/1 and strengths 1/.75/.4/0; AND conserves importance and OR takes the maximum. Extra display categories map to the existing primary scoring groups. The indicators are **Profile Evidence Coverage** and **CV Evidence Coverage**, not employer ATS/hiring predictions. Eligibility remains separate; absent evidence does not prove lack of ability. Methodology is not empirically calibrated.

Optional deterministic suggestions group requirements supported by one experience, retain inclusion/dismissal state and offer skip-safe questions. Exact answers go through the existing Base context/CAS API without changing CV prose or invoking AI. New evidence requires matching refresh.

P08 produces summary, both skill groups and per-experience/project/custom-section proposals in one request. Section regeneration is scoped; unchanged/rejected sections remain. Explicit acceptance writes only the current job CV. Source/job/Base/document pins, CAS and worker leases fence stale responses. Incomplete, invalid or interrupted results retain the saved source; interrupted paid work is not automatically redispatched.

The existing provider configuration/attempt ledger/fallback/cancellation interfaces are reused. Output stays within the existing 8,000-token cap; oversized inputs fail rather than silently truncate or increase budget. Fake transport tests establish contracts only, not real-model factual quality or latency. Paid/model-quality evaluation still needs separate authority.

## Current documents and deletion integration

`CurrentJobDocument`/`CurrentJobWrite`/`CurrentJobSourcePin` live in `packages/contracts/src/jobs/current-document.ts`. Current content uses the existing editor/render envelope, stripped of Base import/raw Q&A/reference/hidden context. `fingerprint` hashes the current accepted content/presentation; `provenance.sourceFingerprint` is a different historical source hash.

There is exactly one current CV per owned job + `ro|en` locale. Saving overwrites that key. No tailored history, restore, old-content readback or visible revision labels remain. Internal CAS counters are not user history. `GET /v1/jobs/:job/cv` selects the primary current document; `?locale=ro|en` selects explicitly. `/cv/save` validates an accepted self-contained document. Historical selectors and history/restore paths are refused.

Migration `20261030011000_p7_current_job_documents.sql` is a **destructive forward review artifact**: only current accepted documents survive, old tailored content is removed. It preserves current photo references. Never apply to real data without reviewed retained-current/lost-history effects and the approved backup/rollback/current-data process.

Internal `prepare_job_documents_for_base_removal(tenant)` is ungranted to PUBLIC/anon/authenticated and checks the owned caller. The import lane owns calling it inside full Base/context/history/source deletion. Current job documents remain independent; pending old-Base analysis/proposal content is cancelled/purged. Downloads owns accepted translation metadata/current-locale source-copy integration, including atomic same-job currentID/content-fingerprint/CAS validation after Base removal. No source-body archive or translation chain is authorized.

## Verification ownership

Focused source/API/queue/collector/package/web/native-PG checks are recorded in `verification-plan.md`. A pinned Chromium synthetic localhost journey covers save/review/match/selective acceptance and desktop/mobile layout; its backend transport is mocked. Separate native PG tests cover real persistence/ownership/CAS/deletion preservation. Installed extension authentication, live ATS pages, real provider quality, hosted configuration and end-to-end latency remain unverified.

This lane owns one consolidated import → Base/Q&A → vacancy → match → current tailored CV → PDF/translation integration once stable import/download handoffs exist. Native no-mistakes owns final Review/Test/fixes/lint/push/PR/CI after Firstmate instruction. No parallel pipeline or shared preview change is authorized here.
