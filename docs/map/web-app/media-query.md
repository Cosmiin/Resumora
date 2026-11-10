---
id: web-app/media-query
area: web-app
files: ["apps/web/src/hooks/useMediaQuery.ts"]
depends_on: ["web-app/styles-editor","web-editor/page"]
contract: false
checked_hash: 0400bb23
decisions: []
open: []
---
Expose a CSS media-query match as a subscribed React value.

- The hook accepts an arbitrary query string and memoizes its subscription against that string. `apps/web/src/hooks/useMediaQuery.ts:4` -> `useMediaQuery`; `apps/web/src/hooks/useMediaQuery.ts:12` -> `[query]`
- Missing matchMedia makes subscription a no-op. `apps/web/src/hooks/useMediaQuery.ts:7` -> `typeof window.matchMedia`
- Change events notify React, and cleanup removes the same listener from the query list. `apps/web/src/hooks/useMediaQuery.ts:9` -> `addEventListener`
- The client snapshot evaluates matchMedia(query).matches and returns false when unavailable. `apps/web/src/hooks/useMediaQuery.ts:16` -> `matches`
- The server snapshot always returns false. `apps/web/src/hooks/useMediaQuery.ts:17` -> `() => false`
## Connections
- Used by Editor to select the phone layout at 899px: `apps/web/src/cv/Editor.tsx:91` -> `useMediaQuery`; `apps/web/src/hooks/useMediaQuery.ts:4` -> `useMediaQuery`
- The editor CSS has a matching narrow panel rule: `apps/web/src/cv/Editor.tsx:91` -> `899px`; `apps/web/src/styles/editor.css:86` -> `899px`
## Assumptions
- A supported matchMedia object must implement addEventListener/removeEventListener; there is no legacy addListener branch. `apps/web/src/hooks/useMediaQuery.ts:9` -> `addEventListener`
