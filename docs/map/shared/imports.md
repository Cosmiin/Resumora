---
id: shared/imports
area: shared
files: ["packages/shared/src/imports.ts","packages/shared/src/imports.test.ts","packages/shared/src/role-description.ts","packages/shared/src/role-description.test.ts"]
depends_on: ["shared/cv","shared/categories","shared/stored-cv"]
contract: true
checked_hash: 1eae2f73
decisions: ["docs/decisions/0003-one-shared-description-of-a-cv.md","docs/decisions/0004-imports-go-through-a-queue.md","docs/decisions/0010-cv-files-go-to-the-model-as-files.md"]
open: []
---
Validate AI import output and turn it into bounded CV content for review.

- Admission is a strict kind/reason object with cv, not_cv or uncertain; draft data is a strict object with required fields and unbounded string/list extraction data. `packages/shared/src/imports.ts:23` -> `AdmitSchema`, `packages/shared/src/imports.ts:39` -> `ImportDraftSchema`, `packages/shared/src/imports.ts:63` -> `interests:`
- Draft locale accepts only en, ro or other; skills stay in three arrays and headings carry arbitrary category strings until conversion. `packages/shared/src/imports.ts:41` -> `detectedLocale`, `packages/shared/src/imports.ts:53` -> `technicalSkills`, `packages/shared/src/imports.ts:65` -> `sourceHeadings`
- emptyDraft removes the photo field obtained from emptyCv and initializes an English draft. `packages/shared/src/imports.ts:70` -> `emptyDraft`
- ImportResultSchema requires at most 50 warnings of at most 500 characters and parses content through StoredCvSchema; headings, unsourced lines and scan state have defaults. Conversion does not parse this full result schema. `packages/shared/src/imports.ts:92` -> `ImportResultSchema`, `packages/shared/src/imports.ts:256` -> `CvContentSchema.parse`; Final content is parsed as current CV content; only the first 50 warnings survive and conversion initializes unsourcedLines empty and isScan false. `packages/shared/src/imports.ts:255` -> `return`
- Conversion clips input warnings to 500 characters but only deduplicates generated warnings; the excess-bullets warning embeds the unbounded draft company before clipping the stored company, so generated warnings can exceed 500 characters. `packages/shared/src/imports.ts:116` -> `draft.warnings`, `packages/shared/src/imports.ts:118` -> `warnings.push`, `packages/shared/src/imports.ts:154` -> `e.company`, `packages/shared/src/imports.ts:158` -> `clip`
- Unparseable dates become empty with a warning; current roles always get an empty end date. `packages/shared/src/imports.ts:129` -> `const date`, `packages/shared/src/imports.ts:162` -> `endDate:`
- Imported roles get new IDs and empty notes; descriptions composed only of company/location pieces are cleared. `packages/shared/src/imports.ts:157` -> `id:`, `packages/shared/src/imports.ts:164` -> `isCopiedDescription`
- Description copying ignores case, whitespace and selected punctuation; a word-break search permits repeated company/location pieces and returns false for empty input. `packages/shared/src/role-description.ts:3` -> `SEPARATORS`, `packages/shared/src/role-description.ts:11` -> `isCopiedDescription`
- Skills are trimmed and deduplicated case-insensitively across groups before clipping; the first group wins even if its item later falls beyond the list limit. `packages/shared/src/imports.ts:172` -> `const seen`
- Other detected languages retain text but are marked English with a warning. `packages/shared/src/imports.ts:184` -> `draft.detectedLocale`, `packages/shared/src/imports.ts:190` -> `locale:`
- An education field suffix is removed from degree only when the suffix is preceded by a supported separator and leaves a nonempty degree. `packages/shared/src/imports.ts:102` -> `withoutField`, `packages/shared/src/imports.ts:196` -> `withoutField`
- Source category paths use their final component; custom maps to other, skill group names map to skills, and unknown categories map to other with a warning. `packages/shared/src/imports.ts:244` -> `const known`
- tested by `packages/shared/src/imports.test.ts:25` -> `toCvContent`; tested by `packages/shared/src/role-description.test.ts:6` -> `isCopiedDescription`

## Connections

- Used by API admission/extraction model calls: `apps/api/src/imports/process.ts:53` -> `AdmitSchema`, `apps/api/src/imports/process.ts:66` -> `ImportDraftSchema` -> `packages/shared/src/imports.ts:23` -> `AdmitSchema`, `packages/shared/src/imports.ts:39` -> `ImportDraftSchema`; prompt endpoints `apps/api/src/imports/process.ts:54` -> `admitPrompt`, `apps/api/src/imports/process.ts:67` -> `extractPrompt` -> `apps/api/src/imports/prompts.ts:18` -> `admitPrompt`, `apps/api/src/imports/prompts.ts:91` -> `extractPrompt`.
- Used by API processing and web import review: `apps/api/src/imports/process.ts:1` -> `toCvContent`, `apps/web/src/imports/ImportSummary.tsx:1` -> `ImportResult`, `apps/web/src/imports/HeadingMap.tsx:1` -> `SourceHeading` -> `packages/shared/src/imports.ts:115` -> `toCvContent`, `packages/shared/src/imports.ts:99` -> `ImportResult`, `packages/shared/src/imports.ts:86` -> `SourceHeading`.
- A generated warning over 500 characters can survive processing and be stored as a ready import, then fail on lookup: conversion validates only content, processImport limits warning count only, and the repository later parses ImportResultSchema. `packages/shared/src/imports.ts:154` -> `e.company`, `packages/shared/src/imports.ts:256` -> `CvContentSchema.parse` -> `apps/api/src/imports/process.ts:91` -> `result.warnings`; persistence `apps/api/src/imports/consumer.ts:28` -> `admin.finish` -> `apps/api/src/imports/supabase-repo.ts:109` -> `finish`; read `apps/api/src/imports/supabase-repo.ts:27` -> `ImportResultSchema.safeParse` -> `packages/shared/src/imports.ts:94` -> `max(500)`.
- Used by API scan warning and web warning presentation: `apps/api/src/imports/process.ts:1` -> `SCAN_WARNING`, `apps/web/src/imports/ImportSummary.tsx:1` -> `SCAN_WARNING` -> `packages/shared/src/imports.ts:83` -> `SCAN_WARNING`.
- Used by editor cleanup as well as import conversion: `apps/web/src/cv/edit/cvReducer.ts:386` -> `isCopiedDescription`, `packages/shared/src/imports.ts:164` -> `isCopiedDescription` -> `packages/shared/src/role-description.ts:11` -> `isCopiedDescription`.
- Queue link carrying the work that produces ImportResult: `apps/api/src/imports/routes.ts:47` -> `deps.queue.send` -> `apps/api/src/imports/consumer.ts:22` -> `msg.body.importId`; message shape lives outside shared at `apps/api/src/imports/repo.ts:11` -> `ImportMessage`, and consumer processing returns the result at `apps/api/src/imports/consumer.ts:27` -> `processImport` -> `packages/shared/src/imports.ts:99` -> `ImportResult`.
- Import creation invokes the database rate-limit trigger: `apps/api/src/imports/supabase-repo.ts:52` -> `cv_imports` -> `supabase/migrations/20261105010000_import_limit.sql:19` -> `cv_imports_limit` -> `supabase/migrations/20261105010000_import_limit.sql:21` -> `check_import_limit`.
- Import apply RPC persists reviewed CvContent: `apps/api/src/imports/supabase-repo.ts:78` -> `apply_import` -> `supabase/migrations/20261106010000_apply_import_content.sql:10` -> `apply_import`; shared content endpoint `packages/shared/src/imports.ts:93` -> `StoredCvSchema`.
- Import lookup relies on the ownership policy: `apps/api/src/imports/supabase-repo.ts:66` -> `cv_imports` -> `supabase/migrations/20261105000000_imports.sql:27` -> `auth.uid`.

## Assumptions

- Callers must validate the raw model draft first; toCvContent accepts a typed draft and immediately reads its arrays. `packages/shared/src/imports.ts:115` -> `ImportDraft`, `packages/shared/src/imports.ts:116` -> `draft.warnings`.
- Conversion is lossy: clipping, skill deduplication and copied-description removal are not reversible; duplicate skills and copied descriptions do not add warnings. `packages/shared/src/imports.ts:127` -> `value.slice`, `packages/shared/src/imports.ts:164` -> `isCopiedDescription`, `packages/shared/src/imports.ts:175` -> `const unique`.
- The queue consumer obtains user identity from the stored import job rather than trusting the message's userId. `apps/api/src/imports/consumer.ts:22` -> `admin.start`, `apps/api/src/imports/consumer.ts:27` -> `job.userId`.
