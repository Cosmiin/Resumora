# Resumora: remove the job product, preserve Base CV

> Historical record. This is not the current specification or an active task list. Start with [the current handoff](../../../HANDOFF.md).

Date: 4 November 2026
Status: approved by the user on 4 November 2026. Proceed to the implementation plan; execution and hosted mutation are not started by design approval alone.

## Intent and agreed scope

Resumora becomes a Base CV product. A fresh application session exposes authentication, CV import, profile editing and enrichment, CV presentation/export, and languages. There is no job workspace, capture, matching, tailoring, application tracking, extension, or job-specific document capability.

The user answered twenty scope questions. Their decisions are:

- Permanently delete the entire job product and its data, across every account/workspace, in both the current repository and existing hosted Resumora database (`aquvhqbkvrtzhbmezkci`).
- Delete all job-specific CVs, answers, analysis, recommendations, application records, extension connections, and job-derived content previously merged into Base CVs. Do not convert job documents to standalone documents or export them for retention.
- Delete identifiable job-related AI accounting, usage, error and audit entries, including entries without document content. Preserve CV-related entries in shared stores.
- Include job-only stored files, generated exports, extension archives, build artifacts and application-managed browser caches. Retain assets still required by an uncontaminated Base CV.
- Preserve authentication and account data; background CV import and scanned-document handling; initial review and later additive imports; manual editing; guided questions, role scores, rewriting, skills improvement and voice input; templates, photos, preview and PDF export; languages and translation; profile history, restore, replacement and deletion.
- Make My Profile the only main workspace, retaining account/settings controls.
- Keep unfinished CV, enrichment and language work. Audit that work separately after this removal project; do not use removal as a pretext for unrelated fixes or redesign.
- Use a new removal migration. Keep applied historical migrations and Git history. Clean current documentation, tests, fixtures and scripts.
- A short maintenance window is acceptable.

## Approaches and decision

1. **Remove job modules and selectively migrate the existing database.** Preserve the current Base CV implementation and data, extract shared utilities, purge job data, replace mixed database routines, and drop job-only schema objects. Requires dependency analysis and migration rehearsal. This is the approach selected through the user's answers on hosted scope, forward migration, preservation and downtime.
2. **Rebuild/reset the database and selectively reimport CV data.** Simpler starting schema, but risks accounts, saved history and unfinished CV functionality. Conflicts with preservation requirements; rejected.
3. **Hide or disable jobs while retaining their implementation/data.** Less initial work, but contradicts permanent removal and fresh-session expectations; rejected.

This is a cross-application removal project, not a folder deletion. The implementation plan will sequence independently verifiable changes within this one project.

## Evidence gathered and limits

Read-only repository inspection found 340 modified/untracked status entries. This is a count, not an audit or permission to overwrite them. The environment guide identifies the Linux/WSL checkout as the active app, with hosted Supabase and AI providers as dependencies.

Read-only hosted inspection on 4 November returned the current `app` table inventory and no Supabase Edge Functions. The table listing reports extension connections and deletion fences even though its job-table row estimates are zero. Estimates are not exact purge evidence.

An exact aggregate of `app.career_operation_results` returned only rewrite operations (17 ready, one failed), with no integration operations. This supports the user's expectation that no job information was merged into Base CV, but does not prove historical absence or inspect every possible source of provenance. A broader preflight is still required before changing profile content.

No application services were restarted, no product code or runtime configuration changed, and no hosted data modified during this design work. Tests and provider calls have not been run for the proposed removal.

## Repository boundaries

| Area | Required treatment |
| --- | --- |
| `apps/extension/` | Remove the entire workspace, package/release scripts, tests, packaging output and current extension instructions. |
| `apps/api/src/jobs/`, `apps/api/src/extension/` | Remove job/capture handlers and processors after moving genuinely shared utilities. |
| `packages/contracts/src/jobs/` | Remove job contracts; relocate generic UUID/locale helpers still used by retained features and update their imports. |
| `apps/api/src/index.ts` | Remove job and extension routes, queue wakes and scheduled drains; retain CV import scheduling and protected CV routes. |
| `apps/api/src/auth/routes.ts` | Remove extension-session revocation dependencies while preserving login, logout, session replacement and CSRF behavior. |
| `apps/api/src/db/`, `workspace/`, `ai/`, `intelligence/` | Remove job commands/types and integration operations; preserve CV drafts, enrichment, provider authorization and accounting. |
| `apps/api/src/languages/`, `export/`, `photos/` | Retain Base functionality; remove job selectors, branches and document references. |
| `apps/web/src/workspace/`, `App.tsx`, `auth/`, `base/` | Use a Profile-only shell, persisted navigation and clients; remove job resource routing and loading. |
| Job/extension components and adapters | Remove dedicated screens, panels, job answers, matching, tailoring and `base/job-adapter.ts`; simplify mixed components without rewriting retained CV behavior. |
| Editor/intelligence/language contracts | Remove job-specific variants and fields; preserve employment history, role titles and CV-processing task concepts. |
| `scripts/job-worker.mjs`, development scripts | Remove the job processor, its launch/config/status handling and job-only bindings; retain the managed frontend/API/import service. |
| Tests, fixtures, schemas, docs, prototypes, examples | Delete job-only material and clean mixed material; retain coverage and examples for Base features. Scan the whole current tree, not only `apps/`. |
| Generated output and caches | Identify and remove job-bearing build/extension artifacts, then rebuild retained outputs. Avoid deleting unrelated worktrees or retained user files. |

Confirmed coupling examples: export routes import a job locale helper; language routes import shared response helpers from job routes; workspace contracts import a UUID helper from job contracts; authentication imports extension revocation; the scheduled handler drains both import and job queues. Removing their containing directories first would break retained functionality.

## Database design

Before generating SQL, build an explicit catalog of tables, functions and overloads, constraints, policies, triggers, views, sequences, grants and scheduled work, using the actual hosted schema and repository migrations. Trace both catalog dependencies and SQL/PLpgSQL bodies; catalog dependencies alone do not capture all procedural references. Reconcile local and applied migration versions. Do not edit applied migrations.

### Job-only removal candidates

The inventory currently identifies:

- `jobs`, `job_captures`, `job_versions`, `job_requirements`, `requirement_atoms`.
- `applications`, `application_events`, `next_actions`.
- `target_job_contexts`, `job_editor_documents`, `job_editor_versions`, `job_workflows`, `job_workflow_operations`, `job_answers`.
- `capture_worker_authorization`, `capture_session_fences`, `capture_connections`, `capture_operations`.
- `job_deletion_fences`, `job_purge_rows`, `job_request_links`.
- Matching-related `evidence_mappings`, `match_evidence`, `analysis_runs`, `analysis_components`, `recommendations`, `readiness_runs`, `recommendation_requirements`, `recommendation_claims`.

Classify `rule_versions` and its individual consumers before deciding its removal: matching rules must disappear, but any utility still needed for Base CV must first be disentangled. Empty tables are not evidence that they are unused.

### Shared data and routines

- Preserve tenants, memberships, authentication, user settings, Base source documents/provenance, profiles, CV storage, import sessions/tasks, photos, Base language proposals and Base lifecycle support.
- Preserve `ai_worker_authorization`: it was introduced in a job-named migration but also supports retained AI work.
- Keep shared AI operations/attempts, idempotency and audit stores. Identify job rows through operation kinds, request kinds, source/target identities and linked records before deleting the association tables. Delete dependent job entries in a safe order; keep unrelated CV records.
- Remove job draft kinds, job integration operations, `submitted_job_id`, job-linked translation proposals and job navigation state from shared workspace/language storage. Preserve import review, Base translation review, profile resume state and Base questions/rewrites.
- Purge job-only rows in canonical source/CV/provenance stores and remove job selectors and constraints from retained structures.
- Rewrite shared routines such as `begin_request`, `protect_immutable`, workspace validation, Base removal and language/photo helpers before dropping tables they reference. Preserve tenant ownership, immutable-history protection, idempotency and lifecycle fencing for retained features.
- Remove all job-only RPCs and grants, including older/private wrappers, types and triggers. Explicitly replace mixed routines. Do not use an unreviewed blanket `DROP ... CASCADE`.
- Remove job-only runtime credentials and stored authorization after stopping their consumers. Keep shared AI credentials, auth keys and provider configuration unchanged.

### Base content provenance

Inspect current Base content, history, language versions, drafts, derived AI results and shared provenance for demonstrable job origin before deleting the origin records. Do not infer job origin from ordinary employment titles, matching words, or the presence of a company name.

Where attribution is established, remove the contributed material and dependent copies so history/restore/translation cannot reintroduce it. Preserve unrelated edits. Recompute affected metadata and invalidate affected derived results as required by the existing contracts. Keep transaction-scoped mutation authority narrow; do not permanently weaken immutable-history protections.

If no attributed content is found, preserve Base payloads unchanged and record the checks supporting that outcome. If mixed content cannot be separated reliably, stop that destructive step with a precise affected-record report rather than guessing or erasing the whole profile. This is a possible evidence gap, not a new request to audit all CV work.

## Meaning of no trace

Completion means no supported job feature, job schema objects, job data or job-specific metadata in the current application and mutable stores under our control. A new session shows only the retained product. Requests from old clients cannot recreate removed data.

Exceptions already agreed are applied migrations and Git history. The design/removal plan and minimal completion evidence are transition records, not active product documentation; retire them from current onboarding/navigation after implementation. A repository historian can still discover prior features through the explicitly retained history.

Previously downloaded user copies, offline browser/extension installations, third-party provider records and managed backup retention are not erased merely by changing the app/database. Inventory reachable copies and report anything outside our control without claiming physical erasure. Do not create a fresh job-data archive or backup as part of this project by default. Existing backup retention is not silently changed.

Browser cleanup must be targeted: preserve auth and CV drafts. Clean accessible job cache keys and job-linked language operation pointers; invalidate stale navigation. Old routes receive the application's generic unknown-route behavior. Extension credentials become unusable when their endpoints and database authorization are removed. An offline installed extension cannot be remotely uninstalled; its remaining local state is an explicit completion limitation until that installation is cleaned.

## Execution sequence for the subsequent implementation plan

1. **Capture the baseline.** Inventory current modified/untracked files and retained interfaces; collect content-free preservation counts/fingerprints and applied schema metadata. Establish relevant test baselines, distinguishing pre-existing failures. Do not reset, clean, stash indiscriminately or switch to a clean branch that loses unfinished work.
2. **Build the Profile-only application locally.** Extract shared utilities and remove UI/API/contract/runtime dependencies. Preserve the existing CV behavior and uncommitted implementation. This is not an opportunity for a redesign or the deferred audit.
3. **Prepare the forward removal migration and storage cleanup.** Produce an explicit object/row classification, provenance preflight and dependency order. Rehearse on disposable PostgreSQL data with multiple synthetic tenants, shared assets and historical rows. Test both upgrading and constructing a database by replaying historical migrations followed by the removal migration.
4. **Verify before rollout.** Build and test retained behavior, schema integrity and rejection of retired operations. Present the actual migration, cleanup manifest, baseline preservation results and rollback limits as the concrete rollout package.
5. **Perform the maintenance cutover once implementation is authorized.** Stop writes and all old job/capture dispatch sources; let active CV imports settle under the managed service's shutdown contract. Re-run preflight under the write freeze. Preserve a temporary, restricted inventory of job-only storage object keys before their database links are removed. Apply the transactional schema/data migration and remove job-only storage objects through supported storage APIs. Record cleanup completion without retaining deleted content; remove temporary manifests when complete. Deploy the prepared local build/runtime configuration and restart using the managed commands.
6. **Verify the hosted result and reopen.** Check schema absence, shared-store cleanup, auth/CV preservation, stale-client rejection and retained browser flows. Re-run the storage sweep and confirm no job processor/config remains. Reopen only when checks pass; if cleanup fails, retain maintenance and retry from the temporary manifest rather than reporting success.
7. **Finish repository cleanup and report.** Remove job-only artifacts/docs/fixtures/scripts, refresh current setup guidance, and report evidence and any inaccessible copies. Leave the separate unfinished-CV-work audit for a subsequent task.

SQL rollback is available before transaction commit. Storage deletion and committed data removal are intentionally irreversible; do not promise an undo migration that can recover deleted content. After commit, repair retained features forward while keeping the removed product unavailable. Any exceptional recovery decision must not silently restore deleted job data.

## Verification and acceptance

Implementation checks must cover:

- All tenants retain authentication, membership, settings and unrelated Base data, history, languages, drafts and shared assets.
- Import includes background completion/recovery, scanned input, review, additive merge and cancellation; enrichment includes questions, scores, rewriting, skills and voice; presentation includes templates, photos, preview, export and languages.
- Profile history/restore/removal still work; cleanup cannot leave a shared trigger or SQL function pointing at a removed table.
- A synthetic profile containing proven job-derived contributions is cleaned without erasing independent Base edits; history and language copies cannot restore the removed contributions.
- Synthetic shared AI/audit/idempotency stores lose job entries and retain CV entries. Preserve shared photo files while deleting files referenced only by removed documents.
- All old job/extension API operations and database RPCs are absent or generically rejected; stale workers, tabs, extension requests and queued callbacks cannot publish deleted content.
- Final catalog inspection finds no job-only schema objects or function-body references outside retained migration history; repository scans classify semantic references instead of banning the word `job` from employment history or background task terminology.
- Fresh login opens My Profile with no job/extension navigation, settings, prompts or calls; narrow and desktop layouts remain usable.

Use Node from `.nvmrc` and existing npm workspaces. Planned checks include `npm run typecheck`, `npm run test:web`, `npm run test --workspace @resumora/api`, `npm run build`, the maintained native PostgreSQL suite, `npm run test:dev-config`, `npm run test:dev-secrets` and a live read-only `npm run dev:doctor`. Update obsolete database suite registrations so the aggregate suite tests the resulting product. The implementation plan will pin exact commands and assertions after inventory and baseline checks.

Use synthetic data for destructive tests. Report configured, process-running and end-to-end-verified states separately. Local health and fake provider tests do not prove hosted provider availability. Any live AI checks must be bounded, identified explicitly and must not be confused with deterministic regression coverage.

## Decisions left to the implementer

Choose neutral helper filenames, internal refactoring boundaries, targeted cache migration mechanics and exact SQL ordering from the dependency inventory. Keep existing libraries, Node version, provider setup and service ownership. Do not change pricing, models, account policy, product design or unrelated CV behavior. Resolve implementation details autonomously; return only for evidence conflicts that prevent preserving agreed Base data while deleting attributed job content.

The next deliverable after design review is a file-level implementation plan with dependency order, meaningful tests, a concrete migration/cleanup preflight and maintenance runbook. Planning is not execution of the destructive rollout.
