---
id: db/insights
area: db
files: ["supabase/migrations/20261106000000_enrichment.sql", "supabase/migrations/20261107010000_insights_pending.sql", "apps/api/src/enrich/repo.ts", "apps/api/src/enrich/supabase-repo.ts", "apps/api/src/enrich/memory-repo.ts", "apps/api/src/enrich/repo.test.ts", "supabase/tests/database/enrichment.test.sql"]
depends_on: ["shared/enrichment-score", "shared/enrichment-focus", "db/voice-reservations", "db/ai-log"]
contract: true
checked_hash: f1dd7457
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0012-ai-enrichment-scores-and-notes.md", "docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md", "docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Cache per-user role scores and predicted results awaiting a later CV save.

- cv_insights has a composite user_id/role_id primary key, cascades auth-user deletion, and stores fingerprint/policy/result without a role foreign key. `supabase/migrations/20261106000000_enrichment.sql:6` -> `cv_insights`
- Current original enrichment policies grant authenticated owners all four operations; update checks ownership both before and after the write. `supabase/migrations/20261106000000_enrichment.sql:19` -> `grant select, insert, update, delete`, `supabase/migrations/20261106000000_enrichment.sql:21` -> `own insights: read`, `supabase/migrations/20261106000000_enrichment.sql:25` -> `own insights: update`
- The pending migration adds non-null JSONB defaulting to an empty array without a database length/shape constraint; the existing policies cover it. `supabase/migrations/20261107010000_insights_pending.sql:11` -> `add column`, `supabase/migrations/20261106000000_enrichment.sql:26` -> `with check`
- Supabase list/get drop malformed or wrong-role cached results rather than throwing for the bad cache entry. `apps/api/src/enrich/supabase-repo.ts:17` -> `RoleResultSchema.safeParse`, `apps/api/src/enrich/supabase-repo.ts:38` -> `flatMap`
- put rejects mismatched role IDs and upserts on user_id,role_id, leaving pending out of the written fields. `apps/api/src/enrich/supabase-repo.ts:48` -> `result.roleId !== roleId`, `apps/api/src/enrich/supabase-repo.ts:58` -> `onConflict`
- Pending entries must have a valid ISO at, valid RoleResult, matching role ID and matching nested/outer fingerprints. `apps/api/src/enrich/supabase-repo.ts:21` -> `PendingEntrySchema`, `apps/api/src/enrich/supabase-repo.ts:27` -> `parsed.success`
- putPending silently returns if the base cache row is absent; otherwise it replaces the same fingerprint, sorts by timestamp and retains MAX_PENDING newest entries via separate read/update requests. `apps/api/src/enrich/supabase-repo.ts:72` -> `if (!data) return`, `apps/api/src/enrich/supabase-repo.ts:77` -> `slice(-MAX_PENDING)`
- remove is a no-op for an empty ID list; otherwise it deletes matching visible role rows. `apps/api/src/enrich/supabase-repo.ts:82` -> `roleIds.length`, `apps/api/src/enrich/supabase-repo.ts:83` -> `delete()`
- Fake list/get return stored results without the database adapter's schema validation; fake pending validates results and fingerprints but does not validate at with PendingEntrySchema. `apps/api/src/enrich/memory-repo.ts:16` -> `structuredClone`, `apps/api/src/enrich/memory-repo.ts:20` -> `structuredClone`, `apps/api/src/enrich/memory-repo.ts:28` -> `RoleResultSchema.safeParse`, `apps/api/src/enrich/supabase-repo.ts:26` -> `PendingEntrySchema.safeParse`
- Fake putPending mutates its row without awaiting a database read/write, so it does not reproduce lost concurrent pending updates possible in the Supabase implementation. `apps/api/src/enrich/memory-repo.ts:40` -> `row.pending =`, `apps/api/src/enrich/supabase-repo.ts:70` -> `await db`, `apps/api/src/enrich/supabase-repo.ts:76` -> `await db`
- tested by `apps/api/src/enrich/repo.test.ts:49` -> `pending role results`
- tested by `supabase/tests/database/enrichment.test.sql:33` -> `another user sees no insights`

## Connections

- Uses owner policies for unfiltered reads and role-only updates: `apps/api/src/enrich/supabase-repo.ts:36` -> `cv_insights` -> `supabase/migrations/20261106000000_enrichment.sql:22` -> `auth.uid()`; `apps/api/src/enrich/supabase-repo.ts:77` -> `update` -> `supabase/migrations/20261106000000_enrichment.sql:26` -> `auth.uid()`.
- Used by score cleanup/cache promotion: `apps/api/src/enrich/score.ts:65` -> `insights.remove`, `apps/api/src/enrich/score.ts:76` -> `insights.pending`, `apps/api/src/enrich/score.ts:94` -> `insights.put` -> `apps/api/src/enrich/supabase-repo.ts:81` -> `remove`, `apps/api/src/enrich/supabase-repo.ts:63` -> `pending`, `apps/api/src/enrich/supabase-repo.ts:47` -> `put`.
- Score creation uses the score prompt before writing the result: `apps/api/src/enrich/score.ts:85` -> `scoreSystemPrompt` -> `apps/api/src/enrich/prompts.ts:250` -> `scoreSystemPrompt`; persistence `apps/api/src/enrich/score.ts:94` -> `insights.put` -> `apps/api/src/enrich/supabase-repo.ts:49` -> `upsert`.
- Web cache read/score URLs use these handlers: `apps/web/src/cv/enrich/enrich-api.ts:27` -> `/v1/enrich/scores`, `apps/web/src/cv/enrich/enrich-api.ts:35` -> `/v1/enrich/score` -> `apps/api/src/enrich/routes.ts:53` -> `/scores`, `apps/api/src/enrich/routes.ts:55` -> `/score`; mount `apps/api/src/app.ts:80` -> `/v1/enrich`.
- Uses voice RPC: `apps/api/src/enrich/supabase-repo.ts:88` -> `rpc("reserve_voice_session"` -> `supabase/migrations/20261106020000_voice_reservation.sql:5` -> `reserve_voice_session`; logger RPC in the same module `apps/api/src/enrich/supabase-repo.ts:103` -> `rpc("log_ai_call"` -> `supabase/migrations/20261109220000_enrich_item_lines.sql:7` -> `log_ai_call`.

## Assumptions

- Cached role existence and policy freshness are application concerns; SQL has no role reference, and scoreRole removes stale role IDs and compares fingerprints/policy. `supabase/migrations/20261106000000_enrichment.sql:8` -> `role_id`, `apps/api/src/enrich/score.ts:64` -> `stale`, `apps/api/src/enrich/score.ts:73` -> `SCORE_POLICY`
- The authenticated token must match the user ID supplied for upserts; RLS enforces that relationship. `apps/api/src/enrich/supabase-repo.ts:11` -> `Authorization`, `apps/api/src/enrich/supabase-repo.ts:51` -> `user_id: user.id`, `supabase/migrations/20261106000000_enrichment.sql:24` -> `auth.uid()`
