---
id: shared/match-score
area: shared
files: ["packages/shared/src/match-score.ts","packages/shared/src/match-score.test.ts"]
depends_on: ["shared/jobs","shared/tailoring"]
contract: true
checked_hash: fa41201e
decisions: []
open: []
---
Convert job-match labels into a deterministic weighted score and band.

- Bands are excellent at 85, strong at 70, fair at 50, otherwise low. `packages/shared/src/match-score.ts:14` -> `bandOf`
- Missing labels score zero; unconfirmed inferred labels score 0.5 regardless of status, while confirmed/noninferred labels use met 1, partial 0.5, missing 0. `packages/shared/src/match-score.ts:21` -> `labelPoints`
- Requirement labels match the first requirement-kind label with ref r plus the zero-based requirement index. `packages/shared/src/match-score.ts:28` -> `requirementLabel`
- Requirements weigh 50 overall; each must requirement weighs twice a nice requirement internally. Empty requirements remove this component. `packages/shared/src/match-score.ts:38` -> `requirements`
- Keywords weigh 30 and average all keyword labels, with no deduplication; no keyword labels removes this component. `packages/shared/src/match-score.ts:53` -> `keywords`
- Seniority weighs 10, gives full/half/zero credit at distances zero/one/more, and is excluded when either side is unknown or CV seniority is absent. `packages/shared/src/match-score.ts:62` -> `seniority`
- Language/education weighs 10 and averages those requirement labels again, separately from their contribution to the requirements component. `packages/shared/src/match-score.ts:72` -> `langEdu`
- Available component weights are rescaled to total 100; parts.points stores fractions while parts.max stores the rescaled weight. `packages/shared/src/match-score.ts:84` -> `computeMatchScore`, `packages/shared/src/match-score.ts:95` -> `Object.values`
- Any must requirement with zero label points caps the rounded score at 69; no available component gives null total/band. Output retains the supplied labels and literal match/1. `packages/shared/src/match-score.ts:101` -> `const capped`
- tested by `packages/shared/src/match-score.test.ts:23` -> `computeMatchScore`

## Connections

- Used by API match scoring: `apps/api/src/tailor/score.ts:2` -> `computeMatchScore` -> `packages/shared/src/match-score.ts:84` -> `computeMatchScore`.
- Uses JobExtraction seniority and shared MatchLabel/MatchScore types: `packages/shared/src/match-score.ts:1` -> `JobExtraction`, `packages/shared/src/match-score.ts:2` -> `MatchLabel` -> `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`, `packages/shared/src/tailor.ts:70` -> `MatchLabelSchema`, `packages/shared/src/tailor.ts:79` -> `MatchScoreSchema`.
- API AI label generation uses the score prompt and shared label schema before deterministic scoring: `apps/api/src/tailor/score.ts:8` -> `ScoreLabelsSchema` -> `packages/shared/src/tailor.ts:70` -> `MatchLabelSchema`; `apps/api/src/tailor/score.ts:51` -> `scoreSystemPrompt` -> `apps/api/src/tailor/score-prompts.ts:3` -> `scoreSystemPrompt`.
- Used by web display through MatchScore, rather than recomputing scores: `apps/web/src/jobs/JobScoreCard.tsx:2` -> `MatchScore`, `apps/web/src/jobs/RequirementList.tsx:2` -> `MatchScore` -> `packages/shared/src/tailor.ts:90` -> `MatchScore`.
- Web score read/create-if-missing URLs terminate at API handlers: `apps/web/src/jobs/jobs-api.ts:29` -> `/score`, `apps/web/src/jobs/jobs-api.ts:36` -> `/score` -> `apps/api/src/jobs/routes.ts:90` -> `/:id/score`, `apps/api/src/jobs/routes.ts:99` -> `/:id/score`. POST returns the stored base score unchanged when present; only when absent does it call scoreMatch and save the result: `apps/api/src/jobs/routes.ts:105` -> `tailor.getScore`, `apps/api/src/jobs/routes.ts:106` -> `if (!base)`, `apps/api/src/jobs/routes.ts:107` -> `scoreMatch`, `apps/api/src/jobs/routes.ts:110` -> `tailor.saveScore`, `apps/api/src/jobs/routes.ts:112` -> `return c.json`.
- Stored match scores rely on RLS: `apps/api/src/tailor/supabase-repo.ts:32` -> `match_scores` -> `supabase/migrations/20261108000000_tailoring.sql:107` -> `auth.uid`.

## Assumptions

- Requirement ordering must remain aligned with r-index references; the scorer does not reconcile labels by requirement text. `packages/shared/src/match-score.ts:29` -> `r${index}`.
- keptInferred is trusted caller input and label duplication is not rejected; keyword duplicates affect the average. `packages/shared/src/match-score.ts:23` -> `keptInferred.has`, `packages/shared/src/match-score.ts:56` -> `labels.filter`.
