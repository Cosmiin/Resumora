---
id: web-app/styles-editor
area: web-app
files: ["apps/web/src/styles/editor.css"]
depends_on: ["web-app/styles-base","web-editor/page","web-editor/bottom-sheet","web-editor/history"]
contract: false
checked_hash: 2af07ff8
cited: [7bf245, 1ff255, f15f03, e54d9b, 085a3c, 620aa3, ff311b, 1c98eb, 78830e, 83f26f, 1673bc, 585600, 78830e, 2cb6f4, 6c23da, 0f9e6b, ae8b6e, ce3a6c, 1c39e2, 76aa84, b5038d, 3e71b1, ff311b, 162bfe, d0a74a, 418c07, 6b83cf, ff311b, b91902, ff311b, 83f26f]
decisions: []
open: []
---
Lay out editor pages, shared sticky panels, mobile sheets and history.

- Global save-status variants, conflict-banner/actions and skill-group/skill-row rules style saving and skill state; .hint is also an unscoped helper. `apps/web/src/styles/editor.css:1` -> `.save-status`; `apps/web/src/styles/editor.css:14` -> `.conflict-actions`; `apps/web/src/styles/editor.css:28` -> `.conflict-banner`; `apps/web/src/styles/editor.css:39` -> `.skill-group`; `apps/web/src/styles/editor.css:43` -> `.hint`
- .editor-workspace starts as a page-plus-330px grid; global .stage sets the page padding and removes its focus outline. `apps/web/src/styles/editor.css:47` -> `.editor-workspace`
- Unprefixed .panel is globally sticky at top zero, capped at viewport height and vertically scrollable, with a single minmax(0,1fr) column. `apps/web/src/styles/editor.css:51` -> `.panel`; `apps/web/src/styles/editor.css:61` -> `grid-template-columns`
- Above 900px the workspace becomes a centered flex layout; .stage loses padding and direct .panel children become 340px wide, sticky 28px down with viewport-minus-56px height. `apps/web/src/styles/editor.css:69` -> `width > 900px`; `apps/web/src/styles/editor.css:77` -> `.editor-workspace > .panel`
- At 899px and below, global .panel becomes static, uncapped and top-bordered, and .stage padding changes. Exactly 900px uses neither of these workspace media overrides. `apps/web/src/styles/editor.css:86` -> `899px`; `apps/web/src/styles/editor.css:88` -> `.panel`; `apps/web/src/styles/editor.css:69` -> `900px`
- Global .sheet is fixed at the bottom with safe-area padding; .peek caps at 176px plus safe area, .full at 80vh; only the full sheet body scrolls. `apps/web/src/styles/editor.css:93` -> `.sheet`; `apps/web/src/styles/editor.css:104` -> `.sheet-body`
- A sheet inside the workspace reserves bottom space on .stage using :has; its nested .panel gets separate border/padding overrides. `apps/web/src/styles/editor.css:106` -> `.sheet .panel`; `apps/web/src/styles/editor.css:108` -> `:has(.sheet)`
- Global .side-panel is sticky/scrollable on desktop and fixed full-screen at 900px or below; close-icon/back controls swap there. `apps/web/src/styles/editor.css:110` -> `.side-panel`; `apps/web/src/styles/editor.css:149` -> `900px`
- The later narrow .side-panel.history-panel override changes that full-screen panel to a bottom sheet capped at 55vh, with its body scrolling and stage reserving 55vh. `apps/web/src/styles/editor.css:167` -> `@media`; `apps/web/src/styles/editor.css:179` -> `.side-panel-body`
## Connections
- Used by the helper panel and mobile sheet components: `apps/web/src/cv/panel/HelperPanel.tsx:34` -> `className="panel"`; `apps/web/src/styles/editor.css:51` -> `.panel`; `apps/web/src/cv/panel/BottomSheet.tsx:27` -> `sheet`; `apps/web/src/styles/editor.css:99` -> `.sheet.peek`
- Shared panel typography is layered later: `apps/web/src/main.tsx:12` -> `editor.css`; `apps/web/src/main.tsx:15` -> `panel.css`; `apps/web/src/styles/editor.css:51` -> `.panel`; `apps/web/src/styles/panel.css:2` -> `.panel`
## Assumptions
- .panel and .stage affect any matching element globally; desktop panel sizing additionally requires direct workspace-child placement. `apps/web/src/styles/editor.css:51` -> `.panel`; `apps/web/src/styles/editor.css:77` -> `>`
