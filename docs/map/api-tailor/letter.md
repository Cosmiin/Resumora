---
id: api-tailor/letter
area: api-tailor
files: ["apps/api/src/tailor/letter.ts","apps/api/test/tailor-letter.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-repository","db/jobs-repository","api-core/call-model","api-tailor/letter-prompts","api-tailor/letter-checks"]
contract: true
checked_hash: daa3cc3d
decisions: []
open: []
---
Generate, retry and save a cover letter, or persist edits to an existing letter.

- Generation accepts optional trimmed whyCompany up to 1000 and hiringManager up to 120; empty values become null. Missing CV/job returns null, unready job 409 `apps/api/src/tailor/letter.ts:12` -> `const optional`; `apps/api/src/tailor/letter.ts:13` -> `LetterBodySchema`; `apps/api/src/tailor/letter.ts:31` -> `readTailoredCv`; `apps/api/src/tailor/letter.ts:35` -> `job_not_ready`.
- Any flags trigger one whole-body generation and verification retry; remaining flags are returned with a saved letter, rather than dropping its text `apps/api/src/tailor/letter.ts:72` -> `attempt(null)`; `apps/api/src/tailor/letter.ts:73` -> `attempt(result)`; `apps/api/src/tailor/letter.ts:81` -> `setCoverLetter`; `apps/api/src/tailor/letter.ts:82` -> `flags: result.flags`.
- Gateway JSON/schema errors retry providers; errors in either attempt or invalid body length become 502 without saving a new letter `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/tailor/letter.ts:53` -> `throw new Error`; `apps/api/src/tailor/letter.ts:75` -> `ai_failed`.
- Editing requires an existing letter, otherwise 409 no_letter; preserves generatedAt and omitted metadata, makes supplied empty metadata null and runs no truth check `apps/api/src/tailor/letter.ts:91` -> `no_letter`; `apps/api/src/tailor/letter.ts:93` -> `...doc.coverLetter`; `apps/api/src/tailor/letter.ts:94` -> `hiringManager`; `apps/api/src/tailor/letter.ts:97` -> `setCoverLetter`.
- Letter saves have no document version check or bump; repeated generation or editing overwrites cover_letter and updates timestamp `apps/api/src/tailor/letter.ts:81` -> `setCoverLetter`; `apps/api/src/tailor/supabase-repo.ts:149` -> `cover_letter: letter`; `apps/api/src/tailor/supabase-repo.ts:150` -> `eq("id", id)`.
- tested by `apps/api/test/tailor-letter.test.ts:87` -> `POST /v1/tailored/:id/cover-letter`.
- tested by `apps/api/test/tailor-letter.test.ts:198` -> `PUT /v1/tailored/:id/cover-letter`.

## Connections

- Used by browser generate and edit URLs `apps/web/src/tailor/tailored-api.ts:53` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:90` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:93` -> `writeCoverLetter`; `apps/api/src/tailor/letter.ts:27` -> `writeCoverLetter`; `apps/web/src/tailor/tailored-api.ts:60` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:99` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:102` -> `editCoverLetter`; `apps/api/src/tailor/letter.ts:86` -> `editCoverLetter`.
- Uses api-tailor/letter-prompts and api-tailor/letter-checks in each generation attempt `apps/api/src/tailor/letter.ts:48` -> `letterSystemPrompt`; `apps/api/src/tailor/letter-prompts.ts:5` -> `letterSystemPrompt`; `apps/api/src/tailor/letter.ts:72` -> `attempt(null)`; `apps/api/src/tailor/letter.ts:55` -> `tailor_verify`.

## Assumptions

- User edits are trusted as user content, with no truth-check call before save `apps/api/src/tailor/letter.ts:86` -> `editCoverLetter`; `apps/api/src/tailor/letter.ts:93` -> `body: edit.body`; `apps/api/src/tailor/letter.ts:97` -> `setCoverLetter`.
