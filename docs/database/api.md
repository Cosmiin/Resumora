# P0–P3 SQL command contract

These functions live in schema `app`. They are a database boundary for the modular monolith; SQL migrations do not configure the project's PostgREST exposed schemas or Auth. The [Base CV persistence handoff](../frontend/base-cv.md#persistence-component-handoff) owns frontend/Worker composition, and [authentication setup](../setup/authentication.md) owns Auth configuration. Server callers must use the verified user's JWT/subject, preserve these request/revision fields and translate `PT400/401/403/409/410/413/422` SQLSTATEs to the corresponding HTTP status. The separate [editor gateway contract](gateway.md) owns the unconfirmed draft RPCs and their Worker mappings. Never use a service identity to trust a browser-supplied user or tenant.

`auth.users.id` is the stable account identity. Email and future Google identity changes must resolve to that same Supabase UID, rather than create ownership by email. Initial workspaces are personal owner-only; no team invites or membership editing endpoint is present.

## Request identity and revisions

Every mutation takes a nonzero UUID request key. Generate one per user intent and persist it with the exact body until the result is known. Its unique scope is **tenant + server-derived user + command + key digest**. The fingerprint covers the full command body and server context, including expected revisions and selected versions. Concurrent equal requests wait on the unique row and return one committed result. Business graph, head, audit and replay result commit in the same transaction. There is no external effect in P0–P3.

For example, if Save committed but the response was lost, retrying the same key/body returns that saved version even if a later save has advanced the head. Reusing the key for changed text produces `409 IDEMPOTENCY_BODY_MISMATCH`. A newly keyed stale edit produces `409 VERSION_CONFLICT`; keep local edits and reconcile. After the technical seven-day replay window, `410 REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE` requires recovery of the existing resource. The key row remains reserved; no retention job or production policy is implied. Authorization is checked again before replay. Analysis replay also checks current confirmation validity.

Revisions start at zero for new profiles/documents/jobs/applications/actions. A successful mutation increments the relevant resource revision. Profile publication takes **both** the expected profile revision and expected Base document revision. Job publication, document publication and application continuity have independent revisions. Do not substitute an immutable version's UUID or sequence for a mutable revision.

## IDs at the canonical boundary

RPC arguments/results and all normalized keys are UUIDs. Portable canonical CV fields use `id_<lowercase UUID>` to satisfy the existing leading-letter ID grammar. This is a lossless codec, not a change to canonical CV 1.0.0.

| Context | Example |
|---|---|
| SQL claim ID / `p_confirm_claim_ids` entry | `12345678-1234-4234-8234-123456789abc` |
| Canonical claim `id` / `nameClaimId` reference | `id_12345678-1234-4234-8234-123456789abc` |
| RPC `baseCvVersionId` | `23456789-1234-4234-8234-123456789abc` |
| Saved canonical `snapshotId` | `id_23456789-1234-4234-8234-123456789abc` |

Allocate IDs consistently before sending a new manual canonical graph. A changed immutable claim requires a new claim ID; retain the old ID only for unchanged content. Fixture labels such as `claim_name` and abstract ATS `item_*` handles are not database foreign keys. The test codec namespaces canonical fixtures per synthetic user. ATS math tests build a separate canonical evidence graph explicitly; they do not reinterpret the original Mara CV or shared UI fixture as relational truth.

For each new job version, `confirm_job` allocates **new requirement and atom row UUIDs**. Client requirement/atom `id` fields are rejected. Preserve a reviewed stable `key` such as `sql` across versions, then use the returned `requirements[].requirementId` and `atoms[].atomId` when submitting evidence for that exact version.

## Granted mutation surface

All signatures below return JSONB. Parameter order follows SQL migrations; use named binding in an adapter. `key` abbreviates the request UUID. No mutation accepts a tenant or acting user from the client.

| Function | Inputs after key | Result and effect |
|---|---|---|
| `provision_workspace` | none | `tenantId,userId`; stable owner workspace, preferences and membership |
| `set_preferences` | `ui_locale text, preferences jsonb` | RO/EN UI preference; independent of document locale |
| `record_consent` | `purpose, policy_version, decision` text | append-only selected consent event |
| `request_deletion` | none | marks tenant deleting and raises deletion generation; new writes/reads fenced; **does not execute erasure** |
| `save_profile_checkpoint` | `profile UUID/null, expected_revision bigint, expected_base_revision bigint, cv JSONB, confirm_claim_ids UUID[], as_of date` | `profileId,profileVersionId,revision,baseDocumentId,baseCvVersionId,baseRevision`; atomic confirmed profile graph and Base CV publication |
| `save_cv_checkpoint` | `document UUID, expected_revision bigint, profile_version UUID, layout JSONB, locale text` | `documentId,cvVersionId,revision`; new Base content/layout version |
| `restore_cv_version` | `document UUID, expected_revision bigint, historical_version UUID` | same IDs/revision plus `restoredFrom`; creates a new version with the historical profile, job version, tailored Base snapshot reference, layout, locale and tailoring state; preserves history |
| `revoke_claim` | `claim UUID, reason text` | append-only confirmation event; invalidates current reuse, retains historical versions |
| `confirm_job` | `job UUID/null, expected_revision bigint, input JSONB` | `jobId,jobVersionId,revision,requirements`; reviewed job capture/requirements and head |
| `save_job_cv_checkpoint` | `document UUID/null, expected_revision bigint, profile_version UUID, job_version UUID, layout JSONB, locale text, tailored boolean` | `documentId,cvVersionId,revision,tailoringState`; independent job CV, never moves Base/profile head |
| `save_application` | `application UUID/null, expected_revision bigint, job_version UUID, document UUID/null, chosen_cv UUID/null, stage text` | application ID/revision; chosen CV must belong to that job/document |
| `save_next_action` | `application UUID, action UUID/null, expected_revision bigint, kind text, label text, due_date date/null, state text` | next action ID/revision; does not mark sent |
| `mark_sent` | `application UUID, expected_revision bigint, cv_version UUID/null, actual_sent_date date/null` | sent event ID/revision and distinct-app `sentCount`; user attestation, not email delivery |
| `retract_sent` | `application UUID, expected_revision bigint, sent_event UUID` | retraction ID/revision/count; same application's actual sent event only |
| `publish_analysis` | `profile_version UUID/null, cv_version UUID/null, job_version UUID, evidence JSONB[], gate_assertions JSONB[], as_of date, locale text` | full analysis output; pinned deterministic inputs and complete explanation |
| `publish_readiness` | `profile_version UUID/null, cv_version UUID/null, job_version UUID/null, checks JSONB` | readiness ID, rubric version, checks, `numericScore:null` |

`layout` means the canonical `document` object (sections, item IDs, section order, visibility, contact presentation), not the complete CV envelope. `save_cv_checkpoint` is for Base CV; use the job command for job documents. Inputs must retain the exact profile/item/claim lineage, not just share a tenant. Optional `layout.photoMode` selects `base` (latest saved Base editor setting on each new revision) or `override` (explicit `layout.photo`, including null). Omitting the mode retains a job’s previous mode; new jobs follow Base. Canonical `document.photo` pins the resolved asset/crop/shape/visibility. Restore pins the historical setting and mode, and fails if its asset has been deleted. Asset references validate tenant and ready state in the same transaction as the version.

Profile checkpoints validate the existing canonical schema plus relational/semantic invariants, then server-stamp explicitly selected confirmations. Imported `status`, timestamps or actor labels cannot confer confirmation. Every included claim must have a valid current confirmation before publication. Visible identity sections materialize name, both non-null title slots and the export contacts selected by `contactIds` as CV items for evidence binding. Hidden sections cannot supply selected CV evidence. Two title slots remain independent and may be null; professional and technical skills remain distinct. Partial year/month dates stay partial; chronology is checked without persisting invented days. Document/source/provenance/entity/claim links are normalized alongside immutable projections. P0–P3 rejects nonempty generated prose, section prose references, generations, interviews and template references. Draft columns retain the checkpoint payload; unconfirmed editor saves use the separate [snapshot contract](gateway.md#unconfirmed-editor-state). Frontend wiring remains pending.

## Reviewed jobs and analysis inputs

A minimal reviewed job input is:

```json
{
  "title": "Inginer platformă", "company": "Synthetic Example",
  "text": "SQL required. Communication preferred.", "captureKind": "paste",
  "requirements": [{
    "key": "sql", "category": "technical", "priority": "required",
    "sourceText": "SQL required.", "hardGate": false,
    "atoms": [{"operator": "AND", "concept": "sql", "weightShare": 1}]
  }]
}
```

Manual/paste only: no scraping or automatic extraction. Source excerpts, when supplied, must occur in reviewed job text. Requirements use reviewed flat AND/OR groups; Submitted AND shares sum to one, OR alternatives count once. Scoring renormalizes shares over applicable positive AND atoms; `not_required` atoms consume no coverage, and wholly `not_required` requirements create neither score criteria nor hard gates. Gate assertions on wholly excluded requirements are rejected. Atom shares and priority fractions must be greater than zero and at most one, with at most six decimal places; fulfillment must be between zero and one with the same precision. Values requiring storage rounding are rejected. Hard gates require a nonblank reviewed `gateBasis`. Required/preferred priority is independent of `hardGate`; an authorization gate is excluded from semantic scoring.

Each accepted semantic evidence row contains `atomId`, `claimId`, `scope` (`profile` or `cv`), `matchClass` (`demonstrated`, `claimed_limited`, `transferable`, `not_evidenced`), `relation` (`exact`, `approved_equivalent`, `transferable`, `partial`, `ambiguous`, `rejected`), optional `fulfillment` (0–1), and optional `explanation`. CV scope additionally requires the actual `cvItemId` selecting that claim. A hard-gate denial is a separate assertion with `requirementId`, `state:"confirmed_unmet"`, `claimId` and reviewed `reason`. Gate assertion inputs accept only `supported` and `confirmed_unmet`, each with a confirmed `claimId` and reviewed `reason`. Omit an assertion when support is unknown; `needs_verification` is a computed output and is rejected as input. Keyword absence does not become a confirmed denial.

The method is `compatibility-1.1.0-db.1`, derived from existing `compatibility-1.1.0` arithmetic with authorization kept gate-only. All five saved reference cases are checked using separately constructed relational inputs. Versioned rules, weights, dictionary, normalizer, matcher, date bounds, reviewed mapping, selected CV evidence, complete profile availability, current confirmation hash, as-of date and locale are pinned in the input bundle/fingerprint. Equal normalized input can reuse an analysis across different request keys. Repetition does not add points; AND shares conserve one criterion and OR takes its strongest alternative. No full profile means CandidateFit is null. Unresolved ambiguous requirements keep eligibility at `needs_verification` unless an explicit confirmed requirement gap takes precedence. Eligibility is independent from the score; qualification equivalence/transfer cannot satisfy a strict credential gate unless explicitly permitted.

This pilot uses explicit reviewed mappings. It does not infer qualification equivalence, legal authorization, dictionary aliases or NLP matches. Scores are uncalibrated compatibility measures, not hiring probability or employer ATS behavior. PDF readability remains `untested`. Recommendation deltas remain null. Readiness is a user-reviewed five-category checklist (`content,structure,jobOptimization,writing,application`) with `pass/needs_action/pending/not_applicable`; pending is not pass, and N/A requires true absence of the relevant job/application context. A job CV pins the job version even when the optional job argument is omitted; a supplied different version is rejected. Job optimization cannot be N/A with a pinned job. Application cannot be N/A while the resolved job has an application, including one whose chosen CV or document has changed. A job without an application can have application N/A. The resolved job version and application-context presence are saved and included in the readiness fingerprint.

## Granted reads and access

`get_analysis(analysis UUID)` reauthorizes and returns current validity plus a separately labeled historical result. If confirmation changed, current scores become null and eligibility needs verification; no old artifact silently becomes current. `duration_bounds(profile_version UUID, as_of date)` returns precision bounds and unknown roles, merging overlapping employment intervals once. `sent_count()` counts distinct applications with an unretracted explicit sent event. `search_applications(query='', stage=null, cursor_time=null, cursor_id=null, limit=30)` uses literal case-insensitive title/company/next-action search, stable `(created_at,id)` cursor, limit 1–100 and a separate unfiltered sent count. Latest, chosen and actually sent CV references are distinct; `latestGenerationId` stays null in this scope.

| Actor/resource | Select | Mutate |
|---|---|---|
| Anonymous | no `app` access | none |
| Active owner, same personal tenant | own product/provenance/history rows under RLS; own preferences/membership/consent | granted commands only |
| Other tenant / revoked owner | no tenant rows or cached result access | rejected |
| Authenticated global rule reader | published non-PII immutable rules | none |
| Request/audit/deletion internal ledgers | no client table access | internal definer command only |
| Operational DB administrator | PostgreSQL owner privileges bypass RLS | operational recovery only; never a browser credential |

No client gets table insert/update/delete, head edits, membership escalation or private helper execution. Security-definer functions use empty search paths and explicit qualifications; PUBLIC/anon function execution is revoked at each function-migration boundary. Internal and cross-stage FKs enforce tenant **and** profile/document/job/version lineage. RLS does not constrain an administrator or substitute for those FKs.
