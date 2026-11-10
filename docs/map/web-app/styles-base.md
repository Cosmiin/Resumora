---
id: web-app/styles-base
area: web-app
files: ["apps/web/src/styles/app.css"]
depends_on: ["web-app/styles-tokens"]
contract: false
checked_hash: a8cb8611
decisions: []
open: []
---
Define global element defaults and reusable shell/form classes.

- The global reset applies border-box to all elements and pseudo-elements; body gets zero margin and global fonts/colors. `apps/web/src/styles/app.css:1` -> `*`; `apps/web/src/styles/app.css:13` -> `body`
- Unscoped button defaults include disabled opacity and cursor; button.link removes background/border/padding, and button.secondary switches to a white background. `apps/web/src/styles/app.css:20` -> `button`; `apps/web/src/styles/app.css:29` -> `button:disabled`; `apps/web/src/styles/app.css:33` -> `button.link`
- All input/textarea elements default to full width with borders and padding; all labels are grids. label.checkbox overrides the grid and its input width. `apps/web/src/styles/app.css:45` -> `input`; `apps/web/src/styles/app.css:54` -> `label`; `apps/web/src/styles/app.css:136` -> `label.checkbox`
- Global .form-error, .form-notice, .page-loading and .page-error styles support multiple feature areas. `apps/web/src/styles/app.css:60` -> `.form-error`; `apps/web/src/styles/app.css:64` -> `.form-notice`; `apps/web/src/styles/app.css:132` -> `.page-loading`; `apps/web/src/styles/app.css:145` -> `.page-error`
- Shell styles use app-* names; active navigation follows aria-current, and the account popup is absolutely positioned with z-index 20. `apps/web/src/styles/app.css:91` -> `aria-current`; `apps/web/src/styles/app.css:112` -> `.app-account-menu`
- Feature naming uses auth-*, import-*, cv-*, job(s)-*, fm-* and tailor-* families, but these are ordinary global selectors, not CSS modules; shared unprefixed selectors still participate in the same cascade. `apps/web/src/styles/auth.css:1` -> `.auth-layout`; `apps/web/src/styles/review.css:2` -> `.import-screen`; `apps/web/src/styles/cv-page.css:2` -> `.cv-page`; `apps/web/src/styles/jobs.css:1` -> `.jobs-page`; `apps/web/src/styles/focus.css:15` -> `.fm-left`; `apps/web/src/styles/tailor.css:3` -> `.tailor-mode`
## Connections
- Loaded before feature styles: `apps/web/src/main.tsx:9` -> `tokens.css`; `apps/web/src/main.tsx:10` -> `app.css`; `apps/web/src/styles/tokens.css:2` -> `:root`; `apps/web/src/styles/app.css:20` -> `button`
- Shared error styling is used by tailoring review: `apps/web/src/tailor/GuidedReview.tsx:85` -> `form-error`; `apps/web/src/styles/app.css:60` -> `.form-error`
- Global full-width fields require feature overrides: `apps/web/src/styles/app.css:48` -> `width: 100%`; `apps/web/src/styles/cv-page.css:51` -> `width: auto`; `apps/web/src/styles/tailor.css:145` -> `width: 18px`
## Assumptions
- Base rules rely on global tokens being loaded first; the header uses --white and --border-subtle without fallback values. `apps/web/src/main.tsx:9` -> `tokens.css`; `apps/web/src/main.tsx:10` -> `app.css`; `apps/web/src/styles/app.css:75` -> `--white`; `apps/web/src/styles/app.css:76` -> `--border-subtle`
