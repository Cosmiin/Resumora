---
id: api-enrich/role-description
area: api-enrich
files: ["apps/api/src/enrich/role-description.ts","apps/api/src/enrich/role-description.test.ts"]
depends_on: ["api-enrich/score-prompts","api-enrich/score","api-enrich/rewrite","shared/cv","shared/enrichment-score","db/ai-log","api-core/call-model"]
contract: true
checked_hash: 629f3107
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Suggest a short role or project introduction and keywords, retrying once for rejected wording.

- Missing scored item or fingerprint mismatch returns 409 before any model request. `apps/api/src/enrich/role-description.ts:57` -> `findScored`; `apps/api/src/enrich/role-description.ts:59` -> `fingerprint`.
- ModelSchema requires text and at most eight keyword strings; the enrich_role_description task uses 400 output tokens. `apps/api/src/enrich/role-description.ts:9` -> `ModelSchema`; `apps/api/src/enrich/role-description.ts:66` -> `enrich_role_description`; `apps/api/src/enrich/role-description.ts:70` -> `400`.
- The prompt requests company context then role purpose, only supplied facts, and keywords copied from the text; project input substitutes project context. `apps/api/src/enrich/role-description.ts:30` -> `First sentence`; `apps/api/src/enrich/role-description.ts:34` -> `Use only facts`; `apps/api/src/enrich/role-description.ts:37` -> `keywords`; `apps/api/src/enrich/role-description.ts:43` -> `kind === "project"`.
- Input contains title, company, location, dates, bullet texts and notes; it omits the existing description and condensed facts. `apps/api/src/enrich/role-description.ts:45` -> `JSON.stringify`; `apps/api/src/enrich/role-description.ts:49` -> `role.notes`.
- Normalizes whitespace; empty text succeeds immediately. Text over MAX_LONG_TEXT, over two sentence segments, or containing an entire normalized bullet triggers a second model request; two rejected answers yield empty text and keywords. `apps/api/src/enrich/role-description.ts:21` -> `MAX_LONG_TEXT`; `apps/api/src/enrich/role-description.ts:23` -> `said.includes`; `apps/api/src/enrich/role-description.ts:63` -> `attempt < 2`; `apps/api/src/enrich/role-description.ts:73` -> `!text`; `apps/api/src/enrich/role-description.ts:80` -> `text: ""`.
- Sentence splitting requires punctuation followed by whitespace; the last nonempty fragment counts even without terminal punctuation. `apps/api/src/enrich/role-description.ts:13` -> `split`.
- Keywords are whitespace-normalized, deduplicated case-sensitively, restricted to 60 characters, and checked as case-insensitive substrings of the accepted text. `apps/api/src/enrich/role-description.ts:76` -> `new Set`; `apps/api/src/enrich/role-description.ts:77` -> `lower.includes`.
- Malformed JSON or schema-invalid output retries through the gateway; exhausted providers become 503 ai_unavailable, while output truncation becomes 502 ai_bad_answer. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:174` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:23` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:24` -> `AiOutputTooLongError`.
- tested by `apps/api/src/enrich/role-description.test.ts:47` -> `POST /v1/enrich/role-description`
- tested by `apps/api/src/enrich/role-description.test.ts:84` -> `countSentences`

## Connections

- Model call uses colocated system/user templates and the db/ai-log allowlisted task. `apps/api/src/enrich/role-description.ts:68` -> `roleDescriptionSystemPrompt`; `apps/api/src/enrich/role-description.ts:26` -> `roleDescriptionSystemPrompt`; `apps/api/src/enrich/role-description.ts:69` -> `roleDescriptionUserMessage`; `apps/api/src/enrich/role-description.ts:41` -> `roleDescriptionUserMessage`; `apps/api/src/enrich/role-description.ts:66` -> `enrich_role_description`; `supabase/migrations/20261109220000_enrich_item_lines.sql:26` -> `enrich_role_description`.
- Uses shared/cv MAX_LONG_TEXT and shared/enrichment-score response limits; keyword 8/60 bounds are copied into filtering. `apps/api/src/enrich/role-description.ts:21` -> `MAX_LONG_TEXT`; `packages/shared/src/cv.ts:11` -> `MAX_LONG_TEXT`; `apps/api/src/enrich/role-description.ts:77` -> `60`; `packages/shared/src/enrich.ts:294` -> `RoleDescriptionAnswerSchema`.
- Uses the common Locale-keyed language instruction. `apps/api/src/enrich/role-description.ts:27` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:13` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:8` -> `LANGUAGE_NAME`.
- Used by the web description URL and route. `apps/web/src/cv/enrich/enrich-api.ts:52` -> `/v1/enrich/role-description`; `apps/api/src/enrich/routes.ts:113` -> `"/role-description"`; `apps/api/src/enrich/routes.ts:118` -> `roleDescription`; `apps/api/src/enrich/role-description.ts:55` -> `roleDescription`.

## Assumptions

- No invented-number or tool check is applied to description text; acceptable checks length, sentence count and copied bullets, so other factual grounding relies on the prompt. `apps/api/src/enrich/role-description.ts:20` -> `acceptable`; `apps/api/src/enrich/role-description.ts:34` -> `Never invent`.
- A schema-valid rejected answer receives the same prompts again; attempt does not enter either prompt builder. `apps/api/src/enrich/role-description.ts:63` -> `attempt`; `apps/api/src/enrich/role-description.ts:68` -> `roleDescriptionSystemPrompt`; `apps/api/src/enrich/role-description.ts:69` -> `roleDescriptionUserMessage`.
