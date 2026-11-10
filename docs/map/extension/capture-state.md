---
id: extension/capture-state
area: extension
files: ["apps/extension/src/save.ts","apps/extension/src/save.test.ts"]
depends_on: ["extension/capture-save","extension/messages","extension/environments"]
contract: false
checked_hash: f962faeb
cited: [505dc7, d7ecb5, a169cf, 8afa7d, 6306b8, 7fd5d9, 8fbe60, e32b53, 9524ba, 2b8aeb, ee85ba, b653f3, 1f8c00, ead136, 488e2c, 4c34b4, e32b53, 4a7f65, 505dc7, 7fd5d9]
decisions: []
open: []
---
Join concurrent captures and retain their latest result for a reopened popup.

- Each saver instance owns separate running-promise and last-result maps. `apps/extension/src/save.ts:21` -> `running`
- Join and save snapshot the environment before awaiting the active tab. `apps/extension/src/save.ts:100` -> `deps.environment`; `apps/extension/src/save.ts:113` -> `deps.environment`
- Join validates an HTTP(S) tab URL, then selects a running promise, latest result, or generic error without reading the page. `apps/extension/src/save.ts:102` -> `tab?.url`; `apps/extension/src/save.ts:106` -> `running.get`
- Capture identity includes environment id, tab id and the full tab URL, so query changes create distinct keys. `apps/extension/src/save.ts:118` -> `const key`
- Concurrent save calls for the same key return the existing promise; a new save clears the prior result. `apps/extension/src/save.ts:119` -> `running.get`
- Save exceptions become generic errors; completion removes the running entry and stores the result. `apps/extension/src/save.ts:122` -> `save(tab.id, env)`
- Outer join/save failures return cantRead. `apps/extension/src/save.ts:107` -> `catch`; `apps/extension/src/save.ts:130` -> `catch`
- tested by `apps/extension/src/save.test.ts:135` -> `joinCapture`
- tested by `apps/extension/src/save.test.ts:369` -> `joins an in-progress save`

## Connections
- Popup check sees the running key and asks the handler to join. `apps/extension/src/save.ts:88` -> `running.has`; `apps/extension/src/popup/popup.ts:104` -> `joinCapture`; `apps/extension/src/handler.ts:43` -> `joinCapture`
- Worker composition owns the saver instance; capture invokes the preparation/POST function with the captured environment. `apps/extension/src/background.ts:22` -> `createSaver`; `apps/extension/src/save.ts:122` -> `save(tab.id, env)`; `apps/extension/src/save.ts:26` -> `const save`

## Assumptions
- The identity key has no user/account component and the maps are memory-only, so coordination is limited to this saver instance rather than durable or per-user storage. `apps/extension/src/save.ts:21` -> `new Map`; `apps/extension/src/save.ts:118` -> `const key`
