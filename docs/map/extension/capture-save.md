---
id: extension/capture-save
area: extension
files: ["apps/extension/src/save.ts","apps/extension/src/save.test.ts"]
depends_on: ["extension/api","extension/auth-token","extension/messages","shared/jobs","api-core/job-routes","web-app/job-page","web-app/jobs-list"]
contract: false
checked_hash: f962faeb
cited: [3cdcc6, aa9041, 6dc729, 5e9d9d, 099ced, 6c0b2c, 361705, c60abc, 37b440, 12ac14, 12ac14, b069e8, 9b0360, 6dc729, a5280c, 1b1b9e, 4eec1a, ef0b94, 713516, 4e40c0, 08e098, 9b84a2, a7c7e9, 099ced, cbffe2, 666888, b0bdfb, 298c9e, 099ced, 63b1ef]
decisions: []
open: []
---
Prepare bounded capture data, authorize its POST, and map the result to popup actions.

- Saving rereads the tab; injection failure becomes cantRead. `apps/extension/src/save.ts:29` -> `deps.runReader`
- Fewer than 200 trimmed text characters produces couldntRead before token lookup, even with JSON-LD available. `apps/extension/src/save.ts:36` -> `read.pageText.trim`
- The outgoing body contains the reader URL, at most 30,000 text characters and at most 20 JSON-LD items. `apps/extension/src/save.ts:39` -> `30_000`
- Body size is measured as UTF-8 JSON bytes; over 100,000 bytes drops all JSON-LD, and a still-oversize body is rejected. `apps/extension/src/save.ts:41` -> `TextEncoder`
- Shared schema validation happens before auth access; invalid input gets the generic error. `apps/extension/src/save.ts:44` -> `CreateJobBodySchema.safeParse`
- No session yields signedOut without a message; expired yields signedOut with expiry copy; offline yields an environment-specific error. `apps/extension/src/save.ts:46` -> `accessToken`
- An unauthorized POST refreshes once and retries once; failed refresh or repeated unauthorized signs out that environment. `apps/extension/src/save.ts:54` -> `unauthorized`
- Saved and existing both build a web job-detail URL from the returned id. `apps/extension/src/save.ts:63` -> `case "saved"`
- Network failure uses environment-specific copy. Known API errors map invalid URL, short text, oversized body and quota to their respective messages/actions. `apps/extension/src/save.ts:66` -> `case "network"`; `apps/extension/src/save.ts:70` -> `invalid_url`
- Unknown API failures preserve requestId with generic copy; recognized error mappings omit that id. `apps/extension/src/save.ts:70` -> `invalid_url`; `apps/extension/src/save.ts:74` -> `outcome.requestId`
- tested by `apps/extension/src/save.test.ts:181` -> `saveActiveTab`

## Connections
- The shared input schema permits optional text of 200-60,000 characters and 20 JSON-LD items; this caller sends a stricter 30,000-character cap. `apps/extension/src/save.ts:39` -> `30_000`; `packages/shared/src/jobs.ts:43` -> `max(60000)`
- The API checks 100 * 1024 body bytes, slightly above the extension's 100,000-byte threshold, and also truncates stored text to 30,000 characters. `apps/extension/src/save.ts:42` -> `100_000`; `apps/api/src/jobs/routes.ts:12` -> `100 * 1024`; `apps/api/src/jobs/routes.ts:32` -> `bytes.byteLength`; `apps/api/src/jobs/routes.ts:60` -> `30_000`
- Successful links resolve to the web job route; unreadable links supply the jobs page add parameter. `apps/extension/src/save.ts:65` -> `/jobs/`; `apps/web/src/router.tsx:20` -> `/jobs/:id`; `apps/extension/src/save.ts:34` -> `/jobs?add=`; `apps/web/src/jobs/JobsPage.tsx:48` -> `searchParams.get("add")`
- Body validation is shared with the receiving API handler. `apps/extension/src/save.ts:44` -> `CreateJobBodySchema.safeParse`; `apps/api/src/jobs/routes.ts:39` -> `CreateJobBodySchema.safeParse`

## Assumptions
- Success means accepted for background processing, not completed extraction: new jobs are queued before the API returns 202. `apps/extension/src/api.ts:30` -> `saved`; `apps/api/src/jobs/routes.ts:64` -> `queue.send`; `apps/api/src/jobs/routes.ts:69` -> `202`
- Reader URL and text are untrusted until shared input validation; JSON-LD values remain unknown objects under that schema. `apps/extension/src/save.ts:44` -> `safeParse`; `packages/shared/src/jobs.ts:44` -> `z.unknown()`
