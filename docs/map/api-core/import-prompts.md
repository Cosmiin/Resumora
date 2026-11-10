---
id: api-core/import-prompts
area: api-core
files: ["apps/api/src/imports/prompts.ts","apps/api/test/prompts.test.ts"]
depends_on: ["shared/categories","shared/imports","api-core/call-model"]
contract: true
checked_hash: dae6628a
decisions: ["docs/decisions/0009-one-fixed-set-of-cv-categories.md","docs/decisions/0010-cv-files-go-to-the-model-as-files.md"]
open: []
---
Define the model's CV admission and word-for-word extraction instructions.

- Both prompts include instructions to treat document content as untrusted, ignore embedded instructions, avoid tools/URLs and return JSON. `apps/api/src/imports/prompts.ts:11` -> `common`, `apps/api/src/imports/prompts.ts:22` -> `common`, `apps/api/src/imports/prompts.ts:67` -> `common`
- Admission permits cv, not_cv and uncertain with a reason. `apps/api/src/imports/prompts.ts:18` -> `admitPrompt`
- Extraction requests verbatim prose, original language/diacritics and absent fields left empty; it prohibits polishing and invented claims. `apps/api/src/imports/prompts.ts:27` -> `COPY WORD FOR WORD`
- Names may be split only when unambiguous; dates preserve year-only precision and explicit current status. `apps/api/src/imports/prompts.ts:35` -> `basics.firstName`, `apps/api/src/imports/prompts.ts:42` -> `current`, `apps/api/src/imports/prompts.ts:45` -> `YYYY-MM`
- Skills are classified by meaning into three groups, preserving unclear items with warnings and avoiding duplicate groups/custom copies. `apps/api/src/imports/prompts.ts:47` -> `SKILLS`
- Narrative determines detectedLocale; isolated product names, addresses and language lists must not decide it. `apps/api/src/imports/prompts.ts:61` -> `detectedLocale`
- The generated category list excludes header and includes English/Romanian synonyms; source headings use skills/other category keys and omit contact headings. `apps/api/src/imports/prompts.ts:71` -> `sourceHeadings`, `apps/api/src/imports/prompts.ts:83` -> `CATEGORIES.filter`
- Role bullets must not be copied into achievements; a company/location line is not a role description. `apps/api/src/imports/prompts.ts:75` -> `achievements`, `apps/api/src/imports/prompts.ts:78` -> `company`
- PROMPT_VERSION is a literal marker; extraction uses buildExtractPrompt's result. `apps/api/src/imports/prompts.ts:9` -> `PROMPT_VERSION`, `apps/api/src/imports/prompts.ts:91` -> `buildExtractPrompt`
- tested by `apps/api/test/prompts.test.ts:6` -> `buildExtractPrompt`, `apps/api/test/prompts.test.ts:32` -> `buildExtractPrompt category rules`; shared file also tested by `apps/api/test/prompts.test.ts:43` -> `improveBulletSystemPrompt`.

## Connections
- Categories generate prompt text: `apps/api/src/imports/prompts.ts:83` -> `CATEGORIES` -> `packages/shared/src/categories.ts:30` -> `CATEGORIES`.
- Used by admission and extraction: `apps/api/src/imports/process.ts:54` -> `admitPrompt` -> `apps/api/src/imports/prompts.ts:18` -> `admitPrompt`; `apps/api/src/imports/process.ts:67` -> `extractPrompt` -> `apps/api/src/imports/prompts.ts:91` -> `extractPrompt`.
- Prompt output must match shared schema: `apps/api/src/imports/process.ts:66` -> `ImportDraftSchema` -> `packages/shared/src/imports.ts:39` -> `ImportDraftSchema`.

## Assumptions
- These are model instructions, not deterministic enforcement of factual copying; the pipeline separately flags unmatched text. `apps/api/src/imports/prompts.ts:28` -> `word for word`, `apps/api/src/imports/process.ts:95` -> `findUnsourcedLines`
