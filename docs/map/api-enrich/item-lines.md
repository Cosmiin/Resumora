---
id: api-enrich/item-lines
area: api-enrich
files: ["apps/api/src/enrich/item-lines.ts","apps/api/src/enrich/item-lines.test.ts"]
depends_on: ["api-enrich/score-prompts","api-enrich/score","api-enrich/rewrite","shared/cv","shared/enrichment-score","shared/enrichment-checks","db/ai-log","api-core/call-model"]
contract: true
checked_hash: 2733dbec
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Suggest short checked lines for one saved course, award, publication or interest.

- Finds the item by input.section and itemId in the saved CV; absence returns 409 not_saved. No fingerprint is compared. `apps/api/src/enrich/item-lines.ts:51` -> `content[input.section]`; `apps/api/src/enrich/item-lines.ts:52` -> `409`.
- KIND is a Record<LightSection, string>; fieldsOf keeps nonblank string-valued fields except id and bullets. `apps/api/src/enrich/item-lines.ts:13` -> `Record<LightSection, string>`; `apps/api/src/enrich/item-lines.ts:19` -> `Object.entries`.
- Available slots are min(4, MAX_BULLETS minus existing lines); at capacity it returns an empty array before invoking the model. `apps/api/src/enrich/item-lines.ts:54` -> `MAX_BULLETS`; `apps/api/src/enrich/item-lines.ts:55` -> `slots <= 0`.
- ModelSchema permits six string lines; enrich_item_lines explicitly requests the cheap tier and 400 output tokens. `apps/api/src/enrich/item-lines.ts:10` -> `ModelSchema`; `apps/api/src/enrich/item-lines.ts:62` -> `enrich_item_lines`; `apps/api/src/enrich/item-lines.ts:63` -> `"cheap"`; `apps/api/src/enrich/item-lines.ts:67` -> `400`.
- The prompt requests up to four sentences of at most twenty words; user input includes the section kind, item fields/current lines and JSON-encoded supplied text. `apps/api/src/enrich/item-lines.ts:25` -> `up to 4`; `apps/api/src/enrich/item-lines.ts:26` -> `20 words`; `apps/api/src/enrich/item-lines.ts:35` -> `KIND[section]`; `apps/api/src/enrich/item-lines.ts:40` -> `JSON.stringify(text)`.
- Drops internal line breaks, blank or over-200-character lines, normalized repeats, detected unknown tools and unknown numbers; it does not count words or sentences. Tool detection is heuristic: an absent lowercase tool in "Used tableau." escapes detection. `apps/api/src/enrich/item-lines.ts:75` -> `raw.trim`; `apps/api/src/enrich/item-lines.ts:78` -> `LINE_MAX`; `apps/api/src/enrich/item-lines.ts:79` -> `unknownTools`; `apps/api/src/tailor/checks.ts:27` -> `technical`; `apps/api/src/tailor/checks.ts:28` -> `capitalised`; `apps/api/src/tailor/checks.ts:36` -> `toolNames`.
- Number/tool sources combine item string fields, existing lines and the current request text; surviving lines are returned without saving input text or proposals. `apps/api/src/enrich/item-lines.ts:57` -> `sources`; `apps/api/src/enrich/item-lines.ts:84` -> `return`.
- Malformed JSON or schema-invalid output retries through the gateway; exhausted providers become 503 ai_unavailable, while output truncation becomes 502 ai_bad_answer. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:174` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:23` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:24` -> `AiOutputTooLongError`.
- tested by `apps/api/src/enrich/item-lines.test.ts:42` -> `POST /v1/enrich/item-lines`

## Connections

- Uses colocated system/user templates and db/ai-log's enrich_item_lines allowlist entry. `apps/api/src/enrich/item-lines.ts:65` -> `itemLinesSystemPrompt`; `apps/api/src/enrich/item-lines.ts:22` -> `itemLinesSystemPrompt`; `apps/api/src/enrich/item-lines.ts:66` -> `itemLinesUserMessage`; `apps/api/src/enrich/item-lines.ts:33` -> `itemLinesUserMessage`; `apps/api/src/enrich/item-lines.ts:62` -> `enrich_item_lines`; `supabase/migrations/20261109220000_enrich_item_lines.sql:26` -> `enrich_item_lines`.
- Uses shared/enrichment-score LIGHT_SECTIONS/LightSection for KIND keys and request validation; LINE_MAX=200 and four returned lines copy ItemLinesAnswerSchema. `apps/api/src/enrich/item-lines.ts:13` -> `LightSection`; `packages/shared/src/enrich.ts:307` -> `LIGHT_SECTIONS`; `apps/api/src/enrich/routes.ts:131` -> `ItemLinesBodySchema`; `packages/shared/src/enrich.ts:311` -> `ItemLinesBodySchema`; `apps/api/src/enrich/item-lines.ts:11` -> `200`; `apps/api/src/enrich/item-lines.ts:54` -> `Math.min(4`; `packages/shared/src/enrich.ts:319` -> `ItemLinesAnswerSchema`.
- Uses shared/cv MAX_BULLETS and shared/enrichment-checks number validation. `apps/api/src/enrich/item-lines.ts:54` -> `MAX_BULLETS`; `packages/shared/src/cv.ts:9` -> `MAX_BULLETS`; `apps/api/src/enrich/item-lines.ts:79` -> `hasUnknownNumber`; `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`.
- Uses tailoring's unknownTools detector outside this area; changing its token heuristics changes which enrichment lines survive. `apps/api/src/enrich/item-lines.ts:79` -> `unknownTools`; `apps/api/src/tailor/checks.ts:34` -> `unknownTools`; `apps/api/src/tailor/checks.ts:27` -> `technical`.
- Uses shared/enrichment-score repeatKey and shared locale instructions. `apps/api/src/enrich/item-lines.ts:72` -> `repeatKey`; `packages/shared/src/enrich.ts:163` -> `repeatKey`; `apps/api/src/enrich/item-lines.ts:23` -> `languageInstruction`; `apps/api/src/enrich/prompts.ts:13` -> `languageInstruction`.
- Used by the browser item-lines URL and route. `apps/web/src/cv/enrich/enrich-api.ts:164` -> `/v1/enrich/item-lines`; `apps/api/src/enrich/routes.ts:130` -> `"/item-lines"`; `apps/api/src/enrich/routes.ts:135` -> `itemLines`; `apps/api/src/enrich/item-lines.ts:49` -> `itemLines`.

## Assumptions

- The route must validate section/text before indexing content; ItemLinesBodySchema requires a recognized section and trimmed nonempty text. `apps/api/src/enrich/routes.ts:131` -> `ItemLinesBodySchema.safeParse`; `packages/shared/src/enrich.ts:312` -> `z.enum`; `packages/shared/src/enrich.ts:314` -> `trim().min(1)`.
- Tool detection is a heuristic based on capitalization and token shape, not a complete fact checker. `apps/api/src/tailor/checks.ts:27` -> `technical`; `apps/api/src/tailor/checks.ts:28` -> `capitalised`.
- Cheap means the configured normal model in this gateway; only strong requests substitute a separate model. `apps/api/src/enrich/item-lines.ts:63` -> `"cheap"`; `apps/api/src/ai/call-model.ts:153` -> `req.tier === "strong"`.
