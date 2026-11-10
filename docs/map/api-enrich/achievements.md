---
id: api-enrich/achievements
area: api-enrich
files: ["apps/api/src/enrich/achievements.ts","apps/api/src/enrich/achievements.test.ts"]
depends_on: ["api-enrich/score-prompts","api-enrich/score","api-enrich/rewrite","shared/cv","shared/enrichment-score","shared/enrichment-checks","db/ai-log","api-core/call-model"]
contract: true
checked_hash: 1908bb4c
cited: [44d6c0, bf1498, f73778, 7d0653, 73a830, 1533ed, 36149c, 881bc0, fd0423, 0d3e20, 1d9cfe, 171266, 56aff8, 53290e, fc24cf, 1998d9, fefc81, fe5783, 28a8c1, e4c90a, 6617b1, 92fa92, 35897b, d8d9c2, 8ebe9b, 73a830, 806b8a, 56aff8, f30a88, 7d0653, 0d4312, 53290e, ac9638, 1d9cfe, dd2561, 03a5b8, ec5f84, 12eda3, 020c9d, 179af0, fb5d28, e09fd3, cdb2c1, 53290e, 98c384, a44633]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Suggest up to five achievements grounded in individual saved experience roles.

- Builds a role-ID map from experience only; returns no suggestions without a model call if every role lacks both bullets and notes. `apps/api/src/enrich/achievements.ts:43` -> `new Map`; `apps/api/src/enrich/achievements.ts:44` -> `content.experience.some`.
- ModelSchema accepts up to ten text/roleId objects; enrich_achievements asks for 1200 output tokens, while the final result is capped at five. `apps/api/src/enrich/achievements.ts:8` -> `ModelSchema`; `apps/api/src/enrich/achievements.ts:9` -> `MAX_SUGGESTIONS`; `apps/api/src/enrich/achievements.ts:49` -> `enrich_achievements`; `apps/api/src/enrich/achievements.ts:53` -> `1200`.
- The prompt asks for three to five lines each tied to one role, excludes existing achievements, and sends roles' bullets/notes plus existing achievement text. `apps/api/src/enrich/achievements.ts:14` -> `3 to 5`; `apps/api/src/enrich/achievements.ts:15` -> `one role`; `apps/api/src/enrich/achievements.ts:28` -> `bullets`; `apps/api/src/enrich/achievements.ts:32` -> `content.achievements`.
- Whitespace-normalizes candidates and drops missing role IDs, blank/overlong text and repeated achievements using repeatKey. `apps/api/src/enrich/achievements.ts:58` -> `repeatKey`; `apps/api/src/enrich/achievements.ts:61` -> `roles.get`; `apps/api/src/enrich/achievements.ts:63` -> `MAX_TEXT`.
- Checks numbers only against the named role's bullet texts and note answers, not other roles; accepted candidates join the repetition set and stop at five. `apps/api/src/enrich/achievements.ts:64` -> `hasUnknownNumber`; `apps/api/src/enrich/achievements.ts:65` -> `taken.add`; `apps/api/src/enrich/achievements.ts:67` -> `MAX_SUGGESTIONS`.
- Malformed JSON or schema-invalid output retries through the gateway; exhausted providers become 503 ai_unavailable, while output truncation becomes 502 ai_bad_answer. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:174` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:23` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:24` -> `AiOutputTooLongError`.
- tested by `apps/api/src/enrich/achievements.test.ts:40` -> `POST /v1/enrich/achievements`

## Connections

- Uses colocated prompt builders and db/ai-log's enrich_achievements allowlist entry. `apps/api/src/enrich/achievements.ts:51` -> `achievementsSystemPrompt`; `apps/api/src/enrich/achievements.ts:11` -> `achievementsSystemPrompt`; `apps/api/src/enrich/achievements.ts:52` -> `achievementsUserMessage`; `apps/api/src/enrich/achievements.ts:23` -> `achievementsUserMessage`; `apps/api/src/enrich/achievements.ts:49` -> `enrich_achievements`; `supabase/migrations/20261109220000_enrich_item_lines.sql:26` -> `enrich_achievements`.
- Uses shared/cv MAX_TEXT and copies shared/enrichment-score's five-suggestion response bound; numeric and repetition checks come from shared/enrichment-checks and shared/enrichment-score. `apps/api/src/enrich/achievements.ts:63` -> `MAX_TEXT`; `packages/shared/src/cv.ts:10` -> `MAX_TEXT`; `apps/api/src/enrich/achievements.ts:9` -> `5`; `packages/shared/src/enrich.ts:302` -> `max(5)`; `apps/api/src/enrich/achievements.ts:64` -> `hasUnknownNumber`; `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`; `apps/api/src/enrich/achievements.ts:58` -> `repeatKey`; `packages/shared/src/enrich.ts:163` -> `repeatKey`.
- Uses the Locale-keyed language instruction. `apps/api/src/enrich/achievements.ts:12` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:13` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:8` -> `LANGUAGE_NAME`.
- Used by the web achievements URL and route. `apps/web/src/cv/enrich/enrich-api.ts:159` -> `/v1/enrich/achievements`; `apps/api/src/enrich/routes.ts:101` -> `"/achievements"`; `apps/api/src/enrich/routes.ts:104` -> `suggestAchievements`; `apps/api/src/enrich/achievements.ts:41` -> `suggestAchievements`.

## Assumptions

- Numeric membership is enforced, but other factual claims depend on the prompt; filtering does not establish that a result actually happened. `apps/api/src/enrich/achievements.ts:17` -> `Never invent`; `apps/api/src/enrich/achievements.ts:64` -> `hasUnknownNumber`.
- The service returns suggestions without checking remaining storage capacity or saving them; accepted achievement count in the CV remains governed by MAX_ACHIEVEMENTS. `apps/api/src/enrich/achievements.ts:69` -> `return`; `packages/shared/src/cv.ts:200` -> `MAX_ACHIEVEMENTS`.
