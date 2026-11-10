---
id: shared/enrichment-focus
area: shared
files: ["packages/shared/src/enrich-focus.ts","packages/shared/src/enrich-focus.test.ts","packages/shared/src/enrich-stream.ts"]
depends_on: ["shared/cv","shared/enrichment-score"]
contract: true
checked_hash: f896b8cb
cited: [8d0ff4, d43863, 839fea, 8458c6, a8d9bf, a41991, 9cd27f, 43ff99, fc7bf3, 09ef5c, f7fd27, fce614, b1aef4, 8fd8cf, bf6464, 988f3f, 7ff367, 075651, 7b9234, 8d0ff4, d43863, e23f17, d43863, 68498e, f3e4ff, 24c607, 0f6500, 66cffc, a41991, 66cffc, c6fea3, 197d3a, d25d5a, fbc523, 860ee6, a41991, 9cd27f, 43ff99, 4be711, 6647e7, 09ef5c, 1103eb, a509ab, 3c11bf, b1aef4, b71df3, 8b1187, a0295e, 2c7383, f0e64f, debf4f, d46923, 917c3f, b1aef4, fc6d17, 631af0, 49de3e, 09ef5c, 1225ee]
decisions: ["docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Share focus-mode cached grades, response shapes and rewrite stream event data.

- Focus-mode constants include the brain-dump question and a maximum of five pending grade results. `packages/shared/src/enrich-focus.ts:5` -> `BRAIN_DUMP_QUESTION`
- notesHash includes only ordered note IDs and answers, separated by null/control characters; other note fields do not affect it. `packages/shared/src/enrich-focus.ts:8` -> `notesHash`
- mergeGrades prefers fresh grades by ID, falls back to stored grades and throws when a current bullet has neither. `packages/shared/src/enrich-focus.ts:18` -> `role.bullets.map`
- Reused duplicate grades point to the first current bullet; scoring is rebuilt while stored role questions are preserved and thin remains sticky unless absent. `packages/shared/src/enrich-focus.ts:31` -> `duplicateOf`, `packages/shared/src/enrich-focus.ts:37` -> `return`
- ImproveAnswer is either strict needsDetail true with nullable/default-null follow-up, or a strict proposal/score/cache response; follow-up options cap at four of 60 characters. `packages/shared/src/enrich-focus.ts:44` -> `ImproveAnswerSchema`
- BrainDumpAnswer allows at most four proposals with integer scores and nullable before/after totals; RoleFactsAnswer allows eight strings and a fromNotes value. `packages/shared/src/enrich-focus.ts:60` -> `BrainDumpAnswerSchema`, `packages/shared/src/enrich-focus.ts:67` -> `RoleFactsAnswerSchema`
- Rewrite events comprise start, delta, ready, dropped, error and done; proposal indices must be nonnegative integers and start.replaces may be null. `packages/shared/src/enrich-stream.ts:7` -> `StartEventSchema`, `packages/shared/src/enrich-stream.ts:14` -> `RewriteEventSchemas`
- Dropped reasons are number, length, unknownBullet, unchanged and newWithoutNote; stream errors have code/message but no requestId. `packages/shared/src/enrich-stream.ts:4` -> `DropReasonSchema`, `packages/shared/src/enrich-stream.ts:11` -> `ErrorEventSchema`
- RewriteEvent derives a discriminated event/data union from the schema map, so adding a schema changes the type union. `packages/shared/src/enrich-stream.ts:24` -> `RewriteEvent`
- tested by `packages/shared/src/enrich-focus.test.ts:38` -> `mergeGrades`

## Connections

- Used by API and web focus logic: `apps/api/src/enrich/improve.ts:1` -> `mergeGrades`, `apps/api/src/enrich/brain-dump.ts:1` -> `BRAIN_DUMP_QUESTION`, `apps/api/src/enrich/role-facts.ts:1` -> `notesHash`, `apps/web/src/cv/enrich/useFocusSession.ts:3` -> `notesHash` -> `packages/shared/src/enrich-focus.ts:12` -> `mergeGrades`, `packages/shared/src/enrich-focus.ts:5` -> `BRAIN_DUMP_QUESTION`, `packages/shared/src/enrich-focus.ts:8` -> `notesHash`.
- Used by web fact acceptance, not only caching: setFacts leaves the CV unchanged unless the current notes hash equals facts.fromNotes, so changing the hash changes which returned facts are accepted. `apps/web/src/cv/edit/cvReducer.ts:339` -> `notesHash` -> `packages/shared/src/enrich-focus.ts:8` -> `notesHash`; fact response contract `packages/shared/src/enrich-focus.ts:69` -> `fromNotes`.
- Used by API pending-result storage: `apps/api/src/enrich/supabase-repo.ts:77` -> `MAX_PENDING`, `apps/api/src/enrich/memory-repo.ts:40` -> `MAX_PENDING` -> `packages/shared/src/enrich-focus.ts:6` -> `MAX_PENDING`. Web uses the returned response types rather than this storage limit: `apps/web/src/cv/enrich/enrich-api.ts:39` -> `ImproveAnswerSchema` -> `packages/shared/src/enrich-focus.ts:44` -> `ImproveAnswerSchema`.
- Used by web focus URLs and API handlers: `apps/web/src/cv/enrich/enrich-api.ts:39` -> `/v1/enrich/improve-bullet`, `apps/web/src/cv/enrich/enrich-api.ts:43` -> `/v1/enrich/brain-dump`, `apps/web/src/cv/enrich/enrich-api.ts:47` -> `/v1/enrich/role-facts` -> `apps/api/src/enrich/routes.ts:66` -> `/improve-bullet`, `apps/api/src/enrich/routes.ts:84` -> `/brain-dump`, `apps/api/src/enrich/routes.ts:147` -> `/role-facts`; response contracts `packages/shared/src/enrich-focus.ts:44` -> `ImproveAnswerSchema`, `packages/shared/src/enrich-focus.ts:60` -> `BrainDumpAnswerSchema`, `packages/shared/src/enrich-focus.ts:67` -> `RoleFactsAnswerSchema`.
- Used by API SSE validation and web SSE parsing: `apps/api/src/enrich/routes.ts:169` -> `RewriteEventSchemas`, `apps/web/src/cv/enrich/enrich-api.ts:88` -> `RewriteEventSchemas` -> `packages/shared/src/enrich-stream.ts:14` -> `RewriteEventSchemas`.
- Used by API rewrite filtering and web event accumulation: `apps/api/src/enrich/rewrite.ts:1` -> `DropReason`, `apps/web/src/cv/enrich/stream-events.ts:1` -> `RewriteEvent` -> `packages/shared/src/enrich-stream.ts:23` -> `DropReason`, `packages/shared/src/enrich-stream.ts:24` -> `RewriteEvent`.
- Focus response generation uses three AI templates: `apps/api/src/enrich/improve.ts:35` -> `improveBulletSystemPrompt` -> `apps/api/src/enrich/focus-prompts.ts:4` -> `improveBulletSystemPrompt`; `apps/api/src/enrich/brain-dump.ts:48` -> `brainDumpSystemPrompt` -> `apps/api/src/enrich/focus-prompts.ts:46` -> `brainDumpSystemPrompt`; `apps/api/src/enrich/role-facts.ts:22` -> `roleFactsSystemPrompt` -> `apps/api/src/enrich/focus-prompts.ts:80` -> `roleFactsSystemPrompt`.
- Web summary rewrite URL consumes this stream contract: `apps/web/src/cv/enrich/SummaryTools.tsx:28` -> `/v1/enrich/rewrite-summary` -> `apps/api/src/enrich/routes.ts:173` -> `/rewrite-summary`; event contract `packages/shared/src/enrich-stream.ts:24` -> `RewriteEvent`.

## Assumptions

- notesHash is order-sensitive and deliberately omits questions, timestamps, input methods and job IDs. Callers must not use it to detect changes in those fields. `packages/shared/src/enrich-focus.ts:9` -> `notes.map`.
- Response integer scores in focus schemas are not range-checked to 0–100; these schemas rely on the score producer. `packages/shared/src/enrich-focus.ts:51` -> `bulletBefore`, `packages/shared/src/enrich-focus.ts:61` -> `proposals:`.
- Per-event schemas do not enforce stream ordering; the client separately treats a stream ending without done as broken. `packages/shared/src/enrich-stream.ts:14` -> `RewriteEventSchemas`, `apps/web/src/cv/enrich/enrich-api.ts:124` -> `BROKEN`.
