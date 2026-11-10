---
id: web-app/job-saves
area: web-app
files: ["apps/web/src/jobs/JobPage.tsx","apps/web/src/jobs/job-page.test.tsx","apps/web/src/jobs/job-edit.test.tsx"]
depends_on: ["web-app/jobs-client","web-app/job-edit","web-app/job-thoughts","shared/jobs","db/jobs-repository","web-tailor/page"]
contract: false
checked_hash: 1813e5bd
cited: [018d84, 5598d2, 5679b1, 49c7ce, 93b897, 638a3c, 4a586f, 70e048, 5eab77, 76f747, d54e51, d9575e, 54778d, 14311f, 4ab1d3, 0b86ae, 2d8e9a, eaf596, ad1ed9, cc2463, c8f5f4, 406ab4, c22c70, 6eb347, b48a4d, 870c84, 5b4070, 6eb347, 98e7b5, b48a4d, eaf596, ad1ed9, cc2463, 9bfb30, 49c7ce, 3d7095]
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Coordinate job mutations, versioned detail saves and list/detail caches.

- cacheJob cancels list and detail queries before writing the returned Job to detail cache; cached list rows update only title, company and location. `apps/web/src/jobs/JobPage.tsx:91` -> `cancelQueries`; `apps/web/src/jobs/JobPage.tsx:95` -> `pages.map`
- Edit completion awaits cacheJob before leaving edit mode. `apps/web/src/jobs/JobPage.tsx:99` -> `async function saved`
- Thoughts/status saves chain onto detailsSave; a failed earlier save is caught so the next queued save can run. `apps/web/src/jobs/JobPage.tsx:105` -> `detailsSave.current.catch`
- Each queued save rereads the current cached Job immediately before PATCH, resending its full extraction and latest version with only the requested thoughts/status changes. `apps/web/src/jobs/JobPage.tsx:106` -> `getQueryData<Job>`
- Missing cached extraction rejects the save; pendingSaves increments before queueing and decrements in finally. `apps/web/src/jobs/JobPage.tsx:104` -> `setPendingSaves`; `apps/web/src/jobs/JobPage.tsx:107` -> `wrong_status`; `apps/web/src/jobs/JobPage.tsx:111` -> `finally`
- Status save errors distinguish version_conflict from generic failures; the picker is disabled while statusSaving. `apps/web/src/jobs/JobPage.tsx:119` -> `version_conflict`; `apps/web/src/jobs/JobPage.tsx:214` -> `disabled={statusSaving}`
- Edit stays disabled for pending detail saves or active voice work; the picker offers saved, tailored, applied, interview, offer and rejected. `apps/web/src/jobs/JobPage.tsx:197` -> `pendingSaves > 0 || thoughtsBusy`; `apps/web/src/jobs/JobPage.tsx:216` -> `"saved", "tailored"`
- Delete waits for the API, cancels the list query, removes the ID from every cached list page and navigates back; failures keep the page and clear deleting. `apps/web/src/jobs/JobPage.tsx:79` -> `deleteJob`
- Delete confirmation warns about tailored content for ready jobs when score loading has not succeeded or a tailored score exists. `apps/web/src/jobs/JobPage.tsx:130` -> `!score.isSuccess`
- Reloading a conflicted edit refetches the job and closes editing only after a successful result. `apps/web/src/jobs/JobPage.tsx:190` -> `onReload`
- tested by `apps/web/src/jobs/job-page.test.tsx:119` -> `Edit disabled`
- tested by `apps/web/src/jobs/job-edit.test.tsx:117` -> `pending detail refetch`
- Extraction-edit classification checks whether userThoughts/applicationStatus are supplied (not undefined), not whether extraction content changed. Supplying either field suppresses edited_by_user/updated_at writes even when the extraction changes; extraction is still written and version incremented. `apps/api/src/jobs/supabase-repo.ts:99` -> `extractionEdit`; `apps/api/src/jobs/supabase-repo.ts:103` -> `extracted`; `apps/api/src/jobs/supabase-repo.ts:105` -> `version: expectedVersion + 1`
## Connections
- Thoughts and status share the same serialized save path: `apps/web/src/jobs/JobPage.tsx:221` -> `saveDetails({ userThoughts })`; `apps/web/src/jobs/JobPage.tsx:118` -> `saveDetails({ applicationStatus })`; `apps/web/src/jobs/JobPage.tsx:103` -> `function saveDetails`
- Full extraction/version PATCH connects to server validation and conflict detection: `apps/web/src/jobs/JobPage.tsx:108` -> `patchJob`; `apps/web/src/jobs/jobs-api.ts:46` -> `PATCH`; `apps/api/src/jobs/routes.ts:117` -> `JobPatchBodySchema`; `apps/api/src/jobs/routes.ts:121` -> `version_conflict`
- saveDetails sends cached extraction with thoughts/status, while the edit form sends extraction without those optional fields; patchJob permits both together. The repository classifies by optional-field presence, so mixed saves write extraction and increment version without setting edited_by_user/updated_at, which control the tailored page's job-changed notice: `apps/web/src/jobs/JobPage.tsx:108` -> `patchJob`; `apps/web/src/jobs/JobEditForm.tsx:56` -> `patchJob`; `apps/web/src/jobs/jobs-api.ts:46` -> `...changes`; `apps/api/src/jobs/supabase-repo.ts:99` -> `extractionEdit`; `apps/api/src/jobs/supabase-repo.ts:103` -> `extracted`; `apps/api/src/jobs/supabase-repo.ts:105` -> `updated_at`; `apps/web/src/tailor/TailoredCvPage.tsx:141` -> `jobChanged`

## Assumptions
- Local serialization prevents this component's overlapping detail saves, but cross-tab writes still rely on server version checks. `apps/web/src/jobs/JobPage.tsx:105` -> `then(async`; `apps/api/src/jobs/routes.ts:119` -> `repo.patch(id, version`
