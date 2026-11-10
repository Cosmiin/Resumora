---
id: extension/capture-check
area: extension
files: ["apps/extension/src/save.ts","apps/extension/src/save.test.ts"]
depends_on: ["extension/messages","extension/job-check","extension/capture-state","web-app/jobs-list"]
contract: false
checked_hash: f962faeb
decisions: []
open: []
---
Check whether the active page is readable and likely a job before offering capture.

- The check snapshots the environment before awaiting active-tab lookup. `apps/extension/src/save.ts:83` -> `deps.environment`
- Missing URL or a non-HTTP(S) protocol returns cantRead. `apps/extension/src/save.ts:85` -> `tab?.url`
- An identical running environment/tab/URL capture returns capturing before injecting the reader again. `apps/extension/src/save.ts:88` -> `running.has`
- Readable text shorter than 200 trimmed characters yields couldntRead with an encoded web paste URL. `apps/extension/src/save.ts:90` -> `trim().length`
- Sufficient text is classified locally as capture or notJob. `apps/extension/src/save.ts:93` -> `looksLikeJob`
- Any exception during environment lookup, tab lookup, URL parsing or reading becomes cantRead. `apps/extension/src/save.ts:94` -> `catch`
- tested by `apps/extension/src/save.test.ts:28` -> `checkActiveTab`

## Connections
- Handler invokes this check; it delegates job recognition to looksLikeJob. `apps/extension/src/handler.ts:41` -> `checkActiveTab`; `apps/extension/src/save.ts:81` -> `checkActiveTab`; `apps/extension/src/save.ts:93` -> `looksLikeJob`; `apps/extension/src/job-check.ts:25` -> `looksLikeJob`
- The paste URL's add parameter is read by the web jobs page to open its add flow. `apps/extension/src/save.ts:91` -> `/jobs?add=`; `apps/web/src/jobs/JobsPage.tsx:48` -> `searchParams.get("add")`
- The popup joins a running capture instead of initiating another save after capturing. `apps/extension/src/save.ts:88` -> `capturing`; `apps/extension/src/popup/popup.ts:104` -> `joinCapture`

## Assumptions
- This is advisory classification: save independently rereads the page and does not require a previous capture result. `apps/extension/src/save.ts:93` -> `looksLikeJob`; `apps/extension/src/save.ts:29` -> `deps.runReader`; `apps/extension/src/save.ts:38` -> `const body`
