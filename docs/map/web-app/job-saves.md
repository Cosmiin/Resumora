---
id: web-app/job-saves
area: web-app
files: ["apps/web/src/jobs/JobPage.tsx","apps/web/src/jobs/job-page.test.tsx","apps/web/src/jobs/job-edit.test.tsx"]
depends_on: ["web-app/jobs-client","web-app/job-edit","shared/jobs","db/jobs-repository","web-tailor/page"]
contract: false
checked_hash: ce88add4
cited: [018d84, 5598d2, 29a658, b5c7d4, f8bf52, df7af6, b5b308, 70e048, 5eab77, 76f747, 09042f, 59a63c, 54778d, 14311f, 4ab1d3, ff2290, 2d8e9a, 99eebf, 750ab6, 3f658f, fb1634, 2e8682, 870c84, 5b4070, fb1634, 98e7b5, 2e8682, 99eebf, 750ab6, 3f658f, 9bfb30, b5c7d4, 3d7095]
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Coordinate job mutations, versioned detail saves and list/detail caches.

- cacheJob cancels list and detail queries before writing the returned Job to detail cache; cached list rows update only title, company and location. `apps/web/src/jobs/JobPage.tsx:89` -> `cancelQueries`; `apps/web/src/jobs/JobPage.tsx:93` -> `pages.map`
- Edit completion awaits cacheJob before leaving edit mode. `apps/web/src/jobs/JobPage.tsx:97` -> `async function saved`
- Status saves chain onto detailsSave; a failed earlier save is caught so the next queued save can run. `apps/web/src/jobs/JobPage.tsx:103` -> `detailsSave.current.catch`
- Each queued save rereads the current cached Job immediately before PATCH, resending its full extraction and latest version with only the requested application-status changes. `apps/web/src/jobs/JobPage.tsx:104` -> `getQueryData<Job>`
- Missing cached extraction rejects the save; pendingSaves increments before queueing and decrements in finally. `apps/web/src/jobs/JobPage.tsx:102` -> `setPendingSaves`; `apps/web/src/jobs/JobPage.tsx:105` -> `wrong_status`; `apps/web/src/jobs/JobPage.tsx:109` -> `finally`
- Status save errors distinguish version_conflict from generic failures; the picker is disabled while statusSaving. `apps/web/src/jobs/JobPage.tsx:117` -> `version_conflict`; `apps/web/src/jobs/JobPage.tsx:213` -> `disabled={statusSaving}`
- Edit stays disabled for pending status saves; the picker offers saved, tailored, applied, interview, offer and rejected. `apps/web/src/jobs/JobPage.tsx:195` -> `pendingSaves > 0`; `apps/web/src/jobs/JobPage.tsx:215` -> `"saved", "tailored"`
- Delete waits for the API, cancels the list query, removes the ID from every cached list page and navigates back; failures keep the page and clear deleting. `apps/web/src/jobs/JobPage.tsx:77` -> `deleteJob`
- Delete confirmation warns about tailored content for ready jobs when score loading has not succeeded or a tailored score exists. `apps/web/src/jobs/JobPage.tsx:128` -> `!score.isSuccess`
- Reloading a conflicted edit refetches the job and closes editing only after a successful result. `apps/web/src/jobs/JobPage.tsx:188` -> `onReload`
- Edit waits for a status save and then uses the new version, tested by `apps/web/src/jobs/job-page.test.tsx:77` -> `keeps Edit disabled until the status save finishes`.
- tested by `apps/web/src/jobs/job-edit.test.tsx:117` -> `pending detail refetch`
- Extraction-edit classification checks whether applicationStatus is supplied (not undefined), not whether extraction content changed. Supplying applicationStatus suppresses edited_by_user/updated_at writes even when the extraction changes; extraction is still written and version incremented. `apps/api/src/jobs/supabase-repo.ts:98` -> `extractionEdit`; `apps/api/src/jobs/supabase-repo.ts:101` -> `extracted`; `apps/api/src/jobs/supabase-repo.ts:103` -> `version: expectedVersion + 1`
## Connections
- Full extraction/version PATCH connects to server validation and conflict detection: `apps/web/src/jobs/JobPage.tsx:106` -> `patchJob`; `apps/web/src/jobs/jobs-api.ts:46` -> `PATCH`; `apps/api/src/jobs/routes.ts:117` -> `JobPatchBodySchema`; `apps/api/src/jobs/routes.ts:121` -> `version_conflict`
- saveDetails sends cached extraction with applicationStatus, while the edit form sends extraction without that optional field; patchJob permits both together. The repository classifies by optional-field presence, so mixed saves write extraction and increment version without setting edited_by_user/updated_at, which control the tailored page's job-changed notice: `apps/web/src/jobs/JobPage.tsx:106` -> `patchJob`; `apps/web/src/jobs/JobEditForm.tsx:56` -> `patchJob`; `apps/web/src/jobs/jobs-api.ts:46` -> `...changes`; `apps/api/src/jobs/supabase-repo.ts:98` -> `extractionEdit`; `apps/api/src/jobs/supabase-repo.ts:101` -> `extracted`; `apps/api/src/jobs/supabase-repo.ts:103` -> `updated_at`; `apps/web/src/tailor/TailoredCvPage.tsx:141` -> `jobChanged`

## Assumptions
- Local serialization prevents this component's overlapping detail saves, but cross-tab writes still rely on server version checks. `apps/web/src/jobs/JobPage.tsx:103` -> `then(async`; `apps/api/src/jobs/routes.ts:119` -> `repo.patch(id, version`
