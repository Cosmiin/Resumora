---
id: api-tailor/eval
area: api-tailor
files: ["apps/api/eval/tailor/run.ts","apps/api/eval/tailor/run.eval.ts","apps/api/eval/tailor/README.md","apps/api/test/tailor-eval.test.ts"]
depends_on: ["shared/cv","shared/jobs","db/cv-repository","db/jobs-repository","db/tailoring-repository","api-core/app","api-core/call-model","api-tailor/score","api-tailor/routes","api-tailor/section-routes","api-tailor/eval-metrics"]
contract: false
checked_hash: bcb42a88
decisions: []
open: []
---
Run six synthetic pairs through scoring and HTTP tailoring with real or fake model dependencies.

- Loads exactly six schema-validated fixture pairs before running calls; fixtures.json is fixture data excluded from map ownership `apps/api/eval/tailor/run.ts:19` -> `FIXTURES`; `apps/api/eval/tailor/run.ts:27` -> `PairSchema`; `apps/api/eval/tailor/run.ts:48` -> `length(6)`.
- Creates an authenticated in-memory app and job, starts neutral tailoring, runs/accepts every section and role without asking questions or supplying decisions, then uses last accept's Score 2 `apps/api/eval/tailor/run.ts:157` -> `verifyToken`; `apps/api/eval/tailor/run.ts:181` -> `/tailor`; `apps/api/eval/tailor/run.ts:187` -> `const body`; `apps/api/eval/tailor/run.ts:188` -> `/run`; `apps/api/eval/tailor/run.ts:190` -> `/accept`; `apps/api/eval/tailor/run.ts:199` -> `score2`.
- The eval fake returns alternating requirement labels, one keyword, unchanged layout and empty verifier results; old role text is shortened to six words and one tool guess exercises code checks `apps/api/eval/tailor/run.ts:266` -> `i % 2`; `apps/api/eval/tailor/run.ts:272` -> `results: []`; `apps/api/eval/tailor/run.ts:275` -> `input.order`; `apps/api/eval/tailor/run.ts:283` -> `guessed`; `apps/api/eval/tailor/run.ts:287` -> `firstWords`.
- Manual runner validates fixtures, requires configured providers, evaluates pairs concurrently, writes RESULTS.md before asserting problems empty, and allows forty minutes `apps/api/eval/tailor/run.eval.ts:17` -> `loadPairs`; `apps/api/eval/tailor/run.eval.ts:20` -> `Promise.all`; `apps/api/eval/tailor/run.eval.ts:22` -> `writeFileSync`; `apps/api/eval/tailor/run.eval.ts:24` -> `toEqual([])`; `apps/api/eval/tailor/run.eval.ts:25` -> `40 * 60_000`.
- tested by `apps/api/test/tailor-eval.test.ts:8` -> `tailoring eval (fake model)`.

## Connections

- Uses route URL strings matching real handlers `apps/api/eval/tailor/run.ts:181` -> `/tailor`; `apps/api/src/tailor/routes.ts:36` -> `/jobs/:id/tailor`; `apps/api/eval/tailor/run.ts:188` -> `/run`; `apps/api/src/tailor/routes.ts:80` -> `/run`; `apps/api/eval/tailor/run.ts:190` -> `/accept`; `apps/api/src/tailor/routes.ts:93` -> `/accept`.
- Manual entrypoint calls runPair/report from the harness `apps/api/eval/tailor/run.eval.ts:20` -> `runPair`; `apps/api/eval/tailor/run.ts:127` -> `runPair`; `apps/api/eval/tailor/run.eval.ts:21` -> `report`; `apps/api/eval/tailor/run.ts:221` -> `report`.
- Uses api-tailor/eval-metrics for unsupported facts, PDF pages and cost `apps/api/eval/tailor/run.ts:201` -> `inventedFacts`; `apps/api/eval/tailor/run.ts:67` -> `inventedFacts`; `apps/api/eval/tailor/run.ts:202` -> `pageCount`; `apps/api/eval/tailor/run.ts:120` -> `pageCount`; `apps/api/eval/tailor/run.ts:207` -> `costOf`; `apps/api/eval/tailor/run.ts:84` -> `costOf`.

## Assumptions

- Fake/in-memory execution does not validate database RLS, RPCs or live model semantics; queue stubs do nothing and model logging stays in arrays `apps/api/eval/tailor/run.ts:161` -> `memoryTailorRepo`; `apps/api/eval/tailor/run.ts:164` -> `send: async`; `apps/api/eval/tailor/run.ts:298` -> `calls.push`.
