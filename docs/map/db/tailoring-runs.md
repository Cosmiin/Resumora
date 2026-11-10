---
id: db/tailoring-runs
area: db
files: ["apps/api/src/tailor/repo.ts","apps/api/src/tailor/supabase-repo.ts","apps/api/src/tailor/memory-repo.ts"]
depends_on: ["db/tailoring-tables","db/tailoring-repository","db/jobs","shared/tailoring"]
contract: false
checked_hash: 5c6e48f8
cited: [b1d742, d7f24b, 5061de, f1e47c, edc186, 9c9f6c, d893f0, 451c51, 569300, fa8122, 96e073, 1d1152, e2c3f3, fc9d94, 3d891c, 4e5696, 066e9a, 5a6b35, d1fbfa, 8be03c, 15154d, 0047c8, fc9d94, 8fe5a2, 49b3d7, df6ebf, 4d0064, c70c38, a4709c, d90b23, 6faba3, 9984fb, 10e202, fccb29, 3a582f, 4b4600, 614648, 5f4e20, 82f1ab, f56a16, c63989, ae5461, 2b1539, a930aa, dc9c07, 92b928, f5c065, 04db0c, 1ebd4b, 61d6ff, 46575b, 2bd8c7, cd46dc, 84752b, 126931, 569300, df2887]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Persist resumable tailoring runs, steering preferences and cached tone examples.

- RunChanges exposes a limited partial set of run fields without an expected version. `apps/api/src/tailor/repo.ts:79` -> `RunChanges`
- getSteering tolerates invalid steering JSON by substituting an empty object, then merges the tone/instruction columns; setSteering writes all three without incrementing version or updated_at. `apps/api/src/tailor/supabase-repo.ts:52` -> `SteeringSchema.safeParse`, `apps/api/src/tailor/supabase-repo.ts:54` -> `withColumns`, `apps/api/src/tailor/supabase-repo.ts:58` -> `update`
- createRun starts running and defaults current_role_id to the first supplied role unless explicitly provided; latestRun picks newest created_at regardless of status. `apps/api/src/tailor/supabase-repo.ts:155` -> `tailor_runs`, `apps/api/src/tailor/supabase-repo.ts:163` -> `status: "running"`, `apps/api/src/tailor/supabase-repo.ts:164` -> `current_role_id`
- updateRun writes only defined change fields, updates time and parses the returned row; tone examples are schema-checked on read and written to jobs without changing its version/time. `apps/api/src/tailor/supabase-repo.ts:175` -> `columns`, `apps/api/src/tailor/supabase-repo.ts:183` -> `update(columns)`, `apps/api/src/tailor/supabase-repo.ts:190` -> `ToneExamplesSchema.safeParse`, `apps/api/src/tailor/supabase-repo.ts:194` -> `update`
- Fake tone examples are keyed only by jobId and read/written without owner checks, unlike SQL jobs RLS; sharing MemoryTailorDocs across users can expose another user's cache. `apps/api/src/tailor/memory-repo.ts:125` -> `docs.toneExamples.get`, `apps/api/src/tailor/memory-repo.ts:129` -> `docs.toneExamples.set`, `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid()`
- Fake run creation does not check that parent jobs or documents exist and belong to the user; SQL foreign keys and RLS check those references. `apps/api/src/tailor/memory-repo.ts:112` -> `docs.runs.set`, `supabase/migrations/20261108000000_tailoring.sql:88` -> `exists`, `supabase/migrations/20261108000000_tailoring.sql:90` -> `public.tailored_cvs`
- Fake latestRun uses reversed map insertion order; SQL picks the newest creation timestamp. `apps/api/src/tailor/memory-repo.ts:104` -> `reverse()`, `apps/api/src/tailor/supabase-repo.ts:156` -> `order("created_at"`

## Connections

- Uses run-owner and job-owner policies for reads: `apps/api/src/tailor/supabase-repo.ts:170` -> `tailor_runs` -> `supabase/migrations/20261108000000_tailoring.sql:84` -> `auth.uid()`; `apps/api/src/tailor/supabase-repo.ts:188` -> `from("jobs")` -> `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid()`.
- Web start/run/tone URLs reach tailoring handlers: `apps/web/src/tailor/tailor-api.ts:23` -> `/tailor`, `apps/web/src/tailor/tailor-api.ts:8` -> `/v1/tailor-runs`, `apps/web/src/tailor/tailor-api.ts:67` -> `/tone-examples` -> `apps/api/src/tailor/routes.ts:36` -> `/jobs/:id/tailor`, `apps/api/src/tailor/routes.ts:67` -> `/tailor-runs/:id`, `apps/api/src/tailor/routes.ts:49` -> `/tone-examples`.
- Web questions/run/accept/answers URLs mutate resumable runs: `apps/web/src/tailor/tailor-api.ts:34` -> `/questions`, `apps/web/src/tailor/tailor-api.ts:46` -> `/run`, `apps/web/src/tailor/tailor-api.ts:53` -> `/accept`, `apps/web/src/tailor/tailor-api.ts:41` -> `/answers` -> `apps/api/src/tailor/routes.ts:69` -> `/questions`, `apps/api/src/tailor/routes.ts:80` -> `/run`, `apps/api/src/tailor/routes.ts:93` -> `/accept`, `apps/api/src/tailor/routes.ts:140` -> `/answers`.
- Web role redo/accept/steering URLs reach run handlers: `apps/web/src/tailor/tailor-api.ts:75` -> `/redo`, `apps/web/src/tailor/tailor-api.ts:82` -> `/accept`, `apps/web/src/tailor/tailor-api.ts:89` -> `/steering`, `apps/web/src/tailor/tailor-api.ts:94` -> `/steering` -> `apps/api/src/tailor/routes.ts:104` -> `/redo`, `apps/api/src/tailor/routes.ts:114` -> `/accept`, `apps/api/src/tailor/routes.ts:125` -> `/steering`, `apps/api/src/tailor/routes.ts:133` -> `/steering`.
- Proposal generation and checking use section templates: `apps/api/src/tailor/section-pass.ts:166` -> `sectionSystemPrompt` -> `apps/api/src/tailor/section-prompts.ts:33` -> `sectionSystemPrompt`; `apps/api/src/tailor/section-pass.ts:198` -> `verifySystemPrompt` -> `apps/api/src/tailor/section-prompts.ts:66` -> `verifySystemPrompt`.
- Questions use their prompt template: `apps/api/src/tailor/questions.ts:102` -> `questionSystemPrompt` -> `apps/api/src/tailor/question-prompts.ts:3` -> `questionSystemPrompt`.
- Layout proposals and tone caches use separate prompt builders: `apps/api/src/tailor/layout-pass.ts:59` -> `layoutSystemPrompt` -> `apps/api/src/tailor/layout-pass.ts:13` -> `layoutSystemPrompt`; `apps/api/src/tailor/tone-examples.ts:36` -> `toneSystemPrompt` -> `apps/api/src/tailor/tone-examples.ts:10` -> `toneSystemPrompt`.

## Assumptions

- Run updates rely on RLS and do not compare an expected version; concurrent writes can replace the same fields. `apps/api/src/tailor/supabase-repo.ts:183` -> `update(columns).eq("id", id)`, `supabase/migrations/20261108000000_tailoring.sql:95` -> `auth.uid()`
