---
id: api-tailor/eval
area: api-tailor
files: ["apps/api/eval/tailor/run.ts","apps/api/eval/tailor/run.eval.ts","apps/api/eval/tailor/README.md","apps/api/test/tailor-eval.test.ts"]
depends_on: ["shared/cv","shared/jobs","db/cv-repository","db/jobs-repository","db/tailoring-repository","api-core/app","api-core/call-model","api-tailor/score","api-tailor/routes","api-tailor/section-routes","api-tailor/eval-metrics"]
contract: false
checked_hash: d5cd3eb6
cited: [5851d4, 77a5d8, 2e157f, 23cad0, ff827d, eebb5f, 922e39, 996e71, 6ff603, a02b8d, bbecce, 51ba35, ef06db, 3373bf, ea2117, bd8557, 838efa, 4c7881, 9169da, 60fbc7, b183b2, 35522d, a083d9, ff827d, 4d0064, 922e39, 3a582f, 996e71, 4b4600, 9169da, e7799c, 679619, eacb3a, db66e3, 24d9ab, 0eefad, b362e0, 92e993, e9b03e, 47899a, 8973f2, 55aa6a, ae91fd, 259794, f3ad99, db6e69]
decisions: []
open: []
---
Run six synthetic pairs through scoring and HTTP tailoring with real or fake model dependencies.

- Loads exactly six schema-validated fixture pairs before running calls; fixtures.json is fixture data excluded from map ownership `apps/api/eval/tailor/run.ts:19` -> `FIXTURES`; `apps/api/eval/tailor/run.ts:27` -> `PairSchema`; `apps/api/eval/tailor/run.ts:48` -> `length(6)`.
- Creates an authenticated in-memory app and job, starts neutral tailoring, runs/accepts every section and role without asking questions or supplying decisions, then uses last accept's Score 2 `apps/api/eval/tailor/run.ts:157` -> `verifyToken`; `apps/api/eval/tailor/run.ts:181` -> `/tailor`; `apps/api/eval/tailor/run.ts:187` -> `const body`; `apps/api/eval/tailor/run.ts:188` -> `/run`; `apps/api/eval/tailor/run.ts:190` -> `/accept`; `apps/api/eval/tailor/run.ts:199` -> `score2`.
- The eval fake returns alternating requirement labels, one keyword, unchanged layout and empty verifier results. Experience reads only items.edit, reuses one model per pair and tracks unique role IDs across requests in CV order (including retries), and shortens text after the first two roles to six words; one tool guess exercises code checks `apps/api/eval/tailor/run.ts:267` -> `i % 2`; `apps/api/eval/tailor/run.ts:273` -> `results: []`; `apps/api/eval/tailor/run.ts:276` -> `input.order`; `apps/api/eval/tailor/run.ts:149` -> `runModel`; `apps/api/eval/tailor/run.ts:163` -> `runModel`; `apps/api/eval/tailor/run.ts:281` -> `roleIds`; `apps/api/eval/tailor/run.ts:283` -> `guessed`; `apps/api/eval/tailor/run.ts:287` -> `firstWords`.
- Manual runner validates fixtures, requires configured providers, evaluates pairs concurrently, writes RESULTS.md before asserting problems empty, and allows forty minutes `apps/api/eval/tailor/run.eval.ts:17` -> `loadPairs`; `apps/api/eval/tailor/run.eval.ts:20` -> `Promise.all`; `apps/api/eval/tailor/run.eval.ts:22` -> `writeFileSync`; `apps/api/eval/tailor/run.eval.ts:24` -> `toEqual([])`; `apps/api/eval/tailor/run.eval.ts:25` -> `40 * 60_000`.
- tested by `apps/api/test/tailor-eval.test.ts:8` -> `tailoring eval (fake model)`.

## Connections

- Uses route URL strings matching real handlers `apps/api/eval/tailor/run.ts:181` -> `/tailor`; `apps/api/src/tailor/routes.ts:36` -> `/jobs/:id/tailor`; `apps/api/eval/tailor/run.ts:188` -> `/run`; `apps/api/src/tailor/routes.ts:80` -> `/run`; `apps/api/eval/tailor/run.ts:190` -> `/accept`; `apps/api/src/tailor/routes.ts:93` -> `/accept`.
- Manual entrypoint calls runPair/report from the harness `apps/api/eval/tailor/run.eval.ts:20` -> `runPair`; `apps/api/eval/tailor/run.ts:127` -> `runPair`; `apps/api/eval/tailor/run.eval.ts:21` -> `report`; `apps/api/eval/tailor/run.ts:221` -> `report`.
- Uses api-tailor/eval-metrics for unsupported facts, PDF pages and cost `apps/api/eval/tailor/run.ts:201` -> `inventedFacts`; `apps/api/eval/tailor/run.ts:67` -> `inventedFacts`; `apps/api/eval/tailor/run.ts:202` -> `pageCount`; `apps/api/eval/tailor/run.ts:120` -> `pageCount`; `apps/api/eval/tailor/run.ts:207` -> `costOf`; `apps/api/eval/tailor/run.ts:84` -> `costOf`.

## Assumptions

- Fake/in-memory execution does not validate database RLS, RPCs or live model semantics; queue stubs do nothing and model logging stays in arrays `apps/api/eval/tailor/run.ts:161` -> `memoryTailorRepo`; `apps/api/eval/tailor/run.ts:164` -> `send: async`; `apps/api/eval/tailor/run.ts:298` -> `calls.push`.

- The fake rewords an ended role's shortened "Split" bullet as "Separated" so it satisfies the required English past-verb check without an extra retry; the long-career test still permits only its known page gap, with the cost limit unchanged. `apps/api/eval/tailor/run.ts:288` -> `bullet.text.replace`; `packages/shared/src/tense.ts:3` -> `PAST_VERBS`; `apps/api/test/tailor-eval.test.ts:16` -> `row.problems.join`; `apps/api/eval/tailor/run.ts:25` -> `costUsd: 0.05`.
