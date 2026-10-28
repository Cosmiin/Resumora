# Target vacancy intake groundwork · v1

Status: prepared contracts and pure mapping preview only. No job route, screen,
gateway command, migration, database write, AI extraction, keyword matching,
comparison or tailoring is activated by this change. The current manual Base CV
experience is unaffected. A vacancy is employer input, never employment history
or evidence of a candidate fact.

## Contract and boundaries

[`normalizeJobIntake`](../../packages/contracts/src/jobs/intake.ts) accepts an
unknown JSON value and returns either normalized intake or field/code issues
without source values. Import through `@resumora/contracts/jobs/intake`.

The exported `JobIntake` and `BaseCvSelection` types in that module own the input
shape; `jobIntakeLimits` owns its character and normalized JSON byte limits.

Only `text` is required for intake. Empty optional strings become absent; null,
non-string metadata and unknown fields fail. Title, company and location may be
independently missing. No placeholder company, inferred title, invented location,
geocoding or automatic translation. Optional Base selectors must be a complete
UUID triple; portable `id_<UUID>` identifiers are not RPC UUIDs. This triple is
an untrusted request to select a Base, **not proof of ownership or lineage**.
It carries no CV content and grants no access.

Text is retained exactly, including whitespace, CRLF, Unicode composition and
instruction-like sentences. Nonblank text is required. PostgreSQL-incompatible
NUL/unpaired surrogates fail rather than silently changing evidence. Character
limits count Unicode code points and apply before optional metadata is trimmed.
Text, title and company limits align with SQL; location and URL limits are
preparation defaults. A future HTTP adapter must also bound the raw body before
parsing and reserve room for the command envelope. These are technical limits,
not a new retention policy. Original *description* text is lossless; metadata is trimmed.

URLs must be absolute HTTP(S), with a hostname, no embedded credentials,
whitespace/control characters or backslashes. Their trimmed spelling is retained
without URL reserialization or query stripping. Syntax validity establishes
neither trust nor reachability. Local/private hosts can be stored because no
resolver, fetch or redirect follows this value. Future fetching requires a
separate reviewed SSRF/egress design; never reuse this storage validator for it.
Treat URLs as private untrusted text; do not auto-preview, load favicons, execute
HTML or log query strings. Render all job content as escaped text. Pasted job
instructions never become system instructions for any later analysis.

[`previewJobMapping`](../../packages/contracts/src/jobs/intake.ts) revalidates the
input and returns a fresh, non-publishable mapping preview. `reviewedInput` uses
the existing command names (`text`, `captureKind:'paste'`, optional metadata,
`requirements:[]`). `extractionState:'pending'` means requirements are unknown,
not that the vacancy has no requirements. Every preview has `review_required`;
missing title/company and unsupported URL persistence add explicit blockers.
`deferred.sourceUrl` and `deferred.requestedBase` retain information that cannot
be sent to `confirm_job`. Never spread this preview into a live RPC. A separate
reviewed command validator/adapter must be implemented before publication.

## Existing schema mapping and gaps

Authority: [SQL command contract](../database/api.md#reviewed-jobs-and-analysis-inputs),
the [P2 tables](../../supabase/migrations/20261025030000_p2_tables.sql),
[P2 commands](../../supabase/migrations/20261025031000_p2_commands.sql) and
[Worker gateway](../database/gateway.md). These are versioned repository
definitions; their presence does not establish hosted application or integration.

| Intake / later selection | Existing destination / command | Constraint or remaining gap |
| --- | --- | --- |
| Stable owned vacancy | `jobs` / `confirm_job(p_key,p_job,p_expected_revision,p_input)` | New job uses null ID/revision zero; server derives tenant. No duplicate jobs table. |
| Exact pasted description | `job_versions.reviewed_text`, capture/source lineage | `confirm_job` stores supplied `text`, creates `job_captures` and `source_documents`, and hashes JSON values. Hashes are not a substitute for original text. First publication must retain original paste; later edits create new captures/versions. |
| Manual title/company/location | `job_versions.title/company/location_text` | Title/company are NOT NULL in SQL and required for reviewed publication; intake permits either missing. Do not silently convert an incomplete intake into a published job. |
| Source URL | Future reviewed extension to existing source/capture metadata | Current RPC rejects `sourceUrl`; source metadata is constructed internally. `jobs.canonical_url_hash` is only a hash, not original URL storage. Preserve deferred URL; do not silently discard it or guess a write. |
| Pending requirements | Later `job_requirements` + `requirement_atoms` + `source_spans` | No extraction-state column/command is claimed. Empty array alone cannot distinguish pending from reviewed-none. Never score pending intake. |
| Base selection | Resolve `cv_documents` kind `base`, `cv_versions`, `profile_versions` | No direct job→Base FK. Correct association is via owned profile/version and independent job CV. Do not put browser selectors in an invented job column. |
| Independent job CV | `save_job_cv_checkpoint` → job-kind `cv_documents`, `cv_versions.job_id/job_version_id` | Existing command validates profile/job lineage and never moves Base/profile heads. It currently chooses latest matching Base snapshot for tailored output; exact user-selected older snapshot is a future command-contract gap, not supported by these selectors. |
| Keywords / evidence | Existing requirements/atoms, dictionaries and analysis evidence | No second keyword/candidate truth table. PRD statuses remain future derived display classifications. |

`createDatabaseGateway` currently maps only workspace provisioning and editor
draft operations. Do not claim that a job endpoint or job RPC adapter exists.
Unconfirmed editor snapshots also do not imply a confirmed canonical profile or
Base version: the publication bridge remains required before the job-CV command
can consume editor content. Saving a job must never silently confirm those facts.

## API and customer flow plan (inactive)

1. Offer a later explicit “Add target job” action beside the existing Base flow.
   Paste description first; optional title/company/location/URL and Base
   selection follow. Keep incomplete input visible locally while reviewing;
   do not promise cross-session draft persistence with today's command.
2. Proposed `POST /api/jobs` envelope: `{requestId, expectedRevision:0, intake}`.
   Proposed update: `PUT /api/jobs/:jobId` with expected job revision. These paths
   are a plan only. Bound JSON before parsing, authenticate using existing Auth,
   preserve refreshed cookies, and use only that verified user's JWT gateway.
   Reject user/tenant/actor fields. Resource UUIDs never grant authorization.
3. Before any future save, complete/review required publication metadata. Resolve
   Base document/version/profile triple within the verified tenant, verify kind,
   version→document and profile lineage, current usability/confirmation, and
   reject stale or mismatched selections without revealing another user's data.
   Intake may precede Base selection; comparison/tailoring may not. Do not fall
   back to another account or a default CV when lookup fails.
4. Extend the **existing** command narrowly for capture metadata and an explicit
   pending-review/extraction state before connecting paste intake. Define whether
   partial intake remains local until metadata review or becomes an owned draft
   using existing job draft fields; no duplicate store. SQL/ownership tests and
   safe gateway response/error mappings belong to that later implementation.
5. Reuse one nonzero request UUID and the exact normalized envelope until outcome
   is known; changed-body reuse fails. Map existing revision conflict/replay
   expiration semantics. Preserve user input on errors; retry must not duplicate
   captures. Do not autosave by calling reviewed publication or inference.
6. Return an owned job/version/revision and explicit pending requirements state
   only after persistence succeeds. Later extraction produces review proposals
   with source spans, never candidate facts. User reviews requirement priority,
   ambiguity, AND/OR groups and hard-gate basis before comparison.
7. Comparison pins job version, confirmed profile and selected CV version.
   Tailoring creates an independent job document/version. Base promotion is a
   separate explicit reviewed action; job edits invalidate stale analysis, never
   rewrite Base or old job CVs. Tracking/sent attestation remains a separate
   product decision and existing application command, not an effect of intake.

## Requirements, keyword and EU evidence seam

Follow the existing [PRD keyword mapping](prd.md#7-jobs-matching-and-keywords):
`included`, `verified_equivalent`, `verified_omitted`, `awaiting_confirmation`,
`unsupported` are future exclusive classifications derived from candidate evidence
and selected CV content. Do not assign them at intake. Required/preferred/
unspecified priorities describe employer criteria; `hardGate` needs separate
reviewed basis. Missing keywords do not prove a candidate lacks a qualification.
Never infer authorization from location or equate a credential by translation.
Requirements retain exact source excerpts/locators; row IDs are allocated by
`confirm_job` for each version, not copied from research fixture labels.

The [enhancement groundwork guide](../setup/openrouter-enhancement.md) owns
current provider policy, the evidence checklist and activation requirements.
Vacancy integration remains pending; no provider types are guessed or
duplicated here. It must bind that evidence to the pinned
job/CV versions and operation. No model calls,
provider residency certification or EU-compliance claim is made by this change.
Do not put raw job/CV text, URLs, tokens or keys in operation logs or proof records.

## Phased backlog and decisions

1. **Next smallest implementation:** reviewed existing-command extension for URL
   metadata and pending state; decide incomplete-draft lifecycle in existing jobs
   structures. Add authenticated gateway mapping and bounded responses, then
   ownership/replay/revision/native SQL tests with synthetic tenants. No hosted
   RLS pass is implied by pure intake checks.
2. Implement narrow paste/review/save UI and editor→canonical publication bridge;
   preserve current manual Base UX and original source. Add actual two-account
   API persistence checks when that integration is authorized.
3. Integrate the groundwork guide's EU route evidence gate and reviewed requirement
   extraction output contract, provenance and invalidation; only later evaluate
   extraction quality. Provider/fallback/cost implementation follows that contract.
4. Implement evidence-based comparison and independent tailoring, explicit Base
   snapshot pinning in the existing command if older snapshots are selectable,
   and review/undo/version continuity. No ATS formula changes in this work.

Routine preparation assumptions: paste-only capture; HTTP(S) URL storage only;
blank optional fields omitted; no placeholder metadata; missing Base selection
does not block intake but blocks later comparison/tailoring. Product decisions
remaining before activation: partial draft persistence/retention, metadata review
requirements, exact Base snapshot selection behavior, when to create application
tracking, and final extraction-review UX. None blocks this reversible groundwork.

## Verification scope

Existing Node runner: `node --experimental-strip-types --test
apps/api/tests/job-intake.test.mjs`. Synthetic inputs cover required/optional
fields, bounds, Unicode/source fidelity, partial metadata, URL storage syntax,
unknown ownership/extraction fields, Base selector shape, independent outputs and
explicit publication blockers. The frozen synthetic Base fixture remains
unchanged; no function accepts or edits candidate content. This proves only the
pure boundary, not ownership enforcement in a running API or database. Auth,
database, payments, UI and runtime AI are unchanged and N/A for discretionary
regression. Required no-mistakes/CI remains the delivery gate.
