---
id: api-enrich/improve
area: api-enrich
files: ["apps/api/src/enrich/score.test.ts","apps/api/src/enrich/improve.ts","apps/api/src/enrich/improve.test.ts"]
depends_on: ["api-enrich/score-prompts","api-enrich/score","api-enrich/focus-prompts","api-enrich/rewrite","shared/enrichment-focus","shared/enrichment-score","db/cv-history","db/insights","db/ai-log","api-core/call-model"]
contract: true
checked_hash: 8915c8ed
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Propose a single replacement only when regrading gives the target bullet a strictly higher score.

- Validates saved fingerprint first (409), then target bullet existence (404), and snapshots the CV before scoring or asking for a rewrite. `apps/api/src/enrich/improve.ts:20` -> `fingerprint`; `apps/api/src/enrich/improve.ts:23` -> `role.bullets.some`; `apps/api/src/enrich/improve.ts:27` -> `snapshot("ai")`.
- ImproveSchema accepts nullable text and nullable question with up to four options of at most 60 characters; the task is enrich_improve_bullet with a 600-token budget. `apps/api/src/enrich/improve.ts:9` -> `ImproveSchema`; `apps/api/src/enrich/improve.ts:33` -> `enrich_improve_bullet`; `apps/api/src/enrich/improve.ts:37` -> `600`.
- Suppresses a question already in notes, filters disallowed exact-number options, and returns needsDetail for null text or rejected/duplicate proposals. `apps/api/src/enrich/improve.ts:40` -> `nextQuestion`; `apps/api/src/enrich/improve.ts:42` -> `isAllowedOption`; `apps/api/src/enrich/improve.ts:44` -> `needsDetail`; `apps/api/src/enrich/improve.ts:46` -> `checkProposal`.
- Moves the proposed target after every other bullet for grading so duplicates can point backward, but merges the result into the original bullet order. `apps/api/src/enrich/improve.ts:53` -> `gradingRole`; `apps/api/src/enrich/improve.ts:57` -> `gradeBullets`; `apps/api/src/enrich/improve.ts:59` -> `mergeGrades`.
- Rejects model-marked duplicate or meaningless proposals and any proposal whose new target score is not strictly greater. `apps/api/src/enrich/improve.ts:58` -> `duplicateOf`; `apps/api/src/enrich/improve.ts:62` -> `after <= bulletBefore`.
- Writes a predicted pending score only if no other original bullet was marked duplicate; returns cached false otherwise, with before/after scores in either accepted case. `apps/api/src/enrich/improve.ts:64` -> `cached`; `apps/api/src/enrich/improve.ts:66` -> `putPending`; `apps/api/src/enrich/improve.ts:69` -> `proposal`.
- Malformed JSON or schema-invalid output retries through the gateway; exhausted providers become 503 ai_unavailable, while output truncation becomes 502 ai_bad_answer. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:174` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:23` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:24` -> `AiOutputTooLongError`.
- tested by `apps/api/src/enrich/improve.test.ts:66` -> `POST /v1/enrich/improve-bullet`

- Secondary enrich_score calls use ModelScoreSchema for baseline scoring when needed and for proposal regrading. A schema-valid reply with wrong requested IDs fails after gateway success logging: 502 ai_bad_answer, without a model retry. `apps/api/src/enrich/improve.ts:30` -> `scoreRole`; `apps/api/src/enrich/improve.ts:57` -> `gradeBullets`; `apps/api/src/enrich/score.ts:32` -> `enrich_score`; `apps/api/src/enrich/score.ts:33` -> `ModelScoreSchema`; `apps/api/src/enrich/score.ts:39` -> `actual.size`; `apps/api/src/enrich/score.ts:24` -> `ai_bad_answer`; `apps/api/src/ai/call-model.ts:162` -> `status: "ok"`.
- tested by `apps/api/src/enrich/score.test.ts:284` -> `without retries`

## Connections

- Uses the focus templates for system and user content. `apps/api/src/enrich/improve.ts:35` -> `improveBulletSystemPrompt`; `apps/api/src/enrich/focus-prompts.ts:4` -> `improveBulletSystemPrompt`; `apps/api/src/enrich/improve.ts:36` -> `improveBulletUserMessage`; `apps/api/src/enrich/focus-prompts.ts:33` -> `improveBulletUserMessage`.
- The task must stay in db/ai-log's allowlist. `apps/api/src/enrich/improve.ts:33` -> `enrich_improve_bullet`; `supabase/migrations/20261109220000_enrich_item_lines.sql:25` -> `enrich_improve_bullet`.
- Uses shared/enrichment-focus mergeGrades and reply union, and shared/enrichment-score option filtering. `apps/api/src/enrich/improve.ts:59` -> `mergeGrades`; `packages/shared/src/enrich-focus.ts:12` -> `mergeGrades`; `apps/api/src/enrich/improve.ts:17` -> `ImproveAnswer`; `packages/shared/src/enrich-focus.ts:44` -> `ImproveAnswerSchema`; `apps/api/src/enrich/improve.ts:42` -> `isAllowedOption`; `packages/shared/src/enrich.ts:132` -> `isAllowedOption`.
- Snapshot persistence crosses the snapshot_base_cv RPC; predicted scoring crosses the insight repository boundary. `apps/api/src/enrich/improve.ts:27` -> `snapshot`; `apps/api/src/cv/supabase-repo.ts:102` -> `rpc("snapshot_base_cv"`; `supabase/migrations/20261106030000_snapshot_skip_same.sql:5` -> `snapshot_base_cv`; `apps/api/src/enrich/improve.ts:66` -> `putPending`; `apps/api/src/enrich/supabase-repo.ts:69` -> `putPending`.
- Used by the web improve URL via the route, producing a shared ImproveAnswerSchema response. `apps/web/src/cv/enrich/enrich-api.ts:39` -> `/v1/enrich/improve-bullet`; `apps/api/src/enrich/routes.ts:66` -> `"/improve-bullet"`; `apps/api/src/enrich/routes.ts:71` -> `improveBullet`; `apps/api/src/enrich/improve.ts:14` -> `improveBullet`.

- Pending storage uses shared/enrichment-focus MAX_PENDING (five); changing this bound affects how many alternative predictions can be reused. `apps/api/src/enrich/improve.ts:66` -> `putPending`; `apps/api/src/enrich/supabase-repo.ts:77` -> `MAX_PENDING`; `packages/shared/src/enrich-focus.ts:6` -> `MAX_PENDING`.

- Uses api-enrich/score's grade-only prompt path and its db/ai-log task allowlist entry. `apps/api/src/enrich/improve.ts:57` -> `gradeBullets`; `apps/api/src/enrich/score.ts:28` -> `gradeBullets`; `apps/api/src/enrich/score.ts:34` -> `scoreSystemPrompt`; `apps/api/src/enrich/prompts.ts:250` -> `scoreSystemPrompt`; `apps/api/src/enrich/score.ts:32` -> `enrich_score`; `supabase/migrations/20261109220000_enrich_item_lines.sql:24` -> `enrich_score`.

## Assumptions

- Uses saved CV data rather than a client-provided bullet; the upstream route must provide user-scoped repositories. `apps/api/src/enrich/improve.ts:18` -> `deps.cv.get`; `apps/api/src/enrich/routes.ts:72` -> `deps.cvRepo(user)`.
- Checks numeric grounding and exact normalized repetition, but relies on model grading to recognize paraphrased duplicates. `apps/api/src/enrich/improve.ts:46` -> `checkProposal`; `apps/api/src/enrich/improve.ts:47` -> `repeatKey`; `apps/api/src/enrich/improve.ts:58` -> `duplicateOf`.
