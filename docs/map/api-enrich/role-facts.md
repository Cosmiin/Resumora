---
id: api-enrich/role-facts
area: api-enrich
files: ["apps/api/src/enrich/role-facts.ts","apps/api/src/enrich/role-facts.test.ts"]
depends_on: ["api-enrich/score","api-enrich/focus-prompts","shared/cv","shared/enrichment-focus","shared/enrichment-checks","db/ai-log","api-core/call-model"]
contract: true
checked_hash: 1f1756f0
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Condense saved note answers and previous facts into facts tagged with their source-note hash.

- Finds roles, projects or volunteering in the saved CV; an absent item returns 404 role_not_found, without a fingerprint requirement. `apps/api/src/enrich/role-facts.ts:10` -> `roleId`; `apps/api/src/enrich/role-facts.ts:12` -> `findScored`; `apps/api/src/enrich/role-facts.ts:13` -> `404`.
- Computes fromNotes before calling the model; no notes returns empty facts immediately even if previous facts exist. `apps/api/src/enrich/role-facts.ts:14` -> `notesHash`; `apps/api/src/enrich/role-facts.ts:15` -> `!role.notes.length`.
- RoleFactsSchema allows at most eight strings; enrich_role_facts uses focus fact prompts and a 1200-token budget. `apps/api/src/enrich/role-facts.ts:8` -> `RoleFactsSchema`; `apps/api/src/enrich/role-facts.ts:20` -> `enrich_role_facts`; `apps/api/src/enrich/role-facts.ts:24` -> `1200`.
- Only note answers and previous fact items count as number sources; strings over 160 characters or with unknown numbers are dropped individually. `apps/api/src/enrich/role-facts.ts:26` -> `sources`; `apps/api/src/enrich/role-facts.ts:27` -> `fact.length <= 160`.
- Returns facts and fromNotes without saving them; unlike rewrite normalization, the fact filter does not trim, deduplicate or reject empty strings. `apps/api/src/enrich/role-facts.ts:27` -> `answer.facts.filter`; `apps/api/src/enrich/role-facts.ts:28` -> `return`.
- Malformed JSON or schema-invalid output retries through the gateway; exhausted providers become 503 ai_unavailable, while output truncation becomes 502 ai_bad_answer. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`; `apps/api/src/ai/call-model.ts:174` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:23` -> `AiUnavailableError`; `apps/api/src/enrich/score.ts:24` -> `AiOutputTooLongError`.
- tested by `apps/api/src/enrich/role-facts.test.ts:53` -> `POST /v1/enrich/role-facts`

## Connections

- Uses focus fact system and user templates; log task must match db/ai-log. `apps/api/src/enrich/role-facts.ts:22` -> `roleFactsSystemPrompt`; `apps/api/src/enrich/focus-prompts.ts:80` -> `roleFactsSystemPrompt`; `apps/api/src/enrich/role-facts.ts:23` -> `roleFactsUserMessage`; `apps/api/src/enrich/focus-prompts.ts:93` -> `roleFactsUserMessage`; `apps/api/src/enrich/role-facts.ts:20` -> `enrich_role_facts`; `supabase/migrations/20261109220000_enrich_item_lines.sql:25` -> `enrich_role_facts`.
- Uses shared/enrichment-focus notesHash and reply schema, shared/enrichment-checks numeric validation, and copies shared/cv fact length/count limits. `apps/api/src/enrich/role-facts.ts:14` -> `notesHash`; `packages/shared/src/enrich-focus.ts:8` -> `notesHash`; `apps/api/src/enrich/role-facts.ts:10` -> `RoleFactsAnswer`; `packages/shared/src/enrich-focus.ts:67` -> `RoleFactsAnswerSchema`; `apps/api/src/enrich/role-facts.ts:27` -> `hasUnknownNumber`; `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`; `apps/api/src/enrich/role-facts.ts:8` -> `max(8)`; `packages/shared/src/cv.ts:40` -> `RoleFactsSchema`.
- Used by browser role-facts requests through the route. `apps/web/src/cv/enrich/enrich-api.ts:47` -> `/v1/enrich/role-facts`; `apps/api/src/enrich/routes.ts:147` -> `"/role-facts"`; `apps/api/src/enrich/routes.ts:152` -> `roleFacts`; `apps/api/src/enrich/role-facts.ts:10` -> `roleFacts`.

## Assumptions

- Stored previous facts are accepted as number sources; this call does not verify their original answers still exist. `apps/api/src/enrich/role-facts.ts:26` -> `role.facts?.items`; `apps/api/src/enrich/focus-prompts.ts:87` -> `may no longer be listed`.
- fromNotes hashes note IDs and answers in order, not every field; consumers must not interpret it as a complete role version. `apps/api/src/enrich/role-facts.ts:14` -> `notesHash`; `packages/shared/src/enrich-focus.ts:9` -> `notes.map`.
- Repository scoping is supplied by the authenticated route, not checked by roleFacts itself. `apps/api/src/enrich/role-facts.ts:11` -> `deps.cv.get`; `apps/api/src/enrich/routes.ts:153` -> `deps.cvRepo(user)`.

