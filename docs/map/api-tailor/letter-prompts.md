---
id: api-tailor/letter-prompts
area: api-tailor
files: ["apps/api/src/tailor/letter-prompts.ts","apps/api/src/tailor/letter.ts"]
depends_on: ["shared/tailoring","db/ai-log","api-core/call-model","api-tailor/strip-header","api-tailor/letter-checks"]
contract: true
checked_hash: 05e69483
cited: [ef9a91, f233ef, 398138, 559e30, b5c81a, b652bf, 47579e, 0b932e, fd748c, 47579e, b04e15, 95e1de, 47579e, b652bf, 8486ef, f233ef, 677ebc, b1a554, e06955, 7cb8da, 7cb8da, ef9a91, cbb89b]
decisions: []
open: []
---
Define cover-letter generation and verification templates, context and generation response shape.

- The model sees stripped tailored content, extracted job, target language, job userThoughts and whyCompany; hiringManager is stored separately and not included in the generated prompt `apps/api/src/tailor/letter.ts:37` -> `stripHeader`; `apps/api/src/tailor/letter.ts:49` -> `letterUserMessage`; `apps/api/src/tailor/letter-prompts.ts:15` -> `JSON.stringify`; `apps/api/src/tailor/letter.ts:78` -> `hiringManager`.
- Strong tailor_letter returns ReplySchema body string with 4000-token budget; trimmed empty or over-4000-character bodies fail after gateway parsing `apps/api/src/tailor/letter.ts:19` -> `ReplySchema`; `apps/api/src/tailor/letter.ts:48` -> `tailor_letter`; `apps/api/src/tailor/letter.ts:53` -> `maxLength`; `packages/shared/src/tailor.ts:178` -> `max(4000)`.
- Prompt requests 3-4 paragraphs and 250-350 words, but code checks only nonempty/max characters, not paragraph count or word count `apps/api/src/tailor/letter-prompts.ts:6` -> `250 to 350`; `apps/api/src/tailor/letter.ts:53` -> `text.length`.
- Retry JSON includes previousBody and each flag?s rule and detail `apps/api/src/tailor/letter-prompts.ts:22` -> `previousBody`.
- No address, date, greeting or signature is prompt guidance; returned bodies are not parsed for these elements `apps/api/src/tailor/letter-prompts.ts:7` -> `Return only the body`; `apps/api/src/tailor/letter.ts:53` -> `text.length`.

## Connections

- Uses generation and verifier templates plus allowed SQL tasks `apps/api/src/tailor/letter.ts:48` -> `letterSystemPrompt`; `apps/api/src/tailor/letter-prompts.ts:5` -> `letterSystemPrompt`; `apps/api/src/tailor/letter.ts:49` -> `letterUserMessage`; `apps/api/src/tailor/letter-prompts.ts:11` -> `letterUserMessage`; `apps/api/src/tailor/letter.ts:55` -> `letterVerifySystemPrompt`; `apps/api/src/tailor/letter-prompts.ts:26` -> `letterVerifySystemPrompt`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_letter`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_verify`.

## Assumptions

- This path does not remove hidden items before sourcing or sending the tailored CV, so hidden content remains available to letter generation `apps/api/src/tailor/letter.ts:37` -> `stripHeader(doc.content)`; `apps/api/src/tailor/letter-prompts.ts:17` -> `cv: input.cv`.
