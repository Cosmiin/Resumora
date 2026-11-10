---
id: api-tailor/section-pass
area: api-tailor
files: ["apps/api/src/tailor/section-pass.ts","apps/api/test/tailor-section.test.ts","apps/api/test/tailor-projects.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-runs","api-core/call-model","api-tailor/section-prompts","api-tailor/proposal-matching","api-tailor/proposal-sources","api-tailor/checks","api-tailor/section-routes"]
contract: true
checked_hash: 8004bc19
cited: [75dd34, 28b78a, bfca10, 2b881d, 940e84, 3b6a64, aaf96f, 06c662, 289baf, 23ff99, d0f0d4, 74005c, 0ecc43, f533db, 892773, 55f68e, 76a88e, f9f3e5, cb20cb, 64eddd, fefc81, 7f036b, bddee2, f88a9a, 5b1723, 6ae89c, 5b1723, bc07e8, 9cd637, 421868, c70c38, 2061c4, d02c8f, 3891f2, 188973, 6faba3, 3a582f, a297d5, be0a70, c35826, 9afdf1, 27b639, 34183f, 32cdb2, 811769, aaf96f, 22014a, d45dc1, f5c065, 6ae89c, 569300, df2887]
decisions: []
open: []
---
Run, verify and retry section proposals, then replace the current step's stored review.

- Rejects layout with 400; done or noncurrent sections with 409. Role sections with a currentRoleId require that exact roleId; absent currentRoleId allows null scope `apps/api/src/tailor/section-pass.ts:115` -> `"layout"`; `apps/api/src/tailor/section-pass.ts:117` -> `run.status`; `apps/api/src/tailor/section-pass.ts:31` -> `run.currentRoleId`.
- Role steps generate and check against only their current item's text and matching non-flag answers, with steering scoped to that role; Summary and other sections retain full-CV evidence and all non-flag answers `apps/api/src/tailor/section-pass.ts:75` -> `edit`; `apps/api/src/tailor/section-pass.ts:80` -> `edit`; `apps/api/src/tailor/section-pass.ts:147` -> `question.roleId === roleId`; `apps/api/src/tailor/section-pass.ts:150` -> `sources`; `apps/api/src/tailor/section-pass.ts:168` -> `steeringText`.
- Unchanged orders are skipped. Order/hide proposals are forced non-inferred and bypass both code truth checks and AI verification; order membership is deferred to accept `apps/api/src/tailor/section-pass.ts:186` -> `"order"`; `apps/api/src/tailor/section-pass.ts:188` -> `notText`; `apps/api/src/tailor/section-pass.ts:196` -> `!notText`; `apps/api/src/tailor/accept.ts:45` -> `ids.length`.
- Verifier results match proposals by itemId only, not field; duplicate results concatenate claims for every field of the item. Missing results add no flags; unknown result IDs are silently ignored `apps/api/src/tailor/section-pass.ts:199` -> `proposals.map`; `apps/api/src/tailor/section-pass.ts:205` -> `result.itemId === p.itemId`.
- Every proposal on a flagged item is retried once, including shared new-skill IDs; retry proposals outside flagged IDs are discarded and retries replace the original item at its first position `apps/api/src/tailor/section-pass.ts:215` -> `flagged =`; `apps/api/src/tailor/section-pass.ts:219` -> `flagged.has`; `apps/api/src/tailor/section-pass.ts:224` -> `placed.has`.
- Still-flagged or omitted retry proposals are dropped. removed counts original flagged-item proposals minus clean replacements, floored at zero; malformed/schema-invalid calls use gateway retries and ultimately 502 `apps/api/src/tailor/section-pass.ts:231` -> `ai_failed`; `apps/api/src/tailor/section-pass.ts:234` -> `flags.length === 0`; `apps/api/src/tailor/section-pass.ts:236` -> `Math.max`; `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`.
- Stores waiting_user, replacing all proposals for mapped item IDs and removing legacy flags for this section/role; returns no questions. Repeating the pass calls the models again `apps/api/src/tailor/section-pass.ts:121` -> `passProposals`; `apps/api/src/tailor/section-pass.ts:123` -> `"waiting_user"`; `apps/api/src/tailor/section-pass.ts:126` -> `questions:`; `apps/api/src/tailor/section-pass.ts:128` -> `questions: []`.
- The generation response returns removed once; updateRun does not store it and TailorRunSchema has no removed field, so reloading via GET run cannot restore that count `apps/api/src/tailor/section-pass.ts:122` -> `updateRun`; `apps/api/src/tailor/section-pass.ts:128` -> `removed`; `packages/shared/src/tailor.ts:185` -> `TailorRunSchema`; `packages/shared/src/tailor.ts:196` -> `proposals`; `packages/shared/src/tailor.ts:203` -> `});`; `apps/api/src/tailor/routes.ts:67` -> `app.get`.
- tested by `apps/api/test/tailor-section.test.ts:76` -> `section pass`.
- tested by `apps/api/test/tailor-projects.test.ts:94` -> `Projects & volunteering step`.
- tested by `apps/api/test/tailor-section.test.ts:77` -> `scopes %s evidence and answers to the permitted roles`; `apps/api/test/tailor-projects.test.ts:95` -> `rewrites only $title using its own evidence and answers`.

## Connections

- Used by browser section run URL and redo service `apps/web/src/tailor/tailor-api.ts:46` -> `/run`; `apps/api/src/tailor/routes.ts:80` -> `/run`; `apps/api/src/tailor/routes.ts:88` -> `runSectionPass`; `apps/api/src/tailor/section-pass.ts:110` -> `runSectionPass`; `apps/api/src/tailor/redo.ts:64` -> `passProposals`; `apps/api/src/tailor/section-pass.ts:135` -> `passProposals`.
- Uses code checks after verifier matching `apps/api/src/tailor/section-pass.ts:206` -> `checkProposal`; `apps/api/src/tailor/checks.ts:43` -> `checkProposal`.
- Uses api-tailor/proposal-matching, api-tailor/proposal-sources and api-tailor/section-prompts `apps/api/src/tailor/section-pass.ts:144` -> `sectionItems`; `apps/api/src/tailor/section-pass.ts:40` -> `sectionItems`; `apps/api/src/tailor/section-pass.ts:150` -> `sources`; `apps/api/src/tailor/section-pass.ts:96` -> `texts`; `apps/api/src/tailor/section-pass.ts:166` -> `sectionSystemPrompt`; `apps/api/src/tailor/section-prompts.ts:35` -> `sectionSystemPrompt`.

## Assumptions

- Run updates rely on repository RLS and have no version check, so concurrent passes can overwrite proposals `apps/api/src/tailor/section-pass.ts:122` -> `updateRun`; `apps/api/src/tailor/supabase-repo.ts:183` -> `update(columns).eq("id", id)`; `supabase/migrations/20261108000000_tailoring.sql:95` -> `auth.uid()`.
