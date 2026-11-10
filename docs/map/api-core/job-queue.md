---
id: api-core/job-queue
area: api-core
files: ["apps/api/src/jobs/consumer.ts","apps/api/test/jobs-consumer.test.ts","apps/api/test/supabase-repo.test.ts"]
depends_on: ["api-core/job-processing","api-core/config","db/jobs-repository","db/match-scores-repository","db/ai-log"]
contract: true
checked_hash: e1535bac
decisions: []
open: []
---
Consume job messages and optionally score the extracted job against the base CV.

- Payload is {jobId:string,userId:string}; start uses jobId, then processing/scoring uses the stored work.userId. `apps/api/src/jobs/repo.ts:5` -> `JobMessage`, `apps/api/src/jobs/consumer.ts:23` -> `msg.body.jobId`, `apps/api/src/jobs/consumer.ts:32` -> `work.userId`
- start is inside the try block; absent or already-finished work is acknowledged immediately. `apps/api/src/jobs/consumer.ts:24` -> `try`
- Successful extraction is persisted before scoring; an existing base score skips scoring, and absent base CV only produces a log. `apps/api/src/jobs/consumer.ts:30` -> `admin.finish`, `apps/api/src/jobs/consumer.ts:33` -> `scores.getScore`, `apps/api/src/jobs/consumer.ts:41` -> `job score skipped`
- Scoring failures are logged and swallowed; the ready job remains ready and the message is acknowledged. `apps/api/src/jobs/consumer.ts:44` -> `catch`
- A processJob failure records its returned code and acknowledges rather than redelivering. `apps/api/src/jobs/consumer.ts:48` -> `admin.fail`
- Errors escaping to the consumer catch (such as storage failures) log only job id and attempt, retry after ten seconds before delivery three, then fail ai_failed and acknowledge. Processing exceptions caught by processJob instead return ai_failed and are acknowledged without retry. `apps/api/src/jobs/consumer.ts:53` -> `deps.log`, `apps/api/src/jobs/process.ts:33` -> `catch`, `apps/api/src/jobs/consumer.ts:48` -> `admin.fail`
- tested by `apps/api/test/jobs-consumer.test.ts:70` -> `job consumer`, `apps/api/test/jobs-consumer.test.ts:191` -> `queue dispatch`, `apps/api/test/jobs-consumer.test.ts:74` -> `handleJobMessage`

## Connections
- Completion has no status/version guard: `apps/api/src/jobs/consumer.ts:30` -> `admin.finish` -> `apps/api/src/jobs/supabase-repo.ts:145` -> `update` -> `apps/api/src/jobs/supabase-repo.ts:128` -> `eq("id", id)`. A late worker can overwrite a prior ready extraction or subsequent user edits written through `apps/api/src/jobs/supabase-repo.ts:103` -> `extracted`, even though those user edits check version and ready status at `apps/api/src/jobs/supabase-repo.ts:106` -> `expectedVersion`.

- Producer -> binding -> dispatch -> consumer: `apps/api/src/jobs/routes.ts:64` -> `queue.send` -> `apps/api/src/index.ts:56` -> `env.JOBS.send` -> `apps/api/src/index.ts:27` -> `deps.jobs` -> `apps/api/src/index.ts:76` -> `handleJobMessage` -> `apps/api/src/jobs/consumer.ts:11` -> `handleJobMessage`.
- Cloudflare batch size one and two retries accompany the consumer's three-delivery cap: `apps/api/wrangler.jsonc:16` -> `max_retries` -> `apps/api/src/jobs/consumer.ts:54` -> `MAX_ATTEMPTS`.
- Consumer uses pipeline: `apps/api/src/jobs/consumer.ts:28` -> `processJob` -> `apps/api/src/jobs/process.ts:6` -> `processJob`.
- Privileged job client and AI log wiring: `apps/api/src/index.ts:74` -> `supabaseJobAdmin` -> `apps/api/src/jobs/supabase-repo.ts:124` -> `SUPABASE_SERVICE_ROLE_KEY`; `apps/api/src/index.ts:75` -> `admin.logCall` -> `apps/api/src/jobs/supabase-repo.ts:151` -> `ai_calls`.
- Privileged scoring access: `apps/api/src/index.ts:76` -> `supabaseTailorAdmin` -> `apps/api/src/tailor/supabase-repo.ts:214` -> `SUPABASE_SERVICE_ROLE_KEY`; `apps/api/src/jobs/consumer.ts:34` -> `deps.baseCv` -> `apps/api/src/tailor/supabase-repo.ts:219` -> `user_id`.
- Base score calculation/storage: `apps/api/src/jobs/consumer.ts:36` -> `scoreMatch` -> `apps/api/src/tailor/score.ts:46` -> `callModel`; `apps/api/src/jobs/consumer.ts:39` -> `scores.saveScore` -> `apps/api/src/tailor/supabase-repo.ts:235` -> `match_scores`.

## Assumptions
- Queue ids are trusted for privileged lookup; ownership is obtained from the row, not verified against the payload userId. `apps/api/src/jobs/consumer.ts:25` -> `admin.start(id)`, `apps/api/src/jobs/supabase-repo.ts:142` -> `data.user_id`
- The admin start update compares the attempts value just read and permits queued/processing status; terminal rows return null. A duplicate arriving after the first start can read the increased attempts and start concurrently, because processing remains eligible. `apps/api/src/jobs/supabase-repo.ts:134` -> `attempts`, `apps/api/src/jobs/supabase-repo.ts:136` -> `data.status`, `apps/api/src/jobs/supabase-repo.ts:139` -> `eq("attempts"`
