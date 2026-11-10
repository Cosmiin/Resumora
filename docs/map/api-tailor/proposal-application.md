---
id: api-tailor/proposal-application
area: api-tailor
files: ["apps/api/src/tailor/accept.ts","apps/api/test/tailor-light.test.ts"]
depends_on: ["shared/cv","shared/tailoring","api-tailor/proposal-matching","api-tailor/section-pass"]
contract: false
checked_hash: ae29a686
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Apply accepted text, ordering, hiding and skill additions to the tailored CV.

- Redo restores just the target role from current Base CV. Awards/courses/publications/interests are always rebuilt from current Base CV before applying decisions `apps/api/src/tailor/accept.ts:103` -> `input.redo`; `apps/api/src/tailor/accept.ts:105` -> `baseRole`; `apps/api/src/tailor/accept.ts:111` -> `"achievements"`; `apps/api/src/tailor/accept.ts:115` -> `list.splice`.
- Light-section order requires every item ID exactly once; invalid order silently does nothing. Hide sets hidden true and line proposals replace text `apps/api/src/tailor/accept.ts:43` -> `p.text.split`; `apps/api/src/tailor/accept.ts:45` -> `new Set(ids)`; `apps/api/src/tailor/accept.ts:53` -> `item.hidden`; `apps/api/src/tailor/accept.ts:57` -> `line.text`.
- Layout applies a same-length list of known section keys without its own uniqueness check; headline changes only first title, summary replaces basics.summary `apps/api/src/tailor/accept.ts:60` -> `p.text.split`; `apps/api/src/tailor/accept.ts:62` -> `order.every`; `apps/api/src/tailor/accept.ts:65` -> `cv.basics.titles`.
- New skills are case-insensitively deduplicated across all three skill groups; surviving additions get a new ID in technicalSkills only, within MAX_ITEMS `apps/api/src/tailor/accept.ts:69` -> `toLowerCase`; `apps/api/src/tailor/accept.ts:70` -> `cv.unclearSkills`; `apps/api/src/tailor/accept.ts:71` -> `cv.technicalSkills.push`.
- Existing role and other-item fields are written from persisted proposal.field; bullets match by ID and overwrite text. Missing targets silently do nothing; final CvContentSchema rejects invalid content with 502 `apps/api/src/tailor/accept.ts:75` -> `p.field`; `apps/api/src/tailor/accept.ts:77` -> `bullet.text`; `apps/api/src/tailor/accept.ts:80` -> `if (item)`; `apps/api/src/tailor/accept.ts:155` -> `safeParse`.
- tested by `apps/api/test/tailor-light.test.ts:101` -> `lighter sections in Final touches`.

## Connections

- Used by api-tailor/accept; targets come from api-tailor/proposal-matching `apps/api/src/tailor/accept.ts:153` -> `apply(content`; `apps/api/src/tailor/accept.ts:38` -> `function apply`; `apps/api/src/tailor/accept.ts:117` -> `sectionItems`; `apps/api/src/tailor/section-pass.ts:40` -> `sectionItems`.

## Assumptions

- Accept relies on stored proposals having passed section/layout validation; it selects by itemId but does not repeat allowed-field or truth checks `apps/api/src/tailor/accept.ts:124` -> `ids.has`; `apps/api/src/tailor/accept.ts:153` -> `apply(content`; `apps/api/src/tailor/accept.ts:75` -> `p.field`.
