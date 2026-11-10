---
id: api-tailor/translate
area: api-tailor
files: ["apps/api/src/tailor/translate.ts","apps/api/src/tailor/translate-prompts.ts","apps/api/test/tailor-translate.test.ts"]
depends_on: ["shared/cv","shared/tailoring","shared/enrichment-checks","db/tailoring-translations","db/ai-log","api-core/call-model"]
contract: true
checked_hash: 77257dd8
cited: [46b1d6, 97fac3, b8e54b, 7d947a, b8d749, 3a381a, 325d75, bcc518, a62adb, a62adb, ec0435, bb0acd, 916a94, 76356c, ae5770, fefc81, bab8a3, 925ce8, c78aaf, a8e930, 9e56bb, 2a4f9f, f5e50f, 8d3e3e, f0a362, 4e2c20, a95aa1, a9d345, 9a18ea, 96024b, a84da6, 76356c, 4273ac, 76356c, f38218, be9103, 916a94, 7cb8da, a876ea, dade95, 24878d, 0ad4fa, f0a362, ad8861, 1a4f33, d7cee4, 955275, db8f9d, f7d2b7, c78aaf, a8e930, 7eb31c, a62adb]
decisions: []
open: []
---
Translate selected CV and letter strings into an independent job-language document.

- Requires a supported language; missing source returns null, same-language returns 400, and an existing independently tailored target-language document returns 409 `apps/api/src/tailor/translate.ts:11` -> `TranslateBodySchema`; `apps/api/src/tailor/translate.ts:55` -> `readTailoredCv`; `apps/api/src/tailor/translate.ts:57` -> `same_language`; `apps/api/src/tailor/translate.ts:59` -> `translatedFrom === null`.
- Collects nonblank strings into dotted paths rooted at cv/letter, including array indices; translates against the source content plus nullable cover letter `apps/api/src/tailor/translate.ts:25` -> `collect`; `apps/api/src/tailor/translate.ts:29` -> `value.forEach`; `apps/api/src/tailor/translate.ts:63` -> `const source`.
- Skips keys id/schemaVersion/locale/layout/photo/facts/email/phone/website/linkedin/url/startDate/endDate/date/company/fullName/firstName/lastName/location/generatedAt/hiringManager/enrichedAt; location is skipped only at cv.basics `apps/api/src/tailor/translate.ts:19` -> `const KEEP`; `apps/api/src/tailor/translate.ts:33` -> `path !== "cv.basics"`.
- Array-valued notes are omitted, while string notes such as education notes are translatable; other names not in KEEP are not protected by code `apps/api/src/tailor/translate.ts:33` -> `key === "notes"`; `apps/api/src/tailor/translate.ts:34` -> `collect(entry`.
- Strong tailor_translate uses ReplySchema texts of string path/text, translateSystemPrompt and translateUserMessage, with 16000 tokens; invalid JSON/schema retries via gateway and exhaustion becomes 502 `apps/api/src/tailor/translate.ts:12` -> `ReplySchema`; `apps/api/src/tailor/translate.ts:69` -> `tailor_translate`; `apps/api/src/tailor/translate.ts:70` -> `maxOutputTokens`; `apps/api/src/tailor/translate.ts:73` -> `ai_failed`; `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`.
- Unknown paths and blank replies silently keep source wording; omitted paths also keep source. Duplicate valid paths apply in reply order, so the last accepted value wins `apps/api/src/tailor/translate.ts:76` -> `structuredClone`; `apps/api/src/tailor/translate.ts:79` -> `for (const`; `apps/api/src/tailor/translate.ts:81` -> `continue`; `apps/api/src/tailor/translate.ts:84` -> `setAt`.
- Only number checks compare each translation against its own original string; unknown numbers increment flagged and keep the current cloned value, without rejecting the entire translation `apps/api/src/tailor/translate.ts:80` -> `original.get`; `apps/api/src/tailor/translate.ts:83` -> `hasUnknownNumber`.
- Forces CV locale to target, validates CV and nullable letter and enforces MAX_CV_BYTES; invalid final output returns 502 before save `apps/api/src/tailor/translate.ts:86` -> `locale: input.language`; `apps/api/src/tailor/translate.ts:88` -> `MAX_CV_BYTES`.
- Writes a new/refreshed copy with source ID, template/tone/instruction and timestamp; a target becoming independently tailored during the call still returns language_taken `apps/api/src/tailor/translate.ts:92` -> `saveTranslation`; `apps/api/src/tailor/translate.ts:96` -> `"language_taken"`.
- Repeated requests regenerate translation and refresh the target; storage clears review/score and uses translated content as its Base snapshot `apps/api/src/tailor/translate.ts:68` -> `callModel`; `apps/api/src/tailor/supabase-repo.ts:116` -> `base_snapshot: input.content`; `apps/api/src/tailor/supabase-repo.ts:118` -> `review: null`.
- tested by `apps/api/test/tailor-translate.test.ts:72` -> `POST /v1/tailored/:id/translate`; the default fake prefixes FR regardless of target language, so these tests do not prove target-language output `apps/api/test/tailor-translate.test.ts:38` -> `sent.texts.map`.

## Connections

- Uses system/user templates; exact-once paths and preserving names/facts are prompt instructions rather than completeness checks `apps/api/src/tailor/translate.ts:70` -> `translateSystemPrompt`; `apps/api/src/tailor/translate-prompts.ts:5` -> `translateSystemPrompt`; `apps/api/src/tailor/translate.ts:70` -> `translateUserMessage`; `apps/api/src/tailor/translate-prompts.ts:10` -> `translateUserMessage`; `apps/api/src/tailor/translate-prompts.ts:6` -> `exactly once`.
- Uses SQL-allowed tailor_translate `apps/api/src/tailor/translate.ts:69` -> `tailor_translate`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_translate`.
- Used by browser translation URL `apps/web/src/tailor/tailored-api.ts:42` -> `/translate`; `apps/api/src/tailor/tailored-routes.ts:81` -> `/translate`; `apps/api/src/tailor/tailored-routes.ts:84` -> `translateTailored`; `apps/api/src/tailor/translate.ts:51` -> `translateTailored`.
- Uses translation repository's two-attempt version/duplicate-insert retry and SQL unique/RLS protection `apps/api/src/tailor/translate.ts:92` -> `saveTranslation`; `apps/api/src/tailor/supabase-repo.ts:121` -> `attempt < 2`; `apps/api/src/tailor/supabase-repo.ts:128` -> `eq("version"`; `apps/api/src/tailor/supabase-repo.ts:136` -> `23505`; `supabase/migrations/20261108000000_tailoring.sql:26` -> `unique`; `supabase/migrations/20261108000000_tailoring.sql:73` -> `auth.uid()`.

## Assumptions

- The allowlist is the collected path map: reply paths cannot introduce arbitrary object keys because only existing collected paths reach setAt `apps/api/src/tailor/translate.ts:77` -> `new Map`; `apps/api/src/tailor/translate.ts:81` -> `before === undefined`; `apps/api/src/tailor/translate.ts:84` -> `setAt`.
- Names or contact information embedded in other translatable text can still be sent; only keys/notes arrays are excluded `apps/api/src/tailor/translate.ts:26` -> `typeof value === "string"`; `apps/api/src/tailor/translate.ts:33` -> `KEEP.has`.
