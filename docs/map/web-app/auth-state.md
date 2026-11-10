---
id: web-app/auth-state
area: web-app
files: ["apps/web/src/auth/AuthProvider.tsx","apps/web/src/auth/RequireAuth.tsx","apps/web/src/auth/auth.test.tsx"]
depends_on: ["web-app/supabase","web-app/i18n","api-core/auth"]
contract: false
checked_hash: 3aaf922a
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
Expose the browser session and gate signed-in routes.

- Context defaults to a null session with loading true, including consumers without a provider. `apps/web/src/auth/AuthProvider.tsx:7` -> `createContext`
- On mount the provider reads getSession and subscribes to all auth-state changes; either result sets loading false. `apps/web/src/auth/AuthProvider.tsx:14` -> `getSession`
- Cleanup marks the effect inactive and unsubscribes, preventing subsequent callbacks from setting state. `apps/web/src/auth/AuthProvider.tsx:20` -> `return () =>`
- useAuth returns context directly, with no separate validation or exception for missing provider. `apps/web/src/auth/AuthProvider.tsx:29` -> `useAuth`
- RequireAuth shows loading text until initialization, then redirects a null session to /login with the full location in state.from; a session renders Outlet. `apps/web/src/auth/RequireAuth.tsx:9` -> `if (loading)`
- tested by `apps/web/src/auth/auth.test.tsx:44` -> `redirects to login`
## Connections
- Used by the protected router branch: `apps/web/src/router.tsx:15` -> `RequireAuth`; `apps/web/src/auth/RequireAuth.tsx:6` -> `RequireAuth`
- Login consumes the saved destination: `apps/web/src/auth/RequireAuth.tsx:10` -> `from: location`; `apps/web/src/auth/LoginPage.tsx:33` -> `location.state?.from`
- A transport sign-out updates the same observed auth state: `apps/web/src/lib/api.ts:43` -> `signOut`; `apps/web/src/auth/AuthProvider.tsx:17` -> `onAuthStateChange`
## Assumptions
- Session presence is a UI gate, while API requests separately verify tokens. `apps/web/src/auth/RequireAuth.tsx:10` -> `!session`; `apps/api/src/app.ts:68` -> `verifyToken`
