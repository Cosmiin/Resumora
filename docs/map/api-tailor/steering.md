---
id: api-tailor/steering
area: api-tailor
files: ["apps/api/src/tailor/steering.ts","apps/api/src/tailor/tone-examples.ts","apps/api/test/tailor-steering.test.ts","apps/api/test/tailor-tone.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-runs","db/ai-log","api-core/call-model","api-tailor/answers"]
contract: true
checked_hash: bef2bd0c
decisions: []
open: []
---
Turn saved steering into prompt text and generate cached examples for the tone picker.

- withColumns fills only falsy steering tone/instruction from older columns, preserving truthy steering values `apps/api/src/tailor/steering.ts:28` -> `withColumns`; `apps/api/src/tailor/steering.ts:31` -> `steering.tone`.
- Steering defaults to neutral, resolves focus IDs only against experience, drops unknown IDs, and quotes trimmed free instructions with JSON.stringify `apps/api/src/tailor/steering.ts:38` -> `"neutral"`; `apps/api/src/tailor/steering.ts:42` -> `focusRoleIds`; `apps/api/src/tailor/steering.ts:49` -> `JSON.stringify`.
- Tone source is the first nonblank bullet in newestRole; an empty newest role yields no examples even if older roles have bullets `apps/api/src/tailor/tone-examples.ts:16` -> `newestRole`; `apps/api/src/tailor/tone-examples.ts:17` -> `find(Boolean)`.
- No source bullet returns null/null. Cache reuse is based solely on exact bullet text, not tone policy or job changes `apps/api/src/tailor/tone-examples.ts:28` -> `toneBullet`; `apps/api/src/tailor/tone-examples.ts:31` -> `cached?.bullet`.
- Cheap tailor_tone_examples uses a seven-key object of nonempty strings under examples, 1500 tokens, and an inline prompt prohibiting fact changes `apps/api/src/tailor/tone-examples.ts:8` -> `ReplySchema`; `apps/api/src/tailor/tone-examples.ts:10` -> `toneSystemPrompt`; `apps/api/src/tailor/tone-examples.ts:35` -> `tailor_tone_examples`.
- Malformed/schema-invalid replies retry via callModel; exhaustion becomes 502. Accepted strings are trimmed and cached without truth checks; whitespace-only strings pass min(1) before trimming, and extra schema keys are not mapped `apps/api/src/tailor/tone-examples.ts:8` -> `z.string().min(1)`; `apps/api/src/tailor/tone-examples.ts:39` -> `ai_failed`; `apps/api/src/tailor/tone-examples.ts:41` -> `TONES.map`; `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`.
- tested by `apps/api/test/tailor-steering.test.ts:23` -> `steeringText`.
- tested by `apps/api/test/tailor-tone.test.ts:65` -> `POST /v1/jobs/:id/tone-examples`.

## Connections

- Used by tone URL and handler `apps/web/src/tailor/tailor-api.ts:67` -> `/tone-examples`; `apps/api/src/tailor/routes.ts:49` -> `/tone-examples`; `apps/api/src/tailor/routes.ts:53` -> `toneExamples`; `apps/api/src/tailor/tone-examples.ts:24` -> `toneExamples`.
- Uses inline prompt and SQL-allowed task `apps/api/src/tailor/tone-examples.ts:36` -> `toneSystemPrompt`; `apps/api/src/tailor/tone-examples.ts:10` -> `toneSystemPrompt`; `apps/api/src/tailor/tone-examples.ts:35` -> `tailor_tone_examples`; `supabase/migrations/20261109220000_enrich_item_lines.sql:29` -> `tailor_tone_examples`.
- Used by api-tailor/section-prompts, api-tailor/question-prompts and api-tailor/layout-pass callers; saved columns are merged by repository `apps/api/src/tailor/section-pass.ts:168` -> `steeringText`; `apps/api/src/tailor/questions.ts:105` -> `steeringText`; `apps/api/src/tailor/layout-pass.ts:60` -> `steeringText`; `apps/api/src/tailor/steering.ts:37` -> `steeringText`; `apps/api/src/tailor/supabase-repo.ts:54` -> `withColumns`; `apps/api/src/tailor/steering.ts:28` -> `withColumns`.
- Uses job tone cache with job owner RLS `apps/api/src/tailor/tone-examples.ts:42` -> `saveToneExamples`; `apps/api/src/tailor/supabase-repo.ts:194` -> `from("jobs")`; `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid()`.

## Assumptions

- Tone generation sends the bullet verbatim; privacy relies on the bullet itself not containing header/contact data `apps/api/src/tailor/tone-examples.ts:36` -> `JSON.stringify({ bullet })`.
- Instruction safety is prompt-level guidance, not a code filter for instruction meaning `apps/api/src/tailor/steering.ts:49` -> `quoted as data`.
