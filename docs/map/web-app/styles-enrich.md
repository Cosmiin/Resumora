---
id: web-app/styles-enrich
area: web-app
files: ["apps/web/src/styles/enrich.css"]
depends_on: ["web-app/styles-base","web-app/styles-panel","web-app/styles-document","web-enrich/score-display","web-enrich/voice-ui","web-enrich/summary-review","web-enrich/skills-review"]
contract: false
checked_hash: b05dd8dd
cited: [93fe6a, 38323d, 619cfb, 49330f, e03f0a, dbe32a, 761b8a, eb1520, 05782b, ecde40, 468b70, c98f72, 1d79d8, aab88a, 489426, 27064f, 4f22da, 1a5e4b, 335b6b, 0c54da, 01d2bd, 00bcda, 888274, be7fbe, ecde40, cb8b37, 01d2bd, 740c61, 00bcda, ecde40, 0c52ea, ae193f]
decisions: []
open: []
---
Style shared scores, answer/voice controls and enrichment proposal states.

- Global .score-pill defaults to absolute outside positioning, with clear/good/work/previous variants, and becomes static at widths up to 720px. More-specific .role-scores .score-pill and .cv-role .score-pill keep pills static at every width. `apps/web/src/styles/enrich.css:3` -> `.score-pill`; `apps/web/src/styles/enrich.css:10` -> `720px`; `apps/web/src/styles/enrich.css:29` -> `.role-scores .score-pill`; `apps/web/src/styles/cv-page.css:162` -> `.cv-role .score-pill`
- .score-ring draws a conic gradient from --v and --c, with clear/work color overrides and an inner circular span. `apps/web/src/styles/enrich.css:16` -> `.score-ring`
- .role-open is a shared row button; .weak-mark positions a bullet indicator and .weak-tip appears on hover/focus or .is-open. At 720px the marker moves inward. `apps/web/src/styles/enrich.css:30` -> `.role-open`; `apps/web/src/styles/enrich.css:39` -> `.weak-mark`; `apps/web/src/styles/enrich.css:44` -> `.weak-tip.is-open`
- Global answer-* rules style answer choices and fields, while .mic is an unprefixed absolutely positioned circular button reused beyond enrichment. `apps/web/src/styles/enrich.css:50` -> `.answer-box`; `apps/web/src/styles/enrich.css:60` -> `.mic`
- Pressed microphones pulse; .answer-rec/.answer-countdown/.answer-partial and .voice-word-new provide recording/transcript feedback. `apps/web/src/styles/enrich.css:63` -> `aria-pressed`; `apps/web/src/styles/enrich.css:65` -> `.answer-rec`; `apps/web/src/styles/enrich.css:71` -> `.voice-word-new`
- Shared unprefixed .saved-note, .working, .btn.small and .prop style review progress/actions; .working uses an animated pseudo-element spinner. `apps/web/src/styles/enrich.css:78` -> `.saved-note`; `apps/web/src/styles/enrich.css:80` -> `.working::before`; `apps/web/src/styles/enrich.css:83` -> `.btn.small`
- Proposal streaming/stopped/dropped/used/kept states change text color, caret, border and opacity; .review-note supplies subdued status boxes. `apps/web/src/styles/enrich.css:90` -> `.prop.streaming`; `apps/web/src/styles/enrich.css:93` -> `.prop.dropped`; `apps/web/src/styles/enrich.css:97` -> `.review-note`
- Reduced-motion overrides disable new-word, microphone, streaming-caret and spinner animations; the microphone retains a static shadow. `apps/web/src/styles/enrich.css:98` -> `prefers-reduced-motion`
- Global .check with scoped .ok/.no and global .sugg with scoped .grp/.ev support checklists and skill choices; .sugg.sort-pick changes columns and cursor. `apps/web/src/styles/enrich.css:106` -> `.check`; `apps/web/src/styles/enrich.css:111` -> `.sugg`
## Connections
- Microphone styling is used indirectly by jobs: `apps/web/src/jobs/JobThoughts.tsx:89` -> `MicButton`; `apps/web/src/cv/enrich/VoiceControls.tsx:46` -> `className="mic"`; `apps/web/src/styles/enrich.css:60` -> `.mic`
- Shared checklist/skill classes connect to enrichment renderers: `apps/web/src/cv/enrich/Checklist.tsx:6` -> `check`; `apps/web/src/styles/enrich.css:106` -> `.check`; `apps/web/src/cv/enrich/SkillsTools.tsx:37` -> `sugg`; `apps/web/src/styles/enrich.css:111` -> `.sugg`
## Assumptions
- .mic needs a positioned field wrapper to anchor correctly; answer-field and job-thoughts-field provide it in their respective styles. `apps/web/src/styles/enrich.css:60` -> `position: absolute`; `apps/web/src/styles/enrich.css:56` -> `position: relative`; `apps/web/src/styles/jobs.css:202` -> `position: relative`
