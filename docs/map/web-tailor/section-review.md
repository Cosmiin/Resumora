---
id: web-tailor/section-review
area: web-tailor
files: ["apps/web/src/tailor/SectionReview.tsx","apps/web/src/tailor/section-review.test.tsx","apps/web/src/tailor/role-context.test.tsx"]
depends_on: ["web-tailor/skills-review","web-tailor/summary-review","web-tailor/layout-review","web-tailor/role-panel","web-tailor/client-section","shared/categories"]
contract: false
checked_hash: e51c4d76
decisions: []
open: []
---
Dispatch specialized section reviews and provide the fallback proposal list.

- New skills use new-skill:<text> as review key; other proposals use itemId. `apps/web/src/tailor/SectionReview.tsx:11` -> `reviewKey`
- Flag questions match key|field when itemId exists, otherwise the legacy quoted-text prefix. `apps/web/src/tailor/SectionReview.tsx:14` -> `flags.find`
- Layout order proposals display English category labels; unknown keys display unchanged. `apps/web/src/tailor/SectionReview.tsx:17` -> `shown`
- Before wording searches technical/professional skill names or experience role fields/bullets, with no before value for other sections. `apps/web/src/tailor/SectionReview.tsx:23` -> `technicalSkills`
- Acceptance skips flagged proposals, defaults ordinary changes true, includes inferred decisions only after explicit choice, and deduplicates by review key using Maps. `apps/web/src/tailor/SectionReview.tsx:64` -> `accept`
- Flagged rows display confirmation state but have no Keep/Remove controls; revert-all affects only unflagged proposals. `apps/web/src/tailor/SectionReview.tsx:62` -> `revertAll`; `apps/web/src/tailor/SectionReview.tsx:91` -> `flagged(p)`
- Skills always dispatches to SkillsReview; final sections and summary require loaded CV for their specialized review. `apps/web/src/tailor/SectionReview.tsx:102` -> `SkillsReview`; `apps/web/src/tailor/SectionReview.tsx:105` -> `FINAL_SECTIONS`
- tested by `apps/web/src/tailor/section-review.test.tsx:6` -> `describe`
- tested by `apps/web/src/tailor/role-context.test.tsx:102` -> `it`

## Connections

- Used as flow fallback when current role data is absent. `apps/web/src/tailor/TailorFlow.tsx:292` -> `SectionReview`; `apps/web/src/tailor/SectionReview.tsx:53` -> `SectionReview`
- Uses global is-inferred/is-changed/is-reverted row styling and strike-through. `apps/web/src/tailor/SectionReview.tsx:81` -> `is-reverted`; `apps/web/src/styles/tailor.css:56` -> `.tailor-items li.is-changed`; `apps/web/src/styles/tailor.css:59` -> `text-decoration`

## Assumptions

- Decisions identify items rather than fields, so multiple proposals sharing a review key share one keep decision. `apps/web/src/tailor/SectionReview.tsx:69` -> `reviewKey`; `apps/web/src/tailor/SectionReview.tsx:71` -> `decisions.set`
