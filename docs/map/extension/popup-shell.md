---
id: extension/popup-shell
area: extension
files: ["apps/extension/popup.html","apps/extension/src/popup/popup.css","apps/extension/src/copy.ts"]
depends_on: ["extension/environments"]
contract: false
checked_hash: beed1606
decisions: []
open: []
---
Supply the popup document, visual states and extension-specific user-facing copy.

- The document has a header badge, empty main and footer, and a module entry script for popup.ts. `apps/extension/popup.html:11` -> `environment-badge`; `apps/extension/popup.html:15` -> `popup.ts`
- The body is fixed at 320px wide with zero margin. `apps/extension/src/popup/popup.css:7` -> `body`
- Direct main and form buttons fill their container, except .link-button uses auto width for Capture anyway; disabled buttons lower opacity and show a not-allowed cursor. `apps/extension/src/popup/popup.css:48` -> `width: 100%`; `apps/extension/src/popup/popup.css:51` -> `width: auto`; `apps/extension/src/popup/view.ts:101` -> `link-button`; `apps/extension/src/popup/popup.css:47` -> `button:disabled`
- Paragraphs and request-id small text permit wrapping anywhere. `apps/extension/src/popup/popup.css:42` -> `overflow-wrap`; `apps/extension/src/popup/popup.css:58` -> `overflow-wrap`
- Spinner animation is disabled when reduced motion is preferred. `apps/extension/src/popup/popup.css:73` -> `prefers-reduced-motion`
- Connection-failure copy differs for Local and Hosted. `apps/extension/src/copy.ts:6` -> `cantReach`
- Saved copy says extraction is still in progress; existing copy says nothing new was added. `apps/extension/src/copy.ts:28` -> `savedText`; `apps/extension/src/copy.ts:31` -> `existingText`
- Request-id copy is generated from the supplied id; invalid-URL and oversized-page copy have dedicated keys. `apps/extension/src/copy.ts:38` -> `requestId`

## Connections
- The HTML script loads the popup controller, which imports these styles. `apps/extension/popup.html:15` -> `popup.ts`; `apps/extension/src/popup/popup.ts:5` -> `popup.css`
- The renderer's spinner class and alert role bind to style rules. `apps/extension/src/popup/view.ts:92` -> `spinner`; `apps/extension/src/popup/popup.css:60` -> `.spinner`; `apps/extension/src/popup/view.ts:63` -> `alert`; `apps/extension/src/popup/popup.css:59` -> `alert`
- Auth and save failures consume environment-aware copy. `apps/extension/src/auth.ts:68` -> `copy.cantReach`; `apps/extension/src/save.ts:67` -> `copy.cantReach`; `apps/extension/src/copy.ts:6` -> `cantReach`

## Assumptions
- The controller expects exactly these main/footer/badge hooks to exist and uses non-null assertions. `apps/extension/popup.html:11` -> `environment-badge`; `apps/extension/popup.html:13` -> `main`; `apps/extension/src/popup/popup.ts:45` -> `querySelector`
