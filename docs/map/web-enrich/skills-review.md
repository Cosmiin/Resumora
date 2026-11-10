---
id: web-enrich/skills-review
area: web-enrich
files: ["apps/web/src/cv/enrich/SkillsTools.tsx","apps/web/src/cv/enrich/summary-skills.test.tsx"]
depends_on: ["web-enrich/skills","web-enrich/skills-path","web-enrich/summary","shared/cv","shared/enrichment-checks","web-editor/reducer","web-editor/document","web-editor/page-fields"]
contract: false
checked_hash: 8bad4989
cited: [61c143, deec06, d653d9, ec962d, 00f1a2, 138ae6, 46eab2, 24a64c, 090457, 7d0cee, 2b2188, 4417e3, 143533, a11a82, 78a196, 0b70c0, cf40dd, 46eab2, 77ed9d, 779894, abd4f6, 0e5ecc, 24a64c, 5e1af5, 3d9a76, 5e04bc, 4417e3, 7417e2, 7bcaff, 69af33]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Review evidenced skills and apply selected additions or moves through the reducer.

- Suggestions deduplicate by trimmed lowercase name and disable Add when the name exists in any of technicalSkills, professionalSkills or unclearSkills; evidence is shown alongside each suggestion. `apps/web/src/cv/enrich/SkillsTools.tsx:24` -> `cv.unclearSkills`; `apps/web/src/cv/enrich/SkillsTools.tsx:27` -> `toLowerCase`; `apps/web/src/cv/enrich/SkillsTools.tsx:45` -> `disabled={done}`; `apps/web/src/cv/enrich/SkillsTools.tsx:51` -> `s.evidence`
- Sort rows resolve IDs against current unclearSkills, start selected, and dispatch one moveSkills for chosen rows; missing/moved IDs disappear from review. `apps/web/src/cv/enrich/SkillsTools.tsx:61` -> `unticked`; `apps/web/src/cv/enrich/SkillsTools.tsx:64` -> `cv.unclearSkills.find`; `apps/web/src/cv/enrich/SkillsTools.tsx:100` -> `moveSkills`
- Checklist uses shared skillsChecklist; nothingToSort includes the unresolved count, while the other check includes missing tool names. `apps/web/src/cv/enrich/SkillsTools.tsx:149` -> `skillsChecklist`; `apps/web/src/cv/enrich/SkillsTools.tsx:151` -> `cv.unclearSkills.length`; `apps/web/src/cv/enrich/SkillsTools.tsx:152` -> `c.missing`
- tested by `apps/web/src/cv/enrich/summary-skills.test.tsx:203` -> `describe`

## Connections

- Uses addSkill/addSkills; reducer trims names, rejects blank/duplicate names across all three groups and enforces destination MAX_ITEMS. `apps/web/src/cv/enrich/SkillsTools.tsx:47` -> `addSkill`; `apps/web/src/cv/enrich/EnrichPath.tsx:139` -> `addSkills`; `apps/web/src/cv/edit/cvReducer.ts:258` -> `case "addSkill"`; `apps/web/src/cv/edit/cvReducer.ts:370` -> `addSkill`; `apps/web/src/cv/edit/cvReducer.ts:171` -> `MAX_ITEMS`; `apps/web/src/cv/edit/cvReducer.ts:173` -> `SKILL_GROUPS`
- Uses moveSkills/removeSkills; moves reject missing/already-target IDs and full destinations, while removal searches every group by ID, preserving unrelated skills. `apps/web/src/cv/enrich/SkillsTools.tsx:100` -> `moveSkills`; `apps/web/src/cv/edit/cvReducer.ts:266` -> `moveSkill`; `apps/web/src/cv/edit/cvReducer.ts:180` -> `MAX_ITEMS`; `apps/web/src/cv/enrich/EnrichPath.tsx:153` -> `removeSkills`; `apps/web/src/cv/edit/cvReducer.ts:374` -> `gone.has(s.id)`
- Uses shared checklist and common rendering; a failing check shows its fix, while a passing one suppresses it. `apps/web/src/cv/enrich/SkillsTools.tsx:149` -> `skillsChecklist`; `packages/shared/src/enrich-checks.ts:98` -> `skillsChecklist`; `apps/web/src/cv/enrich/SkillsTools.tsx:158` -> `Checklist`; `apps/web/src/cv/enrich/Checklist.tsx:14` -> `!it.ok`
- Added skill groups feed document headings through the exhaustive Locale map SKILL_GROUPS (distinct from the shared group-name array); extending Locale requires translated headings here. `apps/web/src/cv/enrich/SkillsTools.tsx:47` -> `group: s.group`; `apps/web/src/cv/page/CvDocument.tsx:53` -> `SKILL_GROUPS[cv.locale]`; `apps/web/src/cv/page/CvDocument.tsx:54` -> `cv.professionalSkills`; `apps/web/src/cv/page/blocks.ts:9` -> `Record<Locale, { technical: string; professional: string }>`

## Assumptions
