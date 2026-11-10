---
id: extension/popup-view
area: extension
files: ["apps/extension/src/popup/view.ts","apps/extension/src/popup/view.test.ts"]
depends_on: ["extension/messages","extension/environments","extension/popup-shell","web-app/auth-login"]
contract: false
checked_hash: 15d5f9b0
decisions: []
open: []
---
Render sign-in, capture and result views and route user actions to the popup controller.

- Each render clears prior children and writes display strings through textContent. `apps/extension/src/popup/view.ts:23` -> `replaceChildren`
- signedOut without a supplied state falls back to Local and the compiled environment list. `apps/extension/src/popup/view.ts:35` -> `"state" in view`
- Sign-in fields are labelled, required and use email/current-password autocomplete; form submit forwards the raw field strings. `apps/extension/src/popup/view.ts:41` -> `const field`; `apps/extension/src/popup/view.ts:59` -> `submit`
- Sign-in errors are rendered as role=alert. `apps/extension/src/popup/view.ts:63` -> `alert`
- Only unconfigured Hosted is disabled in the selector; changes pass the selected EnvId to setEnvironment. `apps/extension/src/popup/view.ts:67` -> `unavailable`; `apps/extension/src/popup/view.ts:75` -> `setEnvironment`
- Both create-account and forgot-password links go to the selected environment's /login page through openTab. `apps/extension/src/popup/view.ts:77` -> `copy.createAccount`
- Checking has a status role and an aria-hidden spinner. `apps/extension/src/popup/view.ts:88` -> `case "checking"`
- Capture anyway disables its button before retry; the capture button also disables before retry and exposes busy state with aria-busy. `apps/extension/src/popup/view.ts:100` -> `captureAnyway`; `apps/extension/src/popup/view.ts:111` -> `view.busy`; `apps/extension/src/popup/view.ts:120` -> `click`
- Saved and existing use distinct copy but both open the supplied openUrl. `apps/extension/src/popup/view.ts:126` -> `case "saved"`
- couldntRead offers the supplied pasteUrl; cantRead only displays a heading. `apps/extension/src/popup/view.ts:136` -> `case "couldntRead"`
- Error views display the message, an optional request id and a retry button. `apps/extension/src/popup/view.ts:144` -> `case "error"`
- tested by `apps/extension/src/popup/view.test.ts:19` -> `popup views`

## Connections
- Controller calls this renderer and supplies retry/sign-in/open-tab actions. `apps/extension/src/popup/popup.ts:80` -> `renderView`; `apps/extension/src/popup/view.ts:21` -> `renderView`; `apps/extension/src/popup/popup.ts:146` -> `actions`
- Login links resolve to the web router's LoginPage. `apps/extension/src/popup/view.ts:78` -> `/login`; `apps/web/src/router.tsx:12` -> `/login`
- Capture anyway feeds the controller retry decision; after a completed page check retryCheck is false, so it saves. `apps/extension/src/popup/view.ts:104` -> `actions.retry`; `apps/extension/src/popup/popup.ts:103` -> `retryCheck = false`; `apps/extension/src/popup/popup.ts:168` -> `retryCheck`

## Assumptions
- Display text is not interpreted as HTML, including worker-provided messages. `apps/extension/src/popup/view.ts:26` -> `textContent`; `apps/extension/src/popup/view.ts:146` -> `view.message`
- The selector's UI availability rule is weaker than the handler's: Local can be selected in the view even if unconfigured, but the handler refuses unconfigured targets. `apps/extension/src/popup/view.ts:67` -> `env.id === "hosted"`; `apps/extension/src/handler.ts:37` -> `configured`
