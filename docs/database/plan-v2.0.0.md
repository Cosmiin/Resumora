# Resumora · database architecture and execution contract 2.0.0

25 October 2026 · Proposed for review · **No schema has been implemented or applied.**

This plan replaces the presentation shape of the recovered 60-table proposal, preserving its originals. It specifies a modular monolith with Supabase Auth, Postgres and private object storage. The actual schema, migration history, data volume, project environment and backup configuration of development candidate `aquvhqbkvrtzhbmezkci` have **not been inspected**. Its dashboard label is not deployment authority.

The implementation approval task is **resumora-db-implementation-approval**, origin **resumora-db-architecture**. This is one consolidated architecture and execution decision. Completing this design does not close that decision. Approval must name version 2.0.0, selected phases and local-only versus staged development execution. There is no production, real personal data, paid provider, billing, DNS or deployment authority in this proposal.

## 1. What the owner gets

A person owns a durable, truthful career record. The person can save a Base CV, select confirmed facts into independently versioned job CVs, inspect why the profile or CV matches a reviewed job, and manually track an application. A later generated sentence never becomes its own evidence. An older sent CV stays pinned even when a new CV is generated. Retry after a broken connection returns the original saved result instead of a second save, charge reservation or sent event.

Use one Postgres transaction for each business command. Normalize ownership, versions, evidence and relationships. Use bounded, typed JSONB inside immutable entity revisions and canonical projections, validated against a pinned canonical schema/validator. Keep bytes outside Postgres in private storage with manifests and checksums. Do not create microservices, Kafka, a separate queue/cache/search engine, generic event-sourced aggregates or a second editable JSON truth for the pilot.

**Smallest technical pilot:** P0–P1, 26 designed tables, manual entry and versioned Base/CV; no external work. **Proposed product pilot:** P0–P3, 43 designed tables, adding reviewed jobs, lean application continuity and deterministic explanation. These counts are computed inventory, not approved targets. Supporting all normalized provenance/version/confirmation relationships accounts for much of the count; omitting integrity to reach a smaller number is not recommended. They can be implemented and reviewed in individual phases.

Async extraction/assistance and metering are P4; private PDF/export is P5. P6 contacts and P7 subscriptions are deferred. The original 60 candidates remain represented. Three integrity/pinning tables are added: `claim_relations` for canonical claimLinks, `entity_revision_entities` for employment skill IDs/enrichment targets, and `profile_version_relations` for the exact historical relation set. These prevent JSON-only entity references and later relations silently changing an old profile projection. Four previously prose-only commercial tables are cataloged explicitly as future scope. The full 67-entry catalog is a roadmap, **not 67 tables to create now**.

## 2. Product and canonical contracts to preserve

- Stable Supabase Auth `auth.users.id` is identity. Email is mutable contact data, never an ownership or tenant key. Password recovery/email changes retain UID. Optional Google later must link through an explicitly verified Auth flow; never merge application accounts merely because two supplied emails match. No OAuth tokens/passwords in product tables and no Google activation now.
- Initial tenancy is one personal workspace with one active owner membership. Teams, invitations, support access and role changes need a later policy. `tenant_memberships` gives a single authorization seam, not an enabled team product.
- Exactly two positioning-title slots, each independently nullable, are distinct from historical role titles. A missing second title is not invented and does not block save.
- Professional and technical skills remain separate, independently selected and ordered, with evidence links. A neighboring tool or title cannot manufacture a skill.
- Name; contacts/professional links; optional private full address; supported summary; employment title/employer/location/context/accomplishments; education; certifications; projects; portfolio; languages with proficiency basis; leadership/publications/volunteering/achievements and evidenced custom modules all map to typed career entities and claims. Enrichment has an explicit target entity and attribute, not a free-floating invented metric.
- Partial dates are canonical `{year, month?}` with year 1900–2200 and month 1–12 if present. No month means no month; never January. Ongoing is explicit. Validate only contradictions implied by precision. Date-bound calculations derive intervals at a pinned as-of date and union concurrent periods; no inferred stored days or career-gap penalty.
- UI locale and document locale are independent `ro`/`en` choices. A translation preserves support and qualification status. It cannot establish a licence, work authorization or language proficiency.
- Claims and entity revisions are immutable content. Confirmation/rejection/revocation is an append-only decision history; user confirmation is attestation, not external verification. External verification needs method, source, actor and date. A generated summary is never its own source.
- Profile versions represent the complete confirmed record; CV versions represent selected content and layout. Each CV version atomically serializes its pinned graph into canonical CV schema 1.0.0. A profile version has a facts-only envelope pinned to the same canonical subdefinitions; document layout is authoritative only in CV versions. Drafts may retain unconfirmed input for review; trusted published/exported selections require confirmations. Portable canonical content omits tenant/private storage keys; authenticated server envelopes enforce ownership.
- Job-specific selection, translation, regeneration or restore cannot silently overwrite Base. Explicit selected-fact promotion with confirmation and expected Base head is a separate command. Restore creates a new version, preserving the original.
- Section IDs persist through reorder/rename; sections and items have per-version ordinals and visibility. Hiding a section never deletes facts. Facts, generated wording and template/layout are independent versioned inputs.
- Latest means the highest successful server sequence on the application branch. Manual checkpoints may be latest content while latest-generation metadata remains separate. Pending/failed/cancelled/stale results cannot move the head. Tailored state needs reviewed target-job and approved completed selection/tailoring provenance; linking a job or exporting a PDF does not establish tailoring.

## 3. Relationships and lineage

Auth UID → owner membership → personal tenant → career profile. A manual/upload/interview source has spans; claims cite spans through `claim_provenance`. Claims cite other claims through `claim_relations` (metric_of, supports, contribution_to, scope_of). `profile_version_relations` pins the exact relation set and both endpoints in that version; a relation added later never changes an older snapshot. `entity_revision_entities` binds employment skill IDs and enrichment targets to same-profile career entities, and publication verifies those entities are selected into the pinned graph. Confirmation events name an exact claim. A stable career entity has immutable revisions; `entity_revision_claims` binds field roles to actual claim rows. Profile versions pin one revision per entity and claim/confirmation pairs.

A CV document belongs to the same profile; its immutable versions pin an exact profile version. Sections belong to one CV version. Items refer to an entity revision selected in **that profile version**, or, after P4, approved prose whose support is selected there. A job document belongs to one stable job; its versions can target changing job-description versions without changing a historical sent record.

A job has captures and immutable reviewed versions. Requirements and atoms name the exact version and captured source document/span. Applications bind a stable job, current reviewed job version and optional job document. Chosen CV/export and historical sent CV/export are separate. A retraction must target a sent event on that same application. New job text marks an old tailored CV as needing review; it does not rewrite it.

Every tenant row uses `(tenant_id,id)` candidate keys and composite FKs. Stronger examples in the catalog include:

| Child → parent | Required context |
|---|---|
| entity revision → career entity | tenant + profile + entity |
| revision supersedes → older revision | tenant + profile + same entity |
| profile parent/head → profile version | tenant + same profile |
| profile version entity → revision | tenant + profile + entity; one revision per entity |
| profile claim → confirmation | tenant + profile + exact claim + event |
| CV version → document/profile | tenant + same profile/document; exact pinned profile version |
| CV item → section | tenant + exact CV version + section |
| CV item → selected revision | tenant + pinned profile version + entity revision membership |
| job version → capture | tenant + job + source document + capture |
| requirement/atom → source | tenant + job + reviewed job version + captured document/span |
| application → branch/chosen CV | tenant + stable job; chosen CV belongs to chosen document |
| sent event → historical CV/export | tenant + application stable job + pinned document/CV; export is of that exact CV |
| match → requirement/claim/item | exact mapping job version; claim in pinned profile; item in pinned CV and actually supporting that claim |
| recommendation support | claim/requirement must belong to analysis inputs, not merely the same tenant |
| prose support | claim in exact pinned profile version; approval matches selected patch and destination |

Tenant FKs alone cannot prove these last conditions. Use composite FK membership keys where possible and narrow publication functions/constraint triggers for graph conditions. PostgreSQL CHECK does not query other rows. JSON IDs are not authorization: external IDs in typed payloads must match the explicit graph or a validated immutable projection. Internal patch-local IDs can remain inside a bounded immutable patch and are validated there.

Optional composite references require paired checks. For example export requires CV; chosen CV requires document; an item reference requires the matching version context. `MATCH SIMPLE` skipping a nullable column must not permit an arbitrary same-tenant reference. Some contexts intentionally allow null (CV-only analysis or an optional span); their commands check the precise allowed mode. Same-phase cycles use table shells then candidate keys then FK installation. Circular heads are added only after version tables exist.

**Synthetic lineage example:** Mara's answer source S1 has span S1.field.outcome, supporting claim C1 (“finance could review payroll exceptions in one place”). Mara confirms C1 through E1. Employment entity R1 revision R1.2 binds C1 and supported SQL/API claims. Profile version B2 pins R1.2/C1/E1. Base CV V2 selects this evidence; job version J1 specifies the automation role. Job document Djob version Vjob2 selects existing API/HR/context claims, with optional later approved prose G1. Analysis A1 pins B2/Vjob2/J1/rules/mapping/as-of. Export X1 later pins Vjob2/template/privacy/renderer and actual checks. Sent event Sent1 pins the actual Vjob2/X1 used. A new Vjob3 never changes Sent1. If C1 is revoked, later reuse/export is blocked and derived artifacts invalidated; a privacy erasure removes or redacts dependent historical copies.

## 4. Physical catalog contract

`catalog-v2.0.0.json` is normative with this narrative. The HTML offers searchable/filterable details for all tables, fields, nullability, keys, FK context, checks, indexes, access and lifecycle. Every original candidate is attributed by M01–M07; restaged phases are P0–P7. Rows added by this revision say so.

UUID for IDs; bigint for sequences/revisions/fences and large byte counts; timestamptz for observed/lease/deadline times; date only for known calendar dates or an explicit analysis as-of. Store SHA-256 as bytea with length 32. Scores use numeric(12,6), quantities/cost numeric(20,8); retain inputs and round display only. A non-null field is NOT NULL at its introduction. Late optional fields do not exist before their named phase. Evolvable text state/kind domains have explicit CHECK sets and transition functions; do not blindly use free text. JSON payloads have pinned type validators, limits on bytes/depth/array lengths, and an allowlist; adding a new payload kind requires a validator version.

Initial implementation size limits are technical proposals to include in a phase specification: canonical/draft payload ≤1 MiB, entity payload ≤64 KiB, ≤1,000 entities, ≤5,000 claims, ≤500 ordered items, text fields ≤20,000 characters (canonical schema limit), source excerpt ≤4 KiB, patch ≤64 KiB/100 actions; reject oversized input rather than truncate facts. These are synthetic pilot guards, not approved upload quotas or paid allowances. Confirm actual Worker CPU/transport limits before production.

Indexes cover tenant/RLS filters and composite FK lookups. Unique keys supply their own indexes; consolidate redundant prefixes during DDL review. Add document/profile/job sequence indexes, application event `(tenant_id,application_id,recorded_at,id)`, bounded application search joins and partial ready-job/outbox indexes in their phases. Title/company/next-action search is parameterized and tenant-scoped; optional contacts join only in P6. Do not add a GIN for every JSON payload or an external search engine. Trigram/FTS needs measured query evidence.

## 5. RLS and identity access matrix

Product rows live in an explicit `app` schema. Keep the schema private initially and expose only deliberately granted views/RPCs via the API. A custom schema is not automatically API-visible. RLS is enabled on all tenant tables including internal tables as defense in depth; lack of API/table grants is an additional boundary. Global catalogs are immutable, read-only published views. No browser gets a service-role key.

| Role | Profile/doc/job facts | Preferences/membership | Internal jobs/audit/usage | Private storage | Writes |
|---|---|---|---|---|---|
| Anonymous | Deny | Deny | Deny | Deny | Auth endpoints only outside product tables |
| Authenticated active owner A | Only A's rows, intended projections | Own preferences; own membership read | Only sanitized operation/usage status via RPC | Exact authorized manifest; short scoped download | Narrow commands; no direct immutable/head/role/quota update |
| Tenant B / revoked session | Deny A; replay authorization checked again | Own allowed rows only / revoked deny | Deny A | Deny A | Cannot forge tenant/context IDs |
| Async job role | Only leased operation's pinned inputs | No arbitrary membership management | Narrow lease/heartbeat/result/meter RPCs | Exact operation objects only | Fence/revision/deletion-checked completion |
| Privacy role | Scoped deletion request closure | Scoped identity severing | Required checkpoints, minimal tombstones | Scoped purge and reconciliation | Child-first resumable erase; no unrelated reads |
| Catalog publisher | No tenant PII | None | Reviewed global version publication | Reviewed template asset manifests | New immutable rule/template versions only |
| Support/admin (future) | No standing blanket PII access | Explicit expiring audited grant | Redacted diagnostics | Only separately authorized | Future policy; not a pilot client role |

Membership SELECT is self-only and nonrecursive; product RLS checks active membership with verified `auth.uid()`. Tenant is derived from verified session and authorized resource, never trusted from JSON. `USING` and `WITH CHECK` protect both existing and new row access; writes that must serialize through commands have no direct DML grants. Ordinary requests use user-scoped authorization, not a broad service credential. Privileged definer functions require schema-qualified references, a fixed safe/empty search_path, revoke PUBLIC execute, explicit `auth.uid`/role/tenant checks and exact grants. Invoker functions cannot write tables the user has no privileges on, so controlled publication needs carefully constrained definer authority or a narrow server role; do not pretend invoker alone solves this. Views must preserve caller RLS/security semantics and be tested against table-owner/service bypass.

Provisioning runs once under a unique personal owner constraint: tenant + membership + preference creation is one command. Repeated signup/auth callbacks return the same workspace. Auth remains managed; no application mutation to auth/storage internals. Source/export bucket keys are opaque, never email/name, and storage policies resolve exact manifest ownership. A valid guessed path or UUID is not authorization. Signed URLs are short-lived but can remain valid until expiry; erasure revokes/purges bytes, not just SQL metadata.

## 6. Idempotency: promised behavior and its limits

### Synchronous save and lost response

The browser chooses one random key for one logical edit and keeps it across retries. Scope is tenant + server-derived principal_key (user UID or explicit service namespace) + semantic command kind + key digest. Canonical fingerprint covers request schema version, target resource, selected immutable input IDs, expected revision, meaningful ordered arrays and body; normalize object key order but not meaningful text or array order. Never store a full PII body merely for retry. A key is not authorization.

A short transaction inserts the scoped key under a UNIQUE constraint. A concurrent duplicate waits on that key, then reads the committed record. Same fingerprint and completed state returns the original safe resource/version/status. An accepted async request returns its original operation. Different fingerprint returns 409 IDEMPOTENCY_BODY_MISMATCH. Never overwrite the old hash/result. New commands lock the target, compare expected draft revision, validate references, write immutable rows + canonical projection + head + audit + result and commit together. A response lost after commit can be retried safely; a crash before commit rolls back all writes. A second newly keyed edit with an old revision gets 409 VERSION_CONFLICT and preserves local edits. A replay of an earlier successful save still returns that earlier version after the head advances.

`profile_versions.publication_request_id`, `cv_versions.publication_request_id`, `application_events.request_id` and later operation/reservation/result constraints provide durable domain anchors. The replay response horizon is a proposed seven days, not a privacy/commercial policy selected by this task. Keep a minimal used-key/fingerprint/resource ledger for at least the lifetime of the referenced resource; expire cached response detail separately. Beyond supported replay return explicit 410 REQUEST_EXPIRED/recover-existing-resource guidance, never silently reuse the same key for a new action. Do not hard-delete request rows still referenced by domain anchors. When privacy erases the tenant, its retired/deletion generation rejects old tokens/jobs. A later recreated account has a different stable Auth/tenant identity.

### Async acceptance, retries and stale workers (P4)

Acceptance transaction locks the allowance period, checks current policy/budget, creates one operation, reserves once and inserts one outbox event plus the request result. No network call happens inside that transaction. Outbox is a transactional message record; deliveries may repeat. Each consumer acknowledges durable acceptance only after a command with its own unique event/effect identity commits. For this monolith the operation row and unique result/publication keys are the dedupe anchor; a separate message broker/inbox is unnecessary.

A worker claims ready operations with a short locked transaction (`SKIP LOCKED` queue pattern), increments a fence and records attempt/lease/deadline. Heartbeats update only the current fence. Provider calls happen outside DB locks. A bounded retry policy applies to transient errors; validation/permission/unsupported input is final. Suggested max three attempts and bounded jitter/deadlines come from discovery and must be measured; each operation persists its actual configured limits. Retry an uncertain provider effect only after provider status/reconciliation or an explicit bounded retry decision. A browser timeout alone never reissues provider work.

Completion locks the operation and destination, checks current lease/fence, deadline, cancellation, tenant deletion generation and expected destination/input revisions. It inserts one durable result per operation, settles one reservation transition, writes completion outbox and moves the head only if current. Unique operation IDs on generation/extraction/export and publication request keys prevent duplicate logical results. If the draft changed, preserve a stale proposal/status without moving the current head. A reclaimed old worker cannot publish. A cancellation/delete raises the fence/generation before purge so late callbacks cannot resurrect content. A late attempt may still append measured cost evidence through a narrowly scoped settlement path; it cannot revive product state.

Reserve a conservative maximum for the configured attempt budget or obtain an additional atomic attempt allowance before retry; do not assume one reservation bounds three external charges. An unknown charge remains reserved/conservatively accounted until reconciled. Price version, attempt ID, measured/estimated/unknown usage and adjustment events are retained without raw prompts. Budget exhaustion keeps the manual path intact; no silent paid escalation.

### Uncertain external effects and storage

If a provider accepts a request and times out, Postgres cannot know whether a charge/output exists. Persist unknown outcome and provider request ID if available. Reconcile status/usage if supported; reuse a documented provider idempotency key for that exact logical effect, if the provider supports it. Otherwise a retry can duplicate external work or cost. **This design promises idempotent logical state, not exactly-once provider execution, delivery or charging.**

An upload uses a stable server-generated manifest/object key for its intent. Duplicate completion checks real checksum/MIME/size before scheduling extraction once. Two purposes with equal file hashes are not automatically one intent. Export fingerprint includes tenant, immutable CV, privacy, locale, template, fonts and renderer version. Storage writes and SQL are separate effects: if bytes exist without final manifest, reconcile/orphan-purge; if manifest says expected but bytes are missing, retry/rebuild or fail honestly. Deterministic private object keys, checksum verification, retained manifest state and bounded orphan reconciliation close this gap without pretending to provide a distributed transaction.

### Sent count and future duplicate webhooks

Double clicking “mark sent” with one key creates one attestation event and one count. Legitimate repeated submissions can have separate events, but the displayed count is DISTINCT application IDs with a valid unretracted mark_sent. Export/download/stage/next-action completion never records sent. Unknown actual date stays NULL; recorded_at is system observation, not invented sending time. Concurrent retractions race on a UNIQUE target and can only retract a same-application mark_sent. Historical document refs are immutable.

P7 ingress verifies provider raw-body signatures before writing an event unique on provider + provider account + provider event ID. Duplicate identical ingress acknowledges the original; changed digest for the same event is quarantined. Acknowledgment follows durable ingress, not completion of subscription processing. Out-of-order events trigger authoritative provider-object reconciliation; do not blindly apply event arrival timestamps. Unknown tenant IDs in provider metadata never authorize a mapping. Subscription publication locks the mapped object and emits a unique immutable entitlement revision; unknown external checkout creation is reconciled by stable intent/customer/provider references before retry. No webhook or checkout is activated by this plan.

## 7. Explainable ATS and readiness records

The database stores versioned inputs and explanation; it does not validate a hiring predictor. P3 is deterministic over reviewed structured evidence, with no model-emitted authoritative score.

Pin profile availability/version, CV version and selected evidence, job/requirement graph and hashes, mapping revision/hash/review, scoring rules, weights, dictionary, normalizer, matcher, date-bounds version, as-of, explanation locale and confirmation/revocation fingerprint. Cache uniqueness is tenant + complete input fingerprint. Reauthorize and check current revocation/deletion before using a stored result. New method/dictionary or factual edits create a new analysis. Presentation-only changes can reuse semantic evidence but invalidate export bytes; never cache by CV text alone.

Candidate–Job Fit covers the full confirmed profile and is NULL when that scope is unavailable. CV–Job Match covers only supported facts represented in the selected CV. Rewording/reordering cannot raise either semantic score; selecting previously omitted supported facts can raise CV–Job Match. Eligibility is independent: requirements_satisfied, needs_verification or confirmed_requirement_gap, with source-backed non-compensatory gates. Required wording alone is not a hard gate; absence of attestation is not proof of a confirmed gap. ATS Readability belongs to actual export checks and stays untested until real bytes are extracted/tested. Readiness remains a qualitative checklist, as current PRD section 15 directs, even though an older technical snapshot demonstrated a numeric rubric.

Discovery method compatibility-1.1.0 / baseline-1.1 proposes category weights 30/25/15/10/10/5/5, priority multipliers 3/2/1 and evidence classes 1/.75/.4/0. Store them as immutable rule config, not a schema constraint pretending calibration. Persist atom denominators, effective weights, allocated AND shares, OR alternatives/polarity, contribution and explanation. Deduplicate repeated synonyms and boilerplate; renormalize only genuinely absent categories and expose it. Strict credentials are not satisfied by contextual aliases.

Shared Mara fixture keeps CandidateFit 90 and CVMatch 62.5→90 through existing confirmed API/HR/outcome/context selection. Eligibility needs verification and PDF is untested. These are illustrative deterministic inputs, not live inference, employer ATS or hiring probability. Recommendations carry exact requirement/claim FKs, limitations and a supported action. Estimated delta is NULL without a concrete comparable supported patch using the same method/job inputs.

## 8. Migration order, dependencies and approval scopes

The older M01–M07 labels are research groups. Do not execute them literally: M03 referenced later jobs/prose/templates; M07 budgets would have appeared after expensive work. Revised P phases resolve those issues.

For **each named phase** use multiple ordered immutable migrations: (a) create new table shells and scalar columns only, (b) add new columns to older tables, (c) add PK/UNIQUE/CHECK constraints and required indexes, (d) add FKs after all referenced target keys exist, (e) add bounded validators/commands/views/RLS/revoke/grants and validation tests. Same-phase circular head constraints are installed after version shells. On existing data, add nullable columns, backfill deterministically, validate constraints, then tighten NOT NULL only where semantically valid. Never leave an unchecked UUID placeholder for a future target.

| Phase | Exact grouping/order | Exit |
|---|---|---|
| P0 · 7 | tenants/user_profiles/memberships; idempotency/audit/consent/deletion; provision and save-command infrastructure | Two-tenant RLS, no self-elevation, stable UID/reprovision, payload-key races and tombstone tests |
| P1 · 19 | source/profile/entity shells; claims/spans/provenance/relations/confirmation; entity revisions and claim joins; profile versions/pins; document versions/sections/items; add head FKs last | Canonical roundtrip/partial dates/two titles/skills, no crossed profile/document, immutable/restore/retry/409 tests |
| P2 · 8 | jobs/captures/versions then requirements/atoms; add nullable job context to existing sources/documents/versions; applications/events/next_actions; add chosen/sent CV lineage last | Old Base rows still valid; job heads/requirements source lineage; sent/retraction/search/latest races |
| P3 · 9 | immutable rules; mappings and match evidence; analysis/components; recommendations and two support joins; readiness | Current fixtures, reproducible fingerprint/total, CV-only NULL scope, no duplicate atom points or numeric readiness claim |
| P4 · 14 | operations/attempts/outbox and quota periods/reservations/usage before job RPCs; add earlier operation refs; extraction + source span run FK; interviews/turns/generation/prose/support/proposals/decisions; replace item XOR constraints and add approval/prose FK after targets | Crash/retry/lease/fence/cancel/delete/provider-unknown and budget tests; no service activation from DDL |
| P5 · 4 | template/version then exports/checks; add template FK to old CV versions and export refs to applications/events after export keys exist | Actual render/check/privacy manifest identity, old sent events without exports remain valid |
| P6 · 2 | contacts/application_contacts after application baseline | Optional third-party policy and purge proven; independent of P3–P5 |
| P7 · 4 | billing accounts/subscriptions/provider ingress/entitlement revisions; provider mapping and commercial projections | Separate commercial approval; duplicate/out-of-order/unknown provider cases |

P1 does not include extraction-run/prose/job/template/operation FKs. P2 adds job constraints, P4 adds operation/prose/extraction constraints and P5 adds template/export constraints. Catalog fields, keys and FKs identify their introduction. P6 depends only on P2; P7 depends on P4. No cross-stage reference points at a nonexistent table.

Use Supabase migration history to apply each file once. Re-running normal apply with no pending migrations is a no-op; rebuilding a fresh local database gives the same schema. Do not spread `IF NOT EXISTS` across DDL and mask a wrong preexisting definition. Seed global catalogs with unique semantic/version keys and verify hash conflicts instead of overwriting published configs. Record source/catalog/plan/migration hashes. Applied shared migration files are immutable; correct forward.

**Approval choices on one board card:**

1. Request revisions / defer execution: no implementation authority.
2. Approve local migration implementation and synthetic tests only: selected phase set, no remote writes.
3. Approve local implementation **and staged development apply** to `aquvhqbkvrtzhbmezkci`: selected phase set, after all local tests and read-only target/schema/history/drift/backup checks; synthetic acceptance rows and cleanup are explicitly included. Each phase applies sequentially with stop-on-drift/failure. This explicit scope is sufficient; do not ask the same remote permission again.

Selectable sets are P0–P1 manual foundation, P0–P3 deterministic product pilot (recommended first), or P0–P5 schema-only feature foundation. P6/P7 remain excluded. Schema approval never activates AI/render/billing providers or paid services. A scope choice is not approval until explicitly queued and sent by the owner. Closing a board without an answer is not approval. Any approval relates to this exact plan/catalog version; material changes need a versioned delta, not reinterpretation of old consent.

## 9. Mandatory execution preflight and validation (later approved task)

1. Record the exact accepted version, selected phases and development/local scope. Use this worktree snapshot's contracts as starting evidence; reconcile newer product changes before implementation.
2. Read-only inspect actual target project identity, purpose/environment, Postgres version, schema/extensions/grants/RLS/views/functions/storage policies, migration history, pending migrations, drift and presence of data. Do not dump user rows, secrets or keys. Existing schema/emptiness remains unknown until this happens. Wrong target, conflicting schema, meaningful unreviewed drift or destructive rewrite is outside approved additive scope and stops execution for Firstmate.
3. Review actual DB and object backup/export availability, restore access, recovery point and retention/tombstone handling. A dashboard/free tier does not prove backups. Establish a synthetic baseline and recovery plan before remote DDL; if no acceptable recovery exists, stop. Remote `db reset` is prohibited. No paid backup upgrade inferred.
4. Implement local migrations and narrow command functions with pinned supported tooling in the later task; no installation is performed now. Local reset/rebuild, lint/security review and tests must pass. Review exact migration list/hash and supported dry-run diff; do not infer `--dry-run` syntax from this document without checking installed CLI help.
5. Apply only the named phase to the verified dedicated dev project, record migration ledger/hash/schema verification, run authorized synthetic acceptance tests and clean up those exact fixtures. Stop on first failed gate/drift; fix forward under the accepted scope. Do not repeatedly request permission for already-approved staged development apply.

Implementation tests must prove: anonymous/A/B/revoked/job/privacy role matrix across SELECT/INSERT/UPDATE/DELETE/RPC/views/Storage; known foreign UUID attacks; same-tenant wrong profile/document/job/requirement/confirmation/prose/export; nullable-context bypasses; sequential/concurrent same-key replay; changed body conflict; separate stale edit; response lost before/after commit; no duplicate version/head/audit/outbox/reservation; restored version history; Base isolation; stale generation/lease/cancel/delete fences; unknown provider outcome and metering; private storage manifest/bytes failures; identical export fingerprint and check checksum; duplicate/out-of-order webhook; sent count/retraction races; source revocation propagation; all canonical fixtures and deliberate invalids; deterministic analysis components and CV-only scope; fresh rebuild and no-pending reapply; permitted upgrade on synthetic populated previous phase.

This planning task only validates artifacts and contract alignment. It does not claim any SQL, RLS, migration, provider, recovery, capacity or rendered-PDF test has passed.

## 10. Deletion, retention, recovery and operations

Retain source facts, history, generated proposals, contact PII, exports, sanitized operations and commercial records as separate classes. Actual durations, residency/legal basis, inactivity, backup exception and provider retention policies remain in the existing product/strategy decision register. Historical suggestions (30-day sources, 24-hour exports, 7-day replay, 90-day unaccepted drafts, 7-day backups) are review inputs, not selected production policy. Local synthetic schema tests do not need a real-data retention decision. Before real data, policy-configured retention jobs and notices are a required feature gate.

Erasure: reauthenticate and record exact scope; mark tenant deleting and increment generation; revoke new work and fence/cancel in-flight operations; compute descendant lineage including source text, claim relations/projections, prose, job/application records if in scope, analyses/caches and PDFs; purge Storage bytes via supported API with checkpoints; delete/redact graph child-first with deliberate RESTRICT behavior; sever Auth identity through supported administration after product purge; retain only minimal pseudonymous tombstone/generation as required through backup expiry. Active tenants require owner UID; erased tombstones may set owner UID NULL. Purge does not mean every backup was selectively erased instantly. Source-only deletion must explain retained fact provenance reduction and invalidate affected derived content according to chosen scope; account erasure covers all copies.

Backups must include Postgres plus object bytes/checksums plus schema/rule/template/font versions. Recovery rehearsal is a sandbox exercise: restore baseline DB/objects, reapply deletion tombstones before serving, verify tenancy and byte checksums, preserve used-key/provider-event/operation identities and reconcile external effects before reenabling dispatch. Restoring an old outbox can replay an already performed provider effect; pause dispatch and reconcile receipts/status first. Reapply changes that occurred after the backup, especially erasures, instead of blindly sending them again. Proposed RPO 24h/RTO 8h from discovery are unproven business targets, not promises.

Rollback is primarily stop affected features/workers, revert compatible application code and use an additive forward correction. A committed destructive migration cannot be made safe by a fictional automatic down migration. Name and rehearse a backup restore for actual data loss; do not restore over the live project without separate recovery authority. Keep old readers/projections while moving schema versions; verify new projections before switching. Use time-bounded locks and stop on unexpected backfill size.

Operational machinery is deliberately local: SQL jobs/outbox/leases begin only at P4; no queue service before async work. Poll short ready batches with indexes, deadlines and bounded attempts. Keep redacted request/operation IDs, queue age, expired lease count, unknown provider outcomes, budget usage, failed deletion checkpoints and object-orphan count. Manual failed-operation triage is enough for the pilot; no dedicated dead-letter table/service is required. Monitoring/threshold/spend amounts need later operating scope; they are not services provisioned by this task.

## 11. Decision and assumption register

| ID | Status | Statement / consequence |
|---|---|---|
| DB-01 | Proposed design | Modular monolith, personal tenancy, normalized relationships + bounded immutable JSONB; separate subtype tables only when query/index/type constraints justify them |
| DB-02 | Preserved contract | Stable Auth UID; two titles; separate skills; partial dates; RO/EN; confirmed evidence and Base isolation are not reopened |
| DB-03 | Proposed staging | P0–P1 manual foundation; P0–P3 first product pilot; P4/P5 feature-gated; P6/P7 deferred. No approved table-count claim |
| DB-04 | Required integrity correction | Canonical claim_relations/entity-reference/version-pin tables; same-phase shells and later cross-stage FK additions; explicit same-profile/document/job relationships |
| DB-05 | Owner decision pending | Exact architecture version and local-only versus staged dev execution, selected P-phase set; owned only by resumora-db-implementation-approval |
| DB-06 | Unverified | Remote schema/history/drift/backup/environment; must inspect read-only before any approved remote apply |
| DB-07 | Future policy dependency | Real-data retention/residency/commercial entitlements/provider terms and limits remain in existing product register; no duplicate policy approvals invented here |
| DB-08 | Boundary correction | Current PRD qualitative readiness takes precedence over older numeric rubric example |
| DB-09 | Known external limit | Idempotent DB state cannot guarantee exactly-once external execution/cost or an atomic SQL+object transaction |
| DB-10 | Browser review | No automatic opening until bridge profile is tied to cosmin@emedi.ro. Documented --no-open supports manual review without silently selecting another profile |

Evidence: repository commit `d8c20ed82e0b1dce95e7a910780400e3fdc31cb2`; PRD sections 5–8, 15–17; architecture data-model, contracts, journey-contracts-v3 and security-ops; canonical schema 1.0.0 and companion workspace/assessment schemas. Original recovered reports/catalog remain untouched. Official Supabase/Postgres documentation links in the prior research are mechanism references, not evidence of a tested hosted setting. Later implementation verifies supported syntax and actual versions.


## 12. Canonical mapping and command implementation checklist

| Canonical concept | Stored graph / exact payload rule |
|---|---|
| facts.nameClaimId | name entity revision + entity_revision_claims role nameClaimId; at most one selected name entity |
| facts.positioningTitleClaimIds | positioning_title payload slot 0/1 with explicit claim role; validator emits exactly two nullable slots; no historical-title substitution |
| facts.contacts | contact revision payload kind/visibility/label; value claim FK; profile contains private facts, CV/export selection independently restricts visibility |
| facts.skills | skill revision payload class=professional or technical, labelClaimId/evidenceClaimIds joins; conceptId is versioned dictionary concept text, not an inferred qualification |
| facts.employment | employment revision payload title/company/location/start/end/ongoing and selected scope/responsibility/accomplishment/metric claim roles; skillIds use entity_revision_entities; revision validator preserves ordered fields |
| facts.education | education revision payload institution/qualification/field/location/start/end/detail claim roles; no recognition inferred |
| facts.optionalEntries | optional_entry payload canonical certification/project/achievement/portfolio/language/leadership/publication/volunteering/custom kind and supported claim roles |
| enrichment | enrichment revision attribute and exactly one targetEntityId in entity_revision_entities; claim IDs in explicit claim joins; target must be selected in same published profile |
| claimLinks | immutable claim_relations, explicitly selected through profile_version_relations; both claims pinned in same version |
| generatedProse | P4 prose_revisions/prose_support with input profile version, generation provenance and separate approval; rejected/pending text excluded from approved export |
| interviews | P4 interviews/turns + exact answer-source provenance; target_context validated against pinned claim/entity graph; skip/unknown never produces confirmed evidence |
| document.sectionOrder / sections | cv_sections ordinal/section_instance_id/kind/label/visibility; complete permutation validated; array order in source facts is not document order |
| section.entryIds / proseIds | cv_items selects revisions/prose in explicit order, exact CV/profile membership and accepted scoped prose decision |
| context / snapshots | server envelopes supply actual tenant and lineage; portable IDs are stable serialized UUIDs; human-readable IDs remain synthetic fixture labels only |

Profile-envelope validator v1 has exactly these top-level keys: schemaVersion, profileId, profileVersionId, sequence, parentVersionId, asOf, sources, provenance, claims, facts, claimLinks, enrichment. It reuses the canonical CV 1.0.0 source/provenance/claim/facts/claimLink/enrichment definitions and their cross-reference rules; document/generatedProse/layout are absent. Profile IDs/versions are server envelope metadata. The complete CV projection adds document selection, approved prose and canonical snapshot/context fields under canonical schema 1.0.0. Both are generated from the same transactionally pinned rows, never edited independently. Local implementation must add envelope validation and fixture roundtrips before this format is published; no profile JSON contract is claimed to exist already.

Every command accepts a verified caller context, stable request key and versioned typed arguments. actor/tenant are resolved by the server. The following is a concrete implementation checklist, with narrow RPC boundaries rather than arbitrary row CRUD:

| Phase / command boundary | Transactional reads/writes and result |
|---|---|
| P0 provision_personal_workspace | lock/unique owner UID; insert/find tenant + membership + preferences; return original tenant on retry; cannot provision another caller |
| P0 begin_or_replay_command | scoped unique key/fingerprint, authorization, expiry handling; helper participates in caller transaction; no separate completed-before-business commit |
| P1 save_profile_checkpoint | expected draft/head; lock profile and relevant confirmation state; validate typed revisions/joins/relations, allocate sequence, pin graph, derive facts projection, audit + replay result; optionally publish Base CV in same command |
| P1 save_cv_checkpoint / restore_cv_version | lock exact document/profile; compare revision; validate selected profile graph, sections/order/privacy; insert immutable CV projection + new sequence/head + request result; restore inserts a new version |
| P1 confirm_claims / revoke_claim | selected same-profile claims; append decisions under lock, publish selected new profile head only on expected revision; revocation blocks reuse and marks dependent current artifacts invalid |
| P2 confirm_job | expected job draft; capture/source/span lineage; new reviewed version and requirement graph; server sequence/head; old analyses remain historical and no longer current |
| P2 attach_application_cv / set_next_action | exact stable job/document/CV lineage and application revision; no inference of sent or tailoring from attachment |
| P2 mark_sent / retract_sent | application lock + request identity; pin actual historical document/CV/export refs; unique event/retraction target; return original event/count projection on replay |
| P3 publish_analysis | validate exact input bundle and accepted evidence graph; complete fingerprint unique; compute deterministic components and explanations; no model total; invalidate cache on current revocation |
| P4 accept_async_command | lock budget period; reserve bounded operation/attempt allowance, write operation/outbox/request result; return same operation on retry |
| P4 claim_work / heartbeat / complete_work | job-only role; short lease/fence transactions; completion checks destination revision, live lease, deadline and deletion generation; exactly one logical result slot |
| P4 accept_proposal / promote_facts_to_base | exact selected internal patch IDs and immutable proposal support; scoped CAS; explicit fact attestation and destination; Base promotion is never an accidental side effect |
| P5 complete_export / purge_object_manifest | exact CV/template/privacy/byte checksum/check reports; private manifest state transition; bytes reconciled separately; export never emits mark_sent |
| P7 ingest_provider_event / reconcile_entitlements | separate commercial scope only; verified ingress identity then authoritative object reconciliation + immutable entitlement publication |

Deletion and validation functions use the same exact tenant/context checks even when granted definer authority. A client cannot invoke a job/privacy/catalog function merely by selecting an operation kind. Include RPC privilege tests and redacted error contracts in each phase's implementation review.
