---
id: web-editor/reducer-notes
area: web-editor
files: ["apps/web/src/cv/edit/cvReducer.ts","apps/web/src/cv/edit/cvReducer.test.ts"]
depends_on: ["web-editor/reducer","shared/cv","shared/enrichment-focus"]
contract: false
checked_hash: 03024e47
cited: [c2a062, baaa47, a05967, 2e84a3, 5509ba, 291e54, a7c7f8, ac68f2, ebb52d, 29a84d, 611be4, 592554, a25931, 24827b, e23f17, d43863, 5509ba, a7c7f8, ab085d, 8cfb7d, d6e493, 7715e0, baaa47, 8c0410, c2a062, f3c377, 611be4, 8cfb7d, 659d96, a05967, aff153]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md"]
open: []
---
Apply role notes and extracted facts without accepting stale note-derived facts, and record enrichment completion.

- setFacts searches all scored lists through roleListOf and ignores facts whose fromNotes hash does not match the current notes. `apps/web/src/cv/edit/cvReducer.ts:333` -> `case "setFacts"`
- setNote searches all scored lists through roleListOf; same-ID notes are replaced, and new notes evict the oldest askedAt values only within their job/non-job kind. `apps/web/src/cv/edit/cvReducer.ts:344` -> `case "setNote"`; `apps/web/src/cv/edit/cvReducer.ts:350` -> `sameKind`; `apps/web/src/cv/edit/cvReducer.ts:358` -> `const notes`
- setFacts and setNote return the unchanged CV when the shared lookup finds no matching item in experience, projects or volunteering. `apps/web/src/cv/edit/cvReducer.ts:334` -> `roleListOf`; `apps/web/src/cv/edit/cvReducer.ts:336` -> `return cv`; `apps/web/src/cv/edit/cvReducer.ts:345` -> `roleListOf`; `apps/web/src/cv/edit/cvReducer.ts:347` -> `return cv`
- setFacts treats absent and null facts alike and returns unchanged content for facts with equal fromNotes, updatedAt and ordered items, even if supplied in a different object. `apps/web/src/cv/edit/cvReducer.ts:337` -> `role.facts ?? null`; `apps/web/src/cv/edit/cvReducer.ts:340` -> `before === facts`
- markEnriched keeps the first timestamp and does not look up any role or item. `apps/web/src/cv/edit/cvReducer.ts:376` -> `case "markEnriched"`
- tested by `apps/web/src/cv/edit/cvReducer.test.ts:254` -> `describe("setNote"`; `apps/web/src/cv/edit/cvReducer.test.ts:302` -> `describe("focus actions"`; `apps/web/src/cv/edit/cvReducer.test.ts:410` -> `describe("markEnriched"`

## Connections

- Uses shared notesHash to prevent stale extracted facts: `apps/web/src/cv/edit/cvReducer.ts:339` -> `notesHash`; `packages/shared/src/enrich-focus.ts:8` -> `notesHash`
- Uses the central scored-list lookup for both note and fact actions; extending SCORED_LIST and shared scoredItems covers these ID-based actions too. `apps/web/src/cv/edit/cvReducer.ts:334` -> `roleListOf`; `apps/web/src/cv/edit/cvReducer.ts:345` -> `roleListOf`; `apps/web/src/cv/edit/lists.ts:20` -> `SCORED_LIST`; `apps/web/src/cv/edit/lists.ts:24` -> `findScored`; `packages/shared/src/cv.ts:270` -> `scoredItems`
- Used by focus-session responses and guided-path completion: `apps/web/src/cv/enrich/useFocusSession.ts:460` -> `setNote`; `apps/web/src/cv/edit/cvReducer.ts:344` -> `case "setNote"`; `apps/web/src/cv/enrich/useFocusSession.ts:563` -> `setFacts`; `apps/web/src/cv/edit/cvReducer.ts:333` -> `case "setFacts"`; `apps/web/src/cv/enrich/EnrichPath.tsx:186` -> `markEnriched`; `apps/web/src/cv/edit/cvReducer.ts:376` -> `case "markEnriched"`

## Assumptions

- IDs must be unique across scored lists for lookup to be unambiguous; findScored takes the first match. `apps/web/src/cv/edit/lists.ts:24` -> `findScored`; `packages/shared/src/cv.ts:279` -> `.find`
- Note eviction assumes askedAt strings sort chronologically; kind is determined by whether jobId is undefined, not by a separate enum. `apps/web/src/cv/edit/cvReducer.ts:350` -> `jobId === undefined`; `apps/web/src/cv/edit/cvReducer.ts:354` -> `askedAt`
