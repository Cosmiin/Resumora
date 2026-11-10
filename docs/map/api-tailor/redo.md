---
id: api-tailor/redo
area: api-tailor
files: ["apps/api/src/tailor/redo.ts","apps/api/test/tailor-redo.test.ts"]
depends_on: ["shared/tailoring","shared/notes","db/cv-repository","db/cv-history","db/tailoring-runs","api-tailor/section-pass","api-tailor/accept","api-tailor/section-routes"]
contract: true
checked_hash: ceb70151
cited: [2e2d59, 4fa902, c1755a, 2f8207, b5cc4a, e9dfa1, d2b464, c1050d, 3b531a, f2bdd3, 9f8ba8, c117ae, eb5a22, c9e0c2, c35826, fef74a, 8e1081, fef74a, f8a6f8, 5f4e20, ae5461, 71e7c0, 0edbec, 82f1ab, ec0866, e78169, fc71e6, eb5a22, 19b510, c568e8, c35826, 9afdf1, 9f8ba8, 8e1081, 99c82b, 71e7c0, 7d487c]
decisions: []
open: []
---
Replace supplied answers for an earlier role or current review and regenerate only that item's proposals.

- Redo accepts up to MAX_ROLE_QUESTIONS answers, including an empty array `apps/api/src/tailor/redo.ts:10` -> `RedoBodySchema`.
- finishedRole requires role membership in stored roleOrder and either placement before current role or a run past the last role section/done/no current section; otherwise 409 role_not_done `apps/api/src/tailor/redo.ts:18` -> `roleOrder`; `apps/api/src/tailor/redo.ts:21` -> `pastRoleSteps`; `apps/api/src/tailor/redo.ts:24` -> `role_not_done`.
- The current waiting_user role may be redone even before acceptance; other calls must pass finishedRole `apps/api/src/tailor/redo.ts:38` -> `underReview`; `apps/api/src/tailor/redo.ts:39` -> `finishedRole`.
- Answers must name non-flag questions for this role in a role section; invalid question IDs fail 400 before Base CV write `apps/api/src/tailor/redo.ts:40` -> `questions`; `apps/api/src/tailor/redo.ts:42` -> `questions.has`.
- Missing current Base CV item returns 404. Only job notes whose question text appears in submitted answers are replaced; skipped or blank replacements remove notes without adding another `apps/api/src/tailor/redo.ts:47` -> `findScored`; `apps/api/src/tailor/redo.ts:49` -> `redone`; `apps/api/src/tailor/redo.ts:51` -> `note.jobId`; `apps/api/src/tailor/redo.ts:52` -> `"skip"`.
- Saves the whole Base CV with version check before merging run answers, then calls passProposals and replaces only this item's proposal IDs; failures after save leave earlier writes intact `apps/api/src/tailor/redo.ts:57` -> `deps.cv.save`; `apps/api/src/tailor/redo.ts:60` -> `updateRun`; `apps/api/src/tailor/redo.ts:64` -> `passProposals`; `apps/api/src/tailor/redo.ts:67` -> `proposals:`.
- Does not move currentSection/status; repeated redo regenerates proposals again, while answers not submitted remain in the run `apps/api/src/tailor/redo.ts:61` -> `!replaced.has`; `apps/api/src/tailor/redo.ts:67` -> `updateRun`.
- tested by `apps/api/test/tailor-redo.test.ts:89` -> `going back to a finished role`.

## Connections

- Used by redo URL; separate finished-role accept uses acceptSection with redo true and leaves the run in place `apps/web/src/tailor/tailor-api.ts:75` -> `/redo`; `apps/api/src/tailor/routes.ts:104` -> `/redo`; `apps/api/src/tailor/routes.ts:108` -> `redoRole`; `apps/api/src/tailor/redo.ts:32` -> `redoRole`; `apps/web/src/tailor/tailor-api.ts:82` -> `/accept`; `apps/api/src/tailor/routes.ts:117` -> `finishedRole`; `apps/api/src/tailor/routes.ts:120` -> `redo: true`; `apps/api/src/tailor/accept.ts:185` -> `input.redo`.
- Uses Base CV save RPC and its history/version behavior `apps/api/src/tailor/redo.ts:57` -> `deps.cv.save`; `apps/api/src/cv/supabase-repo.ts:48` -> `rpc("save_base_cv"`; `supabase/migrations/20261104000000_baseline.sql:73` -> `save_base_cv`.
- Uses the same checked section prompt pipeline `apps/api/src/tailor/redo.ts:64` -> `passProposals`; `apps/api/src/tailor/section-pass.ts:137` -> `passProposals`.

## Assumptions

- A skipped replacement removes this role's matching job note, but other notes and untouched answers remain valid sources `apps/api/src/tailor/redo.ts:51` -> `!redone.has`; `apps/api/src/tailor/redo.ts:61` -> `!replaced.has`.
- Identity/ownership is inherited from scoped repositories; redoRole itself uses roleId and run data rather than user predicates `apps/api/src/tailor/redo.ts:33` -> `tailor: TailorRepo`; `apps/api/src/tailor/routes.ts:108` -> `deps.cvFor(c)`; `apps/api/src/app.ts:98` -> `c.get("user")`.
