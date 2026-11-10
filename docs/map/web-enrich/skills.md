---
id: web-enrich/skills
area: web-enrich
files: ["apps/web/src/cv/enrich/SkillsTools.tsx","apps/web/src/cv/enrich/summary-skills.test.tsx","apps/web/src/cv/enrich/save-failed.test.tsx"]
depends_on: ["web-enrich/client-sections","web-enrich/skills-review","web-enrich/skills-path","web-enrich/path","api-enrich/skills","shared/cv","web-editor/section-tools","web-editor/autosave"]
contract: false
checked_hash: 9bea3fc4
cited: [0d8d56, d35698, 75b923, f40d66, 7a37e2, 5748c7, 38db12, 8eb687, 025146, 2adf01, 37afa8, fc165d, 025146, 2b2188, 47d472, 82c001, 7ccbbb, 0ad7e2, 5ba525, 025146, bc152b, 4bff71, 767b49, 4417e3, 46eab2, 37afa8, ec962d, f043ee, 3935a3, 90a5a6, e1f545]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Request fresh skill suggestions or sorting proposals after saving the CV.

- Each Suggest/Sort click waits for save and makes a fresh request; only the latest live request can set state. A save failure returns to idle with saveFailed and sends no suggestion request. `apps/web/src/cv/enrich/SkillsTools.tsx:128` -> `++latest.current`; `apps/web/src/cv/enrich/SkillsTools.tsx:132` -> `waitForSave`; `apps/web/src/cv/enrich/SkillsTools.tsx:135` -> `mine === latest.current`; `apps/web/src/cv/enrich/SkillsTools.tsx:139` -> `return`; `apps/web/src/cv/enrich/SkillsTools.tsx:143` -> `setAsk`
- HTTP 502 ai_bad_answer, HTTP 503 ai_unavailable and all suggestion errors show the same failed message and Try again for the selected mode; JSON interruptions also enter this catch, with no partial suggestions. `apps/web/src/cv/enrich/SkillsTools.tsx:144` -> `catch`; `apps/web/src/cv/enrich/SkillsTools.tsx:145` -> `status: "failed"`; `apps/web/src/cv/enrich/SkillsTools.tsx:180` -> `open(shown`; `apps/web/src/cv/enrich/enrich-api.ts:154` -> `apiFetch`
- Request is POST `{}`; response has suggestions `{name,group,evidence}[]` and sort `{skillId,group}[]`, with group restricted to technicalSkills/professionalSkills by the local schema. `apps/web/src/cv/enrich/enrich-api.ts:142` -> `SkillGroupSchema`; `apps/web/src/cv/enrich/enrich-api.ts:144` -> `suggestions`; `apps/web/src/cv/enrich/enrich-api.ts:145` -> `sort`; `apps/web/src/cv/enrich/enrich-api.ts:154` -> `json: {}`
- tested by `apps/web/src/cv/enrich/summary-skills.test.tsx:203` -> `describe`
- tested by `apps/web/src/cv/enrich/save-failed.test.tsx:102` -> `describe`

## Connections

- Used by base-CV Skills section tools and the path; both use POST /v1/enrich/skills. `apps/web/src/cv/panel/SectionTools.tsx:206` -> `SkillsTools`; `apps/web/src/cv/enrich/SkillsTools.tsx:112` -> `SkillsTools`; `apps/web/src/cv/enrich/SkillsTools.tsx:142` -> `getSkillSuggestions`; `apps/web/src/cv/enrich/EnrichPath.tsx:289` -> `getSkillSuggestions`; `apps/web/src/cv/enrich/enrich-api.ts:154` -> `/v1/enrich/skills`; `apps/api/src/enrich/routes.ts:189` -> `/skills`
- Uses [skills-review](./skills-review.md): a successful response chooses suggestion or sort review using the current mode. `apps/web/src/cv/enrich/SkillsTools.tsx:185` -> `Suggestions`; `apps/web/src/cv/enrich/SkillsTools.tsx:186` -> `SortProposals`; `apps/web/src/cv/enrich/SkillsTools.tsx:47` -> `addSkill`; `apps/web/src/cv/enrich/SkillsTools.tsx:100` -> `moveSkills`

## Assumptions

- The server supplies evidenced suggestions and legal target groups; the browser checks response shape and duplicates but does not independently verify evidence against saved roles. `apps/web/src/cv/enrich/enrich-api.ts:144` -> `evidence: z.string()`; `apps/web/src/cv/enrich/SkillsTools.tsx:51` -> `s.evidence`
- Skill evidence is limited to experience titles, descriptions, bullets and note answers; projects and volunteering are excluded although the guided path scores them. With no nonblank experience text the server returns both suggestions and sort empty, so it cannot even sort existing unclear skills in that case. `apps/api/src/enrich/skills.ts:33` -> `content.experience`; `apps/api/src/enrich/skills.ts:34` -> `r.notes`; `apps/api/src/enrich/skills.ts:37` -> `texts.length === 0`; `apps/web/src/cv/enrich/EnrichPath.tsx:65` -> `scoredItems`
