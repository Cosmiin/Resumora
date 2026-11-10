---
id: web-app/styles-jobs
area: web-app
files: ["apps/web/src/styles/jobs.css"]
depends_on: ["web-app/styles-base","web-app/jobs-list","web-app/jobs-add","web-app/job-page","web-app/job-edit","web-app/job-requirements","web-app/tailor-gate"]
contract: false
checked_hash: 354e5c57
cited: [aee17b, 551628, 544cff, 0d79b0, 4020bb, 99835c, 239cbf, 1a468d, 66b8fb, 072407, 424895, c4a13c, a6810a, d56416, cb78e5, 8a467a, 0b4294, ce5ed2, 802863, b31ad0, 75b8b5, ce3225, ff9c31, 0c4129, 66b8fb, c5cfa8, 2403ab, 881fd4, ff9c31, f969b7, 239cbf]
decisions: []
open: []
---
Style jobs lists, detail/edit views, dialogs, match labels and the mobile tailor bar.

- List/page selectors use jobs-* and job-* prefixes; detail utility names such as .facts, .sec, .form, .grid2, .seg and .x are scoped under .job-page. `apps/web/src/styles/jobs.css:1` -> `.jobs-page`; `apps/web/src/styles/jobs.css:118` -> `.job-page .facts`; `apps/web/src/styles/jobs.css:144` -> `.job-page .form`; `apps/web/src/styles/jobs.css:151` -> `.job-page .grid2`; `apps/web/src/styles/jobs.css:154` -> `.job-page .seg`
- .jobs-scrim fixes a backdrop at z-index 100; .add-job-dialog is capped by the reading width and viewport height and scrolls internally. `apps/web/src/styles/jobs.css:63` -> `.jobs-scrim`; `apps/web/src/styles/jobs.css:73` -> `.add-job-dialog`
- Focus outlines apply within jobs pages and dialogs; this stylesheet also globally sets .app-nav to flex with a gap, affecting the shell on other pages. `apps/web/src/styles/jobs.css:96` -> `:focus-visible`; `apps/web/src/styles/jobs.css:97` -> `.app-nav`
- At 760px and below list rows wrap, details take a full row, and page/dialog/scrim padding shrinks. `apps/web/src/styles/jobs.css:98` -> `760px`
- Original-ad .doc text preserves whitespace and wraps long words; must/nice marks receive distinct backgrounds/underlines. `apps/web/src/styles/jobs.css:133` -> `.doc`; `apps/web/src/styles/jobs.css:135` -> `mark.must`
- Edit inputs/selects get explicit shared field styles, invalid fields change borders, and two/three-column grids collapse to one at 760px. `apps/web/src/styles/jobs.css:148` -> `.form input`; `apps/web/src/styles/jobs.css:150` -> `aria-invalid`; `apps/web/src/styles/jobs.css:163` -> `grid-template-columns`
- At that edit breakpoint requirement categories occupy their own full-width row and remove buttons move to row one. `apps/web/src/styles/jobs.css:165` -> `grid-column: 1 / -1`
- More-specific requirement-list rules remove generic section list padding; requirement buttons remove global button chrome and remain full width. `apps/web/src/styles/jobs.css:175` -> `.job-page .sec .job-req-list`; `apps/web/src/styles/jobs.css:177` -> `.job-req-line`
- Match bands/symbols style excellent/strong, fair, low and met/partial/missing separately. `apps/web/src/styles/jobs.css:183` -> `.job-match-partial`; `apps/web/src/styles/jobs.css:189` -> `.is-excellent`; `apps/web/src/styles/jobs.css:193` -> `.job-match-met`
- At 699px and below .job-page .tailor becomes a fixed bottom bar at z-index 20; :has(.tailor) reserves space, secondary banner text hides and safe-area padding is added. `apps/web/src/styles/jobs.css:202` -> `699px`
- .gate-meter uses absolute fill/marker children; the component supplies widths/threshold positioning. `apps/web/src/styles/jobs.css:211` -> `.gate-meter`
## Connections
- Shell navigation depends on a jobs stylesheet rule: `apps/web/src/layout/AppShell.tsx:43` -> `app-nav`; `apps/web/src/styles/jobs.css:97` -> `.app-nav`
- Used by job-tailor actions and the gate meter: `apps/web/src/jobs/JobPage.tsx:148` -> `className="tailor"`; `apps/web/src/styles/jobs.css:204` -> `.job-page .tailor`; `apps/web/src/jobs/TailorGate.tsx:51` -> `gate-meter`; `apps/web/src/styles/jobs.css:211` -> `.gate-meter`
## Assumptions
- Shared dialog styling relies on add-job-dialog markup even for TailorGate; CSS does not supply modal focus management. `apps/web/src/jobs/TailorGate.tsx:19` -> `add-job-dialog`; `apps/web/src/styles/jobs.css:73` -> `.add-job-dialog`
