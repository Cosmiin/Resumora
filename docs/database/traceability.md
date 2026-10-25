# Approved architecture 2.0.0 → implemented P0–P3

The approved plan/catalog is a 67-table roadmap. This branch implements its explicitly selected P0–P3 prefix: 43 tables, no P4–P7 tables. Counts describe the approved scope's resulting inventory, rather than a product requirement to reach a count. The frozen JSON catalog remains the detailed logical field/type/nullability/key/FK/index/access/lifecycle reference. SQL is the exact physical implementation, including extra integrity/index columns below.

## Migration order and table coverage

All filenames below are in `supabase/migrations/`. Apply the complete ordered prefix, including each phase's commands, before considering that phase accepted. Table shells precede candidate keys/FKs within their phase. Later context is added only once its referenced tables exist.

| Phase / cumulative tables | Ordered files | Tables introduced |
|---|---|---|
| P0 / 7 | `20261025010000_p0_tables.sql`, `20261025011000_p0_commands.sql` | tenants, user_profiles, tenant_memberships, idempotency_requests, audit_events, consent_events, deletion_requests |
| P1 / 26 | `20261025020000_p1_tables.sql`, `20261025021000_p1_validation.sql`, `20261025022000_p1_publication.sql` | source_documents, source_spans, claims, claim_provenance, confirmation_events, career_entities, entity_revisions, entity_revision_claims, career_profiles, profile_versions, profile_version_entities, profile_version_claims, cv_documents, cv_versions, cv_sections, cv_items, claim_relations, entity_revision_entities, profile_version_relations |
| P2 / 34 | `20261025030000_p2_tables.sql`, `20261025031000_p2_commands.sql` | jobs, job_captures, job_versions, job_requirements, requirement_atoms, applications, application_events, next_actions |
| P3 / 43 | `20261025040000_p3_tables.sql`, `20261025041000_p3_rules_duration.sql`, `20261025042000_p3_analysis.sql` | rule_versions, evidence_mappings, match_evidence, analysis_runs, analysis_components, recommendations, readiness_runs, recommendation_requirements, recommendation_claims |

P2 adds nullable job context and compound FKs to P1 sources/spans/documents/versions. Existing Base rows remain valid. P1 has no FKs to future generation/extraction/operation/template tables. P4/P5 must introduce those columns/constraints in new migrations; no placeholder FK points to a nonexistent table. All installed constraints are validated in the local test run.

## Physical refinements within the approved model

No additional table scope is introduced. Concrete SQL adds precise reviewed-requirement controls (`scorable`, priority fraction, gate kind/equivalence permissions, atom ordinal), an application event ordering sequence, and explicit evidence-role/gate-state discriminators. These implement priority/eligibility/ordering already required by the plan. Eligibility assertions share the existing exact-lineage evidence graph; they are not new semantic score points. Their reviewed input is preserved in the pinned analysis bundle. Strict composite candidate keys/FKs include tenant plus appropriate stable profile/document/job and version IDs. Deferred triggers validate normalized revision/pin/projection consistency, not just UUID existence.

Entity kinds retain the canonical concepts: name, two positioning-title slots, contact, skill (professional/technical), employment, education, optional entry, enrichment. Claim and entity revision content is immutable; graph publication is atomic. Canonical facts projections, CV document layout/selection and job version inputs are distinct. Content changes allocate versions rather than rewriting the source Base CV while tailoring.

The SQL canonical validator embeds `schemas/cv/v1/cv.schema.json` without loosening its ID grammar. Database UUIDs are encoded as `id_UUID` in the canonical envelope. The [API contract](api.md) explains allocation and decoding. Existing canonical fixtures and source ATS/duration calculators remain unchanged. Tests explicitly build separate relational evidence for the abstract ATS examples.

## Executable evidence

`scripts/db/test.py` starts a private native PostgreSQL cluster and executes `supabase/tests/bootstrap.sql` plus all real migrations. Bootstrap Auth roles/subjects are local doubles. `supabase/tests/behavior.py` supplies 45 behavioral methods; several include multiple races, source vectors or rejection cases. These are database behavior checks, not assertions that SQL source text happens to contain an expected string.

| Acceptance area | Tests / concrete evidence |
|---|---|
| Stable UID, tenancy, no elevation | `Foundation.test_provision_replay_and_stable_uid`, `test_anonymous_and_cross_tenant_reads`, `test_no_direct_elevation_or_internal_ledger` |
| Request replay and fingerprint conflicts | equal-body replay, changed payload rejection, expiry reservation, eight-session same-key race, rollback of graph+request, reauthorization after revocation |
| Deletion fence and audit | deletion request repeat, generation increment, later writes/reads rejected, immutable audit |
| Canonical preservation | minimal/full RO fixture roundtrip, partial dates, both title slots, professional/technical skills, claim relations and entity joins; imported confirmation rejected |
| Immutable publication / revision conflict | historical replay after head advance, stale new edit rejected, immutable claim/version, restore inserts a version, concurrent checkpoint produces one graph |
| Tenant + lineage | foreign claim rejected; same-tenant wrong job/document/CV version rejected; exact mapping atom/job and selected CV item required; inappropriate recommendation/retraction joins guarded |
| Application continuity | job branch preserves Base/profile; explicit sent/retraction replay and distinct-app count; sent CV remains historical when latest advances; bounded literal search and Romanian case folding; next action cannot imply sent |
| Explainable analysis | five saved ATS math vectors compared to existing Python calculator; recomputed persisted result hash; AND/OR conservation, exclusions/empty criteria, CV-only null profile scope, duplicate mapping reuse under concurrent different keys |
| Eligibility and validity | authorization independent of semantic scores; strict credential equivalence/transfer; confirmed denial versus unknown; revocation makes current scores null while history survives |
| Date precision / readiness | native interval bounds compared to existing Python calculator, overlapping roles counted once, unknown dates unknown; qualitative five categories and no numeric readiness |
| Fresh and populated migrations | fresh ten-file install →43 tables; normal replay →0 pending; populated P0→P1→P2→P3 preserves earlier records; each phase replay →0; actual schema dump equals fresh install; failed DDL/history transaction leaves neither |
| Preflight security | six network-free tests in `supabase/tests/test_preflight.py`: shell text treated as data, exact project/host/session port binding, TLS read-only requirement, mode0600/regular-file enforcement, no inherited PG service/Auth token |

The local receipt records PostgreSQL version, test count, phase counts and verification limits. Its `cases` counts 45 behavioral methods plus four migration checks; it is not a count of every subcase. CI additionally runs six preflight boundary methods. Native SQL success does not prove actual managed Auth/JWT/PostgREST/Storage/browser behavior, remote privileges, current schema emptiness, backups or production readiness.

## Explicit scope limits

P0–P3 is synchronous manual/reviewed evidence work. No external side effect, background worker, outbox/lease/fence job engine, webhook consumer, metering, billing, generation, rendering or provider is activated. Those are later stages in the frozen plan, with their retry/unknown-effect requirements preserved there. This avoids adding a queue service before there is asynchronous work. Seven-day replay expiry is a technical guard, not an approved real-data retention policy. Deletion initiation/fencing exists; complete graph/object/Auth erasure and backup tombstone replay remain required before real personal data. Production data admission, frontend autosave/API wiring, automatic extraction/matching and P4–P7 are separate scopes.
