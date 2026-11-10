---
id: web-editor/reducer
area: web-editor
files: ["apps/web/src/cv/edit/cvReducer.ts","apps/web/src/cv/edit/lists.ts","apps/web/src/cv/edit/cvReducer.test.ts"]
depends_on: ["shared/cv","shared/categories","shared/stored-cv","shared/imports"]
contract: false
checked_hash: 3aa550ff
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md","docs/decisions/0006-last-save-wins-with-a-version-check.md","docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0009-one-fixed-set-of-cv-categories.md"]
open: []
---
Apply immutable item, bullet and chip edits and centralize list ownership, limits and role lookup.

- setItemField searches only action.list, rejects id/bullets/absent fields and preserves identity on an equal value. `apps/web/src/cv/edit/cvReducer.ts:185` -> `setItemField`
- addItem, removeItem and moveItem operate only on the specified list; add caps MAX_ITEMS, and reorder rejects noninteger/out-of-range/same indices. `apps/web/src/cv/edit/cvReducer.ts:119` -> `addItem`; `apps/web/src/cv/edit/cvReducer.ts:244` -> `case "removeItem"`; `apps/web/src/cv/edit/cvReducer.ts:249` -> `case "moveItem"`; `apps/web/src/cv/edit/cvReducer.ts:101` -> `reorder`
- setBullet, splitBullet, joinBullet and addBullet search only the explicit owner list/item, or top-level achievements; an absent owner or bullet is a no-op. `apps/web/src/cv/edit/cvReducer.ts:192` -> `bulletAction`; `apps/web/src/cv/edit/lists.ts:86` -> `getBullets`
- Splitting clamps the caret and keeps the first ID; joining concatenates into the previous bullet without a separator; limits differ for achievements. `apps/web/src/cv/edit/cvReducer.ts:205` -> `case "splitBullet"`; `apps/web/src/cv/edit/cvReducer.ts:215` -> `case "joinBullet"`; `apps/web/src/cv/edit/cvReducer.ts:97` -> `maxBullets`
- replaceBullet searches all scored lists through roleListOf, then delegates to setBullet within the located list. `apps/web/src/cv/edit/cvReducer.ts:303` -> `case "replaceBullet"`
- addBullets searches all scored lists through roleListOf, generates IDs and truncates additions to remaining bullet capacity. `apps/web/src/cv/edit/cvReducer.ts:308` -> `case "addBullets"`
- addLines and setItemHidden search only their named courses/awards/publications/interests list; showing an item removes hidden rather than storing false. `apps/web/src/cv/edit/cvReducer.ts:317` -> `case "addLines"`; `apps/web/src/cv/edit/cvReducer.ts:324` -> `case "setItemHidden"`
- setCurrent searches only the caller's experience/projects/volunteering list; switching on clears endDate, switching off keeps it. `apps/web/src/cv/edit/cvReducer.ts:361` -> `case "setCurrent"`
- clearCopiedDescriptions separately walks the hard-coded ROLE_LISTS across experience, projects and volunteering, not only experience. `apps/web/src/cv/edit/cvReducer.ts:36` -> `ROLE_LISTS`; `apps/web/src/cv/edit/cvReducer.ts:383` -> `case "clearCopiedDescriptions"`
- SCORED_LIST is an exhaustive Record<ScoredKind, RoleList>; roleListOf uses shared findScored, so ID-based actions share this kind-to-list mapping. `apps/web/src/cv/edit/lists.ts:20` -> `SCORED_LIST`; `apps/web/src/cv/edit/lists.ts:23` -> `roleListOf`
- New role-shaped items start with a deterministic first bullet ID and empty notes; projects additionally get an empty URL. `apps/web/src/cv/edit/lists.ts:52` -> `bullets:`
- addSkill/addSkills deduplicate trimmed case-insensitive names across every shared SKILL_GROUPS member; moveSkill/moveSkills search those groups by ID and respect destination capacity. `apps/web/src/cv/edit/cvReducer.ts:169` -> `addSkill`; `apps/web/src/cv/edit/cvReducer.ts:178` -> `moveSkill`; `apps/web/src/cv/edit/cvReducer.ts:369` -> `case "addSkills"`
- removeSkill searches only the specified group; removeSkills removes IDs across all shared groups. SkillGroup has three members and SKILL_GROUPS is the shared iteration list, not an exhaustive Record in this area. `apps/web/src/cv/edit/cvReducer.ts:260` -> `case "removeSkill"`; `apps/web/src/cv/edit/cvReducer.ts:371` -> `case "removeSkills"`; `packages/shared/src/cv.ts:87` -> `SkillGroup`; `packages/shared/src/cv.ts:88` -> `SKILL_GROUPS`
- addInterest checks trimmed case-insensitive names only in interests; removeInterest delegates to that list. `apps/web/src/cv/edit/cvReducer.ts:267` -> `case "addInterest"`; `apps/web/src/cv/edit/cvReducer.ts:273` -> `case "removeInterest"`
- addAchievements appends only as many lines as fit. `apps/web/src/cv/edit/cvReducer.ts:378` -> `case "addAchievements"`
- tested by `apps/web/src/cv/edit/cvReducer.test.ts:28` -> `describe("bullets"`; `apps/web/src/cv/edit/cvReducer.test.ts:302` -> `describe("focus actions"`

## Connections

- Used by Editor's functional dispatch; unchanged references avoid marking an edit: `apps/web/src/cv/Editor.tsx:79` -> `cvReducer`; `apps/web/src/cv/edit/cvReducer.ts:224` -> `cvReducer`
- Shared scored lookup searches experience, projects, then volunteering; adding a kind must extend shared scoredItems and the editor's single SCORED_LIST mapping, rather than each ID-based action: `apps/web/src/cv/edit/lists.ts:24` -> `findScored`; `packages/shared/src/cv.ts:278` -> `findScored`; `packages/shared/src/cv.ts:270` -> `scoredItems`; `apps/web/src/cv/edit/lists.ts:20` -> `SCORED_LIST`
- Cleanup has its own ROLE_LISTS list, so extending the shared scored lookup alone does not extend cleanup: `apps/web/src/cv/edit/cvReducer.ts:384` -> `ROLE_LISTS.filter`; `apps/web/src/cv/edit/cvReducer.ts:36` -> `ROLE_LISTS`

## Assumptions

- List helpers use type assertions and field membership rather than full runtime validation; autosave is the schema gate. `apps/web/src/cv/edit/lists.ts:75` -> `getItems`; `apps/web/src/cv/edit/lists.ts:79` -> `withItems`; `apps/web/src/cv/useAutosave.ts:175` -> `safeParse`
- IDs must be unique across scored lists for lookup to be unambiguous; findScored takes the first match. `apps/web/src/cv/edit/lists.ts:24` -> `findScored`; `packages/shared/src/cv.ts:279` -> `.find`
- RoleList and ROLE_LISTS are separately declared from ScoredKind; satisfies checks values but does not guarantee that an array lists every kind. `apps/web/src/cv/edit/lists.ts:17` -> `RoleList`; `apps/web/src/cv/edit/cvReducer.ts:36` -> `satisfies`
