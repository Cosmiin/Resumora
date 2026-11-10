---
id: web-tailor/summary-review
area: web-tailor
files: ["apps/web/src/tailor/SummaryReview.tsx","apps/web/src/tailor/summary-review.test.tsx"]
depends_on: ["shared/tailoring","web-tailor/diff-words","web-tailor/client-section"]
contract: false
checked_hash: 75cc7107
cited: [859355, cb8b2c, 212c48, 6ab550, 9b5ef0, fc5c4e, 63fc10, 85d91c, 8a5ca6, 375ca5, 0fe379, 7e4846, f57b97, b7e90d, aca897, 031e1f, fc5c4e]
decisions: []
open: []
---
Review a summary with independently editable inferred phrases.

- Selects the first unflagged summary proposal and places its guesses with shared placeGuesses. `apps/web/src/tailor/SummaryReview.tsx:71` -> `proposals.find`
- A wholly inferred summary with no placed spans is marked as one guess. `apps/web/src/tailor/SummaryReview.tsx:74` -> `whole`
- Rendering combines diff offsets with placed spans; removed phrases remain struck out and edited phrases replace their marked display. `apps/web/src/tailor/SummaryReview.tsx:21` -> `diffWords`; `apps/web/src/tailor/SummaryReview.tsx:31` -> `choice`
- Phrase editing trims text and disables Save when blank. `apps/web/src/tailor/SummaryReview.tsx:49` -> `draft.trim`
- Explicit choices are numerically sorted and emitted as summary#<index>; a wholly inferred summary emits no ordinary keep decision. `apps/web/src/tailor/SummaryReview.tsx:78` -> `Object.entries`
- Original sends summary keep:false with empty inferred/flags; no proposal sends completely empty acceptance. `apps/web/src/tailor/SummaryReview.tsx:100` -> `keep: false`; `apps/web/src/tailor/SummaryReview.tsx:77` -> `onAccept`
- tested by `apps/web/src/tailor/summary-review.test.tsx:24` -> `describe`

## Connections

- Used by SectionReview only with a loaded Base CV summary. `apps/web/src/tailor/SectionReview.tsx:108` -> `SummaryReview`; `apps/web/src/tailor/SummaryReview.tsx:69` -> `SummaryReview`
- Uses tailor-new and tailor-guess global colors. `apps/web/src/tailor/SummaryReview.tsx:24` -> `tailor-new`; `apps/web/src/tailor/SummaryReview.tsx:32` -> `tailor-guess`; `apps/web/src/styles/tailor.css:95` -> `.tailor-new`; `apps/web/src/styles/tailor.css:96` -> `.tailor-guess`

## Assumptions

- Phrase indices depend on shared placement order, and unchosen guesses are omitted from the request rather than confirmed. `apps/web/src/tailor/SummaryReview.tsx:72` -> `placeGuesses`; `apps/web/src/tailor/SummaryReview.tsx:78` -> `Object.entries(choices)`
