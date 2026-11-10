---
id: api-tailor/proposal-sources
area: api-tailor
files: ["apps/api/src/tailor/section-pass.ts","apps/api/src/tailor/enriched-at.test.ts"]
depends_on: ["shared/cv","api-tailor/strip-header"]
contract: false
checked_hash: eb541ea6
cited: [3931b3, 3b6a64, aaf96f, 22014a, 81ede1, aaf96f, 0bdcc2, b360bc, 2eecb3, 1db3b0, 1646b9, 3891f2, 188973, d40c13, 83d28b, aaf96f, 22014a, f61c4a, 83d28b, e8d11b, 22014a, 1646b9, 74446a]
decisions: []
open: []
---
Collect the CV and answer text permitted as evidence for section proposals and cover letters.

- Experience and project/volunteering validation sources contain only the current item's fields, bullets, notes and facts, plus matched non-flag question text and truthy answers for that roleId. Other sections keep the stripped full CV and all non-flag answers. Job text is not a source `apps/api/src/tailor/section-pass.ts:143` -> `stripHeader`; `apps/api/src/tailor/section-pass.ts:147` -> `question.roleId === roleId`; `apps/api/src/tailor/section-pass.ts:150` -> `const sources`.
- Source traversal skips id, layout, schemaVersion, locale, photo, askedAt, updatedAt, fromNotes, enrichedAt and any key ending Id; it includes notes/facts and, for full-CV sources, all skill groups. Unlike prompt context, validation sources do not filter notes by job `apps/api/src/tailor/section-pass.ts:96` -> `texts`; `apps/api/src/tailor/section-pass.ts:99` -> `"askedAt"`; `apps/api/src/tailor/section-pass.ts:150` -> `stepItems`.
- tested by `apps/api/src/tailor/enriched-at.test.ts:5` -> `enrichedAt is CV metadata`.
- String leaves are retained verbatim, including empty strings; other primitive values contribute no evidence `apps/api/src/tailor/section-pass.ts:97` -> `return [value]`; `apps/api/src/tailor/section-pass.ts:102` -> `return []`.
- Flag-question answers are excluded before matching answer IDs `apps/api/src/tailor/section-pass.ts:146` -> `asked`; `apps/api/src/tailor/section-pass.ts:148` -> `asked.has`.
- tested by `apps/api/test/tailor-section.test.ts:77` -> `scopes %s evidence and answers to the permitted roles`; `apps/api/test/tailor-projects.test.ts:95` -> `rewrites only $title using its own evidence and answers`.

- Tense context is separate from evidence: role dates determine pastRole, and steering.language supplies the output locale even when the CV has a different locale. `apps/api/src/tailor/section-pass.ts:206` -> `pastRole`; `apps/api/src/tailor/section-pass.ts:209` -> `locale: steering!.language`.

## Connections

- Used by api-tailor/section-pass for verifier and code-check sources `apps/api/src/tailor/section-pass.ts:150` -> `sources`; `apps/api/src/tailor/section-pass.ts:96` -> `texts`; `apps/api/src/tailor/section-pass.ts:199` -> `sources`; `apps/api/src/tailor/section-pass.ts:209` -> `checkProposal`.
- Used by api-tailor/letter-checks with additional candidate/job sources `apps/api/src/tailor/letter.ts:39` -> `texts(cv)`; `apps/api/src/tailor/section-pass.ts:96` -> `texts`.

## Assumptions

- Question wording itself can authorize a number/tool in validation sources; source inclusion is not proof the answer confirmed that claim `apps/api/src/tailor/section-pass.ts:148` -> `answer.value`; `apps/api/src/tailor/section-pass.ts:151` -> `answer.question`.
