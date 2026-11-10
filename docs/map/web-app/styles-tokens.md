---
id: web-app/styles-tokens
area: web-app
files: ["apps/web/src/styles/tokens.css"]
depends_on: []
contract: false
checked_hash: ac2104fd
cited: [2c9217, 7adf63, cdee37, b6bf18, e8ed36, 23069b, 14568c, 335186, 62a82a, c39145, 559a7f, 95ea98, 5a7ca6, 1d78db, aa16d7, 67f6f8, 915626, e2eb6e, 70ecfb, 7adf63, 23069b, dc35e8, 5b757a]
decisions: []
open: []
---
Define global palette, spacing, typography and focus variables.

- :root declares palette variables and semantic surface, text, border, action and status aliases shared across feature styles. `apps/web/src/styles/tokens.css:45` -> `--surface-page`; `apps/web/src/styles/tokens.css:62` -> `--border-subtle`; `apps/web/src/styles/tokens.css:74` -> `--status-good-bg`
- Spacing/control dimensions are explicit tokens, including a 44px touch-control height; they are not a uniform arithmetic spacing scale. `apps/web/src/styles/tokens.css:102` -> `--space-1`; `apps/web/src/styles/tokens.css:125` -> `--control-height-touch`
- Font variables distinguish display, sans, document and mono families. `apps/web/src/styles/tokens.css:142` -> `--font-display`
- Focus styling is shared through outline/offset tokens. `apps/web/src/styles/tokens.css:202` -> `--focus-outline`; `apps/web/src/styles/tokens.css:203` -> `--focus-offset`
- --text-body is declared first as a color alias and later as 0.92rem. The later :root declaration wins, so color: var(--text-body) consumers receive a non-color value. `apps/web/src/styles/tokens.css:55` -> `--text-body`; `apps/web/src/styles/tokens.css:160` -> `--text-body: 0.92rem`
## Connections
- Loaded before app.css but after tailor.css, which is imported through router and TailorFlow: `apps/web/src/main.tsx:8` -> `router.tsx`; `apps/web/src/router.tsx:8` -> `TailorFlow`; `apps/web/src/tailor/TailorFlow.tsx:20` -> `tailor.css`; `apps/web/src/main.tsx:9` -> `tokens.css`; `apps/web/src/main.tsx:10` -> `app.css`; `apps/web/src/styles/tokens.css:2` -> `:root`
- Base header rules consume shared surface/border tokens: `apps/web/src/styles/app.css:75` -> `--white`; `apps/web/src/styles/app.css:76` -> `--border-subtle`; `apps/web/src/styles/tokens.css:15` -> `--white`; `apps/web/src/styles/tokens.css:62` -> `--border-subtle`

## Assumptions
- Matching font family names must be loaded separately; main imports the variable display and sans font packages. `apps/web/src/styles/tokens.css:142` -> `Newsreader Variable`; `apps/web/src/main.tsx:5` -> `newsreader`; `apps/web/src/main.tsx:6` -> `instrument-sans`
