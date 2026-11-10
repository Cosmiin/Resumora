---
id: web-editor/reducer-sections
area: web-editor
files: ["apps/web/src/cv/edit/cvReducer.ts","apps/web/src/cv/edit/cvReducer.test.ts"]
depends_on: ["web-editor/reducer","shared/cv","shared/categories","shared/stored-cv"]
contract: false
checked_hash: 03024e47
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md","docs/decisions/0006-last-save-wins-with-a-version-check.md","docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0009-one-fixed-set-of-cv-categories.md"]
open: []
---
Apply basics and section edits while preserving section order, visibility and section-only undo.

- setTitles trims trailing empty slots; setBasics refuses titles and setSummary delegates to basics.summary. `apps/web/src/cv/edit/cvReducer.ts:226` -> `case "setBasics"`; `apps/web/src/cv/edit/cvReducer.ts:231` -> `case "setTitles"`; `apps/web/src/cv/edit/cvReducer.ts:275` -> `case "setSummary"`
- sectionsOnCv includes hidden content and treats an achievements array with empty text as present; moving present sections leaves absent sections in their slots. `apps/web/src/cv/edit/cvReducer.ts:91` -> `sectionsOnCv`; `apps/web/src/cv/edit/cvReducer.ts:158` -> `moveSection`
- Adding summary/skills only unhides them; achievements gets a bullet, other gets a custom item, and other sections get one list item. `apps/web/src/cv/edit/cvReducer.ts:125` -> `addSection`
- Deleting a section clears only its content and hides it; restoreSection copies that section and its former visibility from the snapshot. `apps/web/src/cv/edit/cvReducer.ts:289` -> `case "deleteSection"`; `apps/web/src/cv/edit/cvReducer.ts:140` -> `withSectionContent`
- addCustomSection sets the new custom title and unhides other; clearing a section title removes its override. `apps/web/src/cv/edit/cvReducer.ts:297` -> `case "addCustomSection"`; `apps/web/src/cv/edit/cvReducer.ts:277` -> `case "setSectionTitle"`
- toggleHidden adds or removes the named section key without changing its content. `apps/web/src/cv/edit/cvReducer.ts:283` -> `case "toggleHidden"`
- tested by `apps/web/src/cv/edit/cvReducer.test.ts:75` -> `describe("sections"`

## Connections

- Used by header title fields and summary editing: `apps/web/src/cv/edit/sections/HeaderEdit.tsx:36` -> `setTitles`; `apps/web/src/cv/edit/cvReducer.ts:231` -> `case "setTitles"`; `apps/web/src/cv/edit/sections/SummaryEdit.tsx:8` -> `setSummary`; `apps/web/src/cv/edit/cvReducer.ts:275` -> `case "setSummary"`
- Used by page section undo and overview ordering: `apps/web/src/cv/edit/EditablePage.tsx:126` -> `restoreSection`; `apps/web/src/cv/edit/cvReducer.ts:291` -> `case "restoreSection"`; `apps/web/src/cv/panel/Overview.tsx:40` -> `sectionsOnCv`; `apps/web/src/cv/edit/cvReducer.ts:91` -> `sectionsOnCv`
- Uses item/bullet creation for list sections and achievements; other maps to the custom list: `apps/web/src/cv/edit/cvReducer.ts:131` -> `addBullet`; `apps/web/src/cv/edit/cvReducer.ts:203` -> `case "addBullet"`; `apps/web/src/cv/edit/cvReducer.ts:133` -> `addItem`; `apps/web/src/cv/edit/cvReducer.ts:119` -> `function addItem`

## Assumptions

- Skills section restore copies technicalSkills, professionalSkills and unclearSkills explicitly; a new SkillGroup requires extending this separate copy branch. `apps/web/src/cv/edit/cvReducer.ts:145` -> `technicalSkills`; `packages/shared/src/cv.ts:87` -> `SkillGroup`
- Title actions accept only indices 0 | 1 even though the runtime guard uses shared MAX_TITLES. `apps/web/src/cv/edit/cvReducer.ts:43` -> `index: 0 | 1`; `apps/web/src/cv/edit/cvReducer.ts:232` -> `MAX_TITLES`; `packages/shared/src/cv.ts:12` -> `MAX_TITLES`
