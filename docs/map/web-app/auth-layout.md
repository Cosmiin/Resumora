---
id: web-app/auth-layout
area: web-app
files: ["apps/web/src/auth/AuthLayout.tsx","apps/web/src/styles/auth.css","apps/web/src/auth/auth.test.tsx"]
depends_on: ["web-app/i18n","web-app/styles-base"]
contract: false
checked_hash: 776e2a0b
cited: [373100, fddf0d, 760a9d, 5bc2bc, 397be0, a47822, cf6d94, 641e1e, 0cbaf7, 40ab17, 59103d, 3023fb, fddf0d, 12f424, 5bc2bc, acb0fe, cf6d94]
decisions: []
open: []
---
Share the product introduction and responsive form presentation across auth pages.

- The layout renders a main landmark with the product introduction followed by children in the form column. `apps/web/src/auth/AuthLayout.tsx:7` -> `auth-layout`; `apps/web/src/auth/AuthLayout.tsx:27` -> `children`
- Decorative CV markup is hidden from assistive technology. `apps/web/src/auth/AuthLayout.tsx:12` -> `aria-hidden`
- Desktop auth layout fills at least the viewport and uses equal columns. `apps/web/src/styles/auth.css:1` -> `.auth-layout`
- At 900px and below the layout becomes one column and drops its viewport minimum height. `apps/web/src/styles/auth.css:113` -> `@media`
- Narrow layouts hide both descriptive promise text and the sketch. `apps/web/src/styles/auth.css:127` -> `.auth-promise-text`
- Form inputs and submit/link buttons have a 44px minimum height; the form is capped at 380px. `apps/web/src/styles/auth.css:78` -> `.auth-form`; `apps/web/src/styles/auth.css:93` -> `.auth-form input`; `apps/web/src/styles/auth.css:109` -> `button.link`
- tested by `apps/web/src/auth/auth.test.tsx:87` -> `product promise`
## Connections
- Used by both auth pages, through the same children slot: `apps/web/src/auth/LoginPage.tsx:77` -> `AuthLayout`; `apps/web/src/auth/ResetPasswordPage.tsx:27` -> `AuthLayout`; `apps/web/src/auth/AuthLayout.tsx:27` -> `children`
- Uses globally loaded auth-prefixed CSS: `apps/web/src/main.tsx:11` -> `auth.css`; `apps/web/src/styles/auth.css:1` -> `.auth-layout`
## Assumptions
- Forms must keep their auth-form class to receive the width and control overrides. `apps/web/src/auth/LoginPage.tsx:78` -> `auth-form`; `apps/web/src/styles/auth.css:78` -> `.auth-form`
