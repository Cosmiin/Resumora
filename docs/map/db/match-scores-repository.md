---
id: db/match-scores-repository
area: db
files: ["apps/api/src/tailor/repo.ts","apps/api/src/tailor/supabase-repo.ts","apps/api/src/tailor/memory-repo.ts"]
depends_on: ["db/tailoring-tables","db/base-cv","db/jobs","shared/cv","shared/stored-cv","shared/tailoring","shared/match-score"]
contract: false
checked_hash: 5c6e48f8
cited: [734cf6, 1b996c, 9afb74, 188f0b, 0cdedd, f26157, c09742, 8a4caf, b8d237, f041c3, b656f2, f041c3, bbfcfb, 573ab7, dc1f49, c09742, 61e432, c06cae, 39c0ad, 59a61a, e428af, 14055c, f13f46, 70c56b, cb7207, 7cf99d, 664da5, 14cb8f, 80db86, 1753ed, 223dc1, 291638, c09742, 70050f]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Store match-score history and provide privileged base-CV scoring access for the job worker.

- ScoreTarget distinguishes base and tailored scores. `apps/api/src/tailor/repo.ts:4` -> `ScoreTarget`
- saveScore inserts a new row, embedding capped inside parts JSON; getScore extracts it and parses MatchScoreSchema after taking the newest matching created_at row. Omitting tailoredCvId leaves that filter absent. `apps/api/src/tailor/supabase-repo.ts:26` -> `capped`, `apps/api/src/tailor/supabase-repo.ts:34` -> `tailoredCvId !== undefined`, `apps/api/src/tailor/supabase-repo.ts:38` -> `capped`
- Queue-only admin uses privileged access, explicitly filters base CV by user and score by user/job/base/null tailored ID, and writes base scores directly. `apps/api/src/tailor/supabase-repo.ts:214` -> `createClient`, `apps/api/src/tailor/supabase-repo.ts:219` -> `eq("user_id"`, `apps/api/src/tailor/supabase-repo.ts:227` -> `is("tailored_cv_id", null)`, `apps/api/src/tailor/supabase-repo.ts:235` -> `insert`
- Fake scores replace one row per user/job/target/document instead of retaining SQL history. `apps/api/src/tailor/memory-repo.ts:133` -> `store.delete`, `apps/api/src/tailor/memory-repo.ts:134` -> `store.set`, `apps/api/src/tailor/supabase-repo.ts:22` -> `insert`
- Fake score writes do not validate parent ownership or shared-schema shape; SQL checks the parent and the adapter parses read results. `apps/api/src/tailor/memory-repo.ts:134` -> `store.set`, `supabase/migrations/20261108000000_tailoring.sql:111` -> `exists`, `apps/api/src/tailor/supabase-repo.ts:39` -> `MatchScoreSchema.parse`
- Fake admin getScore lacks SQL admin's null tailored ID filter. `apps/api/src/tailor/memory-repo.ts:155` -> `repo.getScore(jobId, "base")`, `apps/api/src/tailor/supabase-repo.ts:227` -> `is("tailored_cv_id", null)`

## Connections

- Uses the score-owner read policy: `apps/api/src/tailor/supabase-repo.ts:32` -> `match_scores` -> `supabase/migrations/20261108000000_tailoring.sql:107` -> `auth.uid()`.
- Job worker uses privileged current-CV and score methods after extraction: `apps/api/src/jobs/consumer.ts:34` -> `deps.baseCv` -> `apps/api/src/tailor/supabase-repo.ts:218` -> `baseCv`; `apps/api/src/jobs/consumer.ts:39` -> `scores.saveScore` -> `apps/api/src/tailor/supabase-repo.ts:234` -> `saveScore`; production wiring `apps/api/src/index.ts:76` -> `supabaseTailorAdmin` -> `apps/api/src/tailor/supabase-repo.ts:213` -> `supabaseTailorAdmin`.
- Web job-score URLs reach score handlers: `apps/web/src/jobs/jobs-api.ts:29` -> `/score`, `apps/web/src/jobs/jobs-api.ts:36` -> `/score`, `apps/web/src/tailor/tailor-api.ts:60` -> `/score` -> `apps/api/src/jobs/routes.ts:90` -> `app.get`, `apps/api/src/jobs/routes.ts:99` -> `app.post`.
- Score generation uses its prompt template: `apps/api/src/tailor/score.ts:51` -> `scoreSystemPrompt` -> `apps/api/src/tailor/score-prompts.ts:3` -> `scoreSystemPrompt`.

## Assumptions

- Request repository reads rely on RLS rather than explicit user predicates; queue-admin methods must instead receive a trusted user ID from the job owner. `apps/api/src/tailor/supabase-repo.ts:94` -> `eq("id", id)`, `apps/api/src/tailor/supabase-repo.ts:227` -> `eq("user_id", userId)`, `apps/api/src/jobs/consumer.ts:32` -> `work.userId`
