---
id: web-enrich/client-sections
area: web-enrich
files: ["apps/web/src/cv/enrich/enrich-api.ts","apps/web/src/cv/enrich/enrich-api.test.ts"]
depends_on: ["web-enrich/client","api-enrich/skills","api-enrich/achievements","api-enrich/item-lines","api-enrich/voice-route","shared/enrichment-score"]
contract: true
checked_hash: a920472a
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Define JSON contracts for skills, achievements, item lines and voice-session creation.

- Skills POSTs `{}`; the local response schema requires suggestions `{name,group,evidence}[]` and sort `{skillId,group}[]`, restricting group to technicalSkills/professionalSkills. `apps/web/src/cv/enrich/enrich-api.ts:142` -> `SkillGroupSchema`; `apps/web/src/cv/enrich/enrich-api.ts:154` -> `json: {}`
- Achievements POSTs `{}` and parses at most five `{text,roleId}` suggestions. Item-lines sends `{section,itemId,text}` and parses at most four nonempty lines of at most 200 characters; section is courses/awards/publications/interests. `apps/web/src/cv/enrich/enrich-api.ts:159` -> `AchievementsAnswerSchema`; `packages/shared/src/enrich.ts:301` -> `AchievementsAnswerSchema`; `apps/web/src/cv/enrich/enrich-api.ts:164` -> `ItemLinesAnswerSchema`; `packages/shared/src/enrich.ts:307` -> `LIGHT_SECTIONS`; `packages/shared/src/enrich.ts:311` -> `ItemLinesBodySchema`; `packages/shared/src/enrich.ts:319` -> `ItemLinesAnswerSchema`
- Voice POST has no JSON body and expects a transient session credential plus expiresAt and model; the client requires a nonempty credential string. `apps/web/src/cv/enrich/enrich-api.ts:55` -> `VoiceSessionSchema`; `apps/web/src/cv/enrich/enrich-api.ts:63` -> `schema: VoiceSessionSchema`

## Connections

- Uses POST /v1/enrich/skills, /achievements and /item-lines. `apps/web/src/cv/enrich/enrich-api.ts:154` -> `/v1/enrich/skills`; `apps/api/src/enrich/routes.ts:189` -> `/skills`; `apps/web/src/cv/enrich/enrich-api.ts:159` -> `/v1/enrich/achievements`; `apps/api/src/enrich/routes.ts:101` -> `/achievements`; `apps/web/src/cv/enrich/enrich-api.ts:164` -> `/v1/enrich/item-lines`; `apps/api/src/enrich/routes.ts:130` -> `/item-lines`
- Uses POST /v1/enrich/voice-session. `apps/web/src/cv/enrich/enrich-api.ts:63` -> `/v1/enrich/voice-session`; `apps/api/src/enrich/routes.ts:194` -> `/voice-session`
- Uses [client](./client.md): all JSON helpers delegate validation and errors to the same authenticated fetch. `apps/web/src/cv/enrich/enrich-api.ts:154` -> `apiFetch`; `apps/web/src/lib/api.ts:64` -> `ApiClientError`; `apps/web/src/lib/api.ts:66` -> `parse`

## Assumptions
