---
id: api-tailor/section-prompts
area: api-tailor
files: ["apps/api/src/tailor/section-prompts.ts","apps/api/src/tailor/section-pass.ts"]
depends_on: ["shared/tailoring","db/ai-log","api-core/call-model","api-tailor/steering","api-tailor/proposal-matching","api-tailor/proposal-application","api-tailor/checks"]
contract: true
checked_hash: ee01d0b9
cited: [2ed88f, 2b881d, 940e84, 3661db, 80ed16, 3364f4, bbccf2, 06c662, 588265, 636f18, cf63df, d45dc1, 04db0c, 4eb6f6, 23c409, d52e34, 638348, 3c6095, 110b06, 9e7e17, d52e34, 93766b, 8664af, 35a524, 866b6c, 3891f2, 188973, d45dc1, f5c065, d45dc1, ab544a, 04db0c, 1ebd4b, 7cb8da, 7cb8da, cc37c8, f4573d, 27b639]
decisions: []
open: []
---
Define section generation and verification prompts and their response contracts.

- Section model context filters role notes to global or this job; experience/projects get only `{ edit: [item] }`, with no context. Skills and Summary keep all experience roles as context; Summary also gets titles, summary and skills `apps/api/src/tailor/section-pass.ts:74` -> `note.jobId`; `apps/api/src/tailor/section-pass.ts:75` -> `edit`; `apps/api/src/tailor/section-pass.ts:80` -> `edit`; `apps/api/src/tailor/section-pass.ts:84` -> `"summary"`.
- Experience and projects explicitly restrict evidence to the item's own bullets, notes, facts and answers; role steps pass their role id to steeringText so focus-role names cannot leak from steering. The edit/context rule remains for sections that send context `apps/api/src/tailor/section-prompts.ts:11` -> `Use only this item's own`; `apps/api/src/tailor/section-prompts.ts:16` -> `Use only this item's own`; `apps/api/src/tailor/section-prompts.ts:38` -> `read-only evidence`; `apps/api/src/tailor/section-pass.ts:168` -> `steeringText`.
- Strong tailor_section uses ModelProposalsSchema with string itemId/field/text, boolean inferred, nullable reason and nullable text/reason guess array; cheap tailor_verify uses results of itemId plus string claims, both with 12000 tokens `apps/api/src/tailor/section-pass.ts:18` -> `ModelProposalsSchema`; `apps/api/src/tailor/section-pass.ts:24` -> `VerifySchema`; `apps/api/src/tailor/section-pass.ts:163` -> `maxOutputTokens`; `apps/api/src/tailor/section-pass.ts:166` -> `"tailor_section"`; `apps/api/src/tailor/section-pass.ts:198` -> `"tailor_verify"`.
- Prompt requests bullet/skill/language relevance ordering, but accept overwrites text by ID without rearranging those arrays; only dedicated order proposals rearrange lighter items/layout `apps/api/src/tailor/section-prompts.ts:10` -> `Reorder`; `apps/api/src/tailor/section-prompts.ts:21` -> `most relevant first`; `apps/api/src/tailor/section-prompts.ts:32` -> `Reorder`; `apps/api/src/tailor/accept.ts:74` -> `scoredItems`; `apps/api/src/tailor/accept.ts:79` -> `cv.technicalSkills`; `apps/api/src/tailor/accept.ts:46` -> `list.splice`.
- Prompt forbids upward language levels and limits new skills to three words, but target resolution and checkProposal do not enforce either specific semantic restriction `apps/api/src/tailor/section-prompts.ts:23` -> `3 words`; `apps/api/src/tailor/section-prompts.ts:32` -> `level upward`; `apps/api/src/tailor/section-pass.ts:65` -> `level: language.level`; `apps/api/src/tailor/checks.ts:51` -> `hasUnknownNumber`.
- User JSON includes section, language, steering, section items, selected job fields and answers; only retries include fix.proposals `apps/api/src/tailor/section-prompts.ts:59` -> `JSON.stringify`; `apps/api/src/tailor/section-prompts.ts:64` -> `input.retry.length`.
- tested by `apps/api/test/tailor-section.test.ts:77` -> `scopes %s evidence and answers to the permitted roles`; `apps/api/test/tailor-projects.test.ts:95` -> `rewrites only $title using its own evidence and answers`.

## Connections

- Uses both prompt templates and their allowed SQL tasks `apps/api/src/tailor/section-pass.ts:166` -> `sectionSystemPrompt`; `apps/api/src/tailor/section-prompts.ts:35` -> `sectionSystemPrompt`; `apps/api/src/tailor/section-pass.ts:166` -> `sectionUserMessage`; `apps/api/src/tailor/section-prompts.ts:49` -> `sectionUserMessage`; `apps/api/src/tailor/section-pass.ts:198` -> `verifySystemPrompt`; `apps/api/src/tailor/section-prompts.ts:68` -> `verifySystemPrompt`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_section`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_verify`.

## Assumptions

- Treating CV/job content as data is prompt guidance; executable target and truth checks live in api-tailor/proposal-matching and api-tailor/section-pass `apps/api/src/tailor/section-prompts.ts:36` -> `data`; `apps/api/src/tailor/section-pass.ts:176` -> `fields.includes`; `apps/api/src/tailor/section-pass.ts:206` -> `checkProposal`.
