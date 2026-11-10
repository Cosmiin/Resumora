---
id: api-tailor/proposal-sources
area: api-tailor
files: ["apps/api/src/tailor/section-pass.ts","apps/api/src/tailor/enriched-at.test.ts"]
depends_on: ["shared/cv","api-tailor/strip-header"]
contract: false
checked_hash: 06897067
decisions: []
open: []
---
Collect the CV and answer text permitted as evidence for section proposals and cover letters.

- Validation sources are every recursively collected string in the stripped full CV, plus matched non-flag question text and truthy answer values. Job text is not a source `apps/api/src/tailor/section-pass.ts:145` -> `stripHeader`; `apps/api/src/tailor/section-pass.ts:148` -> `"flag"`; `apps/api/src/tailor/section-pass.ts:151` -> `const sources`.
- Source traversal skips id, layout, schemaVersion, locale, photo, askedAt, updatedAt, fromNotes, enrichedAt and any key ending Id; it includes notes/facts and all skill groups. Unlike prompt context, validation sources do not filter notes by job `apps/api/src/tailor/section-pass.ts:98` -> `texts`; `apps/api/src/tailor/section-pass.ts:101` -> `"askedAt"`; `apps/api/src/tailor/section-pass.ts:151` -> `texts(cv)`.
- tested by `apps/api/src/tailor/enriched-at.test.ts:5` -> `enrichedAt is CV metadata`.
- String leaves are retained verbatim, including empty strings; other primitive values contribute no evidence `apps/api/src/tailor/section-pass.ts:99` -> `return [value]`; `apps/api/src/tailor/section-pass.ts:104` -> `return []`.
- Flag-question answers are excluded before matching answer IDs `apps/api/src/tailor/section-pass.ts:148` -> `asked`; `apps/api/src/tailor/section-pass.ts:149` -> `asked.has`.

## Connections

- Used by api-tailor/section-pass for verifier and code-check sources `apps/api/src/tailor/section-pass.ts:151` -> `texts(cv)`; `apps/api/src/tailor/section-pass.ts:98` -> `texts`; `apps/api/src/tailor/section-pass.ts:199` -> `sources`; `apps/api/src/tailor/section-pass.ts:206` -> `checkProposal`.
- Used by api-tailor/letter-checks with additional candidate/job sources `apps/api/src/tailor/letter.ts:39` -> `texts(cv)`; `apps/api/src/tailor/section-pass.ts:98` -> `texts`.

## Assumptions

- Question wording itself can authorize a number/tool in validation sources; source inclusion is not proof the answer confirmed that claim `apps/api/src/tailor/section-pass.ts:149` -> `answer.value`; `apps/api/src/tailor/section-pass.ts:151` -> `answer.question`.
