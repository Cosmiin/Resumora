---
id: api-tailor/section-routes
area: api-tailor
files: ["apps/api/src/tailor/routes.ts"]
depends_on: ["shared/tailoring","api-core/errors","api-tailor/routes","api-tailor/questions","api-tailor/answers","api-tailor/section-pass","api-tailor/layout-pass","api-tailor/accept","api-tailor/redo"]
contract: true
checked_hash: 7fe72d97
cited: [01194f, 30b3e2, 6d4d5a, 8d1d94, ab37ec, f3804e, ec0866, e78169, 813f5c, 6a115e, 262678, 0921a4, 30a720, 510e15, 262678, 28b78a, 838056, d90b23, fccb29, 6faba3, 3a582f, 9984fb, 4b4600, 10e202, 614648, 5f4e20, ae5461, 82f1ab, 2b1539, 64e5a1, 4bb7f2, eda562, a297d5]
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md","docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
Dispatch section questions, passes, acceptance, answers and role redo through synchronous HTTP handlers.

- Question/run URLs parse section and optional roleId; malformed JSON yields an empty role body. Both require job extraction and supply current Base CV, except layout reads its own tailored document `apps/api/src/tailor/routes.ts:23` -> `roleBody`; `apps/api/src/tailor/routes.ts:73` -> `!job.extracted`; `apps/api/src/tailor/routes.ts:75` -> `deps.cvFor(c).get`; `apps/api/src/tailor/routes.ts:85` -> `"layout"`; `apps/api/src/tailor/routes.ts:89` -> `deps.cvFor(c).get`.
- Ordinary accept uses AcceptBodySchema defaults. Role-specific accept first requires finishedRole, derives its section from current Base CV with experience fallback, and invokes redo acceptance `apps/api/src/tailor/routes.ts:95` -> `AcceptBodySchema.parse`; `apps/api/src/tailor/routes.ts:117` -> `finishedRole`; `apps/api/src/tailor/routes.ts:120` -> `stepOf`.
- Answers require 1..MAX_RUN_QUESTIONS AnswerSchema values; all write work is awaited before returning ok, with no queued tailoring message `apps/api/src/tailor/routes.ts:19` -> `AnswersBodySchema`; `apps/api/src/tailor/routes.ts:141` -> `AnswersBodySchema.parse`; `apps/api/src/tailor/routes.ts:143` -> `await saveAnswers`; `apps/api/src/tailor/routes.ts:144` -> `ok: true`.
- Guards for current steps are in section/accept services, not common run lookup; questions/answers and steering can reach existing done runs `apps/api/src/tailor/routes.ts:63` -> `!run || !job`; `apps/api/src/tailor/routes.ts:74` -> `askQuestions`; `apps/api/src/tailor/routes.ts:143` -> `saveAnswers`; `apps/api/src/tailor/section-pass.ts:117` -> `run.status === "done"`; `apps/api/src/tailor/accept.ts:94` -> `run.status === "done"`.

## Connections

- Used by web questions, pass, accept and answers URLs `apps/web/src/tailor/tailor-api.ts:34` -> `/questions`; `apps/api/src/tailor/routes.ts:69` -> `/questions`; `apps/web/src/tailor/tailor-api.ts:46` -> `/run`; `apps/api/src/tailor/routes.ts:80` -> `/run`; `apps/web/src/tailor/tailor-api.ts:53` -> `/accept`; `apps/api/src/tailor/routes.ts:93` -> `/accept`; `apps/web/src/tailor/tailor-api.ts:41` -> `/answers`; `apps/api/src/tailor/routes.ts:140` -> `/answers`.
- Used by web role redo and accept URLs `apps/web/src/tailor/tailor-api.ts:75` -> `/redo`; `apps/api/src/tailor/routes.ts:104` -> `/redo`; `apps/web/src/tailor/tailor-api.ts:82` -> `/accept`; `apps/api/src/tailor/routes.ts:114` -> `/accept`.
- Uses the api-tailor/routes run lookup before service dispatch `apps/api/src/tailor/routes.ts:72` -> `runWithJob`; `apps/api/src/tailor/routes.ts:58` -> `runWithJob`.

## Assumptions

- Synchronous retries can repeat AI work; the route neither caches request IDs nor checks that the supplied run is the document's latest run `apps/api/src/tailor/routes.ts:60` -> `getRun(id)`; `apps/api/src/tailor/routes.ts:88` -> `runSectionPass`.
