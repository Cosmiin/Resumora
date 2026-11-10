---
id: api-tailor/section-prompts
area: api-tailor
files: ["apps/api/src/tailor/section-prompts.ts","apps/api/src/tailor/section-pass.ts"]
depends_on: ["shared/tailoring","db/ai-log","api-core/call-model","api-tailor/steering","api-tailor/proposal-matching","api-tailor/proposal-application","api-tailor/checks"]
contract: true
checked_hash: 026449b6
cited: [d1a044, 863a14, 4bc2e5, 588265, 636f18, 798098, 92b928, 04db0c, 8660f9, da54db, d52e34, 638348, 3c6095, 110b06, 9e7e17, d52e34, 93766b, 8664af, 35a524, 866b6c, 92b928, f5c065, 92b928, ab544a, 04db0c, 1ebd4b, 7cb8da, 7cb8da, cc37c8, f4573d, 27b639]
decisions: []
open: []
---
Define section generation and verification prompts and their response contracts.

- Section model context filters role notes to global or this job; experience/projects get one editable item and remaining roles/items as context. Summary gets titles, summary, experience and skills `apps/api/src/tailor/section-pass.ts:75` -> `note.jobId`; `apps/api/src/tailor/section-pass.ts:80` -> `scoredItems`; `apps/api/src/tailor/section-pass.ts:86` -> `"summary"`.
- Strong tailor_section uses ModelProposalsSchema with string itemId/field/text, boolean inferred, nullable reason and nullable text/reason guess array; cheap tailor_verify uses results of itemId plus string claims, both with 12000 tokens `apps/api/src/tailor/section-pass.ts:18` -> `ModelProposalsSchema`; `apps/api/src/tailor/section-pass.ts:24` -> `VerifySchema`; `apps/api/src/tailor/section-pass.ts:163` -> `maxOutputTokens`; `apps/api/src/tailor/section-pass.ts:166` -> `"tailor_section"`; `apps/api/src/tailor/section-pass.ts:198` -> `"tailor_verify"`.
- Prompt requests bullet/skill/language relevance ordering, but accept overwrites text by ID without rearranging those arrays; only dedicated order proposals rearrange lighter items/layout `apps/api/src/tailor/section-prompts.ts:10` -> `Reorder`; `apps/api/src/tailor/section-prompts.ts:19` -> `most relevant first`; `apps/api/src/tailor/section-prompts.ts:30` -> `Reorder`; `apps/api/src/tailor/accept.ts:74` -> `scoredItems`; `apps/api/src/tailor/accept.ts:79` -> `cv.technicalSkills`; `apps/api/src/tailor/accept.ts:46` -> `list.splice`.
- Prompt forbids upward language levels and limits new skills to three words, but target resolution and checkProposal do not enforce either specific semantic restriction `apps/api/src/tailor/section-prompts.ts:21` -> `3 words`; `apps/api/src/tailor/section-prompts.ts:30` -> `level upward`; `apps/api/src/tailor/section-pass.ts:65` -> `level: language.level`; `apps/api/src/tailor/checks.ts:51` -> `hasUnknownNumber`.
- User JSON includes section, language, steering, section context, selected job fields and answers; only retries include fix.proposals `apps/api/src/tailor/section-prompts.ts:57` -> `JSON.stringify`; `apps/api/src/tailor/section-prompts.ts:62` -> `input.retry.length`.

## Connections

- Uses both prompt templates and their allowed SQL tasks `apps/api/src/tailor/section-pass.ts:166` -> `sectionSystemPrompt`; `apps/api/src/tailor/section-prompts.ts:33` -> `sectionSystemPrompt`; `apps/api/src/tailor/section-pass.ts:166` -> `sectionUserMessage`; `apps/api/src/tailor/section-prompts.ts:47` -> `sectionUserMessage`; `apps/api/src/tailor/section-pass.ts:198` -> `verifySystemPrompt`; `apps/api/src/tailor/section-prompts.ts:66` -> `verifySystemPrompt`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_section`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_verify`.

## Assumptions

- Treating CV/job content as data is prompt guidance; executable target and truth checks live in api-tailor/proposal-matching and api-tailor/section-pass `apps/api/src/tailor/section-prompts.ts:34` -> `data`; `apps/api/src/tailor/section-pass.ts:176` -> `fields.includes`; `apps/api/src/tailor/section-pass.ts:206` -> `checkProposal`.
