---
id: api-enrich/score
area: api-enrich
files: ["apps/api/src/enrich/score.ts","apps/api/src/enrich/score.test.ts","apps/api/src/enrich/fake-model.ts"]
depends_on: ["api-enrich/score-prompts","shared/cv","shared/enrichment-score","db/insights","db/ai-log","db/cv-repository","api-core/call-model"]
contract: true
checked_hash: 5e9ce430
cited: [7a80c4, d09660, 9885ce, d35e15, c23f21, 199de6, d71aea, eb9f44, d1289f, 142f66, 6518ad, 060c60, c23f21, e4c90a, 79338a, fefc81, fe5783, 28a8c1, e4c90a, bf04c9, 592165, 4ff777, f6d398, 060bba, 93eaba, d865eb, 2ce5a2, e4c90a, 889914, 0a667f, 5b2a37, b0c61c, 9885ce, d35e15, de61d2, f8461f, 07e650, 6518ad, 33c39f, d09660, a7f629, 7a80c4, d6e493, c84f3c, 105909, 0e1f25, 14bc6b, b19f22, c9738b, d35e15, 887ec7, 02d828, d1289f, 85d90e, 14cb65, 46f7f8, c88f16, 241ac4, 5eb211, 5957c7, f639d9, 747e41, 1d5f13, 9885ce, 4174c9, cba6ab]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Grade saved roles, projects and volunteering, reuse compatible results, and supply common model-error translation.

- Deletes cache entries absent from all scored items before checking the requested role and fingerprint; a missing or mismatched item returns 409 not_saved. `apps/api/src/enrich/score.ts:63` -> `scoredItems`; `apps/api/src/enrich/score.ts:69` -> `notSaved`.
- Main cache wins over pending cache when fingerprint and SCORE_POLICY match; fresh bypasses both, and newly generated or promoted results are persisted. `apps/api/src/enrich/score.ts:73` -> `!input.fresh`; `apps/api/src/enrich/score.ts:76` -> `pending`; `apps/api/src/enrich/score.ts:94` -> `insights.put`.
- Answered role questions are removed from the returned result by trimmed, case-insensitive question text after cache storage. `apps/api/src/enrich/score.ts:96` -> `answered`.
- Both grading paths log enrich_score and parse ModelScoreSchema; full scoring caps output at 4000 tokens, while selected grading uses 600 + 180 per requested ID. `apps/api/src/enrich/score.ts:32` -> `enrich_score`; `apps/api/src/enrich/score.ts:36` -> `maxOutputTokens`; `apps/api/src/enrich/score.ts:83` -> `enrich_score`; `apps/api/src/enrich/score.ts:87` -> `Math.min`.
- Full scoring runs buildRoleResult after callModel; duplicate, extra or missing IDs become 502 ai_bad_answer before any result write. `apps/api/src/enrich/score.ts:89` -> `buildRoleResult`; `packages/shared/src/enrich.ts:183` -> `EnrichParseError`; `apps/api/src/enrich/score.ts:94` -> `insights.put`; `apps/api/src/enrich/score.ts:24` -> `ai_bad_answer`.
- tested by `apps/api/src/enrich/score.test.ts:220` -> `502 and nothing stored`
- Malformed JSON or schema-invalid output retries through the gateway; exhausted providers become 503 ai_unavailable, while output truncation becomes 502 ai_bad_answer. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:174` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:23` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:24` -> `AiOutputTooLongError`.
- Project and volunteering context is added by kindNote for full scoring; gradeBullets calls scoreUserMessage without kind, so selected regrading uses its role default. `apps/api/src/enrich/score.ts:86` -> `found!.kind`; `apps/api/src/enrich/score.ts:35` -> `scoreUserMessage(role, ids)`; `apps/api/src/enrich/prompts.ts:270` -> `kind: ScoredKind = "role"`.
- tested by `apps/api/src/enrich/score.test.ts:43` -> `scoreRole`
- tested by `apps/api/src/enrich/score.test.ts:263` -> `gradeBullets`

- Selected grading also requires exactly the requested unique IDs. Failure occurs after the gateway logs success, so it returns 502 ai_bad_answer without retrying the model. `apps/api/src/enrich/score.ts:39` -> `actual.size`; `apps/api/src/enrich/score.ts:40` -> `EnrichParseError`; `apps/api/src/ai/call-model.ts:162` -> `status: "ok"`; `apps/api/src/enrich/score.ts:24` -> `ai_bad_answer`.
- tested by `apps/api/src/enrich/score.test.ts:284` -> `without retries`

## Connections

- Uses api-enrich/score-prompts for full scoring and focus regrading. Prompt edits require a shared/enrichment-score SCORE_POLICY bump: unchanged fingerprints/policy reuse main or pending results without applying the new prompt. `apps/api/src/enrich/score.ts:34` -> `scoreSystemPrompt`; `apps/api/src/enrich/score.ts:85` -> `scoreSystemPrompt`; `apps/api/src/enrich/prompts.ts:250` -> `scoreSystemPrompt`; `apps/api/src/enrich/score.ts:73` -> `SCORE_POLICY`; `apps/api/src/enrich/score.ts:76` -> `SCORE_POLICY`; `packages/shared/src/enrich.ts:5` -> `SCORE_POLICY`.
- Uses shared/enrichment-score's model schema, arithmetic and versioned fingerprint. `apps/api/src/enrich/score.ts:84` -> `ModelScoreSchema`; `packages/shared/src/enrich.ts:46` -> `ModelScoreSchema`; `apps/api/src/enrich/score.ts:89` -> `buildRoleResult`; `packages/shared/src/enrich.ts:179` -> `buildRoleResult`; `apps/api/src/enrich/score.ts:69` -> `fingerprint`; `packages/shared/src/enrich.ts:270` -> `fingerprint`.
- Uses shared/cv's ScoredKind traversal; changing kinds also requires the browser's exhaustive OF_KEY map, whose lookup supplies the scored-item progress label. `apps/api/src/enrich/score.ts:63` -> `scoredItems`; `packages/shared/src/cv.ts:270` -> `scoredItems`; `packages/shared/src/cv.ts:267` -> `ScoredKind`; `apps/web/src/cv/enrich/EnrichPath.tsx:39` -> `Record<ScoredKind, string>`; `apps/web/src/cv/enrich/EnrichPath.tsx:105` -> `OF_KEY[kind]`.
- Uses db/insights cache reads, which silently reject invalid schemas or mismatched role IDs; pending reads also drop entries with inconsistent fingerprints. Rejected entries appear absent to scoring. `apps/api/src/enrich/score.ts:71` -> `insights.get`; `apps/api/src/enrich/supabase-repo.ts:44` -> `parseResult`; `apps/api/src/enrich/supabase-repo.ts:18` -> `parsed.success`; `apps/api/src/enrich/score.ts:76` -> `insights.pending`; `apps/api/src/enrich/supabase-repo.ts:66` -> `parsePending`; `apps/api/src/enrich/supabase-repo.ts:27` -> `parsed.success`.
- Model task requires the db/ai-log SQL allowlist; production logging calls log_ai_call with the task. `apps/api/src/enrich/score.ts:83` -> `enrich_score`; `supabase/migrations/20261109220000_enrich_item_lines.sql:24` -> `enrich_score`; `apps/api/src/enrich/supabase-repo.ts:103` -> `rpc("log_ai_call"`; `supabase/migrations/20261109220000_enrich_item_lines.sql:7` -> `log_ai_call`.
- Used by web score and cache URLs through enrichment routes. `apps/web/src/cv/enrich/enrich-api.ts:35` -> `/v1/enrich/score`; `apps/api/src/enrich/routes.ts:55` -> `"/score"`; `apps/api/src/enrich/routes.ts:59` -> `scoreRole`; `apps/api/src/enrich/score.ts:56` -> `scoreRole`; `apps/web/src/cv/enrich/enrich-api.ts:27` -> `/v1/enrich/scores`; `apps/api/src/enrich/routes.ts:53` -> `"/scores"`.

## Assumptions

- Fingerprint does not include notes, company or dates; callers needing note-sensitive questions must request fresh scoring. `packages/shared/src/enrich.ts:271` -> `const parts`; `apps/api/src/enrich/score.ts:73` -> `!input.fresh`.
- Caller-provided repositories must represent the authenticated user; scoreRole itself receives repositories, not an ownership filter. `apps/api/src/enrich/score.ts:20` -> `ScoreDeps`; `apps/api/src/enrich/routes.ts:60` -> `deps.cvRepo(user)`.
