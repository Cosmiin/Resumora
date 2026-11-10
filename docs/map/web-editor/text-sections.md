---
id: web-editor/text-sections
area: web-editor
files: ["apps/web/src/cv/edit/sections/HeaderEdit.tsx","apps/web/src/cv/edit/sections/SummaryEdit.tsx","apps/web/src/cv/edit/sections/OtherEdit.tsx","apps/web/src/cv/edit/sections/AchievementsEdit.tsx"]
depends_on: ["web-editor/reducer","web-editor/page-fields","web-editor/photos","web-editor/document","web-editor/templates","web-editor/bullets","web-editor/drag","web-editor/focus","web-editor/section-controls","shared/categories","shared/cv","web-editor/reducer-sections"]
contract: false
checked_hash: 86a56b9e
cited: [99d845, b156f9, c16ead, 3e322f, 21cb47, 8ab6c3, b4404c, 000337, 496500, 25a5e4, 4c9553, 451d3a, 84a3e7, cd6651, a3f680, a70dd7, fe0c51, 989ee6, 277b1d, c1c427, bb08e2, d8d159, fba8c8, 21cb47, 455be2, dbb641, bf3147, 04ef57, 4a558c, 634486, 55953e, 2feb94, 40b4ec, a3ccbb, 356a86, 998350, 11daa8, 9694f8, a725c1, 13d4d7, c16ead, a47b4a, b11e3a, 191d08, 8ab6c3, ff8185, f89f06, 2f00a0, c9fe4d]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Edit basic identity fields, summary, achievements and custom section text.

- Header edits basics through field-specific actions and renders exactly two title inputs with separate setTitles actions. `apps/web/src/cv/edit/sections/HeaderEdit.tsx:23` -> `setBasics`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:38` -> `setTitles`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:80` -> `index={0}`
- Contact fields render as editable text rather than clickable links, and the base photo callback writes basics.photo. `apps/web/src/cv/edit/sections/HeaderEdit.tsx:85` -> `contact.map`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:70` -> `PhotoField`
- Summary uses MAX_LONG_TEXT and a fixed summary field key. `apps/web/src/cv/edit/sections/SummaryEdit.tsx:8` -> `setSummary`; `apps/web/src/cv/edit/sections/SummaryEdit.tsx:12` -> `MAX_LONG_TEXT`
- Custom sections use their own title as the visible heading; details use MAX_LONG_TEXT and the custom list key. `apps/web/src/cv/edit/sections/OtherEdit.tsx:22` -> `<ItemField`; `apps/web/src/cv/edit/sections/OtherEdit.tsx:35` -> `MAX_LONG_TEXT`
- Custom add/reorder stays in the custom list, and new items focus their own title. `apps/web/src/cv/edit/sections/OtherEdit.tsx:52` -> `const add`; `apps/web/src/cv/edit/sections/OtherEdit.tsx:57` -> `const move`
- Achievements uses the top-level owner without an item ID, labels bullets through the shared category locale and focuses a newly added bullet. `apps/web/src/cv/edit/sections/AchievementsEdit.tsx:9` -> `OWNER`; `apps/web/src/cv/edit/sections/AchievementsEdit.tsx:14` -> `const add`; `apps/web/src/cv/edit/sections/AchievementsEdit.tsx:25` -> `CATEGORY.achievements`

## Connections

- Used by page/registry composition: `apps/web/src/cv/edit/EditablePage.tsx:93` -> `HeaderEdit`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:57` -> `HeaderEdit`; `apps/web/src/cv/edit/sections/renderers.tsx:19` -> `SummaryEdit`; `apps/web/src/cv/edit/sections/SummaryEdit.tsx:7` -> `SummaryEdit`; `apps/web/src/cv/edit/sections/renderers.tsx:20` -> `AchievementsEdit`; `apps/web/src/cv/edit/sections/AchievementsEdit.tsx:11` -> `AchievementsEdit`; `apps/web/src/cv/edit/sections/renderers.tsx:41` -> `OtherEdit`; `apps/web/src/cv/edit/sections/OtherEdit.tsx:49` -> `OtherEdit`
- Base mode places private photo controls before the name in the header's top-right slot; tailored mode shows CvPhoto before the name only for the header-right slot: `apps/web/src/cv/edit/sections/HeaderEdit.tsx:69` -> `<CvPhoto`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:70` -> `<PhotoField`; `apps/web/src/styles/cv-page.css:189` -> `float: inline-end`; `apps/web/src/cv/panel/PhotoField.tsx:16` -> `PhotoField`
- Uses global .cv-header/.cv-name/.cv-titles/.cv-contact and separator styling: `apps/web/src/cv/edit/sections/HeaderEdit.tsx:68` -> `cv-header`; `apps/web/src/styles/cv-page.css:20` -> `.cv-header`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:73` -> `cv-name`; `apps/web/src/styles/cv-page.css:97` -> `.cv-name`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:79` -> `cv-titles`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:84` -> `cv-contact`; `apps/web/src/styles/cv-page.css:99` -> `.cv-titles, .cv-contact`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:50` -> `sep`; `apps/web/src/styles/cv-page.css:102` -> `.sep`
- Uses global .cv-custom and .cv-label for independently titled custom blocks: `apps/web/src/cv/edit/sections/OtherEdit.tsx:21` -> `cv-custom`; `apps/web/src/styles/cv-page.css:118` -> `.cv-custom`; `apps/web/src/cv/edit/sections/OtherEdit.tsx:26` -> `cv-label`; `apps/web/src/styles/cv-page.css:106` -> `input.cv-label`
- HeaderEdit copies the shared MAX_TITLES = 2 limit through TitleField's fixed 0 | 1 index and two explicit slots; increasing the shared constant alone does not add editable title inputs. The reducer also fixes its action index to 0 | 1. `apps/web/src/cv/edit/sections/HeaderEdit.tsx:36` -> `index: 0 | 1`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:80` -> `index={0}`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:82` -> `index={1}`; `packages/shared/src/cv.ts:12` -> `MAX_TITLES`; `apps/web/src/cv/edit/cvReducer.ts:43` -> `index: 0 | 1`

## Assumptions

- Text components rely on reducer limits and the autosave schema check; they pass values directly into actions. `apps/web/src/cv/edit/sections/SummaryEdit.tsx:8` -> `dispatch`; `apps/web/src/cv/edit/cvReducer.ts:378` -> `case "addAchievements"`; `apps/web/src/cv/useAutosave.ts:175` -> `safeParse`
- Generated custom/bullet IDs must remain stable for field focus and React row identity. `apps/web/src/cv/edit/sections/OtherEdit.tsx:53` -> `newId`; `apps/web/src/cv/edit/sections/AchievementsEdit.tsx:15` -> `newId`
