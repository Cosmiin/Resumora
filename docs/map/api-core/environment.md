---
id: api-core/environment
area: api-core
files: ["apps/api/src/env.ts","apps/api/.dev.vars.example"]
depends_on: ["api-core/worker","api-core/auth","api-core/call-model","api-core/config"]
contract: true
checked_hash: 23c276e6
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md","docs/decisions/0007-every-ai-call-goes-through-one-function.md"]
open: []
---
Define runtime environment names, queue binding types and the request identity passed to repositories.

- Runtime reads SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and APP_ORIGIN. `apps/api/src/auth.ts:12` -> `SUPABASE_URL`, `apps/api/src/imports/supabase-repo.ts:88` -> `SUPABASE_SERVICE_ROLE_KEY`, `apps/api/src/index.ts:38` -> `APP_ORIGIN`
- Runtime reads OPENROUTER_API_KEY, OPENROUTER_MODEL, optional OPENROUTER_MODEL_STRONG, OPENAI_API_KEY, OPENAI_MODEL and optional OPENAI_MODEL_STRONG. `apps/api/src/ai/call-model.ts:81` -> `OPENROUTER_API_KEY`, `apps/api/src/ai/call-model.ts:82` -> `OPENROUTER_MODEL_STRONG`, `apps/api/src/ai/call-model.ts:85` -> `OPENAI_API_KEY`, `apps/api/src/ai/call-model.ts:86` -> `OPENAI_MODEL_STRONG`
- The example declares those names; values are deliberately omitted from this map. `apps/api/.dev.vars.example:2` -> `SUPABASE_URL`, `apps/api/.dev.vars.example:3` -> `SUPABASE_ANON_KEY`, `apps/api/.dev.vars.example:4` -> `SUPABASE_SERVICE_ROLE_KEY`, `apps/api/.dev.vars.example:5` -> `APP_ORIGIN`, `apps/api/.dev.vars.example:10` -> `OPENROUTER_API_KEY`, `apps/api/.dev.vars.example:11` -> `OPENROUTER_MODEL`, `apps/api/.dev.vars.example:12` -> `OPENAI_API_KEY`, `apps/api/.dev.vars.example:13` -> `OPENAI_MODEL`, `apps/api/.dev.vars.example:16` -> `OPENROUTER_MODEL_STRONG`, `apps/api/.dev.vars.example:17` -> `OPENAI_MODEL_STRONG`
- Strong model names are optional; the base provider/key names are required by the Env type. `apps/api/src/env.ts:9` -> `OPENROUTER_API_KEY`, `apps/api/src/env.ts:11` -> `OPENROUTER_MODEL_STRONG?`, `apps/api/src/env.ts:12` -> `OPENAI_API_KEY`, `apps/api/src/env.ts:14` -> `OPENAI_MODEL_STRONG?`
- AuthUser holds id and token; SupabaseEnv restricts request repository configuration to the URL and anonymous key. `apps/api/src/env.ts:21` -> `AuthUser`, `apps/api/src/env.ts:24` -> `SupabaseEnv`
- IMPORTS carries importId/userId and JOBS uses JobMessage; these are compile-time queue declarations. `apps/api/src/env.ts:16` -> `IMPORTS`, `apps/api/src/env.ts:17` -> `JOBS`

## Connections
- Environment origin reaches CORS through dependency construction: `apps/api/src/index.ts:38` -> `APP_ORIGIN` -> `apps/api/src/app.ts:56` -> `appOrigin`.
- Model configuration is read when real dependencies supply providers: `apps/api/src/index.ts:46` -> `providersFromEnv` -> `apps/api/src/ai/call-model.ts:76` -> `providersFromEnv`.
- Queue types match configured bindings: `apps/api/src/env.ts:16` -> `IMPORTS` -> `apps/api/wrangler.jsonc:11` -> `IMPORTS`; `apps/api/src/env.ts:17` -> `JOBS` -> `apps/api/wrangler.jsonc:12` -> `JOBS`.
- Voice takes the OpenAI key from the same environment: `apps/api/src/index.ts:52` -> `OPENAI_API_KEY` -> `apps/api/src/ai/voice-session.ts:64` -> `apiKey`.

## Assumptions
- Env is a TypeScript declaration, not runtime validation; provider selection silently drops incomplete model/key pairs. `apps/api/src/env.ts:3` -> `Env`, `apps/api/src/ai/call-model.ts:89` -> `filter`
- The narrower SupabaseEnv type is the request-side boundary; privileged queue clients accept the service-role name separately. `apps/api/src/env.ts:24` -> `SupabaseEnv`, `apps/api/src/imports/supabase-repo.ts:87` -> `SUPABASE_SERVICE_ROLE_KEY`, `apps/api/src/jobs/supabase-repo.ts:123` -> `SUPABASE_SERVICE_ROLE_KEY`
