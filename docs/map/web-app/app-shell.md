---
id: web-app/app-shell
area: web-app
files: ["apps/web/src/layout/AppShell.tsx","apps/web/src/auth/auth.test.tsx"]
depends_on: ["web-app/auth-state","web-app/supabase","web-app/i18n","web-editor/autosave","web-app/styles-base"]
contract: false
checked_hash: 655676e5
decisions: []
open: []
---
Wrap pages with navigation, actions and the account menu.

- Actions and children are separate slots; inert applies to the header only. `apps/web/src/layout/AppShell.tsx:41` -> `inert={inert}`; `apps/web/src/layout/AppShell.tsx:51` -> `actions`; `apps/web/src/layout/AppShell.tsx:70` -> `children`
- Account text comes from the session, defaults to empty and uses its first character uppercased as the button content. `apps/web/src/layout/AppShell.tsx:16` -> `useAuth`; `apps/web/src/layout/AppShell.tsx:60` -> `charAt`
- Escape or a mousedown outside the account container closes an open menu; listeners are removed on effect cleanup. `apps/web/src/layout/AppShell.tsx:22` -> `Escape`
- Sign-out checks the shared unsaved flag and may stop on a rejected confirmation; accepted sign-out is fire-and-forget. `apps/web/src/layout/AppShell.tsx:35` -> `hasUnsavedChanges`
- Both navigation links separately prevent default when unsaved-change confirmation is rejected. `apps/web/src/layout/AppShell.tsx:44` -> `/cv`; `apps/web/src/layout/AppShell.tsx:47` -> `/jobs`
- tested by `apps/web/src/auth/auth.test.tsx:159` -> `unsaved changes`
## Connections
- Uses the editor's shared unsaved flag: `apps/web/src/layout/AppShell.tsx:35` -> `hasUnsavedChanges`; `apps/web/src/cv/unsaved.ts:11` -> `hasUnsavedChanges`
- Used by the editor to make import-covered navigation inert: `apps/web/src/cv/Editor.tsx:224` -> `inert`; `apps/web/src/layout/AppShell.tsx:41` -> `inert`
- Navigation URLs match registered routes: `apps/web/src/layout/AppShell.tsx:47` -> `/jobs`; `apps/web/src/router.tsx:19` -> `/jobs`
## Assumptions
- Unsaved-change protection depends on callers maintaining the shared flag; the shell does not inspect form fields. `apps/web/src/layout/AppShell.tsx:6` -> `hasUnsavedChanges`; `apps/web/src/cv/unsaved.ts:7` -> `setUnsavedChanges`
