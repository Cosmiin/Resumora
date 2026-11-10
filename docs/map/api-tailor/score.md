---
id: api-tailor/score
area: api-tailor
files: ["apps/api/src/tailor/score.ts","apps/api/src/tailor/score-prompts.ts","apps/api/src/tailor/score.test.ts","apps/api/src/tailor/fake-model.ts"]
depends_on: ["shared/match-score","shared/tailoring","db/match-scores-repository","db/ai-log","api-core/call-model","api-core/job-queue","api-core/job-routes","api-enrich/score","api-tailor/strip-header","db/jobs-repository","api-tailor/accept-save"]
contract: true
checked_hash: d220ff0e
decisions: ["docs/decisions/0007-every-ai-call-goes-through-one-function.md"]
open: ["accepted: R12 duplicate base score on overlapping deliveries"]
---
Produce checked match labels for Score 1 and Score 2, then delegate numeric scoring to the shared scorer.

- Uses cheap tailor_score with ScoreLabelsSchema: labels are MatchLabelSchema values and cvSeniority uses the job seniority schema; output limit is 12000 `apps/api/src/tailor/score.ts:8` -> `ScoreLabelsSchema`; `apps/api/src/tailor/score.ts:48` -> `tailor_score`.
- Strips header before prompting and evidence checks; prompt excludes layout and sends indexed requirements and responsibilities, not the whole job `apps/api/src/tailor/score.ts:44` -> `stripHeader`; `apps/api/src/tailor/score-prompts.ts:17` -> `layout`.
- Unknown or repeated requirement refs fail; all r0..rN refs must appear. Invalid, repeated, empty or non-job-substring keyword refs are silently dropped `apps/api/src/tailor/score.ts:63` -> `requirements.has`; `apps/api/src/tailor/score.ts:66` -> `return false`; `apps/api/src/tailor/score.ts:71` -> `requirements`.
- A nonblank requirement/responsibility source requires at least one keyword in the raw reply, but every keyword may subsequently be dropped without failing `apps/api/src/tailor/score.ts:72` -> `reply.some`; `apps/api/src/tailor/score.ts:66` -> `return false`.
- Evidence sources are recursively collected string values, skipping layout, schemaVersion, locale, id, enrichedAt and every key ending Id; note questions, answers and timestamps are not otherwise excluded `apps/api/src/tailor/score.ts:10` -> `cvText`; `apps/api/src/tailor/score.ts:14` -> `enrichedAt`.
- Unless the language override returns met first (even for a model status of missing), evidence is split on literal ' | ' and each part trimmed; empty parts fail and every part must be a case-sensitive substring of an individual source. Unsupported evidence or model status missing then becomes missing with null evidence and inferred false `apps/api/src/tailor/score.ts:78` -> `parts`; `apps/api/src/tailor/score.ts:79` -> `part && text.some`; `apps/api/src/tailor/score.ts:84` -> `if (fluent)`; `apps/api/src/tailor/score.ts:85` -> `label.status`.
- Language-category fluent/advanced requirements can override model labels to met only when all recognized language names have matching C1/C2/native/fluent/advanced CV entries `apps/api/src/tailor/score.ts:20` -> `FLUENT_NEED`; `apps/api/src/tailor/score.ts:31` -> `fluent`; `apps/api/src/tailor/score.ts:35` -> `others.some`; `apps/api/src/tailor/score.ts:83` -> `fluentEvidence`.
- Kept inferred text can promote an inferred label when any evidence part is contained in it; then shared computeMatchScore calculates the result `apps/api/src/tailor/score.ts:89` -> `kept`; `apps/api/src/tailor/score.ts:93` -> `computeMatchScore`.
- Invalid JSON/schema replies retry in the gateway; exhausted calls and semantic label errors become 502 ai_failed here, without semantic retries `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:154` -> `ATTEMPTS_PER_PROVIDER`; `apps/api/src/tailor/score.ts:94` -> `catch`.
- The fake-model module only re-exports the enrichment fake; it is not a production scoring implementation `apps/api/src/tailor/fake-model.ts:1` -> `fakeModel`.
- tested by `apps/api/src/tailor/score.test.ts:25` -> `scoreMatch`.
- Overlapping deliveries can append competing Score 1 rows: start permits reclaiming processing jobs, finish updates by ID alone, and the consumer reads getScore before a separate saveScore. Both deliveries may repeat extraction and observe no score `apps/api/src/jobs/supabase-repo.ts:136` -> `data.status`; `apps/api/src/jobs/supabase-repo.ts:128` -> `eq("id", id)`; `apps/api/src/jobs/consumer.ts:28` -> `processJob`; `apps/api/src/jobs/consumer.ts:33` -> `getScore`; `apps/api/src/jobs/consumer.ts:39` -> `saveScore`.

## Connections

- Uses prompt templates `apps/api/src/tailor/score.ts:51` -> `scoreSystemPrompt`; `apps/api/src/tailor/score-prompts.ts:3` -> `scoreSystemPrompt`; `apps/api/src/tailor/score.ts:52` -> `scoreUserMessage`; `apps/api/src/tailor/score-prompts.ts:15` -> `scoreUserMessage`.
- Request scoring uses the authenticated log_ai_call allowlist for tailor_score; logging failure is swallowed by the gateway `apps/api/src/tailor/score.ts:48` -> `tailor_score`; `supabase/migrations/20261109220000_enrich_item_lines.sql:28` -> `tailor_score`; `apps/api/src/enrich/supabase-repo.ts:103` -> `rpc("log_ai_call"`; `supabase/migrations/20261109220000_enrich_item_lines.sql:7` -> `log_ai_call`; `apps/api/src/ai/call-model.ts:159` -> `catch`.
- Used by job queue after extraction: job messages are sent by job routes, consumed by handleJobMessage, and score errors are logged without retrying scoring; a delivery with no claimed work is acknowledged `apps/api/src/jobs/routes.ts:64` -> `queue.send`; `apps/api/src/jobs/consumer.ts:23` -> `msg.body.jobId`; `apps/api/src/jobs/consumer.ts:26` -> `msg.ack`; `apps/api/src/jobs/consumer.ts:36` -> `scoreMatch`; `apps/api/src/jobs/consumer.ts:45` -> `job score failed`.
- Used by browser score URLs: GET reads stored scores; POST fills absent base score rather than rescoring `apps/web/src/tailor/tailor-api.ts:60` -> `/score`; `apps/web/src/jobs/jobs-api.ts:37` -> `method: "POST"`; `apps/api/src/jobs/routes.ts:90` -> `app.get("/:id/score"`; `apps/api/src/jobs/routes.ts:99` -> `app.post("/:id/score"`; `apps/api/src/jobs/routes.ts:107` -> `scoreMatch`.
- Used by api-tailor/accept-save for Score 2 `apps/api/src/tailor/accept.ts:164` -> `scoreMatch`; `apps/api/src/tailor/score.ts:39` -> `scoreMatch`.
- Uses shared fake implementation through re-export `apps/api/src/tailor/fake-model.ts:1` -> `../enrich/fake-model.ts`; `apps/api/src/enrich/fake-model.ts:44` -> `fakeModel`.
- Uses shared numeric scoring after local label checks; queue-worker score logging instead uses direct job-admin inserts and bypasses log_ai_call. `apps/api/src/tailor/score.ts:93` -> `computeMatchScore`; `packages/shared/src/match-score.ts:84` -> `computeMatchScore`; `apps/api/src/index.ts:75` -> `logCall`; `apps/api/src/jobs/supabase-repo.ts:151` -> `ai_calls`.
- Job consumer claim and finish use db/jobs-repository paths allowing overlapping work; score writes append through db/match-scores-repository `apps/api/src/jobs/consumer.ts:25` -> `admin.start`; `apps/api/src/jobs/supabase-repo.ts:133` -> `async start`; `apps/api/src/jobs/consumer.ts:30` -> `admin.finish`; `apps/api/src/jobs/supabase-repo.ts:144` -> `async finish`; `apps/api/src/jobs/consumer.ts:39` -> `saveScore`; `apps/api/src/tailor/supabase-repo.ts:235` -> `insert`.

## Assumptions

- Substring evidence proves text occurrence, not that the label's meaning follows from the quote `apps/api/src/tailor/score.ts:79` -> `value.includes(part)`.
- Queue scoring relies on job-owned administrative access, while request scoring receives user repositories `apps/api/src/index.ts:76` -> `supabaseTailorAdmin`; `apps/api/src/tailor/supabase-repo.ts:219` -> `eq("user_id", userId)`; `apps/api/src/app.ts:87` -> `c.get("user")`.
- Duplicate base scores on overlapping deliveries are accepted by R12; reads choose the newest row. Preserve this trade-off unless explicitly asked to change it `docs/plans/2026-11-08-cv-tailoring.progress.md:59` -> `R12`; `apps/api/src/tailor/supabase-repo.ts:228` -> `order("created_at"`.
