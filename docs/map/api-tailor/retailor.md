---
id: api-tailor/retailor
area: api-tailor
files: ["apps/api/src/tailor/retailor.ts","apps/api/test/tailor-retailor.test.ts","apps/api/test/tailor-redo.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-runs","db/tailoring-repository","db/match-scores-repository","db/cv-repository","api-tailor/start"]
contract: true
checked_hash: 30a5299c
cited: [622714, 3bcc91, 2aba7a, 1f10d5, 65c0a7, 6f2c4b, bd3370, 0995d2, c8bdc1, 90885d, e131c2, 8053aa, 3adbcc, 8053aa, 1c5777, 3adbcc, c54052, 5530c7, 973961, 0b7e77, c54052, d6c3d6, eca151, 8f7d05, 646413, 26f36d, d1bad7, 568568, f56a16, dc9c07, da9169, c3ad51, 8053aa, 6742c1, 3adbcc, f1e47c, 1f8c4b, 69cf18, 0e9776, 8053aa, 8b5a35, 9e323d]
decisions: []
open: []
---
Start selected-section runs or reset every step when steering changes.

- Retailor body requires at least one valid section and permits up to twice the section count; shared runSections deduplicates and restores canonical order `apps/api/src/tailor/retailor.ts:9` -> `RetailorBodySchema`; `packages/shared/src/tailor.ts:55` -> `TAILOR_SECTIONS.filter`.
- Missing document returns null, missing job throws 404, and non-ready/unextracted job throws 409 `apps/api/src/tailor/retailor.ts:21` -> `readTailoredCv`; `apps/api/src/tailor/retailor.ts:25` -> `job_not_ready`.
- Section eligibility uses tailored content except courses/publications/interests come from current Base CV; role order still comes from tailored content `apps/api/src/tailor/retailor.ts:29` -> `runSections`; `apps/api/src/tailor/retailor.ts:33` -> `runItems(doc.content`.
- No eligible sections returns 400; one section creates kind section, otherwise retailor. Each request creates a new run rather than resuming an existing one `apps/api/src/tailor/retailor.ts:30` -> `sections.length === 0`; `apps/api/src/tailor/retailor.ts:31` -> `createRun`; `apps/api/src/tailor/retailor.ts:32` -> `kind:`.
- Steering restart reads current Base CV and resets document content/review/score to Base wording, empty review and stored base score before storing new steering `apps/api/src/tailor/retailor.ts:50` -> `deps.cv.get`; `apps/api/src/tailor/retailor.ts:52` -> `getScore`; `apps/api/src/tailor/retailor.ts:53` -> `saveTailoredCv`; `apps/api/src/tailor/retailor.ts:57` -> `setSteering`.
- A reset version conflict leaves steering unchanged; a later setSteering/createRun failure can leave the document reset because writes are not atomic `apps/api/src/tailor/retailor.ts:53` -> `saveTailoredCv`; `apps/api/src/tailor/retailor.ts:54` -> `version_conflict`; `apps/api/src/tailor/retailor.ts:57` -> `setSteering`; `apps/api/src/tailor/retailor.ts:60` -> `createRun`.
- Restart always creates every Base CV step, even for an earlier single-section run; carries forward non-flag questions and only their answers `apps/api/src/tailor/retailor.ts:59` -> `runSections(base)`; `apps/api/src/tailor/retailor.ts:65` -> `"flag"`; `apps/api/src/tailor/retailor.ts:67` -> `ids.has`.
- Old run is not closed or marked superseded; restart updates only the new run, and repeated restart makes another run `apps/api/src/tailor/retailor.ts:60` -> `created`; `apps/api/src/tailor/retailor.ts:68` -> `updateRun(created.id`.
- tested by `apps/api/test/tailor-retailor.test.ts:99` -> `re-tailor`.
- tested by `apps/api/test/tailor-redo.test.ts:157` -> `changing steering after Experience`.

## Connections

- Used by document retailor URL `apps/web/src/tailor/tailored-api.ts:37` -> `/retailor`; `apps/api/src/tailor/tailored-routes.ts:73` -> `/retailor`; `apps/api/src/tailor/tailored-routes.ts:76` -> `startRetailor`; `apps/api/src/tailor/retailor.ts:16` -> `startRetailor`.
- Used by run steering URL `apps/web/src/tailor/tailor-api.ts:89` -> `/steering`; `apps/api/src/tailor/routes.ts:133` -> `/steering`; `apps/api/src/tailor/routes.ts:136` -> `restartWithSteering`; `apps/api/src/tailor/retailor.ts:43` -> `restartWithSteering`.
- Uses repository version check for reset but unversioned steering write `apps/api/src/tailor/retailor.ts:53` -> `saveTailoredCv`; `apps/api/src/tailor/supabase-repo.ts:82` -> `eq("version", expectedVersion)`; `apps/api/src/tailor/retailor.ts:57` -> `setSteering`; `apps/api/src/tailor/supabase-repo.ts:58` -> `.update`.

## Assumptions

- Readiness is checked for selected retailor but steering restart receives a run and does not load/check the job's extracted state `apps/api/src/tailor/retailor.ts:23` -> `deps.jobs.get`; `apps/api/src/tailor/retailor.ts:44` -> `deps:`; `apps/api/src/tailor/retailor.ts:48` -> `readTailoredCv`.
- Resetting content does not refresh baseSnapshot, coverLetter or language; repository saveTailoredCv writes only content/review/score/version/time `apps/api/src/tailor/retailor.ts:53` -> `content: base`; `apps/api/src/tailor/supabase-repo.ts:79` -> `update`; `apps/api/src/tailor/supabase-repo.ts:80` -> `changes.content`.
