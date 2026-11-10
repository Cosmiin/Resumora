---
id: web-enrich/path
area: web-enrich
files: ["apps/web/src/cv/enrich/EnrichPath.tsx","apps/web/src/cv/enrich/PathStart.tsx","apps/web/src/cv/enrich/enrich-path.test.tsx","apps/web/src/cv/enrich/sections-path.test.tsx"]
depends_on: ["web-enrich/scores","web-enrich/focus-ui","web-enrich/item-lines","web-enrich/achievements","web-enrich/skills-path","web-enrich/path-completion","web-enrich/client-sections","api-enrich/achievements","api-enrich/skills","shared/cv","shared/enrichment-score","web-editor/page"]
contract: false
checked_hash: ae62582c
cited: [4d8420, 08e860, e1f545, 3191dc, 59e831, d6e493, d8aeb5, fbcfca, f2da34, dfab52, 2380cc, 105909, c84f3c, d51619, 6fcecd, 659343, 8f8f39, 0b9a8e, faffe0, 97a8e0, 98d83f, 967d5e, dc473b, 726a7d, 2683cb, ed3bb0, e73d7b, 8c43ba, 4f59f7, 39d741, 020c9d, 179af0, 01eba9, 5ba525, 025146, bc152b, a398d1, 2380cc, 92eb1d, 3f57b3, fcf213, b3436e, 39d741, 4b486e, d6b919, 5ba525, d79ff5]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Choose and freeze enrichment stops for the lifetime of the guided path.

- A role is below target unless state is ready with a non-null score >= ENRICHED_AT (80); missing, previous, unavailable and scoring states remain eligible. `apps/web/src/cv/enrich/EnrichPath.tsx:26` -> `ENRICHED_AT`; `apps/web/src/cv/enrich/EnrichPath.tsx:28` -> `state === "ready"`
- Start reads live scores, but Start's handler freezes stop IDs, light-item stops and before-scores; mid-path score changes do not rebuild that list. `apps/web/src/cv/enrich/EnrichPath.tsx:65` -> `scoredItems`; `apps/web/src/cv/enrich/EnrichPath.tsx:68` -> `fixed?.stops`; `apps/web/src/cv/enrich/EnrichPath.tsx:85` -> `setFixed`
- Scored stops follow experience, projects, volunteering order, then light stops, achievements, skills and end. Light stops include only items without any nonblank bullet, regardless of hidden status. `packages/shared/src/cv.ts:270` -> `scoredItems`; `apps/web/src/cv/enrich/EnrichPath.tsx:33` -> `lightStops`; `apps/web/src/cv/enrich/EnrichPath.tsx:76` -> `afterRoles`; `apps/web/src/cv/enrich/EnrichPath.tsx:116` -> `achievements`; `apps/web/src/cv/enrich/EnrichPath.tsx:130` -> `skills`; `apps/web/src/cv/enrich/EnrichPath.tsx:141` -> `end`
- OF_KEY exhaustively maps ScoredKind role/project/volunteering to progress translation keys; extending the shared union requires extending this map. `apps/web/src/cv/enrich/EnrichPath.tsx:39` -> `Record<ScoredKind, string>`; `packages/shared/src/cv.ts:267` -> `ScoredKind`
- Start groups role versus other scored items, shows ellipsis only for scoring, and uses a stored numeric result for other states when present. `apps/web/src/cv/enrich/PathStart.tsx:23` -> `scoring`; `apps/web/src/cv/enrich/PathStart.tsx:24` -> `result.score`; `apps/web/src/cv/enrich/PathStart.tsx:64` -> `kind === "role"`
- Frozen stops, before-scores, stage/progress, achievement count and skill Undo IDs live only in component state, with no localStorage persistence; remount/reload resets them to the start and empty tracking state. `apps/web/src/cv/enrich/EnrichPath.tsx:67` -> `fixed`; `apps/web/src/cv/enrich/EnrichPath.tsx:71` -> `stage`; `apps/web/src/cv/enrich/EnrichPath.tsx:78` -> `skills`; `apps/web/src/cv/enrich/EnrichPath.tsx:80` -> `achievementsAdded`
- tested by `apps/web/src/cv/enrich/enrich-path.test.tsx:46` -> `describe`
- tested by `apps/web/src/cv/enrich/sections-path.test.tsx:77` -> `describe`

## Connections

- Used by the base-CV editor only while no focus target or history view is open. `apps/web/src/cv/Editor.tsx:266` -> `!isTailored`; `apps/web/src/cv/Editor.tsx:267` -> `EnrichPath`; `apps/web/src/cv/enrich/EnrichPath.tsx:61` -> `EnrichPath`
- Uses FocusMode for scored items and LightStop for lightweight items; each receives waitForSave and reducer dispatch. `apps/web/src/cv/enrich/EnrichPath.tsx:97` -> `FocusMode`; `apps/web/src/cv/enrich/FocusMode.tsx:86` -> `FocusMode`; `apps/web/src/cv/enrich/EnrichPath.tsx:118` -> `LightStop`; `apps/web/src/cv/enrich/FocusMode.tsx:352` -> `LightStop`
- Uses achievements and skill JSON routes after saving; both 502 ai_bad_answer and 503 ai_unavailable are swallowed here, moving forward with nothing added, as are other exceptions. `apps/web/src/cv/enrich/EnrichPath.tsx:258` -> `suggestAchievements`; `apps/web/src/cv/enrich/enrich-api.ts:159` -> `/v1/enrich/achievements`; `apps/api/src/enrich/routes.ts:101` -> `/achievements`; `apps/web/src/cv/enrich/EnrichPath.tsx:259` -> `catch`; `apps/web/src/cv/enrich/EnrichPath.tsx:289` -> `getSkillSuggestions`; `apps/web/src/cv/enrich/enrich-api.ts:154` -> `/v1/enrich/skills`; `apps/api/src/enrich/routes.ts:189` -> `/skills`; `apps/web/src/cv/enrich/EnrichPath.tsx:290` -> `catch`
- Uses [path-completion](./path-completion.md): after skill processing the path switches to end and passes the tracked totals. `apps/web/src/cv/enrich/EnrichPath.tsx:141` -> `kind: "end"`; `apps/web/src/cv/enrich/EnrichPath.tsx:158` -> `EndStop`

## Assumptions

- Frozen IDs are expected to remain valid during the path: focus renders null if an item disappears, while start rows filter missing items. `apps/web/src/cv/enrich/EnrichPath.tsx:74` -> `filter`; `apps/web/src/cv/enrich/FocusMode.tsx:133` -> `if (!role) return null`
- Departure during waitForSave does not prevent achievement or skill requests from starting afterward: each calls the API before its alive check, so cleanup suppresses results rather than cancelling work. `apps/web/src/cv/enrich/EnrichPath.tsx:257` -> `waitForSave`; `apps/web/src/cv/enrich/EnrichPath.tsx:258` -> `suggestAchievements`; `apps/web/src/cv/enrich/EnrichPath.tsx:260` -> `!alive`; `apps/web/src/cv/enrich/EnrichPath.tsx:288` -> `waitForSave`; `apps/web/src/cv/enrich/EnrichPath.tsx:289` -> `getSkillSuggestions`; `apps/web/src/cv/enrich/EnrichPath.tsx:291` -> `alive`
