---
id: web-enrich/summary-review
area: web-enrich
files: ["apps/web/src/cv/enrich/SummaryTools.tsx","apps/web/src/cv/enrich/summary-skills.test.tsx"]
depends_on: ["web-enrich/summary","web-enrich/summary-stream","web-enrich/stream","api-enrich/rewrite","web-editor/reducer"]
contract: false
checked_hash: d7006c73
cited: [d49d48, c4d581, baf7a3, b1b267, 20df46, 02cb91, 610d6c, 2782bc, c80801, 4b04b6, 86007a, b516cf, 0fc885, b1b267, 07e757, 56b5b6, 569bad, 2782bc, d03786, d49d48, baf7a3, 8bc536]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Accept only ready summary proposals while the starting summary remains unchanged.

- A ready proposal remains usable after a later stream failure if the current summary equals started; unfinished text never becomes usable. If summary changed, Use is disabled and the UI offers regeneration. `apps/web/src/cv/enrich/SummaryTools.tsx:48` -> `summary !== started`; `apps/web/src/cv/enrich/SummaryTools.tsx:62` -> `ready`; `apps/web/src/cv/enrich/SummaryTools.tsx:75` -> `disabled={changed}`
- Use dispatches setSummary then marks that proposal used; Keep closes review. Restart unmounts review during drafting, so it discards that review's proposal list even though the lower-level event reducer supports run IDs. `apps/web/src/cv/enrich/SummaryTools.tsx:38` -> `setSummary`; `apps/web/src/cv/enrich/SummaryTools.tsx:39` -> `state: "used"`; `apps/web/src/cv/enrich/SummaryTools.tsx:78` -> `onClose`; `apps/web/src/cv/enrich/SummaryTools.tsx:136` -> `setStep("drafting")`; `apps/web/src/cv/enrich/SummaryTools.tsx:171` -> `step === "review"`
- These tests do not cover ready-proposal usability or unfinished text after a later stream failure. Readiness, Use, Keep, restart after an error with no proposals, and changed-summary protection are tested by `apps/web/src/cv/enrich/summary-skills.test.tsx:99` -> `it`; `apps/web/src/cv/enrich/summary-skills.test.tsx:117` -> `it`; `apps/web/src/cv/enrich/summary-skills.test.tsx:134` -> `it`; `apps/web/src/cv/enrich/summary-skills.test.tsx:160` -> `it`; `apps/web/src/cv/enrich/summary-skills.test.tsx:173` -> `it`

## Connections

- Uses setSummary -> setBasics; identical values are a reducer no-op. `apps/web/src/cv/enrich/SummaryTools.tsx:38` -> `setSummary`; `apps/web/src/cv/edit/cvReducer.ts:275` -> `case "setSummary"`; `apps/web/src/cv/edit/cvReducer.ts:276` -> `setBasics`; `apps/web/src/cv/edit/cvReducer.ts:228` -> `cv.basics[field] === value`
- Uses [summary](./summary.md): Restart returns through start and mounts a new review after another save wait. `apps/web/src/cv/enrich/SummaryTools.tsx:171` -> `onRestart`; `apps/web/src/cv/enrich/SummaryTools.tsx:138` -> `waitForSave`

## Assumptions

- Acceptance compares only summary text, not changes to role evidence or locale made while streaming. It relies on server checks for grounding. `apps/web/src/cv/enrich/SummaryTools.tsx:48` -> `summary !== started`; `apps/web/src/cv/enrich/SummaryTools.tsx:75` -> `disabled={changed}`; `apps/api/src/enrich/routes.ts:186` -> `checkSummary`
