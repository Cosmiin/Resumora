---
id: extension/background
area: extension
files: ["apps/extension/src/background.ts","apps/extension/src/reader-entry.ts","apps/extension/src/chrome.d.ts","apps/extension/src/handler.test.ts"]
depends_on: ["extension/handler","extension/auth-session","extension/storage","extension/environments","extension/capture-state","extension/readers"]
contract: false
checked_hash: b7e8c2f0
cited: [fb25b7, 25ed17, 46ed14, dbf620, c1c7ee, ea35ef, 8fcefd, 2b5f7e, 2ec35e, 86c76f, ad8bbc, 6f3a59, 8fcefd, a6cb9c, ea35ef, 5b56ba, fa8ed6, c1c7ee, a01dca, 4c34b4, 505dc7]
decisions: []
open: []
---
Compose browser dependencies and bridge popup requests to injected page reads.

- The worker creates one storage adapter, auth object and saver when composed. `apps/extension/src/background.ts:20` -> `chromeStorage`
- Active-tab lookup uses the current window's first active tab and returns null when its id is absent. `apps/extension/src/background.ts:27` -> `tabs.query`
- Each read first injects reader.js, then executes a function invoking __resumoraReadPage. `apps/extension/src/background.ts:32` -> `reader.js`
- Only the first execution result is returned; a missing result throws. `apps/extension/src/background.ts:33` -> `const [read]`; `apps/extension/src/background.ts:39` -> `throw`
- The injected entry installs a global function that reads the document and location when invoked. `apps/extension/src/reader-entry.ts:8` -> `readPage(document, location)`
- The message listener resolves handlers asynchronously and returns true to leave the response channel open. `apps/extension/src/background.ts:50` -> `addListener`
- Rejected handlers receive a generic error reply with null requestId. `apps/extension/src/background.ts:52` -> `sendResponse`
- Local Chrome declarations expose unknown message/sender/response values; background adds its own tab and injection types. `apps/extension/src/chrome.d.ts:4` -> `addListener`; `apps/extension/src/background.ts:10` -> `BackgroundChrome`
- tested by `apps/extension/src/handler.test.ts:137` -> `background messages`

## Connections
- Popup sendMessage reaches onMessage and the handler's request switch. `apps/extension/src/popup/popup.ts:53` -> `sendMessage`; `apps/extension/src/background.ts:50` -> `onMessage`; `apps/extension/src/handler.ts:23` -> `switch`
- Injected global installation and invocation must agree; readPage returns ReaderResult. `apps/extension/src/reader-entry.ts:8` -> `__resumoraReadPage`; `apps/extension/src/background.ts:37` -> `__resumoraReadPage`; `apps/extension/src/readers/index.ts:10` -> `readPage`

## Assumptions
- The worker trusts the installed reader result without runtime shape validation. `apps/extension/src/background.ts:39` -> `read?.result`; `apps/extension/src/background.ts:40` -> `return read.result`
- Capture tracking belongs to the saver instance created in this worker, so a new worker instance creates new maps. `apps/extension/src/background.ts:22` -> `createSaver`; `apps/extension/src/save.ts:21` -> `new Map`
