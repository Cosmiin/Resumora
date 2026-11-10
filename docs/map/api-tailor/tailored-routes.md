---
id: api-tailor/tailored-routes
area: api-tailor
files: ["apps/api/src/tailor/tailored-routes.ts","apps/api/test/tailored.test.ts"]
depends_on: ["shared/cv","shared/tailoring","shared/api-responses","api-core/app","api-core/auth","api-core/cv-routes","api-core/errors","db/tailoring-repository","api-tailor/review-item","api-tailor/retailor","api-tailor/translate","api-tailor/letter"]
contract: true
checked_hash: 32888ec4
cited: [6422fb, 15f0b2, 949649, d79acb, c63dbb, 04e030, ac52d1, ff931b, 2fbcc8, 072faa, cac7fd, 1f10e7, 1c61c4, 8db4ef, c337a7, 318b0a, a03ecf, d1bad7, 695a9c, 34439f, c416df, 83c5f1, d1d873, d27605, 2fbcc8, 457057, fd3afc, 123912, f8885a, c320d3, d7e916, 68525a, 8e9a8b, 68008b, 36a0d3, 65b44e, 0fda38, 41c62d, 46fb5a, 4bd0b3, f154be, 8db4ef, 646413, 26f36d, a876ea, dade95, 9f45d4, e71dd8, 3d90d9, f98040, ff931b, effb0a, 072faa, 211fbe, c63dbb, 291638, deb3ff, 2fbcc8, 227040, ffa578, d7e916, 486972, c63dbb, 1f10e7, d1d873, 45f374, 55ef6b]
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md","docs/decisions/0002-the-api-acts-as-the-signed-in-user.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Expose document reads, versioned editor saves, template/review changes and document-level AI actions.

- All document routes validate UUID and map missing documents to 404 not_found; job listing instead uses job_not_found and checks parent existence `apps/api/src/tailor/tailored-routes.ts:20` -> `notFound`; `apps/api/src/tailor/tailored-routes.ts:31` -> `const id`; `apps/api/src/tailor/tailored-routes.ts:39` -> `jobNotFound`.
- GET job tailored returns items summaries, while GET tailored returns the full repository document `apps/api/src/tailor/tailored-routes.ts:40` -> `items:`; `apps/api/src/tailor/tailored-routes.ts:44` -> `readTailoredCv`; `apps/api/src/tailor/tailored-routes.ts:46` -> `c.json(cv)`.
- Editor PUT requires CvContentSchema plus positive expectedVersion and uses shared readJson/saveResponse handling; missing repository result is 404 `apps/api/src/tailor/tailored-routes.ts:17` -> `SaveBody`; `apps/api/src/tailor/tailored-routes.ts:51` -> `readJson`; `apps/api/src/tailor/tailored-routes.ts:52` -> `saveTailoredContent`; `apps/api/src/tailor/tailored-routes.ts:54` -> `saveResponse`.
- PATCH document changes only the template and returns it; unlike editor PUT it takes no expectedVersion `apps/api/src/tailor/tailored-routes.ts:18` -> `TemplateBody`; `apps/api/src/tailor/tailored-routes.ts:59` -> `TemplateBody.parse`; `apps/api/src/tailor/tailored-routes.ts:60` -> `setTemplate`.
- Review PATCH validates ReviewItemBodySchema and returns updated document; absent document becomes not_found `apps/api/src/tailor/tailored-routes.ts:65` -> `/review`; `apps/api/src/tailor/tailored-routes.ts:67` -> `ReviewItemBodySchema`; `apps/api/src/tailor/tailored-routes.ts:70` -> `c.json(cv)`.
- Retailor and translate POST parse their dedicated schemas, await service calls and map null results to not_found `apps/api/src/tailor/tailored-routes.ts:75` -> `RetailorBodySchema`; `apps/api/src/tailor/tailored-routes.ts:76` -> `startRetailor`; `apps/api/src/tailor/tailored-routes.ts:83` -> `TranslateBodySchema`; `apps/api/src/tailor/tailored-routes.ts:86` -> `notFound`.
- Letter POST returns generation result including flags; PUT parses edits and returns only coverLetter `apps/api/src/tailor/tailored-routes.ts:92` -> `LetterBodySchema`; `apps/api/src/tailor/tailored-routes.ts:96` -> `c.json(result)`; `apps/api/src/tailor/tailored-routes.ts:101` -> `LetterEditSchema`; `apps/api/src/tailor/tailored-routes.ts:104` -> `coverLetter`.
- Editor save changes content/version/time without clearing or recomputing review, score or cover letter; later reads may contain metadata based on earlier content `apps/api/src/tailor/tailored-routes.ts:52` -> `saveTailoredContent`; `apps/api/src/tailor/supabase-repo.ts:106` -> `update({ content, version:`.
- tested by `apps/api/test/tailored.test.ts:63` -> `tailored CV read and save`.

## Connections

- Mounted under /v1 with authenticated user repositories `apps/api/src/app.ts:110` -> `"/v1"`; `apps/api/src/app.ts:111` -> `tailoredRoutes`; `apps/api/src/tailor/tailored-routes.ts:23` -> `tailoredRoutes`; `apps/api/src/app.ts:116` -> `c.get("user")`.
- Used by web list/read/save/template URLs `apps/web/src/tailor/tailored-api.ts:15` -> `/tailored`; `apps/api/src/tailor/tailored-routes.ts:37` -> `/jobs/:id/tailored`; `apps/web/src/tailor/tailored-api.ts:9` -> `/v1/tailored/`; `apps/web/src/tailor/tailored-api.ts:20` -> `apiFetch(tailored(id)`; `apps/api/src/tailor/tailored-routes.ts:43` -> `/tailored/:id`; `apps/web/src/tailor/tailored-api.ts:25` -> `method: "PUT"`; `apps/api/src/tailor/tailored-routes.ts:49` -> `app.put`; `apps/web/src/tailor/tailored-api.ts:65` -> `method: "PATCH"`; `apps/api/src/tailor/tailored-routes.ts:57` -> `app.patch`.
- Used by web review/retailor/translate URLs `apps/web/src/tailor/tailored-api.ts:32` -> `/review`; `apps/api/src/tailor/tailored-routes.ts:65` -> `/review`; `apps/web/src/tailor/tailored-api.ts:37` -> `/retailor`; `apps/api/src/tailor/tailored-routes.ts:73` -> `/retailor`; `apps/web/src/tailor/tailored-api.ts:42` -> `/translate`; `apps/api/src/tailor/tailored-routes.ts:81` -> `/translate`.
- Used by web letter generation/edit URLs `apps/web/src/tailor/tailored-api.ts:53` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:90` -> `/cover-letter`; `apps/web/src/tailor/tailored-api.ts:60` -> `/cover-letter`; `apps/api/src/tailor/tailored-routes.ts:99` -> `/cover-letter`.
- Uses shared editor response adapter and JSON size guard `apps/api/src/tailor/tailored-routes.ts:51` -> `readJson`; `apps/api/src/cv/routes.ts:12` -> `readJson`; `apps/api/src/tailor/tailored-routes.ts:54` -> `saveResponse`; `apps/api/src/cv/routes.ts:28` -> `saveResponse`.
- Uses tailored-document RLS through repository ID reads/writes `apps/api/src/tailor/tailored-routes.ts:44` -> `readTailoredCv`; `apps/api/src/tailor/supabase-repo.ts:94` -> `eq("id", id)`; `supabase/migrations/20261108000000_tailoring.sql:69` -> `auth.uid()`; `apps/api/src/tailor/tailored-routes.ts:52` -> `saveTailoredContent`; `apps/api/src/tailor/supabase-repo.ts:107` -> `eq("version", expectedVersion)`; `supabase/migrations/20261108000000_tailoring.sql:76` -> `auth.uid()`.

## Assumptions

- Ownership relies on bearer-authenticated Supabase clients and RLS; route handlers only supply document/job IDs `apps/api/src/app.ts:116` -> `c.get("user")`; `apps/api/src/tailor/supabase-repo.ts:18` -> `user.token`; `apps/api/src/tailor/tailored-routes.ts:44` -> `readTailoredCv(id(c))`.
- Template and cover-letter operations lack version protection even though content and review saves use version checks `apps/api/src/tailor/tailored-routes.ts:59` -> `TemplateBody.parse`; `apps/api/src/tailor/tailored-routes.ts:101` -> `LetterEditSchema.parse`; `apps/api/src/tailor/supabase-repo.ts:143` -> `template`; `apps/api/src/tailor/supabase-repo.ts:149` -> `cover_letter`.
