---
id: db/tailoring-repository
area: db
files: ["apps/api/src/tailor/repo.ts","apps/api/src/tailor/supabase-repo.ts","apps/api/src/tailor/memory-repo.ts"]
depends_on: ["db/tailoring-tables","db/tailoring-runs","db/tailoring-translations","db/match-scores-repository","shared/cv","shared/stored-cv","shared/tailoring"]
contract: false
checked_hash: 5c6e48f8
cited: [486972, b656f2, dacbb5, 8bfd99, 5540ff, 0640b6, d6bb42, 8a1af4, 8b5a35, aac334, 457057, 5ec046, 45f374, 55ef6b, 7cde2c, cdea93, db8f9d, fbb7d0, a2afa9, a8a002, 316445, cb993a, 291638, deb3ff, 68525a, 68008b, 0fda38, 8e9a8b, 65b44e, 41c62d, f154be, 646413, 8db4ef, 26f36d, 9f45d4, 3d90d9, 46fb5a, e71dd8, f98040, 4bd0b3, b652bf, 8486ef, b1a554, e06955, 291638, deb3ff, 7cde2c, f83533, 0640b6]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Create, read and save tailored documents with version checks and separate template and letter writes.

- The Supabase implementation uses the user's bearer token and table queries, not custom tailoring RPCs. `apps/api/src/tailor/supabase-repo.ts:18` -> `Authorization`, `apps/api/src/tailor/supabase-repo.ts:22` -> `from("match_scores").insert`
- createTailoredCv stores the same content as current content and base snapshot and maps any 23505 insertion error to exists. `apps/api/src/tailor/supabase-repo.ts:65` -> `content: input.content`, `apps/api/src/tailor/supabase-repo.ts:66` -> `base_snapshot`, `apps/api/src/tailor/supabase-repo.ts:69` -> `23505`
- readTailoredCv parses both current/base content through storedCv and validates the full response; steering is read through the separate steering method, not TAILORED_COLUMNS. `apps/api/src/tailor/supabase-repo.ts:97` -> `TailoredCvSchema.parse`, `apps/api/src/tailor/supabase-repo.ts:99` -> `storedCv`, `apps/api/src/tailor/supabase-repo.ts:200` -> `TAILORED_COLUMNS`
- saveTailoredCv writes content/review/score and increments version only on a matching version; absent and stale rows both return conflict. `apps/api/src/tailor/supabase-repo.ts:79` -> `update`, `apps/api/src/tailor/supabase-repo.ts:84` -> `conflict`
- Editor saveTailoredContent updates only content/version/time and distinguishes missing rows from conflicts through a second read. `apps/api/src/tailor/supabase-repo.ts:106` -> `update`, `apps/api/src/tailor/supabase-repo.ts:112` -> `current.data`
- Template and cover-letter writes update updated_at without a version check or bump. `apps/api/src/tailor/supabase-repo.ts:143` -> `update`, `apps/api/src/tailor/supabase-repo.ts:149` -> `update`
- Fake document creation does not check that the parent job exists or belongs to the user; SQL foreign keys and RLS reject those writes. `apps/api/src/tailor/memory-repo.ts:45` -> `docs.cvs.set`, `supabase/migrations/20261108000000_tailoring.sql:10` -> `references public.jobs`, `supabase/migrations/20261108000000_tailoring.sql:73` -> `exists`
- Fake document lists use map insertion order rather than SQL creation timestamps. `apps/api/src/tailor/memory-repo.ts:52` -> `docs.cvs.values()`, `apps/api/src/tailor/supabase-repo.ts:88` -> `order("created_at"`

- RUN_COLUMNS is a hand-kept select list and toRun explicitly maps snake_case columns to camelCase fields; a new run field needs both updated to reach the returned TailorRun. `apps/api/src/tailor/supabase-repo.ts:201` -> `RUN_COLUMNS`, `apps/api/src/tailor/supabase-repo.ts:203` -> `toRun`, `apps/api/src/tailor/supabase-repo.ts:205` -> `userId: row.user_id`

## Connections

- Uses the document owner policy: `apps/api/src/tailor/supabase-repo.ts:94` -> `tailored_cvs` -> `supabase/migrations/20261108000000_tailoring.sql:69` -> `auth.uid()`.
- Web document list/read/save URLs reach tailored handlers: `apps/web/src/tailor/tailored-api.ts:15` -> `/tailored`, `apps/web/src/tailor/tailored-api.ts:9` -> `/v1/tailored`, `apps/web/src/tailor/tailored-api.ts:25` -> `method: "PUT"` -> `apps/api/src/tailor/tailored-routes.ts:37` -> `/jobs/:id/tailored`, `apps/api/src/tailor/tailored-routes.ts:43` -> `/tailored/:id`, `apps/api/src/tailor/tailored-routes.ts:49` -> `app.put`.
- Web review/retailor URLs reach document handlers: `apps/web/src/tailor/tailored-api.ts:32` -> `/review`, `apps/web/src/tailor/tailored-api.ts:37` -> `/retailor` -> `apps/api/src/tailor/tailored-routes.ts:65` -> `/review`, `apps/api/src/tailor/tailored-routes.ts:73` -> `/retailor`.
- Web letter/template URLs reach document handlers: `apps/web/src/tailor/tailored-api.ts:53` -> `/cover-letter`, `apps/web/src/tailor/tailored-api.ts:60` -> `/cover-letter`, `apps/web/src/tailor/tailored-api.ts:65` -> `PATCH` -> `apps/api/src/tailor/tailored-routes.ts:90` -> `/cover-letter`, `apps/api/src/tailor/tailored-routes.ts:99` -> `/cover-letter`, `apps/api/src/tailor/tailored-routes.ts:57` -> `app.patch`.
- Letter generation and checks use separate prompts: `apps/api/src/tailor/letter.ts:48` -> `letterSystemPrompt` -> `apps/api/src/tailor/letter-prompts.ts:5` -> `letterSystemPrompt`; `apps/api/src/tailor/letter.ts:55` -> `letterVerifySystemPrompt` -> `apps/api/src/tailor/letter-prompts.ts:26` -> `letterVerifySystemPrompt`.

## Assumptions

- Request document reads rely on RLS rather than explicit user predicates. `apps/api/src/tailor/supabase-repo.ts:94` -> `eq("id", id)`, `supabase/migrations/20261108000000_tailoring.sql:69` -> `auth.uid()`
- Fake documents bypass SQL references and shared-schema parsing; successful fake writes do not prove that database writes or readTailoredCv will accept the same runtime data. `apps/api/src/tailor/memory-repo.ts:45` -> `docs.cvs.set`, `apps/api/src/tailor/memory-repo.ts:57` -> `structuredClone`, `apps/api/src/tailor/supabase-repo.ts:97` -> `TailoredCvSchema.parse`
