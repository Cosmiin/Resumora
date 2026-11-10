---
id: web-tailor/layout-review
area: web-tailor
files: ["apps/web/src/tailor/LayoutReview.tsx","apps/web/src/tailor/final-touches.test.tsx","apps/web/src/tailor/light-sections.test.tsx"]
depends_on: ["shared/cv","shared/categories","web-tailor/diff-words","web-tailor/client-section"]
contract: false
checked_hash: dc061fc1
decisions: []
open: []
---
Review final-section rewording, item order, hiding, headline and section order.

- FINAL_SECTIONS contains achievements, courses, publications, interests, languages and layout; LISTED selects the first four for item-list rendering. `apps/web/src/tailor/LayoutReview.tsx:8` -> `FinalSection`
- movedKeys uses a longest-common-subsequence table; only next keys outside the retained sequence are marked moved. `apps/web/src/tailor/LayoutReview.tsx:25` -> `movedKeys`; `apps/web/src/tailor/LayoutReview.tsx:39` -> `new Set`
- Achievements reads cv.awards; courses, publications and interests each expose their own names, details and optional bullets. `apps/web/src/tailor/LayoutReview.tsx:61` -> `achievements`; `apps/web/src/tailor/LayoutReview.tsx:64` -> `courses`
- Proposed item order is used only if it is a complete, duplicate-free permutation of current items; otherwise original order remains. `apps/web/src/tailor/LayoutReview.tsx:80` -> `order`
- Blank listed items are omitted unless they have any lines; hide:<id> hidden proposals start checked and are cancelled by an explicit false choice. `apps/web/src/tailor/LayoutReview.tsx:93` -> `shown.filter`
- Inferred replacements mark whole text, while other replacements use word differences. `apps/web/src/tailor/LayoutReview.tsx:43` -> `NewText`
- Layout shows the first original headline struck through and labels comma-separated section keys using English category names. `apps/web/src/tailor/LayoutReview.tsx:22` -> `sectionName`; `apps/web/src/tailor/LayoutReview.tsx:120` -> `titles[0]`; `apps/web/src/tailor/LayoutReview.tsx:123` -> `sectionName`
- Unflagged changes alone participate in acceptance; original rejects both ordinary and inferred changes, while new leaves inferred undecided and honors unchecked hide choices. `apps/web/src/tailor/LayoutReview.tsx:134` -> `changes`; `apps/web/src/tailor/LayoutReview.tsx:140` -> `decide`
- Languages render only changed items, joining existing or proposed name/level fields. `apps/web/src/tailor/LayoutReview.tsx:51` -> `cv.languages`; `apps/web/src/tailor/LayoutReview.tsx:153` -> `items.map`
- tested by `apps/web/src/tailor/final-touches.test.tsx:44` -> `describe`
- tested by `apps/web/src/tailor/light-sections.test.tsx:20` -> `describe`

## Connections

- Used by SectionReview and by the flow's empty-final-section auto-accept rule. `apps/web/src/tailor/SectionReview.tsx:106` -> `LayoutReview`; `apps/web/src/tailor/LayoutReview.tsx:133` -> `LayoutReview`; `apps/web/src/tailor/TailorFlow.tsx:86` -> `FINAL_SECTIONS`; `apps/web/src/tailor/LayoutReview.tsx:9` -> `FINAL_SECTIONS`
- Uses is-moved emphasis and is-hidden dimming that excludes the hide control. `apps/web/src/tailor/LayoutReview.tsx:123` -> `is-moved`; `apps/web/src/styles/tailor.css:161` -> `is-moved`; `apps/web/src/tailor/LayoutReview.tsx:96` -> `is-hidden`; `apps/web/src/styles/tailor.css:181` -> `is-hidden`

## Assumptions

- Listed item order is validated locally, but section-order preview directly splits the proposal text and relies on server checks for valid keys. `apps/web/src/tailor/LayoutReview.tsx:82` -> `valid`; `apps/web/src/tailor/LayoutReview.tsx:116` -> `split`
