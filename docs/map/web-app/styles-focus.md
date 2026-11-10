---
id: web-app/styles-focus
area: web-app
files: ["apps/web/src/styles/focus.css"]
depends_on: ["web-app/styles-base","web-app/styles-enrich","web-enrich/focus-ui","web-enrich/voice-ui","web-enrich/celebration","web-tailor/moment"]
contract: false
checked_hash: b97a74e6
cited: [bf3517, ddc6e4, 1fcc7d, 81f957, f3a96c, a2c773, c571dc, 4761a4, 52507e, 3dd5e1, 9fa45f, d74982, 2bda33, a5c3a4, 41bf4e, 97e848, 115ae8, 56ba25, bfcfb7, 12537b, 14c7df, d75237, 448d2e, 5c1093, bf3517, 03ea45, d11953, 7eb0eb, 7f580d, 2bda33, 5062f6, d11953]
decisions: []
open: []
---
Style full-screen enrichment steps and shared celebration/voice presentation.

- .focus-mode is a fixed z-index-1000 two-column frame with an entry animation and shared focus outline; left/right regions scroll independently. `apps/web/src/styles/focus.css:5` -> `.focus-mode`; `apps/web/src/styles/focus.css:15` -> `.fm-left`; `apps/web/src/styles/focus.css:42` -> `.fm-right`
- Most focus elements use fm-* names; .visually-hidden is a global accessible-text utility with important absolute positioning. `apps/web/src/styles/focus.css:3` -> `.visually-hidden`; `apps/web/src/styles/focus.css:16` -> `.fm-eyebrow`
- fm bullet current/new/working variants distinguish selected and generated lines; working text animates a clipped gradient. `apps/web/src/styles/focus.css:26` -> `.fm-bullet.is-current`; `apps/web/src/styles/focus.css:29` -> `.is-working`
- Focus-mode answer/mic overrides increase field/button sizes and change pressed option colors; brain-dump-specific overrides enlarge the field and microphone again. `apps/web/src/styles/focus.css:75` -> `.focus-mode .answer-box`; `apps/web/src/styles/focus.css:85` -> `.fm-dump`
- fm-close is above the fm-moment overlay (z-index 3 versus 2), preserving access to Close during celebration. `apps/web/src/styles/focus.css:45` -> `z-index: 3`; `apps/web/src/styles/focus.css:127` -> `z-index: 2`
- Shared voice-* rules and unscoped .answer-rec:not(.is-finishing) override recording layout everywhere, not just under .focus-mode. `apps/web/src/styles/focus.css:140` -> `.voice-cue`; `apps/web/src/styles/focus.css:144` -> `.answer-rec:not(.is-finishing)`
- Global .improve-btn is normally transparent beside bullets, shown by hover/focus-within; non-hover devices force partial visibility. `apps/web/src/styles/focus.css:159` -> `.improve-btn`; `apps/web/src/styles/focus.css:166` -> `focus-within`; `apps/web/src/styles/focus.css:169` -> `hover: none`
- At 760px the frame becomes stacked, left content caps at 34vh, Close becomes fixed, and improve controls move above/right of bullets. `apps/web/src/styles/focus.css:173` -> `760px`; `apps/web/src/styles/focus.css:181` -> `.fm-close`; `apps/web/src/styles/focus.css:185` -> `.improve-btn`
- Reduced-motion suppresses animations/transitions for the focus frame, its descendants and improve buttons, and restores non-gradient working text. `apps/web/src/styles/focus.css:188` -> `prefers-reduced-motion`
- Guided-path variants add bar rows; fm-path uses one content column and has-path uses three rows on narrow screens. `apps/web/src/styles/focus.css:216` -> `.focus-mode.has-path`; `apps/web/src/styles/focus.css:222` -> `.focus-mode.fm-path`; `apps/web/src/styles/focus.css:231` -> `grid-template-rows`
## Connections
- Used by FocusMode and both enrichment/tailoring celebrations: `apps/web/src/cv/enrich/FocusMode.tsx:163` -> `focus-mode`; `apps/web/src/styles/focus.css:5` -> `.focus-mode`; `apps/web/src/cv/enrich/CelebrateMoment.tsx:46` -> `fm-moment`; `apps/web/src/tailor/TailorMoment.tsx:38` -> `fm-moment`; `apps/web/src/styles/focus.css:126` -> `.fm-moment`
- VoiceStatus uses the globally overridden recording class: `apps/web/src/cv/enrich/VoiceControls.tsx:83` -> `answer-rec`; `apps/web/src/styles/focus.css:144` -> `.answer-rec`
## Assumptions
- Reduced-motion matching is selector-limited; shared fm-moment/voice elements outside .focus-mode do not receive its blanket descendant rule. `apps/web/src/styles/focus.css:189` -> `.focus-mode *`; `apps/web/src/tailor/TailorMoment.tsx:38` -> `fm-moment`
