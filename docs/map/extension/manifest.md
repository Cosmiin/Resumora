---
id: extension/manifest
area: extension
files: ["apps/extension/src/manifest.ts","apps/extension/src/manifest.test.ts"]
depends_on: ["extension/environments","extension/background","extension/storage","extension/auth-session","extension/api"]
contract: false
checked_hash: 74ba5a33
decisions: []
open: []
---
Declare extension entry points and the permissions required by capture and authentication.

- The manifest is MV3 with a module service worker at background.js. `apps/extension/src/manifest.ts:10` -> `manifest_version`; `apps/extension/src/manifest.ts:18` -> `service_worker`
- The toolbar action opens popup.html. `apps/extension/src/manifest.ts:15` -> `default_popup`
- The permission list contains activeTab, scripting and storage. `apps/extension/src/manifest.ts:19` -> `permissions`
- Host permissions include only configured environments' API and Supabase origins, each with a wildcard path. `apps/extension/src/manifest.ts:4` -> `origins`
- Origins are deduplicated and sorted; web-app origins are not included by the endpoint selection. `apps/extension/src/manifest.ts:6` -> `env.apiUrl`; `apps/extension/src/manifest.ts:20` -> `host_permissions`
- tested by `apps/extension/src/manifest.test.ts:13` -> `buildManifest`

## Connections
- activeTab supports capture of the selected tab, and scripting is used for both reader injection calls. `apps/extension/src/manifest.ts:19` -> `activeTab`; `apps/extension/src/background.ts:27` -> `tabs.query`; `apps/extension/src/background.ts:32` -> `executeScript`
- storage backs persistent environment and auth state. `apps/extension/src/manifest.ts:19` -> `storage`; `apps/extension/src/storage.ts:12` -> `storage.local`; `apps/extension/src/auth.ts:38` -> `deps.storage.get`
- API host permission corresponds to the jobs POST; Supabase host permission corresponds to the auth client endpoint. `apps/extension/src/manifest.ts:6` -> `env.apiUrl`; `apps/extension/src/api.ts:21` -> `/v1/jobs`; `apps/extension/src/auth.ts:35` -> `config.supabaseUrl`

## Assumptions
- Capture relies on browser-granted active-tab access rather than broad job-board host permissions. `apps/extension/src/manifest.ts:19` -> `activeTab`; `apps/extension/src/manifest.ts:6` -> `env.supabaseUrl`; `apps/extension/src/background.ts:32` -> `executeScript`
