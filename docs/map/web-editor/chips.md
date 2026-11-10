---
id: web-editor/chips
area: web-editor
files: ["apps/web/src/cv/edit/ChipInput.tsx","apps/web/src/cv/edit/sections/SkillsEdit.tsx","apps/web/src/cv/edit/sections/InterestsEdit.tsx","apps/web/src/cv/edit/chips.test.tsx"]
depends_on: ["web-editor/reducer","web-editor/page-fields","web-editor/bullets","shared/cv"]
contract: false
checked_hash: 1283378e
cited: [85f6b3, 8cbae6, dac385, 76ecf7, ea4bcf, 544921, d64b3b, 3111f5, 1ace63, e768b3, f00621, e6c1ff, 7a13b3, 6261e1, 79e7c6, 0993be, 3111f5, a23147, 1ace63, cf40dd, d9ad07, dd9a19, 6fbce5, e98dce, e0066d, 32ef23, b6480e, 8deb9c, 141db9, 48c604, 43ac84, 154394, e9df0f, d74e98, df08cf, 0b70c0, 24b84e, 3ee698]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Edit grouped skills and interests as chips while retaining hidden-item recovery.

- Enter, comma or blur commits trimmed nonempty text and clears the input; composition keystrokes are ignored. `apps/web/src/cv/edit/ChipInput.tsx:18` -> `commit`; `apps/web/src/cv/edit/ChipInput.tsx:24` -> `onKey`; `apps/web/src/cv/edit/ChipInput.tsx:56` -> `onBlur`
- Backspace in an empty input removes the last chip and returns its name to the draft for editing. `apps/web/src/cv/edit/ChipInput.tsx:29` -> `Backspace`
- Technical and professional rows always render; once unclear skills have existed, the sort row stays mounted even when emptied. `apps/web/src/cv/edit/sections/SkillsEdit.tsx:49` -> `showSort`; `apps/web/src/cv/edit/sections/SkillsEdit.tsx:56` -> `<SkillRow`; `apps/web/src/cv/edit/sections/SkillsEdit.tsx:70` -> `hasSort || showSort`
- Skill rows dispatch add/remove with a typed SkillGroup and use skills-group as their field key; the three rows are explicit JSX, not an exhaustive union-keyed record. `apps/web/src/cv/edit/sections/SkillsEdit.tsx:19` -> `SkillGroup`; `apps/web/src/cv/edit/sections/SkillsEdit.tsx:26` -> `addSkill`; `apps/web/src/cv/edit/sections/SkillsEdit.tsx:40` -> `fieldKey`; `apps/web/src/cv/edit/sections/SkillsEdit.tsx:72` -> `group="unclearSkills"`
- Interests passes all interests, including hidden ones, to ChipInput; hidden interests additionally receive Show controls. `apps/web/src/cv/edit/sections/InterestsEdit.tsx:10` -> `const hidden`; `apps/web/src/cv/edit/sections/InterestsEdit.tsx:13` -> `items={cv.interests}`; `apps/web/src/cv/edit/sections/InterestsEdit.tsx:22` -> `setItemHidden`
- Interest bullet editors render for any interest with a nonempty bullets array, without filtering hidden items. `apps/web/src/cv/edit/sections/InterestsEdit.tsx:30` -> `cv.interests.filter`
- tested by `apps/web/src/cv/edit/chips.test.tsx:20` -> `describe("ChipInput"`

## Connections

- Uses shared SkillGroup and the reducer's cross-group duplicate checks: `apps/web/src/cv/edit/sections/SkillsEdit.tsx:19` -> `SkillGroup`; `packages/shared/src/cv.ts:87` -> `SkillGroup`; `apps/web/src/cv/edit/sections/SkillsEdit.tsx:26` -> `addSkill`; `apps/web/src/cv/edit/cvReducer.ts:173` -> `SKILL_GROUPS.some`
- Uses global .cv-chips/.cv-chip/.cv-chip-sort, with removal buttons visible on focus/hover: `apps/web/src/cv/edit/ChipInput.tsx:39` -> `cv-chips`; `apps/web/src/styles/cv-page.css:41` -> `.cv-chips`; `apps/web/src/cv/edit/ChipInput.tsx:41` -> `cv-chip-sort`; `apps/web/src/styles/cv-page.css:43` -> `.cv-chip-sort`; `apps/web/src/cv/edit/ChipInput.tsx:43` -> `<button`; `apps/web/src/styles/cv-page.css:77` -> `.cv-chip button`
- Uses global .cv-chip-input and skill-row layout: `apps/web/src/cv/edit/ChipInput.tsx:49` -> `cv-chip-input`; `apps/web/src/styles/cv-page.css:78` -> `.cv-chip-input`; `apps/web/src/cv/edit/sections/SkillsEdit.tsx:32` -> `cv-skill-row`; `apps/web/src/styles/cv-page.css:39` -> `.cv-skill-row`
- Uses global .cv-hidden-list/.cv-hide to recover hidden interests: `apps/web/src/cv/edit/sections/InterestsEdit.tsx:16` -> `cv-hidden-list`; `apps/web/src/styles/cv-page.css:206` -> `.cv-hidden-list`; `apps/web/src/cv/edit/sections/InterestsEdit.tsx:21` -> `cv-hide`; `apps/web/src/styles/cv-page.css:204` -> `.cv-hide`

## Assumptions

- ChipInput clears the draft after calling onAdd even if the reducer refuses a duplicate or full list. `apps/web/src/cv/edit/ChipInput.tsx:20` -> `onAdd`; `apps/web/src/cv/edit/cvReducer.ts:171` -> `MAX_ITEMS`
- Removing a chip before re-adding its edited text does not preserve the original ID; new skill IDs come from the reducer. `apps/web/src/cv/edit/ChipInput.tsx:33` -> `onRemove`; `apps/web/src/cv/edit/cvReducer.ts:169` -> `id = newId()`
