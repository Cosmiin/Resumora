---
id: web-app/auth-login
area: web-app
files: ["apps/web/src/auth/LoginPage.tsx","apps/web/src/auth/authErrors.ts","apps/web/src/auth/auth.test.tsx"]
depends_on: ["web-app/auth-state","web-app/auth-layout","web-app/auth-reset","web-app/supabase","web-app/i18n"]
contract: false
checked_hash: 0db2a746
cited: [8b454d, 265d18, 3de633, a9687e, 30588d, 4a571a, 9fca16, fec3f7, 4b55b7, b136c7, 13eaa5, 769f03, 0392a4, 30588d, 013388, b65968, f3b5e2, b65968]
decisions: []
open: []
---
Handle password sign-in, sign-up, recovery requests and readable auth errors.

- The page starts in signIn mode; changing mode clears notices/errors but preserves email and password state. `apps/web/src/auth/LoginPage.tsx:26` -> `signIn`; `apps/web/src/auth/LoginPage.tsx:41` -> `switchTo`
- Redirect destinations accept a pathname beginning with one slash but not two, append a string search, omit hash, and otherwise use /cv. `apps/web/src/auth/LoginPage.tsx:33` -> `from`
- Any session immediately renders a replacement navigation to the computed destination. `apps/web/src/auth/LoginPage.tsx:39` -> `if (session)`
- Sign-in calls signInWithPassword; sign-up shows its confirmation notice only when there is no returned session and no error. `apps/web/src/auth/LoginPage.tsx:54` -> `signInWithPassword`; `apps/web/src/auth/LoginPage.tsx:57` -> `signUp`
- Recovery requests send the current origin plus /reset-password as redirectTo. `apps/web/src/auth/LoginPage.tsx:63` -> `resetPasswordForEmail`
- Submission catches thrown failures as auth.genericError and always clears busy. `apps/web/src/auth/LoginPage.tsx:69` -> `catch`
- Password minimum length is eight only for sign-up; forgot mode omits the password input. `apps/web/src/auth/LoginPage.tsx:85` -> `mode !== "forgot"`; `apps/web/src/auth/LoginPage.tsx:92` -> `minLength`
- Error mapping lowercases messages and checks wrong credentials, unconfirmed email, weak-password wording, then rate-limit wording before a generic fallback. `apps/web/src/auth/authErrors.ts:5` -> `toLowerCase`
- tested by `apps/web/src/auth/auth.test.tsx:96` -> `wrong password`
- tested by `apps/web/src/auth/auth.test.tsx:119` -> `needs confirmation`
## Connections
- Uses the singleton Supabase client: `apps/web/src/auth/LoginPage.tsx:54` -> `supabase.auth`; `apps/web/src/lib/supabase.ts:10` -> `createClient`
- Recovery URL matches the public reset route: `apps/web/src/auth/LoginPage.tsx:64` -> `/reset-password`; `apps/web/src/router.tsx:13` -> `/reset-password`
## Assumptions
- The recovery redirect depends on the browser origin and Supabase accepting that redirect target. `apps/web/src/auth/LoginPage.tsx:64` -> `window.location.origin`
