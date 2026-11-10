---
id: api-enrich/brain-dump
area: api-enrich
files: ["apps/api/src/enrich/score.test.ts","apps/api/src/enrich/brain-dump.ts","apps/api/src/enrich/brain-dump.test.ts"]
depends_on: ["api-enrich/score-prompts","api-enrich/score","api-enrich/focus-prompts","api-enrich/rewrite","shared/cv","shared/enrichment-score","shared/enrichment-focus","db/cv-history","db/ai-log","api-core/call-model"]
contract: true
checked_hash: 3d8fe268
cited: [a5b5ad, 25ad4e, 64c263, 76889b, 2e2063, b279ec, eb731d, d2aa37, 80297e, 9e13d6, b495e8, 0bed4e, 15ecfb, 928f62, d56ab0, 16e356, 634b68, 14ee92, 87a1df, fefc81, fe5783, 28a8c1, e4c90a, d86cd2, 99106c, 11214f, d71aea, 100997, 93eaba, e4c90a, 2ce5a2, a0295e, 2c7383, 9e13d6, dd7302, 80297e, cff603, b279ec, 8fca03, 16e356, 61f407, 25ad4e, 8d0ff4, e292b0, 7b9234, 48b522, 9cd27f, 2e2063, 6d3223, 81cfca, 11214f, 414f3c, c6fea3, fbc523, e73356, 2e2f7c, 11214f, 414f3c, 0a667f, b0c61c, d71aea, 85d90e, b279ec, a58860, 2c7c98, 0bed4e, 981b60, 2c693e, aeb85e]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Turn saved role answers into bounded, checked and graded new bullet proposals.

- Missing item or stale fingerprint returns 409; ramble uses only the latest BRAIN_DUMP_QUESTION answer, while answers uses the latest ten notes of any question. `apps/api/src/enrich/brain-dump.ts:18` -> `fingerprint`; `apps/api/src/enrich/brain-dump.ts:23` -> `BRAIN_DUMP_QUESTION`; `apps/api/src/enrich/brain-dump.ts:29` -> `details`.
- Missing notes produce 400 no_answers or no_brain_dump; snapshot happens before checking available bullet slots. `apps/api/src/enrich/brain-dump.ts:25` -> `!notes.length`; `apps/api/src/enrich/brain-dump.ts:33` -> `snapshot("ai")`.
- At capacity, returns no proposals and only a matching cached score, without a model call; otherwise the cap is min(4, MAX_BULLETS minus existing). `apps/api/src/enrich/brain-dump.ts:35` -> `MAX_BULLETS`; `apps/api/src/enrich/brain-dump.ts:38` -> `SCORE_POLICY`.
- BrainDumpSchema permits up to four strings; enrich_brain_dump uses a 1200-token budget and the locale/kind-aware focus templates. `apps/api/src/enrich/brain-dump.ts:9` -> `BrainDumpSchema`; `apps/api/src/enrich/brain-dump.ts:46` -> `enrich_brain_dump`; `apps/api/src/enrich/brain-dump.ts:49` -> `found!.kind`.
- Normalizes whitespace, checks proposal rules and repetition, assigns unused newN IDs, and stops selecting candidates at available slots before grading. `apps/api/src/enrich/brain-dump.ts:57` -> `squash`; `apps/api/src/enrich/brain-dump.ts:59` -> `checkProposal`; `apps/api/src/enrich/brain-dump.ts:61` -> `usedIds`; `apps/api/src/enrich/brain-dump.ts:65` -> `slots`.
- Grades candidates appended after existing bullets, keeps only scores at least 40, and recomputes roleAfterAll from the survivors; it returns proposals without persisting pending results. `apps/api/src/enrich/brain-dump.ts:70` -> `appended`; `apps/api/src/enrich/brain-dump.ts:74` -> `b.score >= 40`; `apps/api/src/enrich/brain-dump.ts:76` -> `mergeGrades`; `apps/api/src/enrich/brain-dump.ts:77` -> `return`.
- tested by `apps/api/src/enrich/brain-dump.test.ts:75` -> `returns up to four scored proposals`
- Malformed JSON or schema-invalid output retries through the gateway; exhausted providers become 503 ai_unavailable, while output truncation becomes 502 ai_bad_answer. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:174` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:23` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:24` -> `AiOutputTooLongError`.
- tested by `apps/api/src/enrich/brain-dump.test.ts:74` -> `POST /v1/enrich/brain-dump`

- Secondary enrich_score calls use ModelScoreSchema for baseline scoring when needed and for proposal regrading. A schema-valid reply with wrong requested IDs fails after gateway success logging: 502 ai_bad_answer, without a model retry. `apps/api/src/enrich/brain-dump.ts:43` -> `scoreRole`; `apps/api/src/enrich/brain-dump.ts:71` -> `gradeBullets`; `apps/api/src/enrich/score.ts:32` -> `enrich_score`; `apps/api/src/enrich/score.ts:33` -> `ModelScoreSchema`; `apps/api/src/enrich/score.ts:39` -> `actual.size`; `apps/api/src/enrich/score.ts:24` -> `ai_bad_answer`; `apps/api/src/ai/call-model.ts:162` -> `status: "ok"`.

## Connections

- Uses focus system/user templates and the db/ai-log allowlisted enrich_brain_dump task. `apps/api/src/enrich/brain-dump.ts:48` -> `brainDumpSystemPrompt`; `apps/api/src/enrich/focus-prompts.ts:46` -> `brainDumpSystemPrompt`; `apps/api/src/enrich/brain-dump.ts:49` -> `brainDumpUserMessage`; `apps/api/src/enrich/focus-prompts.ts:66` -> `brainDumpUserMessage`; `apps/api/src/enrich/brain-dump.ts:46` -> `enrich_brain_dump`; `supabase/migrations/20261109220000_enrich_item_lines.sql:25` -> `enrich_brain_dump`.
- Uses shared/cv MAX_BULLETS; the literal 40 copies shared/enrichment-score's goodStart band threshold, so band changes also affect accepted proposals. `apps/api/src/enrich/brain-dump.ts:35` -> `MAX_BULLETS`; `packages/shared/src/cv.ts:9` -> `MAX_BULLETS`; `apps/api/src/enrich/brain-dump.ts:74` -> `40`; `packages/shared/src/enrich.ts:279` -> `40`.
- Uses shared/enrichment-focus's BRAIN_DUMP_QUESTION, mergeGrades and answer schema. `apps/api/src/enrich/brain-dump.ts:23` -> `BRAIN_DUMP_QUESTION`; `packages/shared/src/enrich-focus.ts:5` -> `BRAIN_DUMP_QUESTION`; `apps/api/src/enrich/brain-dump.ts:72` -> `mergeGrades`; `packages/shared/src/enrich-focus.ts:12` -> `mergeGrades`; `apps/api/src/enrich/brain-dump.ts:14` -> `BrainDumpAnswer`; `packages/shared/src/enrich-focus.ts:60` -> `BrainDumpAnswerSchema`.
- Uses snapshot RPC and common grade-only scoring. `apps/api/src/enrich/brain-dump.ts:33` -> `snapshot`; `apps/api/src/cv/supabase-repo.ts:102` -> `rpc("snapshot_base_cv"`; `supabase/migrations/20261106030000_snapshot_skip_same.sql:5` -> `snapshot_base_cv`; `apps/api/src/enrich/brain-dump.ts:71` -> `gradeBullets`; `apps/api/src/enrich/score.ts:28` -> `gradeBullets`.
- Used by the browser brain-dump URL and route. `apps/web/src/cv/enrich/enrich-api.ts:43` -> `/v1/enrich/brain-dump`; `apps/api/src/enrich/routes.ts:84` -> `"/brain-dump"`; `apps/api/src/enrich/routes.ts:89` -> `brainDump`; `apps/api/src/enrich/brain-dump.ts:11` -> `brainDump`.

- Uses api-enrich/score's grade-only prompt path and its db/ai-log task allowlist entry. `apps/api/src/enrich/brain-dump.ts:71` -> `gradeBullets`; `apps/api/src/enrich/score.ts:28` -> `gradeBullets`; `apps/api/src/enrich/score.ts:34` -> `scoreSystemPrompt`; `apps/api/src/enrich/prompts.ts:250` -> `scoreSystemPrompt`; `apps/api/src/enrich/score.ts:32` -> `enrich_score`; `supabase/migrations/20261109220000_enrich_item_lines.sql:24` -> `enrich_score`.

## Assumptions

- Capacity calculation assumes saved CV bullet counts already obey MAX_BULLETS; this path only special-cases slots equal to zero. `apps/api/src/enrich/brain-dump.ts:35` -> `MAX_BULLETS`; `apps/api/src/enrich/brain-dump.ts:36` -> `slots === 0`; `packages/shared/src/cv.ts:56` -> `MAX_BULLETS`.
- Numeric grounding checks the whole role and all notes, wider than the prompt's selected details-only instruction. `apps/api/src/enrich/brain-dump.ts:59` -> `checkProposal`; `apps/api/src/enrich/rewrite.ts:31` -> `roleSources`; `apps/api/src/enrich/rewrite.ts:12` -> `role.notes.flatMap`; `apps/api/src/enrich/focus-prompts.ts:75` -> `only source`.
