---
id: web-app/jobs-add
area: web-app
files: ["apps/web/src/jobs/AddJobDialog.tsx","apps/web/src/jobs/jobs-page.test.tsx"]
depends_on: ["web-app/jobs-client","web-app/i18n","web-app/styles-jobs","shared/jobs"]
contract: false
checked_hash: a2745dd9
cited: [4eaeb2, aa756b, 0059b4, cab068, 225b0c, 199653, 6d68f5, f1d278, b3d267, 21a334, 06fdd1, 86d27d, 93925c, c3e76f, e52674, 561bbd, b85c33, 4eaeb2, f257cc, 630fce, a5280c, 6d68f5, cbffe2, 22be30]
decisions: []
open: []
---
Collect a job URL and pasted text, including extension fallback and duplicate handling.

- The paste form starts collapsed unless initialUrl is supplied; URL/text stay in component state across collapsing. `apps/web/src/jobs/AddJobDialog.tsx:8` -> `initialUrl`; `apps/web/src/jobs/AddJobDialog.tsx:106` -> `pasteOpen`
- Mount focuses Close and locks body scrolling; cleanup restores the previous overflow value and marks the component inactive. `apps/web/src/jobs/AddJobDialog.tsx:23` -> `useEffect`
- Opening paste focuses the URL field normally and text when initialUrl exists. `apps/web/src/jobs/AddJobDialog.tsx:32` -> `initialUrl !== undefined`
- Submission accepts only HTTP(S) URLs and at least 200 trimmed text characters, focusing the first invalid field. `apps/web/src/jobs/AddJobDialog.tsx:39` -> `validUrl`; `apps/web/src/jobs/AddJobDialog.tsx:44` -> `count < 200`
- createJob receives a trimmed URL but the original text; local validation does not cap URL or text length. `apps/web/src/jobs/AddJobDialog.tsx:51` -> `createJob(url.trim(), text)`; `apps/web/src/jobs/AddJobDialog.tsx:113` -> `textarea`
- A newly created job invokes onAdded and closes if still mounted; duplicate results keep the dialog open and link to the existing job. `apps/web/src/jobs/AddJobDialog.tsx:52` -> `!result.existing`; `apps/web/src/jobs/AddJobDialog.tsx:120` -> `existingId`
- invalid_url, text_too_short, payload_too_large and job_limit get specific copy; network gets api.network and other failures generic copy. `apps/web/src/jobs/AddJobDialog.tsx:58` -> `err.code`
- Escape, scrim click and Close cancel; Tab wraps through controls selected by button/input/textarea/link selectors. `apps/web/src/jobs/AddJobDialog.tsx:71` -> `Escape`; `apps/web/src/jobs/AddJobDialog.tsx:73` -> `querySelectorAll`; `apps/web/src/jobs/AddJobDialog.tsx:81` -> `e.target === e.currentTarget`
- tested by `apps/web/src/jobs/jobs-page.test.tsx:342` -> `traps focus`
- tested by `apps/web/src/jobs/jobs-page.test.tsx:418` -> `duplicate open`
## Connections
- Used by JobsList with the extension URL as the dialog key and initial value: `apps/web/src/jobs/JobsPage.tsx:151` -> `key={initialUrl}`; `apps/web/src/jobs/AddJobDialog.tsx:8` -> `initialUrl`
- Hand-copied minimum 200 must track the shared create schema, whose 60,000 text/2,048 URL maxima are enforced server-side: `apps/web/src/jobs/AddJobDialog.tsx:41` -> `200`; `packages/shared/src/jobs.ts:42` -> `2048`; `packages/shared/src/jobs.ts:43` -> `60000`
## Assumptions
- The UI submits URL plus text rather than fetching the URL; the API is responsible for content validation and duplicate detection. `apps/web/src/jobs/AddJobDialog.tsx:51` -> `createJob`; `apps/api/src/jobs/routes.ts:39` -> `safeParse`; `apps/api/src/jobs/routes.ts:52` -> `findByUrl`
