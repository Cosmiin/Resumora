---
id: web-enrich/item-lines
area: web-enrich
files: ["apps/web/src/cv/enrich/FocusMode.tsx","apps/web/src/cv/enrich/light-stops.test.tsx"]
depends_on: ["web-enrich/client-sections","web-enrich/focus-ui","web-enrich/brain-dump","web-enrich/path","api-enrich/item-lines","shared/enrichment-score","web-editor/reducer","shared/dates","web-editor/document","web-editor/page-fields"]
contract: false
checked_hash: bd821239
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Collect free text for one light item and append only the suggested lines the user selects.

- LightStop supports courses/awards/publications/interests via LineList; it starts at a text box, has no score state, and returns null if the item is missing. `apps/web/src/cv/enrich/FocusMode.tsx:345` -> `LightStep`; `apps/web/src/cv/enrich/FocusMode.tsx:353` -> `section: LineList`; `apps/web/src/cv/enrich/FocusMode.tsx:375` -> `cv[section]`; `apps/web/src/cv/enrich/FocusMode.tsx:376` -> `return null`; `apps/web/src/cv/edit/lists.ts:29` -> `LineList`
- Submission waits for save and sends `{section,itemId,text:text.trim()}`; response `{lines:string[]}` selects picks when nonempty and advances immediately when empty. `apps/web/src/cv/enrich/FocusMode.tsx:385` -> `waitForSave`; `apps/web/src/cv/enrich/FocusMode.tsx:386` -> `itemLines`; `apps/web/src/cv/enrich/FocusMode.tsx:388` -> `kind: "pick"`; `apps/web/src/cv/enrich/FocusMode.tsx:389` -> `onNext`
- Save errors, HTTP 502 ai_bad_answer, HTTP 503 ai_unavailable and interrupted JSON responses all show the same failed screen; Retry resends the retained draft and Skip advances. `apps/web/src/cv/enrich/FocusMode.tsx:390` -> `catch`; `apps/web/src/cv/enrich/FocusMode.tsx:391` -> `kind: "failed"`; `apps/web/src/cv/enrich/FocusMode.tsx:433` -> `onNext`; `apps/web/src/cv/enrich/FocusMode.tsx:434` -> `ask(answer.value)`; `apps/web/src/cv/enrich/enrich-api.ts:164` -> `apiFetch`
- The light-item answer remains local state, including via metadata; submit passes only text, without setNote. Unmount prevents rendering results but does not abort the request. `apps/web/src/cv/enrich/FocusMode.tsx:360` -> `setAnswer`; `apps/web/src/cv/enrich/FocusMode.tsx:364` -> `alive.current = false`; `apps/web/src/cv/enrich/FocusMode.tsx:387` -> `!alive.current`; `apps/web/src/cv/enrich/FocusMode.tsx:415` -> `onSubmit={(text)`
- Picks begin unchecked through lines mode; Back restores the text box, selected numeric-string indices choose response text, and nonempty picks dispatch one addLines then advance. `apps/web/src/cv/enrich/FocusMode.tsx:421` -> `DumpPickStep lines`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:99` -> `lines ? []`; `apps/web/src/cv/enrich/FocusMode.tsx:422` -> `kind: "box"`; `apps/web/src/cv/enrich/FocusMode.tsx:425` -> `addLines`
- Wire request is strict, with nonempty itemId and trimmed text <=MAX_LONG_TEXT; response is at most four nonempty strings <=200 characters. `packages/shared/src/enrich.ts:311` -> `ItemLinesBodySchema`; `packages/shared/src/enrich.ts:314` -> `MAX_LONG_TEXT`; `packages/shared/src/enrich.ts:319` -> `ItemLinesAnswerSchema`
- tested by `apps/web/src/cv/enrich/light-stops.test.tsx:60` -> `describe`

## Connections

- Used by the path only for items lacking nonblank lines. `apps/web/src/cv/enrich/EnrichPath.tsx:35` -> `b.text.trim()`; `apps/web/src/cv/enrich/EnrichPath.tsx:118` -> `LightStop`; `apps/web/src/cv/enrich/FocusMode.tsx:352` -> `LightStop`
- Uses POST /v1/enrich/item-lines and the server's shared ItemLinesBodySchema. `apps/web/src/cv/enrich/FocusMode.tsx:386` -> `itemLines`; `apps/web/src/cv/enrich/enrich-api.ts:164` -> `/v1/enrich/item-lines`; `apps/api/src/enrich/routes.ts:130` -> `/item-lines`; `apps/api/src/enrich/routes.ts:131` -> `ItemLinesBodySchema`
- Uses addLines; missing owners, empty input or a full MAX_BULLETS list are ignored, and remaining room bounds additions with new IDs. `apps/web/src/cv/enrich/FocusMode.tsx:425` -> `addLines`; `apps/web/src/cv/edit/cvReducer.ts:317` -> `case "addLines"`; `apps/web/src/cv/edit/cvReducer.ts:320` -> `MAX_BULLETS`; `apps/web/src/cv/edit/cvReducer.ts:321` -> `newId`
- Related date displays depend on two locale paths: LightStop uses formatRange/Intl, while the saved light-section document uses formatYearMonth and its exhaustive Locale SHORT_NAMES map. Adding a Locale must cover the month-name map as well as the PRESENT map used by formatRange. `apps/web/src/cv/enrich/FocusMode.tsx:378` -> `formatRange`; `apps/web/src/cv/page/blocks.ts:25` -> `formatRange`; `apps/web/src/cv/page/blocks.ts:22` -> `Intl.DateTimeFormat`; `apps/web/src/cv/page/blocks.ts:4` -> `Record<Locale, string>`; `apps/web/src/cv/page/NewSections.tsx:35` -> `formatYearMonth`; `packages/shared/src/dates.ts:62` -> `formatYearMonth`; `packages/shared/src/dates.ts:65` -> `SHORT_NAMES[locale]`; `packages/shared/src/dates.ts:24` -> `Record<Locale, readonly string[]>`

## Assumptions

- Generated lines depend on saved item fields plus the submitted draft; acceptance does not recheck original item text, only the reducer's current owner/capacity checks. `apps/web/src/cv/enrich/FocusMode.tsx:386` -> `itemLines`; `apps/web/src/cv/enrich/FocusMode.tsx:425` -> `dispatch`; `apps/web/src/cv/edit/cvReducer.ts:319` -> `getBullets`
