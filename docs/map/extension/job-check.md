---
id: extension/job-check
area: extension
files: ["apps/extension/src/job-check.ts","apps/extension/src/job-check.test.ts"]
depends_on: ["extension/readers","shared/jobs","api-core/job-processing"]
contract: false
checked_hash: d04a7682
decisions: []
open: []
---
Apply a permissive local job-page heuristic before the user chooses capture.

- Any JSON-LD JobPosting immediately qualifies, including nested arrays or @graph objects and scalar/array @type fields. `apps/extension/src/job-check.ts:17` -> `hasJobPosting`; `apps/extension/src/job-check.ts:26` -> `hasJobPosting`
- The unconditional board list includes Greenhouse, Lever, Workday, Ashby, SmartRecruiters, Workable, Recruitee, Teamtailor, Personio, BambooHR, eJobs, BestJobs and Hipo domains. `apps/extension/src/job-check.ts:3` -> `JOB_HOSTS`
- Domain matching accepts the exact hostname or a dot-delimited subdomain; LinkedIn requires /jobs/ and Indeed requires /viewjob or /rc/clk prefixes. `apps/extension/src/job-check.ts:30` -> `hostMatches`
- A job/career/vacancy/position/posting path segment contributes one signal rather than automatically accepting. `apps/extension/src/job-check.ts:35` -> `url.pathname`
- English and Romanian phrases contribute text signals after lowercasing and stripping combining marks. `apps/extension/src/job-check.ts:9` -> `JOB_SIGNALS`; `apps/extension/src/job-check.ts:39` -> `normalize`
- Two total signals accept the page; invalid URL parsing contributes no URL signal but still permits text matching. `apps/extension/src/job-check.ts:38` -> `catch`; `apps/extension/src/job-check.ts:41` -> `signals >= 2`
- tested by `apps/extension/src/job-check.test.ts:14` -> `looksLikeJob`

## Connections
- The capture check invokes the heuristic only after the 200-character minimum. `apps/extension/src/save.ts:90` -> `trim().length`; `apps/extension/src/save.ts:93` -> `looksLikeJob`; `apps/extension/src/job-check.ts:25` -> `looksLikeJob`
- JSON-LD recognition differs from the API selector: the heuristic recurses arrays, while findJobPosting skips top-level array values. `apps/extension/src/job-check.ts:18` -> `Array.isArray`; `apps/api/src/jobs/routes.ts:60` -> `findJobPosting`; `packages/shared/src/jobs.ts:113` -> `Array.isArray(value)`
- Final single-job admission is downstream model processing, which can reject a locally accepted capture. `apps/extension/src/job-check.ts:31` -> `JOB_HOSTS`; `apps/api/src/jobs/consumer.ts:28` -> `processJob`; `apps/api/src/jobs/process.ts:20` -> `not_a_job`

## Assumptions
- Host recognition is a convenience signal, not proof of a job posting; listed host matches bypass all text-phrase checks. `apps/extension/src/job-check.ts:31` -> `JOB_HOSTS`; `apps/extension/src/job-check.ts:34` -> `return true`
