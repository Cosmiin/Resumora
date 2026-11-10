---
id: extension/environments
area: extension
files: ["apps/extension/src/environments.ts","apps/extension/src/config.ts","apps/extension/src/environments.test.ts"]
depends_on: []
contract: true
checked_hash: f0d4ff38
cited: [d8816e, 54f1ba, 226bd9, 8b6d3d, 95b4ad, a9c60c, cd5e46, 9e5ed4, dedf0e, aada42, b3b168, a9c60c, 49c080, a9c60c]
decisions: []
open: []
---
Choose local or hosted service endpoints from build-time browser configuration.

- EnvId has exactly local and hosted; EnvConfig carries id, label, API/web/Supabase URLs, a public key field and configured status. `apps/extension/src/environments.ts:1` -> `EnvId`; `apps/extension/src/environments.ts:3` -> `EnvConfig`
- Hosted reads VITE_HOSTED_API_URL, VITE_HOSTED_WEB_URL, VITE_HOSTED_SUPABASE_URL and VITE_HOSTED_SUPABASE_ANON_KEY; trailing URL slashes are removed. `apps/extension/src/environments.ts:16` -> `withoutTrailingSlashes`
- Local reads VITE_LOCAL_SUPABASE_URL and VITE_LOCAL_SUPABASE_ANON_KEY; its API and web endpoints are fixed loopback URLs. `apps/extension/src/environments.ts:33` -> `apiUrl`
- Local is configured solely when its public-key variable is truthy, with a fallback Supabase URL. `apps/extension/src/environments.ts:36` -> `VITE_LOCAL_SUPABASE_URL`
- Hosted is configured only with a truthy key and three parseable HTTPS URLs. `apps/extension/src/environments.ts:48` -> `configured`; `apps/extension/src/environments.ts:23` -> `https:`
- The exported runtime environments object is built from import.meta.env. `apps/extension/src/config.ts:3` -> `import.meta.env`
- tested by `apps/extension/src/environments.test.ts:11` -> `environmentsFrom`

## Connections
- API base selection flows from stored environment through background composition to the save request. `apps/extension/src/background.ts:25` -> `environment`; `apps/extension/src/save.ts:51` -> `apiUrl`
- Configured environments determine manifest host permissions. `apps/extension/src/environments.ts:48` -> `configured`; `apps/extension/src/manifest.ts:5` -> `configured`

## Assumptions
- Configuration checks availability, not whether an API and Supabase instance belong together; hosted validation only checks HTTPS and key presence. `apps/extension/src/environments.ts:48` -> `configured`
