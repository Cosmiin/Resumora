---
id: web-app/styles-panel
area: web-app
files: ["apps/web/src/styles/panel.css"]
depends_on: ["web-app/styles-base","web-app/styles-editor","web-editor/overview","web-editor/section-tools","web-enrich/skills","web-app/tailor-gate"]
contract: false
checked_hash: e9734798
decisions: []
open: []
---
Supply shared helper-panel controls and unprefixed utility classes used beyond the panel.

- Global .panel typography raises selected nested controls to 14px but leaves layout/sticky behavior to editor.css. `apps/web/src/styles/panel.css:2` -> `.panel`
- Global .p-h, .p-sub, .health, .flag, .pill and .all-good style panel headings/status; .flag.tip changes color and its nested pill. `apps/web/src/styles/panel.css:6` -> `.p-h`; `apps/web/src/styles/panel.css:9` -> `.flag`; `apps/web/src/styles/panel.css:16` -> `.all-good`
- Global .sec-list/.sec-row style section rows; nested .drag-grip becomes static and fully visible, overriding document grip positioning. `apps/web/src/styles/panel.css:19` -> `.sec-list`; `apps/web/src/styles/panel.css:22` -> `.drag-grip`
- .icon-btn is a global 28px button with hover/focus and aria-pressed=false variants; .add-sec controls section adding. `apps/web/src/styles/panel.css:27` -> `.icon-btn`; `apps/web/src/styles/panel.css:32` -> `.add-sec`
- Global .fine provides muted small text; .btn sets shared button chrome with .primary and .danger variants and keyboard outlines. `apps/web/src/styles/panel.css:35` -> `.fine`; `apps/web/src/styles/panel.css:38` -> `.btn`
- Global .ctx-head, .box, .box-title, .toggle and .switch style section tools; switch checked state moves its pseudo-element thumb. `apps/web/src/styles/panel.css:47` -> `.ctx-head`; `apps/web/src/styles/panel.css:52` -> `.switch`; `apps/web/src/styles/panel.css:55` -> `translateX`
- Global .row-btns and .tips handle grouped actions/advice; .ai button looks unavailable through cursor/background styling, but CSS alone does not disable clicks. `apps/web/src/styles/panel.css:57` -> `.row-btns`; `apps/web/src/styles/panel.css:61` -> `cursor: not-allowed`
- Global .soon and .sort-row plus scoped .sort-row .chip support upcoming actions and unclear-skill sorting. `apps/web/src/styles/panel.css:62` -> `.soon`
## Connections
- Used by Overview headings and actions: `apps/web/src/cv/panel/Overview.tsx:72` -> `btn primary`; `apps/web/src/styles/panel.css:39` -> `.btn.primary`; `apps/web/src/cv/panel/Overview.tsx:75` -> `p-h`; `apps/web/src/styles/panel.css:6` -> `.p-h`
- Used outside panel markup by the job tailor gate and enrichment tools: `apps/web/src/jobs/TailorGate.tsx:55` -> `fine`; `apps/web/src/styles/panel.css:35` -> `.fine`; `apps/web/src/cv/enrich/SkillsTools.tsx:44` -> `btn small`; `apps/web/src/styles/panel.css:38` -> `.btn`
## Assumptions
- The filename does not scope rules: .btn, .fine and other unprefixed classes remain shared throughout the application. `apps/web/src/main.tsx:15` -> `panel.css`; `apps/web/src/styles/panel.css:35` -> `.fine`; `apps/web/src/styles/panel.css:38` -> `.btn`
