---
id: api-tailor/letter-checks
area: api-tailor
files: ["apps/api/src/tailor/letter.ts"]
depends_on: ["shared/enrichment-checks","api-tailor/checks","api-tailor/proposal-sources","api-tailor/letter-prompts","api-core/call-model","db/ai-log"]
contract: true
checked_hash: 5627e17d
decisions: []
open: []
---
Combine cover-letter claim verification with number and tool checks against candidate and job sources.

- Cheap tailor_verify returns results of itemId plus claims strings, 2000 tokens. Unlike section verification, all returned claims are applied, including unknown item IDs; missing results imply no achievement flags `apps/api/src/tailor/letter.ts:20` -> `VerifySchema`; `apps/api/src/tailor/letter.ts:55` -> `tailor_verify`; `apps/api/src/tailor/letter.ts:65` -> `verified.results.flatMap`.
- Candidate sources include section-pass texts from stripped CV plus userThoughts, whyCompany, job title/company/location and I. Job summary/responsibilities/requirements/benefits are supplied separately to verifier `apps/api/src/tailor/letter.ts:39` -> `const sources`; `apps/api/src/tailor/letter.ts:43` -> `const jobText`; `apps/api/src/tailor/letter.ts:56` -> `sources, job: jobText`.
- Local checks combine candidate sources and job text, allowing job-stated numbers/tools; German runs only number checks, other languages run checkProposal `apps/api/src/tailor/letter.ts:59` -> `const known`; `apps/api/src/tailor/letter.ts:60` -> `"de"`; `apps/api/src/tailor/letter.ts:62` -> `checkProposal`.
- Verifier input contains one synthetic letter proposal with before null, so it has no existing CV item/field to resolve `apps/api/src/tailor/letter.ts:56` -> `itemId: "letter"`.
- Local flags precede achievement flags; repeated claims are not deduplicated `apps/api/src/tailor/letter.ts:63` -> `flags`; `apps/api/src/tailor/letter.ts:65` -> `flatMap`.

## Connections

- Uses api-tailor/proposal-sources traversal and api-tailor/checks `apps/api/src/tailor/letter.ts:39` -> `texts(cv)`; `apps/api/src/tailor/section-pass.ts:98` -> `texts`; `apps/api/src/tailor/letter.ts:62` -> `checkProposal`; `apps/api/src/tailor/checks.ts:43` -> `checkProposal`.
- Uses api-tailor/letter-prompts under SQL-allowed tailor_verify; api-tailor/letter retries the body and returns remaining flags `apps/api/src/tailor/letter.ts:55` -> `letterVerifySystemPrompt`; `apps/api/src/tailor/letter-prompts.ts:26` -> `letterVerifySystemPrompt`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_verify`; `apps/api/src/tailor/letter.ts:73` -> `attempt(result)`; `apps/api/src/tailor/letter.ts:82` -> `flags: result.flags`.

## Assumptions

- The verifier prompt separates job facts from candidate achievements, but local numbers/tools permit both; semantic attribution relies on model verification `apps/api/src/tailor/letter-prompts.ts:27` -> `"sources"`; `apps/api/src/tailor/letter-prompts.ts:28` -> `candidate`; `apps/api/src/tailor/letter.ts:59` -> `...jobText`.
