---
id: web-tailor/skills-review
area: web-tailor
files: ["apps/web/src/tailor/SkillsReview.tsx","apps/web/src/tailor/skills-review.test.tsx"]
depends_on: ["web-tailor/client-section","shared/cv"]
contract: false
checked_hash: a22ceaed
cited: [641f1b, 15bc33, 10e3ca, 4c874e, 179549, 5065ae, 603aa8, 97a5b5, 30e6de, a45f14, bf394b, 53ef97, e8d391, a1cca3, 49cfb9, 6d857a, a1cca3, 5065ae]
decisions: []
open: []
---
Review skill changes in five-item batches with choices retained between batches in the mounted component.

- BATCH is a local UI limit of five; batches never falls below one even for no proposals. `apps/web/src/tailor/SkillsReview.tsx:6` -> `BATCH`; `apps/web/src/tailor/SkillsReview.tsx:29` -> `Math.max`
- Only unflagged proposals become changes; undone and guess choices live outside the current batch slice in React state, so they persist between batches but reset on remount/reload. `apps/web/src/tailor/SkillsReview.tsx:24` -> `changes`; `apps/web/src/tailor/SkillsReview.tsx:26` -> `useState`
- New-skill keys include proposal text; existing items keep their ids. `apps/web/src/tailor/SkillsReview.tsx:8` -> `keyOf`
- Old names are resolved from technical and professional skills, excluding unclear skills. `apps/web/src/tailor/SkillsReview.tsx:32` -> `oldName`
- Final acceptance includes all ordinary changes unless undone and only explicitly decided guesses, with empty flags. `apps/web/src/tailor/SkillsReview.tsx:34` -> `accept`
- Inferred changes expose Keep/Remove; ordinary changes expose a reversible Undo toggle. `apps/web/src/tailor/SkillsReview.tsx:49` -> `p.inferred`; `apps/web/src/tailor/SkillsReview.tsx:56` -> `setUndone`
- tested by `apps/web/src/tailor/skills-review.test.tsx:21` -> `describe`

- Back revisits earlier batches; Next changes batch locally; only the last batch offers acceptance. `apps/web/src/tailor/SkillsReview.tsx:69` -> `setBatch`; `apps/web/src/tailor/SkillsReview.tsx:71` -> `last`

## Connections

- Used by SectionReview's skills branch even without loaded CV data. `apps/web/src/tailor/SectionReview.tsx:102` -> `SkillsReview`; `apps/web/src/tailor/SkillsReview.tsx:23` -> `SkillsReview`
- Uses global is-reverted row treatment. `apps/web/src/tailor/SkillsReview.tsx:44` -> `is-reverted`; `apps/web/src/styles/tailor.css:58` -> `.tailor-items li.is-reverted`

## Assumptions

- The component accepts missing CV and still submits proposal keys; old names are optional presentation data. `apps/web/src/tailor/SkillsReview.tsx:23` -> `cv = null`; `apps/web/src/tailor/SkillsReview.tsx:32` -> `oldName`
