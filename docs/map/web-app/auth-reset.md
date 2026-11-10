---
id: web-app/auth-reset
area: web-app
files: ["apps/web/src/auth/ResetPasswordPage.tsx"]
depends_on: ["web-app/auth-login","web-app/auth-layout","web-app/supabase","web-app/i18n"]
contract: false
checked_hash: a784708f
cited: [a229d9, 6575d2, 861719, b2dbc1, c5da0c, 30c00d, 861719, f3b5e2, bd3354, b2dbc1, 0484a2, f3b5e2, 861719]
decisions: []
open: []
---
Change the current Supabase session's password from the recovery page.

- The reset form stores password, busy, error and completion locally. `apps/web/src/auth/ResetPasswordPage.tsx:11` -> `useState`
- Submitting prevents the form navigation, marks busy and clears an earlier error before updateUser. `apps/web/src/auth/ResetPasswordPage.tsx:17` -> `preventDefault`
- The submitted payload is only the password; no recovery token is sent explicitly by this component. `apps/web/src/auth/ResetPasswordPage.tsx:20` -> `updateUser({ password })`
- Returned errors use authErrorKey; success replaces the input with a status message and /cv link. `apps/web/src/auth/ResetPasswordPage.tsx:22` -> `authErrorKey`; `apps/web/src/auth/ResetPasswordPage.tsx:30` -> `done`
- The password is required, has new-password autocomplete and an eight-character browser minimum; submission is disabled while busy. `apps/web/src/auth/ResetPasswordPage.tsx:38` -> `minLength={8}`
- A rejected updateUser promise bypasses the following busy reset because submit has no catch/finally. `apps/web/src/auth/ResetPasswordPage.tsx:20` -> `await`
## Connections
- Used by the public reset route: `apps/web/src/router.tsx:13` -> `ResetPasswordPage`; `apps/web/src/auth/ResetPasswordPage.tsx:10` -> `ResetPasswordPage`
- Uses shared auth error translation: `apps/web/src/auth/ResetPasswordPage.tsx:22` -> `authErrorKey`; `apps/web/src/auth/authErrors.ts:4` -> `authErrorKey`
## Assumptions
- The page relies on Supabase's current authenticated/recovery session; it is public in the router and performs no local session check. `apps/web/src/router.tsx:13` -> `/reset-password`; `apps/web/src/auth/ResetPasswordPage.tsx:20` -> `updateUser`
