---
id: web-app/supabase
area: web-app
files: ["apps/web/src/lib/supabase.ts","apps/web/.env.example"]
depends_on: ["api-core/auth"]
contract: false
checked_hash: 488464c4
cited: [62f602, b54c8e, 86bd66, 013388, 83577a, afb160, c5195b, 013388, c08448, b54c8e, b54c8e, 827316]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
Create the shared browser Supabase client and identify its environment contract.

- The client reads VITE_SUPABASE_URL from import.meta.env. `apps/web/src/lib/supabase.ts:3` -> `VITE_SUPABASE_URL`
- The second input is VITE_SUPABASE_ANON_KEY, also read at module initialization. `apps/web/src/lib/supabase.ts:4` -> `VITE_SUPABASE_ANON_KEY`
- Either missing or empty input throws before a client is exported. `apps/web/src/lib/supabase.ts:6` -> `if (!url || !anonKey)`
- One exported client is constructed with only URL and anonymous-key arguments; no custom auth or storage options are passed here. `apps/web/src/lib/supabase.ts:10` -> `createClient(url, anonKey)`
- The missing-configuration error points at the example-file setup workflow; this entry records variable names from code without reading environment files. `apps/web/src/lib/supabase.ts:7` -> `Missing VITE_SUPABASE_URL`
## Connections
- Used by both auth state and authenticated HTTP transport: `apps/web/src/auth/AuthProvider.tsx:14` -> `supabase.auth.getSession`; `apps/web/src/lib/api.ts:33` -> `supabase.auth.getSession`; `apps/web/src/lib/supabase.ts:10` -> `supabase`
- Test configuration supplies the same variable names: `apps/web/vite.config.ts:19` -> `VITE_SUPABASE_ANON_KEY`; `apps/web/src/lib/supabase.ts:4` -> `VITE_SUPABASE_ANON_KEY`
## Assumptions
- The browser uses a public client credential; protected API access separately verifies the user's access token with Supabase claims. `apps/web/src/lib/supabase.ts:4` -> `VITE_SUPABASE_ANON_KEY`; `apps/api/src/auth.ts:16` -> `getClaims(token)`
