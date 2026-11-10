---
id: web-editor/section-tools
area: web-editor
files: ["apps/web/src/cv/panel/SectionTools.tsx","apps/web/src/cv/panel/sectionTips.ts","apps/web/src/cv/panel/section-tools.test.tsx"]
depends_on: ["web-editor/reducer","web-editor/role-editors","shared/categories","shared/cv","web-editor/reducer-sections"]
contract: false
checked_hash: e7515626
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Offer context-specific section controls, skill sorting and original-wording recovery.

- RoleBox searches only the focused role list, returns nothing for a missing ID, and sends setCurrent/removeItem for that list. `apps/web/src/cv/panel/SectionTools.tsx:39` -> `RoleBox`; `apps/web/src/cv/panel/SectionTools.tsx:52` -> `setCurrent`; `apps/web/src/cv/panel/SectionTools.tsx:61` -> `removeItem`
- RoleEnrich searches experience only; projects and volunteering receive RoleBox controls but not this score card. `apps/web/src/cv/panel/SectionTools.tsx:77` -> `cv.experience.find`; `apps/web/src/cv/panel/SectionTools.tsx:199` -> `key === "experience"`; `apps/web/src/cv/panel/SectionTools.tsx:202` -> `key === "volunteering"`
- ToSortBox moves each unclear skill to technical or professional using moveSkill and disappears when there are none. `apps/web/src/cv/panel/SectionTools.tsx:92` -> `unclearSkills.length`; `apps/web/src/cv/panel/SectionTools.tsx:99` -> `moveSkill`; `apps/web/src/cv/panel/SectionTools.tsx:102` -> `professionalSkills`
- Original-wording recovery handles summary directly; for listed sections it matches item IDs within the same list and restores differing string fields except id. `apps/web/src/cv/panel/SectionTools.tsx:114` -> `originalWording`; `apps/web/src/cv/panel/SectionTools.tsx:121` -> `LISTS.includes`; `apps/web/src/cv/panel/SectionTools.tsx:126` -> `Object.entries`
- Original bullet text is restored only for matching IDs in experience, projects or volunteering; it does not recreate missing bullets. `apps/web/src/cv/panel/SectionTools.tsx:132` -> `Array.isArray`; `apps/web/src/cv/panel/SectionTools.tsx:135` -> `current.has`
- The original-wording list whitelist contains custom, while page focus uses other for custom sections, so that branch does not find custom items through normal page focus. `apps/web/src/cv/panel/SectionTools.tsx:111` -> `LISTS`; `apps/web/src/cv/panel/SectionTools.tsx:121` -> `LISTS.includes`; `apps/web/src/cv/edit/sections/renderers.tsx:40` -> `other:`; `apps/web/src/cv/edit/EditablePage.tsx:99` -> `data-section={key}`
- An original CV marks the tools as tailored and disables role/summary/skills enrichment; sorting unclear skills remains available. `apps/web/src/cv/panel/SectionTools.tsx:160` -> `original !== undefined`; `apps/web/src/cv/panel/SectionTools.tsx:205` -> `!tailored`; `apps/web/src/cv/panel/SectionTools.tsx:207` -> `ToSortBox`
- Hiding a section sends toggleHidden, returns to overview and focuses the page; reset-name sends an empty title override. `apps/web/src/cv/panel/SectionTools.tsx:180` -> `onClick`; `apps/web/src/cv/panel/SectionTools.tsx:193` -> `setSectionTitle`
- Tips and AI buttons use partial CategoryKey maps: missing tip entries fall back to list tips, missing AI entries return none; the achievements placeholder has aria-disabled and no click handler. `apps/web/src/cv/panel/sectionTips.ts:5` -> `Partial<Record`; `apps/web/src/cv/panel/sectionTips.ts:16` -> `AI_BUTTONS`; `apps/web/src/cv/panel/sectionTips.ts:20` -> `tipsFor`; `apps/web/src/cv/panel/SectionTools.tsx:221` -> `aria-disabled="true"`
- tested by `apps/web/src/cv/panel/section-tools.test.tsx:39` -> `describe("section tools"`

## Connections

- Used by HelperPanel when page focus identifies a section: `apps/web/src/cv/panel/HelperPanel.tsx:36` -> `<SectionTools`; `apps/web/src/cv/panel/SectionTools.tsx:158` -> `SectionTools`
- Uses web-enrich summary/skill tools with waitForSave, which those tools await before server work: `apps/web/src/cv/panel/SectionTools.tsx:205` -> `SummaryTools`; `apps/web/src/cv/enrich/SummaryTools.tsx:138` -> `await waitForSave`; `apps/web/src/cv/panel/SectionTools.tsx:206` -> `SkillsTools`; `apps/web/src/cv/enrich/SkillsTools.tsx:132` -> `await waitForSave`
- Uses the enrichment context opener and score-card callback: `apps/web/src/cv/panel/SectionTools.tsx:76` -> `useOpenFocus`; `apps/web/src/cv/enrich/focus-context.ts:13` -> `useOpenFocus`; `apps/web/src/cv/panel/SectionTools.tsx:81` -> `<ScoreCard`; `apps/web/src/cv/enrich/ScoreCard.tsx:29` -> `ScoreCard`
- Uses global .panel-tools/.box/.toggle/.switch for tools and current-job controls: `apps/web/src/cv/panel/SectionTools.tsx:168` -> `panel-tools`; `apps/web/src/styles/panel.css:44` -> `.panel-tools`; `apps/web/src/cv/panel/SectionTools.tsx:44` -> `box`; `apps/web/src/styles/panel.css:49` -> `.box`; `apps/web/src/cv/panel/SectionTools.tsx:46` -> `toggle`; `apps/web/src/styles/panel.css:51` -> `.toggle`; `apps/web/src/cv/panel/SectionTools.tsx:49` -> `switch`; `apps/web/src/styles/panel.css:52` -> `.switch`
- Uses global .sort-row/.chip and .ai/.soon presentation: `apps/web/src/cv/panel/SectionTools.tsx:97` -> `sort-row`; `apps/web/src/styles/panel.css:63` -> `.sort-row`; `apps/web/src/cv/panel/SectionTools.tsx:98` -> `chip sort`; `apps/web/src/styles/panel.css:64` -> `.sort-row .chip`; `apps/web/src/cv/panel/SectionTools.tsx:219` -> `ai`; `apps/web/src/styles/panel.css:61` -> `.ai button`; `apps/web/src/cv/panel/SectionTools.tsx:223` -> `soon`; `apps/web/src/styles/panel.css:62` -> `.soon`
- Action rows and tips use global .row-btns and .tips rules; these unscoped selectors also affect unrelated elements reusing those classes. `apps/web/src/cv/panel/SectionTools.tsx:55` -> `row-btns`; `apps/web/src/styles/panel.css:57` -> `.row-btns`; `apps/web/src/cv/panel/SectionTools.tsx:210` -> `tips`; `apps/web/src/styles/panel.css:59` -> `.tips`

## Assumptions

- Callers needing save-before-enrichment must supply waitForSave; the default resolves immediately. `apps/web/src/cv/panel/SectionTools.tsx:72` -> `savedNow`; `apps/web/src/cv/panel/SectionTools.tsx:158` -> `waitForSave = savedNow`
- Original-wording recovery assumes stable matching item/bullet IDs between the base and tailored copies. `apps/web/src/cv/panel/SectionTools.tsx:123` -> `itemId`; `apps/web/src/cv/panel/SectionTools.tsx:135` -> `current.has`
- Category focus is indexed without a runtime guard. `apps/web/src/cv/panel/SectionTools.tsx:162` -> `CATEGORY[key]`
