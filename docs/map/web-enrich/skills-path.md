---
id: web-enrich/skills-path
area: web-enrich
files: ["apps/web/src/cv/enrich/EnrichPath.tsx","apps/web/src/cv/enrich/SkillsNotice.tsx","apps/web/src/cv/enrich/enrich-path.test.tsx"]
depends_on: ["web-enrich/skills","web-enrich/skills-review","web-enrich/client-sections","web-enrich/path","web-enrich/path-completion","api-enrich/skills","web-editor/reducer","web-editor/autosave"]
contract: false
checked_hash: 43916134
cited: [d6b919, 5ba525, a398d1, 143533, 655cb8, abd4f6, 1aa363, 776dfc, 1d6453, c81bbe, 6f3a15, 5ba525, 025146, bc152b, 37afa8, fc165d, 5ba525, 0ad7e2, faffe0, abd4f6, 0e5ecc]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Automatically add path skill suggestions and retain their proposed IDs for Undo.

- Path SkillsStop waits for save, converts every suggestion to `{id:newId(),name,group}`, ignores sort, and automatically dispatches addSkills; 502/503 and all other errors advance with no additions. `apps/web/src/cv/enrich/EnrichPath.tsx:288` -> `waitForSave`; `apps/web/src/cv/enrich/EnrichPath.tsx:289` -> `suggestions.map`; `apps/web/src/cv/enrich/EnrichPath.tsx:290` -> `catch`; `apps/web/src/cv/enrich/EnrichPath.tsx:139` -> `addSkills`
- Path retains proposed IDs and names for its notice; Undo dispatches removeSkills for exactly those IDs. The count is proposed additions, not a read-back of reducer-admitted skills. `apps/web/src/cv/enrich/EnrichPath.tsx:140` -> `setSkills`; `apps/web/src/cv/enrich/EnrichPath.tsx:153` -> `removeSkills`; `apps/web/src/cv/enrich/SkillsNotice.tsx:20` -> `names.length`
- Notice is absent with no names, and switches to removed text after Undo. `apps/web/src/cv/enrich/SkillsNotice.tsx:13` -> `return null`; `apps/web/src/cv/enrich/SkillsNotice.tsx:16` -> `undone`; `apps/web/src/cv/enrich/SkillsNotice.tsx:21` -> `onUndo`
- tested by `apps/web/src/cv/enrich/enrich-path.test.tsx:171` -> `describe`

## Connections

- Uses POST /v1/enrich/skills after saving: `{}` returns suggestions `{name,group,evidence}[]` and sort `{skillId,group}[]`; path processing keeps only suggestions. `apps/web/src/cv/enrich/EnrichPath.tsx:289` -> `getSkillSuggestions`; `apps/web/src/cv/enrich/enrich-api.ts:154` -> `/v1/enrich/skills`; `apps/api/src/enrich/routes.ts:189` -> `/skills`; `apps/web/src/cv/enrich/enrich-api.ts:144` -> `suggestions`; `apps/web/src/cv/enrich/enrich-api.ts:145` -> `sort`
- Uses [skills](./skills.md): both path and section tools call the same suggestion client, but the path ignores sort. `apps/web/src/cv/enrich/EnrichPath.tsx:289` -> `getSkillSuggestions`; `apps/web/src/cv/enrich/SkillsTools.tsx:142` -> `getSkillSuggestions`
- Uses [path](./path.md): proposed IDs feed Undo removal and remain only in path component state. `apps/web/src/cv/enrich/EnrichPath.tsx:78` -> `skills`; `apps/web/src/cv/enrich/EnrichPath.tsx:153` -> `removeSkills`; `apps/web/src/cv/edit/cvReducer.ts:374` -> `gone.has(s.id)`

## Assumptions
