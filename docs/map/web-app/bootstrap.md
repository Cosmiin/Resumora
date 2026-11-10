---
id: web-app/bootstrap
area: web-app
files: ["apps/web/src/main.tsx","apps/web/src/router.tsx","apps/web/index.html"]
depends_on: ["web-app/auth-state","web-app/auth-login","web-app/auth-reset","web-app/styles-base","web-editor/page","web-app/jobs-list","web-app/job-page","web-tailor/flow","web-tailor/page"]
contract: false
checked_hash: 4e3650e4
decisions: []
open: []
---
Mount the browser application and choose public and authenticated pages.

- The HTML document fixes its language to English and supplies the root element and module entry. `apps/web/index.html:2` -> `lang="en"`; `apps/web/index.html:9` -> `id="root"`; `apps/web/index.html:10` -> `/src/main.tsx`
- One module-level QueryClient retries failed queries once and disables refetch on window focus. `apps/web/src/main.tsx:20` -> `queryClient`
- StrictMode wraps QueryClientProvider, then AuthProvider, then RouterProvider. `apps/web/src/main.tsx:26` -> `StrictMode`
- Login and password reset sit outside RequireAuth; the CV, jobs, tailoring flow and tailored document sit inside it. `apps/web/src/router.tsx:12` -> `/login`; `apps/web/src/router.tsx:15` -> `RequireAuth`
- Root redirects to /cv with replacement, and unmatched paths first redirect to root. `apps/web/src/router.tsx:17` -> `replace`; `apps/web/src/router.tsx:25` -> `replace`
- Global styles load in explicit order: tokens, app, auth, editor, review, CV page, panel, enrich, jobs, focus. Later rules can affect earlier feature markup. `apps/web/src/main.tsx:9` -> `tokens.css`
## Connections
- Uses the auth guard for the protected route branch: `apps/web/src/router.tsx:15` -> `RequireAuth`; `apps/web/src/auth/RequireAuth.tsx:10` -> `Navigate`
- Uses the CV, job and tailoring pages by route: `apps/web/src/router.tsx:18` -> `CvPage`; `apps/web/src/cv/CvPage.tsx:18` -> `CvPage`; `apps/web/src/router.tsx:20` -> `JobPage`; `apps/web/src/jobs/JobPage.tsx:18` -> `JobPage`; `apps/web/src/router.tsx:21` -> `TailorFlow`; `apps/web/src/tailor/TailorFlow.tsx:25` -> `TailorFlow`
## Assumptions
- The non-null root assertion relies on index.html retaining its root element. `apps/web/src/main.tsx:25` -> `getElementById`; `apps/web/index.html:9` -> `root`
