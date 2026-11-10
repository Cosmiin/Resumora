---
id: extension/popup-state
area: extension
files: ["apps/extension/src/popup/popup.ts","apps/extension/src/popup/view.test.ts"]
depends_on: ["extension/messages","extension/popup-view","extension/popup-shell"]
contract: false
checked_hash: 6766b5e6
cited: [ebd32d, ab4092, 563861, ceb56f, 6b5716, 039e61, bf5d56, 34e495, e3aa01, 4fa7a4, 9ca3e1, a69c19, 350ffc, b9d035, ad5cb6, dbbd50, 0df40c, b0aa53, bdb3ab, 6f3a59, 8fcefd, 6ea354, c24d16, 53ca9e, 748324, 130230, 4550ff, 2fd7c1, ab4092, 9467bb, b0aa53, 1d5ed4]
decisions: []
open: []
---
Coordinate popup initialization, environment changes, page checks and capture results.

- Startup sends getState and validates env and environment summaries before showState; validation accepts missing or wrongly typed email despite the string-or-null contract. `apps/extension/src/popup/popup.ts:172` -> `getState`; `apps/extension/src/popup/popup.ts:15` -> `isPopupState`; `apps/extension/src/messages.ts:14` -> `email`
- Without a truthy state email, showState renders signedOut without querying the tab. `apps/extension/src/popup/popup.ts:85` -> `state.email`
- Signed-in state queries the active tab, displays only HTTP(S) host plus pathname, and rejects an empty display location. `apps/extension/src/popup/popup.ts:91` -> `tabs.query`
- The popup shows checking before checkActiveTab; a capturing reply joins the existing save. `apps/extension/src/popup/popup.ts:99` -> `checking`
- A capture shows busy UI and waits for both the background result and a 500ms minimum before applying it. `apps/extension/src/popup/popup.ts:113` -> `busy: true`
- Version increments invalidate stale check/save responses after a later action. `apps/extension/src/popup/popup.ts:83` -> `++version`; `apps/extension/src/popup/popup.ts:101` -> `current !== version`; `apps/extension/src/popup/popup.ts:119` -> `current !== version`
- A signedOut save result clears the popup email and shows the sign-in form with the returned message. `apps/extension/src/popup/popup.ts:122` -> `signedOut`
- Environment changes and sign-out share changeState, which validates replies and runs showState again. `apps/extension/src/popup/popup.ts:131` -> `changeState`; `apps/extension/src/popup/popup.ts:163` -> `setEnvironment`
- Sign-in uses a separate reply validator and displays a returned failure message on the existing state. `apps/extension/src/popup/popup.ts:151` -> `signIn`
- Retry is suppressed during a pending state change; otherwise it retries the failed check, saves, or restarts initialization depending on state. `apps/extension/src/popup/popup.ts:166` -> `retry`
- Each show refreshes the badge and footer; signed-in footer displays email, sign-out and environment selection. `apps/extension/src/popup/popup.ts:55` -> `const current`; `apps/extension/src/popup/popup.ts:78` -> `footer.append`
- New tabs are opened through tabs.create; rejected creation uses the generic failure view. `apps/extension/src/popup/popup.ts:165` -> `tabs.create`
- tested by `apps/extension/src/popup/view.test.ts:148` -> `popup interactions`

## Connections
- Runtime requests go to the worker listener; message dispatch details are owned by extension/messages. `apps/extension/src/popup/popup.ts:53` -> `sendMessage`; `apps/extension/src/background.ts:50` -> `onMessage`
- Rendering is delegated to renderView with actions that feed back into this controller. `apps/extension/src/popup/popup.ts:80` -> `renderView`; `apps/extension/src/popup/view.ts:21` -> `renderView`; `apps/extension/src/popup/view.ts:122` -> `actions.retry`
- The entry script starts automatically and requires the HTML main/footer/badge nodes. `apps/extension/src/popup/popup.ts:179` -> `startPopup`; `apps/extension/src/popup/popup.ts:45` -> `querySelector`; `apps/extension/popup.html:11` -> `environment-badge`; `apps/extension/popup.html:13` -> `main`

## Assumptions
- State validation checks environment summaries but not email; save validation checks only allowed kind strings, not associated URLs or error fields. `apps/extension/src/popup/popup.ts:15` -> `isPopupState`; `apps/extension/src/popup/popup.ts:36` -> `isSaveResult`
- The popup relies on trusted worker-provided destination URLs; openTab passes them directly to tabs.create. `apps/extension/src/popup/popup.ts:165` -> `tabs.create`; `apps/extension/src/popup/view.ts:129` -> `view.openUrl`
