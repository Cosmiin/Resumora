# Target vacancy intake groundwork · v1

The shared normalization and canonical mapping contracts below remain groundwork for publication.
Implemented paste/save/review behavior and setup are owned by
[connected vacancies and scoped wording](../setup/connected-jobs-ai.md); future extension, URL
and extraction flows are owned by the [capture design](vacancy-capture-design.md).
A vacancy is employer input, never employment history or evidence of a candidate fact.

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
preparation defaults. The connected HTTP adapter uses the bounded body reader in
[`cv/routes.ts`](../../apps/api/src/cv/routes.ts) before validating the command envelope. These are technical limits,
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
be sent to `confirm_job`. Never spread this preview into a live RPC. The connected save/review validator is
[`parseJobSave`](../../packages/contracts/src/jobs/connected.ts); the pure preview is not its wire envelope.

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
| Source URL | Connected capture context; see [setup](../setup/connected-jobs-ai.md) | `confirm_job` still rejects `sourceUrl`; the connected adapter preserves it separately instead of spreading it into canonical publication. `jobs.canonical_url_hash` is only a hash, not original URL storage. |
| Pending requirements | Later `job_requirements` + `requirement_atoms` + `source_spans` | No extraction-state column/command is claimed. Empty array alone cannot distinguish pending from reviewed-none. Never score pending intake. |
| Canonical Base selection | Resolve `cv_documents` kind `base`, `cv_versions`, `profile_versions` | No direct job→Base FK. Correct association is via owned profile/version and independent job CV. Do not put browser selectors in an invented job column. |
| Independent job CV | `save_job_cv_checkpoint` → job-kind `cv_documents`, `cv_versions.job_id/job_version_id` | Existing command validates profile/job lineage and never moves Base/profile heads. It currently chooses latest matching Base snapshot for tailored output; exact user-selected older snapshot is a future command-contract gap, not supported by these selectors. |
| Keywords / evidence | Existing requirements/atoms, dictionaries and analysis evidence | No second keyword/candidate truth table. PRD statuses remain future derived display classifications. |

## Canonical publication prerequisites

Unconfirmed editor snapshots do not imply a confirmed canonical profile or Base version. The
publication bridge remains required before `save_job_cv_checkpoint` can consume editor content;
saving a vacancy must never silently confirm candidate facts.

Resolve the requested canonical document/version/profile triple within the verified tenant,
checking Base kind, version→document and profile lineage, and current usability/confirmation.
Reject stale or mismatched selections without exposing another account's data. Never substitute
a guessed/default CV. Comparison must pin the reviewed job version, confirmed profile and selected
CV version. Tailoring creates an independent job document/version; Base promotion is a separate
explicit action. Job edits invalidate dependent analysis without rewriting Base or old job CVs.
Application tracking and sent attestation remain separate from intake.

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

The [connected setup guide](../setup/connected-jobs-ai.md) owns current provider configuration and
limits. Future vacancy extraction must bind its output to reviewed job/CV versions and preserve
source provenance, as specified in the [capture design](vacancy-capture-design.md). No provider
residency certification or EU-compliance claim follows from intake. Do not put raw job/CV text,
URLs, tokens or keys in operation logs or proof records.

## Verification scope

Existing Node runner: `node --experimental-strip-types --test
apps/api/tests/job-intake.test.mjs`. Synthetic inputs cover required/optional
fields, bounds, Unicode/source fidelity, partial metadata, URL storage syntax,
unknown ownership/extraction fields, Base selector shape, independent outputs and
explicit publication blockers. The frozen synthetic Base fixture remains
unchanged; no function accepts or edits candidate content. These checks prove only the
pure boundary, not ownership enforcement in a running API or database. Connected API/UI and SQL
verification commands and their limits are owned by the [setup guide](../setup/connected-jobs-ai.md#offline-checks).
