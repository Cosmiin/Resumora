---
id: web-enrich/path-completion
area: web-enrich
files: ["apps/web/src/cv/enrich/EnrichPath.tsx","apps/web/src/cv/enrich/EnrichedScreen.tsx","apps/web/src/cv/enrich/enrich-path.test.tsx","apps/web/src/cv/enrich/enriched-rows.test.tsx"]
depends_on: ["web-enrich/path","web-enrich/scores","web-enrich/focus-ui","web-enrich/skills-path","shared/cv","shared/enrichment-score","web-editor/reducer-notes","web-editor/reducer","web-editor/autosave"]
contract: false
checked_hash: 3a79fd6a
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Summarize current scores and visited-item changes, then mark enrichment or navigate onward.

- Completion waits only for scoring/previous states to settle, then averages non-null scores with rounding across every current scored item, not only visited stops; none yields zero. `apps/web/src/cv/enrich/EnrichPath.tsx:166` -> `averageScore`; `apps/web/src/cv/enrich/EnrichPath.tsx:181` -> `settled`; `apps/web/src/cv/enrich/EnrichPath.tsx:183` -> `?? 0`
- ENRICHED_AT and ENRICHED_AVERAGE separately hard-code 80; these are path targets, distinct from shared band clear=75. There is no imported shared path-target constant in either declaration. `apps/web/src/cv/enrich/EnrichPath.tsx:26` -> `80`; `apps/web/src/cv/enrich/EnrichedScreen.tsx:26` -> `80`; `packages/shared/src/enrich.ts:278` -> `75`
- At settled average >=80 the path dispatches markEnriched; the reducer preserves the first timestamp, so a later lower score does not erase it. `apps/web/src/cv/enrich/EnrichPath.tsx:184` -> `enriched`; `apps/web/src/cv/enrich/EnrichPath.tsx:186` -> `markEnriched`; `apps/web/src/cv/edit/cvReducer.ts:377` -> `cv.enrichedAt`
- Below target the end screen offers the lowest item with a numeric score for another focus session; returning from it restores the end stage. `apps/web/src/cv/enrich/EnrichPath.tsx:200` -> `lowest`; `apps/web/src/cv/enrich/EnrichPath.tsx:148` -> `FocusMode`; `apps/web/src/cv/enrich/EnrichPath.tsx:149` -> `kind: "end"`; `apps/web/src/cv/enrich/EnrichedScreen.tsx:44` -> `onImprove`
- Before-to-after rows show a change only for visited items with both scores and a difference; light-section totals count current nonblank lines on visited items. `apps/web/src/cv/enrich/EnrichedScreen.tsx:91` -> `r.visited`; `apps/web/src/cv/enrich/EnrichPath.tsx:204` -> `lights.filter`; `apps/web/src/cv/enrich/EnrichPath.tsx:206` -> `b.text.trim()`
- Find a job waits for save, but catches a rejected save and still closes/navigates to /jobs. `apps/web/src/cv/enrich/EnrichPath.tsx:215` -> `catch`; `apps/web/src/cv/enrich/EnrichPath.tsx:217` -> `navigate("/jobs")`
- tested by `apps/web/src/cv/enrich/enrich-path.test.tsx:46` -> `describe`
- tested by `apps/web/src/cv/enrich/enriched-rows.test.tsx:83` -> `describe`

## Connections

- Uses [path](./path.md): EndStop receives the frozen before-scores and visited stops from the current path instance. `apps/web/src/cv/enrich/EnrichPath.tsx:158` -> `EndStop`; `apps/web/src/cv/enrich/EnrichPath.tsx:166` -> `averageScore`

## Assumptions

- An unavailable result may contribute its old numeric score to completion because only scoring/previous block settlement; this is not an all-fresh-scores guarantee. `apps/web/src/cv/enrich/EnrichPath.tsx:170` -> `scoreOf`; `apps/web/src/cv/enrich/EnrichPath.tsx:181` -> `settled`; `apps/web/src/cv/enrich/EnrichPath.tsx:182` -> `scoreOf`
