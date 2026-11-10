---
id: web-enrich/scores
area: web-enrich
files: ["apps/web/src/cv/enrich/useRoleScores.ts","apps/web/src/cv/enrich/scores.test.tsx"]
depends_on: ["web-enrich/client","shared/cv","shared/enrichment-score","api-enrich/score","web-editor/autosave","web-editor/page"]
contract: false
checked_hash: 8595913a
cited: [b08f3e, 9ea02b, 6e8b22, fde5e1, 1e932b, 40161b, ec634f, 83a9ce, cfc7da, 2e7d3b, 02f2c8, 941da8, 44f473, bb77f5, 0c07d8, 30b09a, eea3b2, 9785bd, 8b612f, beaf05, c5f9d4, 73cc62, 48a8de, f4c569, c6ca9e, 8b0632, 9ea418, b08f3e, 3bf89a, 48a8de, 48c23d, b08f3e, f639d9, 747e41, 48a8de, c88f16, 241ac4, 8533fe, 2b9cf0, ece376, a7f629, 1d5f13, 7a8154, 585844, 40161b, d09660]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Maintain score-cache state separately from editable CV content and serialize background rescoring.

- Initial GET failure is swallowed and marks loading complete, allowing fresh scoring without cached results. `apps/web/src/cv/enrich/useRoleScores.ts:67` -> `getScores`; `apps/web/src/cv/enrich/useRoleScores.ts:71` -> `catch`; `apps/web/src/cv/enrich/useRoleScores.ts:73` -> `setLoaded`
- Iterates experience, projects and volunteering in shared order; one request runs at a time, only while autosave is saved, after a 2000 ms quiet interval. Once quiet, the next item can start immediately. `apps/web/src/cv/enrich/useRoleScores.ts:44` -> `scoredItems`; `apps/web/src/cv/enrich/useRoleScores.ts:8` -> `RESCORE_DELAY_MS`; `apps/web/src/cv/enrich/useRoleScores.ts:116` -> `status !== "saved"`; `apps/web/src/cv/enrich/useRoleScores.ts:127` -> `quiet.current`
- Empty/whitespace-only bullets do not trigger a score request; matching results with null score produce state none. `apps/web/src/cv/enrich/useRoleScores.ts:32` -> `hasBullets`; `apps/web/src/cv/enrich/useRoleScores.ts:118` -> `!hasBullets`; `apps/web/src/cv/enrich/useRoleScores.ts:148` -> `state: "none"`
- A 409 parks an unchanged fingerprint until the next saved transition; if the role changed while the request ran it is not parked. `apps/web/src/cv/enrich/useRoleScores.ts:99` -> `409`; `apps/web/src/cv/enrich/useRoleScores.ts:103` -> `waiting.current.add`; `apps/web/src/cv/enrich/useRoleScores.ts:84` -> `waiting.current.clear`
- 502 ai_bad_answer, 503 ai_unavailable, malformed JSON responses and network failures mark that fingerprint failed; old results remain visible and retries are suppressed until retry clears failure or the fingerprint changes. `apps/web/src/cv/enrich/useRoleScores.ts:104` -> `setFailed`; `apps/web/src/cv/enrich/useRoleScores.ts:120` -> `failed.get`; `apps/web/src/cv/enrich/useRoleScores.ts:135` -> `retry`; `apps/web/src/cv/enrich/useRoleScores.ts:150` -> `unavailable`
- Responses are retained only while the role still exists; fingerprint comparison determines ready versus previous, and matching in-flight scoring takes precedence over a stored result. `apps/web/src/cv/enrich/useRoleScores.ts:95` -> `experience.some`; `apps/web/src/cv/enrich/useRoleScores.ts:149` -> `inFlight`; `apps/web/src/cv/enrich/useRoleScores.ts:151` -> `state: "ready"`
- Stable entries preserve the Map identity to avoid downstream rerenders. `apps/web/src/cv/enrich/useRoleScores.ts:155` -> `sameEntry`; `apps/web/src/cv/enrich/useRoleScores.ts:159` -> `const same`
- These requests use JSON rather than SSE; response-body failures follow the same failure path, not partial-score rendering. `apps/web/src/cv/enrich/useRoleScores.ts:93` -> `scoreRole`; `apps/web/src/lib/api.ts:61` -> `res.json`; `apps/web/src/lib/api.ts:66` -> `parse`
- Failure suppression and parked 409 fingerprints last only for this hook instance: failed and waiting reset on remount, which fetches server results again. Cleanup clears alive without aborting the in-flight scoreRole request. `apps/web/src/cv/enrich/useRoleScores.ts:49` -> `failed`; `apps/web/src/cv/enrich/useRoleScores.ts:51` -> `waiting`; `apps/web/src/cv/enrich/useRoleScores.ts:67` -> `getScores`; `apps/web/src/cv/enrich/useRoleScores.ts:77` -> `alive.current = false`; `apps/web/src/cv/enrich/useRoleScores.ts:93` -> `scoreRole`
- tested by `apps/web/src/cv/enrich/scores.test.tsx:47` -> `describe`

## Connections

- Uses GET /v1/enrich/scores returning `{items:RoleResult[]}` and POST /score `{roleId,fingerprint}` returning RoleResult. `apps/web/src/cv/enrich/useRoleScores.ts:67` -> `getScores`; `apps/web/src/cv/enrich/enrich-api.ts:27` -> `/v1/enrich/scores`; `apps/api/src/enrich/routes.ts:53` -> `items:`; `apps/web/src/cv/enrich/useRoleScores.ts:93` -> `scoreRole`; `apps/web/src/cv/enrich/enrich-api.ts:35` -> `/v1/enrich/score`; `apps/api/src/enrich/routes.ts:55` -> `/score`
- Used by the editor with no roles for tailored documents; score updates are hook state rather than reducer actions. `apps/web/src/cv/Editor.tsx:86` -> `useRoleScores`; `apps/web/src/cv/enrich/useRoleScores.ts:46` -> `setResults`
- Uses shared fingerprint inputs: SCORE_POLICY, locale, title, description, bullet IDs and texts; notes are not included. `apps/web/src/cv/enrich/useRoleScores.ts:27` -> `fingerprint`; `packages/shared/src/enrich.ts:270` -> `fingerprint`; `packages/shared/src/enrich.ts:271` -> `const parts`

## Assumptions

- WeakMap fingerprint memoization requires immutable role objects; changing a role in place would reuse the cached hash. `apps/web/src/cv/enrich/useRoleScores.ts:22` -> `WeakMap`; `apps/web/src/cv/enrich/useRoleScores.ts:26` -> `known.value`
- Saved status must mean the server has the current text; the API independently rejects a mismatched fingerprint. `apps/web/src/cv/enrich/useRoleScores.ts:116` -> `status`; `apps/api/src/enrich/score.ts:69` -> `input.fingerprint`
