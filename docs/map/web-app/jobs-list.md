---
id: web-app/jobs-list
area: web-app
files: ["apps/web/src/jobs/JobsPage.tsx","apps/web/src/jobs/jobs-page.test.tsx"]
depends_on: ["web-app/jobs-client","web-app/jobs-add","web-app/auth-state","web-app/app-shell","web-app/styles-jobs"]
contract: false
checked_hash: 4acf419e
decisions: []
open: []
---
Page through the signed-in user's jobs, poll unfinished captures and open add links.

- JobsPage keys its child by current user ID; the infinite query also includes user ID and uses gcTime zero. `apps/web/src/jobs/JobsPage.tsx:23` -> `userId`; `apps/web/src/jobs/JobsPage.tsx:38` -> `queryKey`
- Pages are flattened with first occurrence winning for duplicate job IDs. `apps/web/src/jobs/JobsPage.tsx:15` -> `Map`
- Pagination consumes nextCursor, and only queued/processing rows trigger three-second polling. `apps/web/src/jobs/JobsPage.tsx:41` -> `nextCursor`
- The polling window starts on first observed busy rows, stops after two minutes and is restarted after add; becoming idle alone does not reset its start. `apps/web/src/jobs/JobsPage.tsx:63` -> `started ?? Date.now()`; `apps/web/src/jobs/JobsPage.tsx:67` -> `120_000`; `apps/web/src/jobs/JobsPage.tsx:91` -> `setPollStartedAt`
- An add query parameter opens the dialog only for HTTP(S), then is removed with replace regardless of validity while preserving other parameters. `apps/web/src/jobs/JobsPage.tsx:48` -> `searchParams.get("add")`; `apps/web/src/jobs/JobsPage.tsx:57` -> `remaining`
- Search filters loaded rows by title, company, location and host after trimming/lowercasing; it does not query the server. `apps/web/src/jobs/JobsPage.tsx:74` -> `search.trim`
- Load more is hidden during nonblank search; it waits for a running refetch before requesting a page with the updated cursor. `apps/web/src/jobs/JobsPage.tsx:80` -> `cancelRefetch: false`; `apps/web/src/jobs/JobsPage.tsx:140` -> `!q`
- Add cancels matching list queries and refetches; after a first add, focus restoration switches from the removed empty-state button to the persistent Add button. `apps/web/src/jobs/JobsPage.tsx:90` -> `opener.current`
- The shell header and main become inert behind the dialog; closing returns focus to the opener. `apps/web/src/jobs/JobsPage.tsx:71` -> `focus`; `apps/web/src/jobs/JobsPage.tsx:98` -> `inert={dialogOpen}`
- A failed refresh with cached pages preserves the list and shows a separate retry message. `apps/web/src/jobs/JobsPage.tsx:109` -> `!query.data`; `apps/web/src/jobs/JobsPage.tsx:144` -> `query.isError && query.data`
- tested by `apps/web/src/jobs/jobs-page.test.tsx:115` -> `running refetch`
- tested by `apps/web/src/jobs/jobs-page.test.tsx:171` -> `signed-in user changes`
## Connections
- Extension fallback URLs feed this page's add parser: `apps/extension/src/save.ts:34` -> `/jobs?add=`; `apps/web/src/jobs/JobsPage.tsx:48` -> `searchParams.get("add")`
- Uses paginated listJobs and AddJobDialog: `apps/web/src/jobs/JobsPage.tsx:40` -> `listJobs`; `apps/web/src/jobs/jobs-api.ts:13` -> `listJobs`; `apps/web/src/jobs/JobsPage.tsx:151` -> `AddJobDialog`; `apps/web/src/jobs/AddJobDialog.tsx:7` -> `AddJobDialog`
- Job row links match the detail route: `apps/web/src/jobs/JobsPage.tsx:126` -> `/jobs/`; `apps/web/src/router.tsx:20` -> `/jobs/:id`
## Assumptions
- hostOf constructs URL directly although the shared list schema only requires a string, so persisted URLs must remain parseable. `apps/web/src/jobs/JobsPage.tsx:12` -> `new URL`; `packages/shared/src/jobs.ts:71` -> `z.string()`
