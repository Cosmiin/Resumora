---
id: api-tailor/steering
area: api-tailor
files: ["apps/api/src/tailor/steering.ts","apps/api/src/tailor/tone-examples.ts","apps/api/test/tailor-steering.test.ts","apps/api/test/tailor-tone.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-runs","db/ai-log","api-core/call-model","api-tailor/answers"]
contract: true
checked_hash: 72667d0f
cited: [935658, fb9ec2, 49bc0e, 3eaea0, 842676, 284829, 4445ee, fac51b, 12f141, dd01a1, bbae22, 126931, ad8b31, bbae22, 4c58f8, e8e7e7, fefc81, 56e0b1, 01051a, 07146d, df6ebf, a4709c, 334a09, 1ed74c, 84752b, 126931, ad8b31, 48d99a, 25e185, 032f5e, 7991e4, 6abfa6, 5061de, 935658, adf1b1, 96e073, fc9d94, 84752b, 284829]
decisions: []
open: []
---
Turn saved steering into prompt text and generate cached examples for the tone picker.

- withColumns fills only falsy steering tone/instruction from older columns, preserving truthy steering values `apps/api/src/tailor/steering.ts:28` -> `withColumns`; `apps/api/src/tailor/steering.ts:31` -> `steering.tone`.
- Steering defaults to neutral and quotes trimmed free instructions with JSON.stringify. With a roleId and nonempty focus IDs, it describes only whether this item is a focus role, without naming other roles; empty focus IDs add no focus line. Without roleId it still lists focus roles from experience, dropping unknown IDs `apps/api/src/tailor/steering.ts:38` -> `"neutral"`; `apps/api/src/tailor/steering.ts:43` -> `focusRoleIds`; `apps/api/src/tailor/steering.ts:47` -> `roles`; `apps/api/src/tailor/steering.ts:55` -> `JSON.stringify`.
- Tone source is the first nonblank bullet in newestRole; an empty newest role yields no examples even if older roles have bullets `apps/api/src/tailor/tone-examples.ts:16` -> `newestRole`; `apps/api/src/tailor/tone-examples.ts:17` -> `find(Boolean)`.
- No source bullet returns null/null. Cache reuse is based solely on exact bullet text, not tone policy or job changes `apps/api/src/tailor/tone-examples.ts:28` -> `toneBullet`; `apps/api/src/tailor/tone-examples.ts:31` -> `cached?.bullet`.
- Cheap tailor_tone_examples uses a seven-key object of nonempty strings under examples, 1500 tokens, and an inline prompt prohibiting fact changes `apps/api/src/tailor/tone-examples.ts:8` -> `ReplySchema`; `apps/api/src/tailor/tone-examples.ts:10` -> `toneSystemPrompt`; `apps/api/src/tailor/tone-examples.ts:35` -> `tailor_tone_examples`.
- Malformed/schema-invalid replies retry via callModel; exhaustion becomes 502. Accepted strings are trimmed and cached without truth checks; whitespace-only strings pass min(1) before trimming, and extra schema keys are not mapped `apps/api/src/tailor/tone-examples.ts:8` -> `z.string().min(1)`; `apps/api/src/tailor/tone-examples.ts:39` -> `ai_failed`; `apps/api/src/tailor/tone-examples.ts:41` -> `TONES.map`; `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`.
- tested by `apps/api/test/tailor-steering.test.ts:23` -> `steeringText`.
- tested by `apps/api/test/tailor-steering.test.ts:39` -> `describes only this role's focus status`.
- tested by `apps/api/test/tailor-tone.test.ts:65` -> `POST /v1/jobs/:id/tone-examples`.

## Connections

- Used by tone URL and handler `apps/web/src/tailor/tailor-api.ts:67` -> `/tone-examples`; `apps/api/src/tailor/routes.ts:49` -> `/tone-examples`; `apps/api/src/tailor/routes.ts:53` -> `toneExamples`; `apps/api/src/tailor/tone-examples.ts:24` -> `toneExamples`.
- Uses inline prompt and SQL-allowed task `apps/api/src/tailor/tone-examples.ts:36` -> `toneSystemPrompt`; `apps/api/src/tailor/tone-examples.ts:10` -> `toneSystemPrompt`; `apps/api/src/tailor/tone-examples.ts:35` -> `tailor_tone_examples`; `supabase/migrations/20261109220000_enrich_item_lines.sql:29` -> `tailor_tone_examples`.
- Used by api-tailor/section-prompts, api-tailor/question-prompts and api-tailor/layout-pass callers; saved columns are merged by repository `apps/api/src/tailor/section-pass.ts:168` -> `steeringText`; `apps/api/src/tailor/questions.ts:107` -> `steeringText`; `apps/api/src/tailor/layout-pass.ts:60` -> `steeringText`; `apps/api/src/tailor/steering.ts:37` -> `steeringText`; `apps/api/src/tailor/supabase-repo.ts:54` -> `withColumns`; `apps/api/src/tailor/steering.ts:28` -> `withColumns`.
- Uses job tone cache with job owner RLS `apps/api/src/tailor/tone-examples.ts:42` -> `saveToneExamples`; `apps/api/src/tailor/supabase-repo.ts:194` -> `from("jobs")`; `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid()`.

## Assumptions

- Tone generation sends the bullet verbatim; privacy relies on the bullet itself not containing header/contact data `apps/api/src/tailor/tone-examples.ts:36` -> `JSON.stringify({ bullet })`.
- Instruction safety is prompt-level guidance, not a code filter for instruction meaning `apps/api/src/tailor/steering.ts:55` -> `quoted as data`.
