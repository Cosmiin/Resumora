---
id: extension/messages
area: extension
files: ["apps/extension/src/messages.ts"]
depends_on: ["extension/environments"]
contract: true
checked_hash: e7002cf5
decisions: []
open: []
---
Define popup-to-background requests and the state, check and save replies.

- getState, signOut, checkActiveTab, joinCapture and saveActiveTab contain only their type discriminator. `apps/extension/src/messages.ts:4` -> `getState`
- signIn adds email and password strings; setEnvironment adds an EnvId. `apps/extension/src/messages.ts:5` -> `signIn`
- PopupState contains env, nullable email and environment summaries limited to id, label and configured. `apps/extension/src/messages.ts:12` -> `PopupState`
- SignInReply is either ok:true with PopupState or ok:false with a message. `apps/extension/src/messages.ts:18` -> `SignInReply`
- CheckResult distinguishes capture, capturing, notJob, cantRead and couldntRead with pasteUrl. `apps/extension/src/messages.ts:22` -> `CheckResult`
- SaveResult uses openUrl for saved/existing, pasteUrl for couldntRead, only kind for cantRead, nullable message for signedOut, and message plus nullable requestId for error. `apps/extension/src/messages.ts:29` -> `SaveResult`

## Connections
- The popup sends getState; the handler replies with PopupState. `apps/extension/src/popup/popup.ts:172` -> `getState`; `apps/extension/src/handler.ts:24` -> `getState`
- signIn sender supplies credentials; handler returns SignInReply. `apps/extension/src/popup/popup.ts:151` -> `signIn`; `apps/extension/src/handler.ts:26` -> `signIn`
- The popup sends signOut; the handler replies with the updated state. `apps/extension/src/popup/popup.ts:164` -> `signOut`; `apps/extension/src/handler.ts:33` -> `signOut`
- The popup requests setEnvironment; the handler accepts configured targets. `apps/extension/src/popup/popup.ts:163` -> `setEnvironment`; `apps/extension/src/handler.ts:36` -> `setEnvironment`
- The popup sends checkActiveTab; the handler replies with the saver check result. `apps/extension/src/popup/popup.ts:100` -> `checkActiveTab`; `apps/extension/src/handler.ts:40` -> `checkActiveTab`
- joinCapture is selected after a capturing reply, sent through save(type), and dispatched to the saver. `apps/extension/src/popup/popup.ts:104` -> `joinCapture`; `apps/extension/src/popup/popup.ts:116` -> `send({ type })`; `apps/extension/src/handler.ts:42` -> `joinCapture`
- saveActiveTab is save's default request type, sent through send(type) and dispatched by the handler. `apps/extension/src/popup/popup.ts:111` -> `saveActiveTab`; `apps/extension/src/popup/popup.ts:116` -> `send({ type })`; `apps/extension/src/handler.ts:44` -> `saveActiveTab`
- The injected reader uses function execution results, not these runtime message types; its shape is url, pageText and jsonLd. `apps/extension/src/background.ts:33` -> `executeScript`; `apps/extension/src/reader-entry.ts:8` -> `__resumoraReadPage`; `apps/extension/src/readers/index.ts:4` -> `ReaderResult`

## Assumptions
- Request is a TypeScript contract, not runtime validation: the background casts incoming messages and ignores sender. `apps/extension/src/background.ts:50` -> `_sender`; `apps/extension/src/background.ts:51` -> `message as Request`
