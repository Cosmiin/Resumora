---
id: web-tailor/client-actions
area: web-tailor
files: ["apps/web/src/tailor/tailored-api.ts","apps/web/src/tailor/retailor.test.tsx","apps/web/src/tailor/translate.test.tsx","apps/web/src/tailor/cover-letter.test.tsx"]
depends_on: ["shared/tailoring","api-tailor/tailored-routes","api-tailor/retailor","api-tailor/translate","api-tailor/letter"]
contract: true
checked_hash: 7aee7903
decisions: []
open: []
---
Request re-tailoring, translation and cover-letter generation or editing.

- Re-tailoring POSTs {sections:TailorSection[]} and requires {run:TailorRun}. `apps/web/src/tailor/tailored-api.ts:36` -> `retailor`
- Translation POSTs {language:TailorLanguage} and validates {tailoredCvId:string,flagged:number}. `apps/web/src/tailor/tailored-api.ts:41` -> `translate`
- Letter generation POSTs {whyCompany,hiringManager} and validates {coverLetter:CoverLetter,flags:Flag[]}. `apps/web/src/tailor/tailored-api.ts:52` -> `writeLetter`
- Letter editing PUTs {body,hiringManager,whyCompany} and requires {coverLetter}; no version is sent. `apps/web/src/tailor/tailored-api.ts:59` -> `saveLetter`
- FlagSchema and CoverLetterSchema come from shared contracts; failed parsing propagates from apiFetch. `apps/web/src/tailor/tailored-api.ts:47` -> `CoverLetterSchema`; `apps/web/src/lib/api.ts:66` -> `parse`
- tested by `apps/web/src/tailor/retailor.test.tsx:62` -> `it`
- tested by `apps/web/src/tailor/translate.test.tsx:67` -> `it`
- tested by `apps/web/src/tailor/cover-letter.test.tsx:42` -> `it`

## Connections

- Uses POST /v1/tailored/:id/retailor. `apps/web/src/tailor/tailored-api.ts:37` -> `/retailor`; `apps/api/src/tailor/tailored-routes.ts:73` -> `app.post`
- Uses POST /v1/tailored/:id/translate. `apps/web/src/tailor/tailored-api.ts:42` -> `/translate`; `apps/api/src/tailor/tailored-routes.ts:81` -> `app.post`
- Uses POST /v1/tailored/:id/cover-letter. `apps/web/src/tailor/tailored-api.ts:53` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:90` -> `app.post`
- Uses PUT /v1/tailored/:id/cover-letter. `apps/web/src/tailor/tailored-api.ts:60` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:99` -> `app.put`

## Assumptions

- Request handlers construct user-scoped dependencies; none of these client methods supplies a user id. `apps/web/src/tailor/tailored-api.ts:37` -> `json`; `apps/api/src/app.ts:116` -> `c.get`
