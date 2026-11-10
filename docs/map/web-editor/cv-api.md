---
id: web-editor/cv-api
area: web-editor
files: ["apps/web/src/cv/cv-api.ts"]
depends_on: ["shared/api-responses","shared/cv","api-core/cv-routes","api-core/auth","db/cv-repository","shared/notes"]
contract: false
checked_hash: 7160bb48
cited: [c329ae, 65a053, 086796, 4bd914, 78cdb8, 79e42e, df4aad, bd7cbf, e15887, c329ae, a352da, 666166, e15887, 374d76, 086796, 13fe6b, 78cdb8, feecaa, 9ec6a7, ac30fe, a9900d, deb51a, 4cf21b, 2bac6b, 66931f, 3dfac0, 296741, 9ec6a7, 263c88, 60b46f, 215f7b, 17c679, 556064, c5195b, 3a862b, 2b8a5e]
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md","docs/decisions/0002-the-api-acts-as-the-signed-in-user.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Expose schema-checked browser calls for the current CV and its history.

- getCv validates GET /v1/cv with CvResponseSchema. `apps/web/src/cv/cv-api.ts:15` -> `CvResponseSchema`
- listHistory validates an items envelope and returns the array. `apps/web/src/cv/cv-api.ts:18` -> `HistoryListSchema`; `apps/web/src/cv/cv-api.ts:22` -> `.items`
- History detail validates CV content plus a string timestamp; IDs are URL encoded. `apps/web/src/cv/cv-api.ts:19` -> `HistoryDetailSchema`; `apps/web/src/cv/cv-api.ts:26` -> `encodeURIComponent`
- Restore posts only the expected version and parses SaveResponseSchema, so the API's additional restored content is not part of this client return contract. `apps/web/src/cv/cv-api.ts:29` -> `restoreHistory`; `apps/api/src/cv/routes.ts:68` -> `content`; `packages/shared/src/api.ts:12` -> `SaveResponseSchema`
- saveCv sends content and version together in a PUT, with response schema validation. `apps/web/src/cv/cv-api.ts:38` -> `method: "PUT"`

## Connections

- GET /v1/cv caller, route mount and handler: `apps/web/src/cv/cv-api.ts:15` -> `"/v1/cv"`; `apps/api/src/app.ts:74` -> `"/v1/cv"`; `apps/api/src/cv/routes.ts:42` -> `app.get`
- PUT /v1/cv caller and handler: `apps/web/src/cv/cv-api.ts:38` -> `"/v1/cv"`; `apps/api/src/cv/routes.ts:44` -> `app.put`
- GET /v1/cv/history caller and handler: `apps/web/src/cv/cv-api.ts:22` -> `"/v1/cv/history"`; `apps/api/src/cv/routes.ts:49` -> `"/history"`
- GET /v1/cv/history/:id caller and handler: `apps/web/src/cv/cv-api.ts:26` -> `encodeURIComponent`; `apps/api/src/cv/routes.ts:51` -> `"/history/:id"`
- POST /v1/cv/history/:id/restore caller and handler: `apps/web/src/cv/cv-api.ts:30` -> `/restore`; `apps/api/src/cv/routes.ts:57` -> `"/history/:id/restore"`
- Uses apiFetch for authenticated transport, errors and schema parsing: `apps/web/src/cv/cv-api.ts:12` -> `apiFetch`; `apps/web/src/lib/api.ts:56` -> `apiFetch`; `apps/web/src/lib/api.ts:64` -> `ApiClientError`
- Used by autosave's default editor source and history reads: `apps/web/src/cv/Editor.tsx:39` -> `baseSource`; `apps/web/src/cv/cv-api.ts:37` -> `saveCv`; `apps/web/src/cv/HistoryPanel.tsx:38` -> `listHistory`; `apps/web/src/cv/cv-api.ts:21` -> `listHistory`
- Restore uses shared/notes to merge the selected snapshot with current notes and newer facts by matching IDs across experience, projects and volunteering, then validates and saves the result; restored content can therefore differ from the history preview. `apps/web/src/cv/cv-api.ts:30` -> `/restore`; `apps/api/src/cv/routes.ts:64` -> `mergeNewerNotes`; `packages/shared/src/notes.ts:50` -> `mergeNewerNotes`; `packages/shared/src/notes.ts:59` -> `const facts`; `packages/shared/src/notes.ts:64` -> `result.experience`

## Assumptions

- Identity comes from the transport token, not a caller-supplied user ID. `apps/web/src/lib/api.ts:14` -> `authorization`; `apps/web/src/lib/api.ts:33` -> `getSession`
- The base-CV repository selects without an explicit user filter and relies on the user's bearer token and database RLS. `apps/api/src/cv/supabase-repo.ts:23` -> `Authorization`; `apps/api/src/cv/supabase-repo.ts:35` -> `from("base_cvs")`
