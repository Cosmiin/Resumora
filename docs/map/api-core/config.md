---
id: api-core/config
area: api-core
files: ["apps/api/package.json","apps/api/tsconfig.json","apps/api/vitest.eval.config.ts","apps/api/wrangler.jsonc"]
depends_on: ["api-core/worker","api-core/environment"]
contract: true
checked_hash: ffa5adb4
cited: [598868, c5ea60, 624b78, e3416c, 61c33d, f3e409, 4a56c3, 48cdb8, f5b702, 33da27, 8dd2a6, 8a55ac, 8a55ac, 5eb4e0, 4f2b8b, 511931, 598868, db2706, b96d03, e3416c, e7027d, 61c33d, f3e409, 28452d, 4a56c3, 8506da, 33da27, c0244b, 4f2b8b, 3052c5, a3f618]
decisions: ["docs/decisions/0004-imports-go-through-a-queue.md","docs/decisions/0007-every-ai-call-goes-through-one-function.md"]
open: []
---
Configure Worker bindings, build/type checks and separate live-model evaluation commands.

- Worker entry is src/index.ts with nodejs_compat; cron runs every five minutes. `apps/api/wrangler.jsonc:3` -> `main`, `apps/api/wrangler.jsonc:5` -> `nodejs_compat`, `apps/api/wrangler.jsonc:8` -> `crons`
- IMPORTS and JOBS bind named producer queues; consumers use batch size one, with three import retries and two job retries. `apps/api/wrangler.jsonc:11` -> `IMPORTS`, `apps/api/wrangler.jsonc:12` -> `JOBS`, `apps/api/wrangler.jsonc:15` -> `max_retries`, `apps/api/wrangler.jsonc:16` -> `max_retries`
- dev starts Wrangler on loopback port 8788; build is a deployment dry run writing dist, and typecheck runs tsc without emit. `apps/api/package.json:6` -> `dev`
- Evaluation scripts select their own config and area, whereas test invokes vitest run; eval generation bundles source before running it with Node. `apps/api/package.json:7` -> `test`, `apps/api/package.json:10` -> `eval:import`, `apps/api/package.json:14` -> `eval:generate`
- Typechecking includes src, test and eval with both Worker and Node types; scripts is not in include. `apps/api/tsconfig.json:3` -> `types`, `apps/api/tsconfig.json:4` -> `include`
- Eval config reads EVAL_DEV_VARS or its package-local vars file, parses assignment lines and injects values into test env; only eval/**/*.eval.ts runs, with ten-minute test/hook timeouts. `apps/api/vitest.eval.config.ts:10` -> `EVAL_DEV_VARS`, `apps/api/vitest.eval.config.ts:13` -> `readFileSync`, `apps/api/vitest.eval.config.ts:23` -> `include`

## Connections
- Entry file and Worker export: `apps/api/wrangler.jsonc:3` -> `src/index.ts` -> `apps/api/src/index.ts:61` -> `export default`.
- Binding types and producers: `apps/api/src/env.ts:16` -> `IMPORTS` -> `apps/api/wrangler.jsonc:11` -> `IMPORTS`; `apps/api/src/env.ts:17` -> `JOBS` -> `apps/api/wrangler.jsonc:12` -> `JOBS`.
- Dispatch must track configured queue names exactly: `apps/api/wrangler.jsonc:15` -> `resumora-imports` -> `apps/api/src/index.ts:28` -> `resumora-imports`; `apps/api/wrangler.jsonc:16` -> `resumora-jobs` -> `apps/api/src/index.ts:26` -> `resumora-jobs`.
- Manual evaluation config is selected by package scripts: `apps/api/package.json:10` -> `vitest.eval.config.ts` -> `apps/api/vitest.eval.config.ts:21` -> `defineConfig`.

## Assumptions
- Evaluations and diagnostics load vars files in their own execution; documenting them does not require executing those commands. `apps/api/vitest.eval.config.ts:13` -> `readFileSync`, `apps/api/scripts/check-pdf-input.ts:22` -> `readVars`, `apps/api/scripts/check-voice-session.ts:14` -> `readVars`
