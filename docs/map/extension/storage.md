---
id: extension/storage
area: extension
files: ["apps/extension/src/storage.ts","apps/extension/src/handler.test.ts"]
depends_on: ["extension/environments"]
contract: false
checked_hash: 41cc89de
cited: [519dd7, 7f13a1, ea352f, bbec03, 74c70c, 17cc98, 6f3bc3, 58af10, 05121f, cdab0d, 614021, 013711, e33686, 372efe, ea352f, 69d6f9]
decisions: []
open: []
---
Persist environment selection and string-valued auth data through an interchangeable storage adapter.

- The storage interface exposes asynchronous get, set and remove, with nullable string reads. `apps/extension/src/storage.ts:3` -> `KeyValueStorage`
- The browser adapter uses chrome.storage.local and maps non-string values to null. `apps/extension/src/storage.ts:12` -> `storage.local`; `apps/extension/src/storage.ts:19` -> `typeof value`
- Writes use a single computed property and removals forward the key. `apps/extension/src/storage.ts:21` -> `local.set`
- The memory adapter uses a Map and implements the same string API without persistence. `apps/extension/src/storage.ts:26` -> `memoryStorage`
- Only the exact stored value hosted selects Hosted; absent or unknown values select Local. `apps/extension/src/storage.ts:36` -> `"hosted"`
- Environment changes write the shared env key. `apps/extension/src/storage.ts:40` -> `"env"`
- tested by `apps/extension/src/handler.test.ts:118` -> `Chrome storage adapter`

## Connections
- Auth adapts this interface to Supabase storage method names. `apps/extension/src/auth.ts:38` -> `deps.storage.get`; `apps/extension/src/storage.ts:17` -> `async get`
- Handler selection uses the stored environment on each request and persists accepted switches. `apps/extension/src/handler.ts:22` -> `getEnvId`; `apps/extension/src/storage.ts:35` -> `getEnvId`; `apps/extension/src/handler.ts:38` -> `setEnvId`; `apps/extension/src/storage.ts:39` -> `setEnvId`

## Assumptions
- Storage only checks primitive type; auth is responsible for parsing stored session JSON. `apps/extension/src/storage.ts:19` -> `typeof value`; `apps/extension/src/auth.ts:78` -> `JSON.parse`
