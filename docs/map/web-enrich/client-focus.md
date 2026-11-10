---
id: web-enrich/client-focus
area: web-enrich
files: ["apps/web/src/cv/enrich/enrich-api.ts","apps/web/src/cv/enrich/enrich-api.test.ts"]
depends_on: ["web-enrich/client","api-enrich/improve","api-enrich/brain-dump","api-enrich/role-facts","api-enrich/role-description","shared/enrichment-focus","shared/enrichment-score"]
contract: true
checked_hash: a920472a
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Define JSON request and response contracts for focus generation and derived role text.

- Improve sends `{roleId, bulletId, fingerprint}`; response is either `{needsDetail:true,nextQuestion:{text,options}|null}` or `{proposal:{bulletId,text},bulletBefore,bulletAfter,roleBefore,roleAfter,cached}`. `apps/web/src/cv/enrich/enrich-api.ts:38` -> `improveBullet`; `packages/shared/src/enrich-focus.ts:44` -> `ImproveAnswerSchema`; `packages/shared/src/enrich-focus.ts:50` -> `proposal`
- Brain dump sends `{roleId,fingerprint,source?:"answers"}`; omitting source selects the server's ramble default. Response has up to four `{id,text,score}` proposals and nullable roleBefore/roleAfterAll. `apps/web/src/cv/enrich/enrich-api.ts:42` -> `brainDump`; `apps/api/src/enrich/routes.ts:31` -> `default("ramble")`; `packages/shared/src/enrich-focus.ts:60` -> `BrainDumpAnswerSchema`
- Facts sends `{roleId}` and parses `{facts:string[],fromNotes:string}`, with at most eight facts. Description sends `{roleId,fingerprint}` and parses `{text,keywords}`, bounded by MAX_LONG_TEXT and eight keywords. `apps/web/src/cv/enrich/enrich-api.ts:47` -> `roleId`; `packages/shared/src/enrich-focus.ts:67` -> `RoleFactsAnswerSchema`; `apps/web/src/cv/enrich/enrich-api.ts:52` -> `RoleDescriptionAnswerSchema`; `packages/shared/src/enrich.ts:294` -> `RoleDescriptionAnswerSchema`
- These tests do not cover roleDescription, size limits or the server's default source. Request bodies and valid/invalid answer parsing for improveBullet, brainDump and roleFacts are tested by `apps/web/src/cv/enrich/enrich-api.test.ts:49` -> `it`; `apps/web/src/cv/enrich/enrich-api.test.ts:60` -> `it`. Improve's needs-detail branch and brain dump's optional answers source are tested by `apps/web/src/cv/enrich/enrich-api.test.ts:66` -> `it`; `apps/web/src/cv/enrich/enrich-api.test.ts:71` -> `it`

## Connections

- Uses POST /v1/enrich/improve-bullet and /brain-dump. `apps/web/src/cv/enrich/enrich-api.ts:39` -> `/v1/enrich/improve-bullet`; `apps/api/src/enrich/routes.ts:66` -> `/improve-bullet`; `apps/web/src/cv/enrich/enrich-api.ts:43` -> `/v1/enrich/brain-dump`; `apps/api/src/enrich/routes.ts:84` -> `/brain-dump`
- Uses POST /v1/enrich/role-facts and /role-description. `apps/web/src/cv/enrich/enrich-api.ts:47` -> `/v1/enrich/role-facts`; `apps/api/src/enrich/routes.ts:147` -> `/role-facts`; `apps/web/src/cv/enrich/enrich-api.ts:52` -> `/v1/enrich/role-description`; `apps/api/src/enrich/routes.ts:113` -> `/role-description`
- Uses [client](./client.md): all JSON helpers delegate validation and errors to the same authenticated fetch. `apps/web/src/cv/enrich/enrich-api.ts:39` -> `apiFetch`; `apps/web/src/lib/api.ts:64` -> `ApiClientError`; `apps/web/src/lib/api.ts:66` -> `parse`

## Assumptions
