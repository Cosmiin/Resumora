---
id: db/voice-reservations
area: db
files: ["supabase/migrations/20261106020000_voice_reservation.sql", "supabase/tests/database/enrichment.test.sql"]
depends_on: ["db/ai-log", "shared/enrichment-score"]
contract: true
checked_hash: c013f43a
cited: [86da04, 96e154, 274853, 43a595, 0e8243, 8e86f2, 0e8243, 7006a6, 97df4b, e2e47e, 0f8b33, 9366e3, 86da04, e04f7f, 0a1315, 9b676d, d8788c, 8e86f2, 3ff05e, c5a4cd, 3e48dd, 1f1c6f, a667d6, 14cb65, cb77c1, 23342e, e02475, 475c90, c20785, e2e47e, 86da04, 0e8243, 3b9f0a]
decisions: ["docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Count and record voice usage atomically before requesting a transcription session.

- reserve_voice_session(text,int) remains its original voice_reservation definition; it runs as definer with an empty search path and rejects missing auth.uid. `supabase/migrations/20261106020000_voice_reservation.sql:5` -> `reserve_voice_session`, `supabase/migrations/20261106020000_voice_reservation.sql:15` -> `v_user is null`
- A per-user advisory transaction lock serializes the count and insert. `supabase/migrations/20261106020000_voice_reservation.sql:20` -> `pg_advisory_xact_lock`
- Only the caller's enrich_voice rows with status ok in the inclusive last 24 hours count; reaching p_limit returns false without inserting. `supabase/migrations/20261106020000_voice_reservation.sql:22` -> `select count`, `supabase/migrations/20261106020000_voice_reservation.sql:29` -> `v_used >= p_limit`
- Success inserts an ok row using provider openai, truncates the supplied model to 100 characters, and returns true. `supabase/migrations/20261106020000_voice_reservation.sql:33` -> `insert into public.ai_calls`
- Execution is revoked from public/anon and granted to authenticated; the function does not validate or cap the caller's p_limit. `supabase/migrations/20261106020000_voice_reservation.sql:29` -> `p_limit`, `supabase/migrations/20261106020000_voice_reservation.sql:39` -> `revoke execute`
- The fake records only user/task/status/time and ignores model; it performs count/push without an await, rather than using a database lock. `apps/api/src/enrich/memory-repo.ts:46` -> `_model`, `apps/api/src/enrich/memory-repo.ts:50` -> `aiCalls.push`
- tested by `supabase/tests/database/enrichment.test.sql:138` -> `the 21st voice session is refused`

## Connections

- Used by InsightsRepo.reserveVoiceSession RPC: `apps/api/src/enrich/supabase-repo.ts:88` -> `rpc("reserve_voice_session"` -> `supabase/migrations/20261106020000_voice_reservation.sql:5` -> `reserve_voice_session`.
- The route reserves the configured per-day quota before contacting the provider and returns 429 if refused: `apps/api/src/enrich/routes.ts:199` -> `reserveVoiceSession` -> `apps/api/src/enrich/supabase-repo.ts:87` -> `reserveVoiceSession`; subsequent call `apps/api/src/enrich/routes.ts:203` -> `createVoiceSession` -> `apps/api/src/ai/voice-session.ts:56` -> `createVoiceSession`.
- Reservation inserts into the otherwise owner-read-only log: `supabase/migrations/20261106020000_voice_reservation.sql:33` -> `ai_calls` -> `supabase/migrations/20261104000000_baseline.sql:50` -> `grant select`, `supabase/migrations/20261104000000_baseline.sql:66` -> `own ai calls: read`.
- Web voice URL reaches the enrichment handler: `apps/web/src/cv/enrich/enrich-api.ts:63` -> `/v1/enrich/voice-session` -> `apps/api/src/enrich/routes.ts:194` -> `/voice-session`.
- Failed provider calls add an error log rather than deleting the reservation: `apps/api/src/ai/voice-session.ts:85` -> `status: "error"` -> `apps/api/src/enrich/supabase-repo.ts:103` -> `rpc("log_ai_call"` -> `supabase/migrations/20261109220000_enrich_item_lines.sql:34` -> `insert into public.ai_calls`.
- Voice task names must stay synchronized: SQL counts `supabase/migrations/20261106020000_voice_reservation.sql:25` -> `enrich_voice` and inserts `supabase/migrations/20261106020000_voice_reservation.sql:34` -> `enrich_voice`, matching `apps/api/src/ai/voice-session.ts:31` -> `VOICE_TASK`; the fake counts that constant at `apps/api/src/enrich/memory-repo.ts:48` -> `c.task === VOICE_TASK` and inserts it at `apps/api/src/enrich/memory-repo.ts:50` -> `task: VOICE_TASK`.

## Assumptions

- This RPC alone cannot enforce a fixed product quota against direct authenticated callers because they supply p_limit; authorization limits identity, not the limit value. `supabase/migrations/20261106020000_voice_reservation.sql:5` -> `p_limit int`, `supabase/migrations/20261106020000_voice_reservation.sql:29` -> `p_limit`, `supabase/migrations/20261106020000_voice_reservation.sql:40` -> `to authenticated`
