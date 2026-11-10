---
id: web-tailor/client-actions
area: web-tailor
files: ["apps/web/src/tailor/tailored-api.ts","apps/web/src/tailor/retailor.test.tsx","apps/web/src/tailor/translate.test.tsx","apps/web/src/tailor/cover-letter.test.tsx"]
depends_on: ["shared/tailoring","api-tailor/tailored-routes","api-tailor/retailor","api-tailor/translate","api-tailor/letter"]
contract: true
checked_hash: 7aee7903
cited: [8aa1f6, 6ec5d0, b4a7ff, c571f9, e65e1e, c6ca9e, 646413, 26f36d, a876ea, dade95, 9f45d4, e71dd8, 3d90d9, f98040, 646413, d7e916]
decisions: []
open: []
---
Request re-tailoring, translation and cover-letter generation or editing.

- Re-tailoring POSTs {sections:TailorSection[]} and requires {run:TailorRun}. `apps/web/src/tailor/tailored-api.ts:36` -> `retailor`
- Translation POSTs {language:TailorLanguage} and validates {tailoredCvId:string,flagged:number}. `apps/web/src/tailor/tailored-api.ts:41` -> `translate`
- Letter generation POSTs {whyCompany,hiringManager} and validates {coverLetter:CoverLetter,flags:Flag[]}. `apps/web/src/tailor/tailored-api.ts:52` -> `writeLetter`
- Letter editing PUTs {body,hiringManager,whyCompany} and requires {coverLetter}; no version is sent. `apps/web/src/tailor/tailored-api.ts:59` -> `saveLetter`
- FlagSchema and CoverLetterSchema come from shared contracts; failed parsing propagates from apiFetch. `apps/web/src/tailor/tailored-api.ts:47` -> `CoverLetterSchema`; `apps/web/src/lib/api.ts:66` -> `parse`

## Connections

- Uses POST /v1/tailored/:id/retailor. `apps/web/src/tailor/tailored-api.ts:37` -> `/retailor`; `apps/api/src/tailor/tailored-routes.ts:73` -> `app.post`
- Uses POST /v1/tailored/:id/translate. `apps/web/src/tailor/tailored-api.ts:42` -> `/translate`; `apps/api/src/tailor/tailored-routes.ts:81` -> `app.post`
- Uses POST /v1/tailored/:id/cover-letter. `apps/web/src/tailor/tailored-api.ts:53` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:90` -> `app.post`
- Uses PUT /v1/tailored/:id/cover-letter. `apps/web/src/tailor/tailored-api.ts:60` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:99` -> `app.put`

## Assumptions

- Request handlers construct user-scoped dependencies; none of these client methods supplies a user id. `apps/web/src/tailor/tailored-api.ts:37` -> `json`; `apps/api/src/app.ts:116` -> `c.get`
