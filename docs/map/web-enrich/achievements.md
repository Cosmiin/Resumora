---
id: web-enrich/achievements
area: web-enrich
files: ["apps/web/src/cv/enrich/AchievementsPick.tsx","apps/web/src/cv/enrich/EnrichPath.tsx","apps/web/src/cv/enrich/enrich-path.test.tsx"]
depends_on: ["web-enrich/client-sections","web-enrich/path","web-enrich/skills-path","api-enrich/achievements","shared/enrichment-score","shared/cv","web-editor/reducer","web-editor/role-editors"]
contract: false
checked_hash: 4f4f0b77
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Offer evidence-linked achievement picks after the item stops and append the selected texts together.

- AchievementsStop waits for save and requests suggestions once per effect; no suggestions or any failure advances with an empty list, subject to the alive guard. `apps/web/src/cv/enrich/EnrichPath.tsx:257` -> `waitForSave`; `apps/web/src/cv/enrich/EnrichPath.tsx:258` -> `suggestAchievements`; `apps/web/src/cv/enrich/EnrichPath.tsx:259` -> `catch`; `apps/web/src/cv/enrich/EnrichPath.tsx:261` -> `done.current([])`
- HTTP 502 ai_bad_answer, HTTP 503 ai_unavailable, malformed responses and save failures are all silently skipped; this JSON flow has no partial-stream UI. `apps/web/src/cv/enrich/EnrichPath.tsx:255` -> `found`; `apps/web/src/cv/enrich/EnrichPath.tsx:259` -> `catch`; `apps/web/src/cv/enrich/enrich-api.ts:159` -> `apiFetch`
- POST body is `{}` and response is `{suggestions:[{text,roleId}]}` capped at five, text <=2000 characters and nonempty roleId <=64. The UI adds local index-string IDs for picking. `apps/web/src/cv/enrich/enrich-api.ts:159` -> `json: {}`; `packages/shared/src/enrich.ts:302` -> `suggestions`; `apps/web/src/cv/enrich/EnrichPath.tsx:262` -> `id: String(i)`
- Nothing starts selected; Add is disabled until a pick exists, and None sends an empty list. Selected texts retain response order. `apps/web/src/cv/enrich/AchievementsPick.tsx:15` -> `new Set()`; `apps/web/src/cv/enrich/AchievementsPick.tsx:48` -> `onDone([])`; `apps/web/src/cv/enrich/AchievementsPick.tsx:49` -> `picked.size === 0`; `apps/web/src/cv/enrich/AchievementsPick.tsx:50` -> `suggestions.filter`
- Attribution resolves only against cv.experience; an unknown role leaves off attribution without hiding the suggestion. Company is optional in the label. `apps/web/src/cv/enrich/EnrichPath.tsx:274` -> `roles={cv.experience}`; `apps/web/src/cv/enrich/AchievementsPick.tsx:23` -> `roles.find`; `apps/web/src/cv/enrich/AchievementsPick.tsx:24` -> `return null`; `apps/web/src/cv/enrich/AchievementsPick.tsx:26` -> `company ?`
- Selected texts dispatch addAchievements once and advance to skills; the report counts requested additions, even if reducer capacity admits fewer. `apps/web/src/cv/enrich/EnrichPath.tsx:128` -> `addAchievements`; `apps/web/src/cv/enrich/EnrichPath.tsx:129` -> `setAchievementsAdded(texts.length)`; `apps/web/src/cv/edit/cvReducer.ts:379` -> `room`; `apps/web/src/cv/edit/cvReducer.ts:381` -> `slice(0, room)`
- tested by `apps/web/src/cv/enrich/enrich-path.test.tsx:116` -> `describe`

## Connections

- Uses POST /v1/enrich/achievements -> AchievementsAnswerSchema; server returns suggestions from its service. `apps/web/src/cv/enrich/EnrichPath.tsx:258` -> `suggestAchievements`; `apps/web/src/cv/enrich/enrich-api.ts:159` -> `/v1/enrich/achievements`; `apps/api/src/enrich/routes.ts:101` -> `/achievements`; `apps/api/src/enrich/routes.ts:104` -> `suggestAchievements`
- Used by AchievementsStop; the reducer appends new IDs up to MAX_ACHIEVEMENTS and ignores empty/full additions. `apps/web/src/cv/enrich/EnrichPath.tsx:274` -> `AchievementsPick`; `apps/web/src/cv/enrich/AchievementsPick.tsx:14` -> `AchievementsPick`; `apps/web/src/cv/enrich/EnrichPath.tsx:128` -> `addAchievements`; `apps/web/src/cv/edit/cvReducer.ts:378` -> `case "addAchievements"`; `apps/web/src/cv/edit/cvReducer.ts:380` -> `room <= 0`
- Uses the shared achievement response schema whose hard-copied 2000-character text limit mirrors MAX_TEXT; the server suggestion filter uses MAX_TEXT directly, so changing that constant alone leaves the response limit behind. `apps/web/src/cv/enrich/enrich-api.ts:159` -> `AchievementsAnswerSchema`; `packages/shared/src/enrich.ts:302` -> `max(2000)`; `packages/shared/src/cv.ts:10` -> `MAX_TEXT = 2000`; `apps/api/src/enrich/achievements.ts:63` -> `text.length > MAX_TEXT`

## Assumptions

- The user confirms truth through selection; the UI does not revalidate evidence, deduplicate achievement text or compare a source fingerprint at acceptance. `apps/web/src/cv/enrich/AchievementsPick.tsx:50` -> `map((s) => s.text)`; `apps/web/src/cv/edit/cvReducer.ts:381` -> `cv.achievements`
