# Independent job editor documents (I2)

This bounded editor adapter saves durable, accepted job-specific revisions without advancing the Base editing head. It reuses `resumora-editor-draft/1`, the current editor/preview shapes, owned `target_job_contexts`, and the existing verified-session/Origin/CSRF boundary. It does not publish a canonical CV, create career claims, implement matching/tailoring/translation, call a provider, consume tailoring credit, or add a UI workflow. Canonical publication and its confirmations/FKs remain unchanged.

The forward migration `20261029010000_p3_job_editor_documents.sql` is local implementation only. Hosted application, migration and deployment remain separately gated.

## Stored contract

`resumora-job-editor/1` has explicit document `acceptance: accepted`; each wording change independently requires `acceptance: accepted` and an origin. Pending proposals cannot enter this saved-version API. Sending a proposal does not overwrite an accepted version. A reviewed replacement requires an explicit save and the current document revision.

Each document pins one owned immutable Base snapshot UUID/revision. Its facts, original sources, exact career answers and import/review metadata remain in that snapshot. No blanket dual-write, source migration, or duplicate career profile is introduced. Every saved revision pins the owned job ID, nullable reviewed job version and server-computed fingerprint of the job intake/requirements/version. Later Base saves do not change an existing job document. To use a different Base snapshot, create a separate document after explicitly deleting the current job document; saves cannot silently repin its source.

`selectedFacts` records exact entity/field/value/source handles from the source snapshot, and `selectedAnswerIds` references confirmed answers. These select evidence eligible for job wording; presentation controls visibility. Editor handles never substitute for canonical UUIDs. Selected facts must already be authored/confirmed, and referenced sources must exist in the pinned snapshot. Wording targets are the current editor's roles and non-language optional entries. Evidence must be that target's context/details/bullets or confirmed target answers with a source handle. Wording cannot replace titles, employers, dates, sources, statuses or answers. Accepting wording is approval of presentation, never factual confirmation. Semantic entailment/quality belongs to the later tailoring proposal workflow; these deterministic persistence checks enforce scope and provenance rather than claiming semantic verification.

`presentation` accepts order, hidden sections/fields, template version and photo overrides. Omitted properties inherit from the pinned snapshot, never from latest Base or global preferences. A null photo explicitly removes it. Well-formed unknown template references survive. Existing Base presentation and accepted wording remain available in the source; job changes overlay only their explicit targets. Job photo references use existing ownership/readiness checks and are retained by upload expiration alongside other historical references. Explicit photo deletion still makes that asset unavailable; restoring a version with a deleted photo fails rather than resurrecting it.

`localAdditions` supports manual bullets and skills with `scope: job-only`, `origin: user_authored` and namespaced handles. Their projection uses a separate job-local manual source. They do not become career answers or Base facts and cannot be used as independent source evidence by this adapter. Promotion into career knowledge is deferred to a separate explicit operation. General factual replacement, source repinning and additional wording targets are not silently inferred from editor payloads.

The render projection is assembled by `projectJobEditor` using the strict existing decoder and a clone of the pinned source. Generated text goes into the existing `presentation.approvedWording` overlay; original fact values remain intact. API responses return this `draft` plus version metadata and the persisted adapter `payload`. The source envelope itself remains obtainable through the existing owned snapshot API. Never send a projected job draft to the Base save endpoint as an automatic side effect.

## Worker endpoints

All routes are under `/v1/jobs/:jobId/cv` and require the existing authenticated session. Writes also require the existing Origin/CSRF headers and JSON media type. The request body is bounded by the existing 1 MiB reader; stored adapter payloads are bounded to 512 KiB. The source snapshot retains its existing independent 1 MiB limit.

| Method/path suffix | Behavior |
|---|---|
| GET `/context` | Server job pin/fingerprint and the job's original source snapshot/revision; a caller can explicitly select another owned Base snapshot at document creation. |
| GET (no suffix) | Active document head or null. With both `documentId` and `versionId` query parameters, load that historical version scoped to the same job/document. |
| GET `/history?documentId=...&beforeRevision=...` | Up to 20 versions newest first; optional exclusive positive revision cursor. |
| POST `/save` | `{requestId, documentId: null or UUID, expectedRevision, payload}`. Null creates a document with expected revision zero; subsequent saves require the exact active document UUID/head. |
| POST `/restore` | `{requestId, documentId, expectedRevision, versionId}`. Append a new immutable revision copying the selected accepted version, preserving earlier versions and `restoredFrom`. |
| POST `/delete` | `{requestId, documentId, expectedRevision}`. Soft-delete only that job document; future reads/restores/saves of it fail. Base, original answers, sources and other job documents remain independent. A later explicit create gets a new document ID. |

Save/restore/delete use the existing transactional idempotency ledger. Identical retries return the same durable revision; changed bodies under the same command/request ID fail. Only the new revision ID is stored in the request result ledger; no payload is put in the provider usage ledger. Deleted documents and inactive accounts fence content replay. Expired request keys retain the existing recovery error rather than silently generating another revision. There is no provider operation or async cancellation workflow in these synchronous persistence commands; callers retain request IDs after uncertain transport outcomes.

The owned job row/context serialize concurrent document writes. CAS prevents concurrent saves/restores from replacing later accepted revisions. A changed job fingerprint/version fences stale save or restore; reading historical versions still returns their historical pin. Tenant/membership and photo row locks order writes against deletion/revocation. New tables are RPC-only with RLS enabled and no direct authenticated/anonymous access; existing exposed table policies are unchanged. Version rows are immutable and document/parent/restore/source/job/photo references carry tenant-scoped FKs.

## Focused local verification

Use the existing API/node and native disposable PostgreSQL harnesses. No hosted credentials, SQL, provider calls or new services are needed:

```sh
node --experimental-strip-types --test apps/api/tests/job-documents.test.mjs apps/api/tests/auth-runtime.test.mjs apps/api/tests/database.test.mjs apps/api/tests/cv.test.mjs
python3 scripts/db/test.py --suite job-documents --pg-bin /path/to/existing/postgresql/bin --receipt /tmp/job-documents.json
npm run typecheck --workspaces --if-present
```

The new SQL suite covers independent jobs/Base, immutable versions, load/history pagination/restore, replay/body mismatch/expiry, concurrent acceptance, tenant/resource/source isolation, pinned old Base, reviewed job changes, accepted-only scope, job-local facts, delete/revocation fencing, photo ownership/readiness/retention and no canonical/provider side effects. The mandatory full database suite also includes it. The I0 integration owner must additionally verify imported snapshot options/selected answers/rewrite metadata after normal I0+I2 reconciliation; this slice does not claim that integration has already run.
