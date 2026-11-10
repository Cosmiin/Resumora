---
id: web-tailor/guided-review
area: web-tailor
files: ["apps/web/src/tailor/GuidedReview.tsx","apps/web/src/tailor/guided-review.test.tsx"]
depends_on: ["web-tailor/client-document","web-tailor/export-files","web-editor/document","api-tailor/review-item"]
contract: false
checked_hash: 6e5960b2
cited: [14aed2, 477903, 9d2135, 01fe77, 39ea84, 0eee2c, f2540b, 537f5c, 6c45ba, 7e39d7, 638b98, 19d542, 2d6b0f, b871fd, b28147, ebb8d5, 7b8bbf, 063aaa, 523ad5, c5a5fe, 87fd5a, 530efa, 969bca, b871fd, 74e325, a22099, 661b03, b8832e, f2540b, f154be, b0724e, 0eee2c, 90391a, 6c45ba, f2540b, 1d7bfb, ca4931, b77fd8]
decisions: []
open: []
---
Resolve retained AI guesses one at a time against versioned saved content.

- guessesOf retains only kept, inferred, unreviewed items; missing text becomes empty. `apps/web/src/tailor/GuidedReview.tsx:18` -> `Object.entries`
- Review ordering is fixed summary, experience, skills, achievements, languages, then unlisted sections; it does not read content.layout.order. `apps/web/src/tailor/GuidedReview.tsx:13` -> `ORDER`; `apps/web/src/tailor/GuidedReview.tsx:17` -> `rank`
- Summary phrase keys focus the summary; new-skill keys resolve by case-insensitive name in technical/professional skills; other keys focus themselves. `apps/web/src/tailor/GuidedReview.tsx:25` -> `targetOf`
- Mount loads the row once and records the initial guess count; the current guess is always the first remaining item. `apps/web/src/tailor/GuidedReview.tsx:47` -> `load`; `apps/web/src/tailor/GuidedReview.tsx:51` -> `left[0]`
- Each decision sends section/key/action, optional text and the loaded row.version; success replaces the entire row and clears draft. `apps/web/src/tailor/GuidedReview.tsx:60` -> `reviewItem`
- version_conflict refetches the CV and shows stale; item_changed shows changed without reload; other errors show failed. `apps/web/src/tailor/GuidedReview.tsx:64` -> `version_conflict`
- Edits trim text and disable blank saves; no remaining guesses shows completion with Back/Export actions. `apps/web/src/tailor/GuidedReview.tsx:86` -> `draft.trim`; `apps/web/src/tailor/GuidedReview.tsx:72` -> `!current`
- Focus changes scroll .cv-mark-focus into view centered and smoothly. `apps/web/src/tailor/GuidedReview.tsx:53` -> `scrollIntoView`
- tested by `apps/web/src/tailor/guided-review.test.tsx:37` -> `describe`

## Connections

- The guide and guide-card classes use global selectors, not selectors rooted to the tailoring feature; other elements with those class names receive the same layout rules. `apps/web/src/tailor/GuidedReview.tsx:98` -> `guide`; `apps/web/src/tailor/GuidedReview.tsx:100` -> `guide-card`; `apps/web/src/styles/tailor.css:171` -> `.guide`; `apps/web/src/styles/tailor.css:175` -> `.guide-card`
- Tailor .cv-mark-changed/.cv-mark-inferred and import-review .map-wrap/.map-title/.map rules share the global CSS namespace without feature roots, so class-name reuse outside their features also matches. `apps/web/src/styles/tailor.css:136` -> `.cv-mark-changed`; `apps/web/src/styles/tailor.css:137` -> `.cv-mark-inferred`; `apps/web/src/styles/review.css:26` -> `.map-wrap`; `apps/web/src/styles/review.css:27` -> `.map-title`; `apps/web/src/styles/review.css:28` -> `.map`

- Uses CvDocument focus marks and global guide-page dimming; the sticky card is ordered before the page by CSS. `apps/web/src/tailor/GuidedReview.tsx:99` -> `focus={focus}`; `apps/web/src/cv/page/CvDocument.tsx:32` -> `focus === id ? "cv-mark-focus"`; `apps/web/src/tailor/GuidedReview.tsx:100` -> `guide-card`; `apps/web/src/styles/tailor.css:172` -> `.guide-card`; `apps/web/src/styles/tailor.css:173` -> `.guide-page`
- Uses the same retained-guess predicate as export warning counting. `apps/web/src/tailor/GuidedReview.tsx:20` -> `item?.kept`; `apps/web/src/export/export-files.ts:23` -> `item?.kept`
- Versioned decisions reach the server review validator through reviewItem. `apps/web/src/tailor/GuidedReview.tsx:60` -> `version: row.version`; `apps/web/src/tailor/tailored-api.ts:32` -> `PATCH`; `apps/api/src/tailor/review-item.ts:39` -> `doc.version`

## Assumptions

- A version-conflict reload replaces row without clearing draft; if the first remaining guess changes, submitting the edit form sends the previous guess text against the new current key and version. `apps/web/src/tailor/GuidedReview.tsx:51` -> `current`; `apps/web/src/tailor/GuidedReview.tsx:65` -> `setRow`; `apps/web/src/tailor/GuidedReview.tsx:86` -> `decide`; `apps/web/src/tailor/GuidedReview.tsx:60` -> `current.key`

- Review JSON is structurally loose in TailoredCvSchema, so the UI narrows its shape locally; authoritative target and version checks remain server-side. `packages/shared/src/tailor.ts:218` -> `z.unknown`; `apps/web/src/tailor/GuidedReview.tsx:19` -> `Record<string, ItemReview>`; `apps/api/src/tailor/review-item.ts:43` -> `Object.hasOwn`
