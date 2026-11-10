---
id: web-tailor/client-document
area: web-tailor
files: ["apps/web/src/tailor/tailored-api.ts","apps/web/src/tailor/tailored-page.test.tsx","apps/web/src/tailor/guided-review.test.tsx"]
depends_on: ["shared/tailoring","shared/api-responses","api-tailor/tailored-routes","api-tailor/review-item","api-core/cv-routes","db/tailoring-repository","web-editor/autosave","db/tailoring-tables"]
contract: true
checked_hash: 0b392e70
decisions: []
open: []
---
Read tailored documents and perform versioned content and review saves.

- Listing unwraps {items:[{id,language,translatedFrom,updatedAt}]}; translatedFrom is nullable. `apps/web/src/tailor/tailored-api.ts:10` -> `SummarySchema`; `apps/web/src/tailor/tailored-api.ts:15` -> `items`
- Document reads parse a full TailoredCv, with content, baseSnapshot, review, score, coverLetter and version supplied by the shared schema. `apps/web/src/tailor/tailored-api.ts:20` -> `TailoredCvSchema`; `packages/shared/src/tailor.ts:212` -> `content`; `packages/shared/src/tailor.ts:220` -> `coverLetter`
- Content PUT sends {content,expectedVersion:version} and parses SaveResponse. `apps/web/src/tailor/tailored-api.ts:25` -> `expectedVersion`
- The server validates expectedVersion >= 1 and returns {version,updatedAt} on success; mismatch is HTTP 409 with error.code version_conflict and current {version,updatedAt}. `apps/api/src/tailor/tailored-routes.ts:17` -> `expectedVersion`; `apps/api/src/cv/routes.ts:29` -> `result.ok`; `apps/api/src/cv/routes.ts:32` -> `version_conflict`
- Review PATCH sends {section,key,action,text?,version} with keep/remove/edit actions, returning a full TailoredCv. `apps/web/src/tailor/tailored-api.ts:28` -> `ReviewDecision`; `apps/web/src/tailor/tailored-api.ts:32` -> `PATCH`
- Template PATCH sends only {template}, returning {template} validated against the shared template enum. `apps/web/src/tailor/tailored-api.ts:65` -> `TailoredCvSchema.shape.template`
- tested by `apps/web/src/tailor/tailored-page.test.tsx:142` -> `it`
- tested by `apps/web/src/tailor/guided-review.test.tsx:67` -> `it`

- Content saves conditionally update the row matching id and expectedVersion and increment version; a second read distinguishes stale from missing rows. `apps/api/src/tailor/supabase-repo.ts:104` -> `saveTailoredContent`
- Template and letter writes update timestamps without content-version checks or increments. `apps/api/src/tailor/supabase-repo.ts:142` -> `setTemplate`; `apps/api/src/tailor/supabase-repo.ts:148` -> `setCoverLetter`

## Connections

- Uses GET /v1/jobs/:id/tailored. `apps/web/src/tailor/tailored-api.ts:15` -> `/tailored`; `apps/api/src/tailor/tailored-routes.ts:37` -> `app.get`
- Uses GET /v1/tailored/:id. `apps/web/src/tailor/tailored-api.ts:20` -> `apiFetch`; `apps/api/src/tailor/tailored-routes.ts:43` -> `app.get`
- Uses PUT /v1/tailored/:id and the common save response handler. `apps/web/src/tailor/tailored-api.ts:25` -> `PUT`; `apps/api/src/tailor/tailored-routes.ts:49` -> `app.put`; `apps/api/src/tailor/tailored-routes.ts:54` -> `saveResponse`; `apps/api/src/cv/routes.ts:28` -> `saveResponse`
- Uses PATCH /v1/tailored/:id/review. `apps/web/src/tailor/tailored-api.ts:32` -> `/review`; `apps/api/src/tailor/tailored-routes.ts:65` -> `app.patch`
- Uses PATCH /v1/tailored/:id for template persistence. `apps/web/src/tailor/tailored-api.ts:65` -> `PATCH`; `apps/api/src/tailor/tailored-routes.ts:57` -> `app.patch`

- Uses /v1 mount and the conditional content repository save. `apps/web/src/tailor/tailored-api.ts:9` -> `/v1/tailored`; `apps/api/src/app.ts:110` -> `/v1`; `apps/api/src/tailor/tailored-routes.ts:52` -> `saveTailoredContent`; `apps/api/src/tailor/supabase-repo.ts:104` -> `saveTailoredContent`
- Document read/update queries rely on tailored_cvs owner RLS, rather than adding a user-id filter. `apps/api/src/tailor/supabase-repo.ts:94` -> `eq("id", id)`; `supabase/migrations/20261108000000_tailoring.sql:69` -> `auth.uid()`; `apps/api/src/tailor/supabase-repo.ts:107` -> `expectedVersion`; `supabase/migrations/20261108000000_tailoring.sql:76` -> `auth.uid()`
- Used by Editor autosave; conflicts surface in ConflictBanner with Load latest and Keep mine callbacks. `apps/web/src/tailor/TailoredCvPage.tsx:81` -> `saveTailored`; `apps/web/src/cv/Editor.tsx:60` -> `useAutosave`; `apps/web/src/cv/Editor.tsx:173` -> `ConflictBanner`

## Assumptions

- Client ids are locators, not authorization: the server uses a repository created for c.get(user), and missing document reads return 404. `apps/api/src/app.ts:116` -> `c.get`; `apps/api/src/tailor/tailored-routes.ts:45` -> `notFound`
