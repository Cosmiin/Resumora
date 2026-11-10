---
id: extension/handler
area: extension
files: ["apps/extension/src/handler.ts","apps/extension/src/handler.test.ts"]
depends_on: ["extension/messages","extension/storage","extension/auth-session","extension/capture-check","extension/capture-state"]
contract: false
checked_hash: 5bb002cf
cited: [614021, 6333ac, 1e1f73, 50bf5c, 7b5ab0, 3ac3a8, 088b97, 4a6fb6, c8ead1, bc3229, 7c2c55, 2f5646, 7b5ab0]
decisions: []
open: []
---
Dispatch popup requests against the currently selected environment.

- Every request reads the stored environment before switching on the message type. `apps/extension/src/handler.ts:22` -> `getEnvId`
- State resolves email from auth and publishes only environment id, label and configured fields. `apps/extension/src/handler.ts:13` -> `state`
- Successful sign-in returns freshly read state; failed sign-in returns the auth failure unchanged. `apps/extension/src/handler.ts:27` -> `auth.signIn`
- Sign-out waits for auth clearing before reading state. `apps/extension/src/handler.ts:34` -> `auth.signOut`
- Unconfigured switches return the current state without writing the environment. `apps/extension/src/handler.ts:37` -> `configured`
- Check, join and save dispatch separately; join does not invoke saveActiveTab. `apps/extension/src/handler.ts:40` -> `checkActiveTab`
- tested by `apps/extension/src/handler.test.ts:30` -> `popup message handler`

## Connections
- Background composition supplies this handler to runtime message registration. `apps/extension/src/background.ts:43` -> `createHandler`; `apps/extension/src/handler.ts:7` -> `createHandler`; `apps/extension/src/background.ts:58` -> `registerMessages`
- State email comes from stored session JSON, through auth.email. `apps/extension/src/handler.ts:15` -> `auth.email`; `apps/extension/src/auth.ts:73` -> `async email`

## Assumptions
- setEnvironment assumes a valid EnvId; an arbitrary runtime value would index environments without a guard. `apps/extension/src/handler.ts:37` -> `deps.environments[req.env]`
