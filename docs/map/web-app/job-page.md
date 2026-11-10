---
id: web-app/job-page
area: web-app
files: ["apps/web/src/jobs/JobPage.tsx","apps/web/src/jobs/job-page.test.tsx"]
depends_on: ["web-app/jobs-client","web-app/job-saves","web-app/job-requirements","web-app/job-summary","web-app/tailor-gate","web-app/app-shell","web-tailor/flow-state","web-tailor/client-run","api-tailor/routes"]
contract: false
checked_hash: fef2bfa2
cited: [5254a2, 71a0a1, 99ffe2, 5bf541, 60fe81, d9c699, ed396c, 4055b2, a8c56c, 806f75, c904c5, b7d88d, 7f50b5, 0cb5d4, 8a3340, 39ed5b, 6d2402, 07c255, 71a0a1, 889221, 7086bf, cb7207, 0494d0, 7cf99d, 4583b8, 2c3b94, 49b3d7, c70c38, 3612e5, 5a38fb, 93e707, 549f50, a7904e, 6cd010, f86844]
decisions: []
open: []
---
Load a job and its scores, select display states and offer tailoring navigation.

- JobView remounts for each user/job pair; detail, score and remembered-run query keys all include that pair and have gcTime zero. `apps/web/src/jobs/JobPage.tsx:21` -> `key=`; `apps/web/src/jobs/JobPage.tsx:41` -> `queryKey`; `apps/web/src/jobs/JobPage.tsx:51` -> `queryKey`
- Queued/processing jobs poll every three seconds, with a two-minute deadline established when JobView mounts. `apps/web/src/jobs/JobPage.tsx:27` -> `120_000`; `apps/web/src/jobs/JobPage.tsx:42` -> `refetchInterval`
- Score loading is enabled only when job.status is ready. `apps/web/src/jobs/JobPage.tsx:47` -> `enabled`
- An unfinished run is loaded only from the browser's remembered run ID; errors become null and done runs or runs without a currentSection are ignored. `apps/web/src/jobs/JobPage.tsx:53` -> `remembered(id)`
- Retry refetches score data unless a successful read has no base score; only that missing-base case POSTs scoreJob and writes the score cache. `apps/web/src/jobs/JobPage.tsx:61` -> `score.isSuccess`
- Initial 404 shows not-found copy, other initial errors offer retry; a detail refetch error with existing data leaves that data displayed. `apps/web/src/jobs/JobPage.tsx:174` -> `query.data === undefined`
- Failed jobs distinguish not_a_job from other extraction failures; needs_text receives its own display path. `apps/web/src/jobs/JobPage.tsx:186` -> `not_a_job`; `apps/web/src/jobs/JobPage.tsx:224` -> `needs_text`
- A remembered active run takes precedence over an existing tailored score; both move the tailoring banner above the ad, whereas the initial tailor action stays below it. `apps/web/src/jobs/JobPage.tsx:138` -> `run ?`; `apps/web/src/jobs/JobPage.tsx:161` -> `tailorOnTop`
- The initial tailor button remains clickable for unready jobs to show a status-specific reason; ready jobs open TailorGate. `apps/web/src/jobs/JobPage.tsx:153` -> `onClick`
- Salary displays only if a bound exists; applyBy is formatted with a UTC midnight date and UTC timezone. `apps/web/src/jobs/JobPage.tsx:163` -> `T00:00:00Z`; `apps/web/src/jobs/JobPage.tsx:167` -> `salary.min !== null`
- tested by `apps/web/src/jobs/job-page.test.tsx:181` -> `missing Score 1`
- tested by `apps/web/src/jobs/job-page.test.tsx:449` -> `stops polling`
## Connections
- Uses GET job and GET/POST score clients: `apps/web/src/jobs/JobPage.tsx:41` -> `getJob`; `apps/web/src/jobs/jobs-api.ts:19` -> `/v1/jobs/`; `apps/web/src/jobs/JobPage.tsx:46` -> `getJobScore`; `apps/web/src/jobs/jobs-api.ts:29` -> `/score`; `apps/web/src/jobs/JobPage.tsx:64` -> `scoreJob`; `apps/web/src/jobs/jobs-api.ts:36` -> `/score`
- Remembered-run reads ultimately call GET /v1/tailor-runs/:id: `apps/web/src/jobs/JobPage.tsx:54` -> `getRun`; `apps/web/src/tailor/tailor-api.ts:29` -> `getRun`; `apps/web/src/tailor/tailor-api.ts:8` -> `/v1/tailor-runs/`; `apps/api/src/tailor/routes.ts:67` -> `app.get`; `apps/api/src/app.ts:95` -> `/v1`
- Gate navigation uses registered tailoring routes: `apps/web/src/jobs/JobPage.tsx:227` -> `/tailor`; `apps/web/src/router.tsx:21` -> `/jobs/:id/tailor`; document links use `apps/web/src/jobs/JobPage.tsx:147` -> `/cv`; `apps/web/src/router.tsx:22` -> `/jobs/:id/cv`
## Assumptions
- The page treats a tailored score as the signal to offer the tailored-document link; it does not verify document availability here. `apps/web/src/jobs/JobPage.tsx:137` -> `score.data?.tailored`; `apps/web/src/jobs/JobPage.tsx:143` -> `tailored ?`
