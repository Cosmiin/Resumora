---
id: api-core/app
area: api-core
files: ["apps/api/src/app.ts","apps/api/test/app.test.ts"]
depends_on: ["api-core/auth","api-core/errors","api-core/cv-routes","api-core/import-routes","api-core/job-routes","api-core/voice-session"]
contract: true
checked_hash: 35e86b1c
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md"]
open: []
---
Compose the HTTP API around the AppDeps injection contract.

- AppDeps requires origin, verifier, CV/import/job/insights factories, model access, both queue senders and a logger; tailorRepo, voice and clock are optional. Adding a required field changes all constructors below. `apps/api/src/app.ts:19` -> `AppDeps`, `apps/api/src/app.ts:28` -> `insightsRepo`, `apps/api/src/app.ts:34` -> `queue`
- Request ids are generated before downstream middleware and returned in x-request-id; incoming ids are not reused. `apps/api/src/app.ts:46` -> `app.use`
- CORS permits only the exact configured origin, exposes x-request-id, and accepts authorization/content-type. `apps/api/src/app.ts:55` -> `cors`
- Health is public; every /v1/* request requires the case-sensitive Bearer prefix and a verified user. `apps/api/src/app.ts:63` -> `/health`, `apps/api/src/app.ts:65` -> `/v1/*`
- Missing optional tailorRepo fails only when a job-score/tailoring factory is invoked. `apps/api/src/app.ts:85` -> `tailorRepoFor`, `apps/api/src/app.ts:99` -> `tailorFor`
- Unknown paths use the standard error envelope; thrown route errors go through toErrorResponse. `apps/api/src/app.ts:123` -> `app.notFound`
- tested by `apps/api/test/app.test.ts:31` -> `describe`

## Connections
- Production and tailoring-eval constructors: `apps/api/src/index.ts:36` -> `realDeps` and `apps/api/eval/tailor/run.ts:155` -> `AppDeps` supply `apps/api/src/app.ts:43` -> `createApp`.
- Uses CV and import route builders: `apps/api/src/app.ts:74` -> `cvRoutes` -> `apps/api/src/cv/routes.ts:39` -> `cvRoutes`; `apps/api/src/app.ts:77` -> `importRoutes` -> `apps/api/src/imports/routes.ts:19` -> `importRoutes`.
- Uses job and enrichment builders: `apps/api/src/app.ts:83` -> `jobRoutes` -> `apps/api/src/jobs/routes.ts:19` -> `jobRoutes`; `apps/api/src/app.ts:80` -> `enrichRoutes` -> `apps/api/src/enrich/routes.ts:36` -> `enrichRoutes`.
- Uses both tailoring builders under /v1: `apps/api/src/app.ts:96` -> `tailorRoutes` -> `apps/api/src/tailor/routes.ts:26` -> `tailorRoutes`; `apps/api/src/app.ts:111` -> `tailoredRoutes` -> `apps/api/src/tailor/tailored-routes.ts:23` -> `tailoredRoutes`.
- AppDeps constructor coverage, tested by `apps/api/test/app.test.ts:5` -> `AppDeps`, `apps/api/test/cv.test.ts:24` -> `createApp`, `apps/api/test/cv-history.test.ts:14` -> `createApp`, `apps/api/test/imports.test.ts:27` -> `createApp`, `apps/api/test/jobs.test.ts:36` -> `deps`, `apps/api/src/ai/voice-session.test.ts:87` -> `createApp`; contract `apps/api/src/app.ts:19` -> `AppDeps`.
- Enrichment constructors, tested by `apps/api/src/enrich/achievements.test.ts:26` -> `createApp`, `apps/api/src/enrich/brain-dump.test.ts:57` -> `createApp`, `apps/api/src/enrich/improve.test.ts:48` -> `createApp`, `apps/api/src/enrich/item-lines.test.ts:28` -> `createApp`, `apps/api/src/enrich/rewrite.test.ts:121` -> `createApp`, `apps/api/src/enrich/role-description.test.ts:33` -> `createApp`, `apps/api/src/enrich/role-facts.test.ts:36` -> `createApp`, `apps/api/src/enrich/routes.test.ts:21` -> `createApp` and `apps/api/src/enrich/routes.test.ts:76` -> `createApp`; contract `apps/api/src/app.ts:19` -> `AppDeps`.
- Tailoring constructors, tested by `apps/api/test/tailor-accept.test.ts:50` -> `AppDeps`, `apps/api/test/tailor-letter.test.ts:55` -> `AppDeps`, `apps/api/test/tailor-projects.test.ts:49` -> `AppDeps`, `apps/api/test/tailor-light.test.ts:50` -> `AppDeps`, `apps/api/test/tailor-questions.test.ts:52` -> `AppDeps`, `apps/api/test/tailor-redo.test.ts:46` -> `AppDeps`, `apps/api/test/tailor-retailor.test.ts:50` -> `AppDeps`, `apps/api/test/tailor-section.test.ts:40` -> `AppDeps`, `apps/api/test/tailor-start.test.ts:31` -> `AppDeps`, `apps/api/test/tailor-tone.test.ts:42` -> `AppDeps`, `apps/api/test/tailor-translate.test.ts:44` -> `AppDeps`, `apps/api/test/tailored.test.ts:28` -> `AppDeps`; contract `apps/api/src/app.ts:19` -> `AppDeps`.

## Assumptions
- Repository factories must preserve the authenticated identity; routing passes the context user without checking row ownership itself. `apps/api/src/app.ts:74` -> `c.get("user")`, `apps/api/src/app.ts:84` -> `deps.jobRepo`
