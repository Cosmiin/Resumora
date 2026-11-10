---
id: api-tailor/proposal-matching
area: api-tailor
files: ["apps/api/src/tailor/section-pass.ts","apps/api/test/tailor-section.test.ts","apps/api/test/tailor-projects.test.ts"]
depends_on: ["shared/cv","shared/tailoring"]
contract: false
checked_hash: 8004bc19
cited: [811769, e85f56, ac6050, 29b933, ed8083, 60b0a8, d51ffa, 801aaa, ac04f5, 41ad31, 93766b, d856ad, f4573d, 23ff99, 17d1aa, 3f523e, 5cc000, ae0e76, 10e53b, c30d48, de4c8b, 10e53b, 07def6, 0eb696, 2061c4, d02c8f, 32cdb2, 811769, 836a45, 84a33a, ac6050, cbe504, f533db]
decisions: []
open: []
---
Resolve model item IDs and fields, preserving only allowed targets and matched summary guesses.

- Matching map uses stable item IDs: role/project/volunteering IDs expose description/company/title/startDate/endDate; each bullet ID exposes text, optionally restricted to one current role `apps/api/src/tailor/section-pass.ts:40` -> `sectionItems`; `apps/api/src/tailor/section-pass.ts:43` -> `stepItems`; `apps/api/src/tailor/section-pass.ts:45` -> `fields:`; `packages/shared/src/tailor.ts:39` -> `cv.projects`.
- Skills map only technical/professional IDs plus new-skill to name; unclearSkills are not editable. Summary maps the synthetic summary ID to summary `apps/api/src/tailor/section-pass.ts:49` -> `technicalSkills`; `apps/api/src/tailor/section-pass.ts:50` -> `"new-skill"`; `apps/api/src/tailor/section-pass.ts:52` -> `"summary"`.
- Awards expose name/description; awards and light sections expose each line ID to text, hide:<id> to hidden, and order to order only for lists longer than one. Languages expose name/level `apps/api/src/tailor/section-pass.ts:59` -> `award.id`; `apps/api/src/tailor/section-pass.ts:60` -> `line.id`; `apps/api/src/tailor/section-pass.ts:63` -> `list.length`; `apps/api/src/tailor/section-pass.ts:65` -> `language.id`.
- Proposal itemId must be in the map; field must match exactly, except a one-field item coerces any supplied field to its only field. Unknown targets are dropped and optionally logged by IDs/fields; blank text is silently omitted `apps/api/src/tailor/section-pass.ts:175` -> `items.get(p.itemId)`; `apps/api/src/tailor/section-pass.ts:176` -> `fields.length === 1`; `apps/api/src/tailor/section-pass.ts:188` -> `p.text.trim()`; `apps/api/src/tailor/section-pass.ts:192` -> `deps.log`.
- For text proposals, trimmed model reasons survive when incoming inferred is true or itemId is new-skill; matching non-skipped skill answers with selected experience roles replace new-skill reasons with Used in text. Matched summary guesses can subsequently set inferred:false while retaining the incoming reason `apps/api/src/tailor/section-pass.ts:158` -> `answer.via !== "skip"`; `apps/api/src/tailor/section-pass.ts:159` -> `usedIn.set`; `apps/api/src/tailor/section-pass.ts:179` -> `p.inferred`; `apps/api/src/tailor/section-pass.ts:183` -> `inferred: false`; `apps/api/src/tailor/section-pass.ts:189` -> `...why, ...guessed`.
- Summary guesses retain only matched nonoverlapping verbatim spans and switch the parent proposal to inferred false when any survive `apps/api/src/tailor/section-pass.ts:181` -> `placeGuesses`; `apps/api/src/tailor/section-pass.ts:183` -> `inferred: false`; `packages/shared/src/tailor.ts:149` -> `text.indexOf`; `packages/shared/src/tailor.ts:151` -> `placed.every`.
- tested by `apps/api/test/tailor-section.test.ts:76` -> `section pass`.
- tested by `apps/api/test/tailor-projects.test.ts:94` -> `Projects & volunteering step`.

## Connections

- Used by api-tailor/section-pass before checking and api-tailor/accept before decisions; writes belong to api-tailor/proposal-application `apps/api/src/tailor/section-pass.ts:144` -> `sectionItems`; `apps/api/src/tailor/section-pass.ts:40` -> `sectionItems`; `apps/api/src/tailor/accept.ts:117` -> `sectionItems`; `apps/api/src/tailor/accept.ts:75` -> `p.field`.

## Assumptions

- Stable IDs must uniquely identify intended CV items: Map.set overwrites collisions and verification/review also group by item ID `apps/api/src/tailor/section-pass.ts:45` -> `items.set`; `apps/api/src/tailor/section-pass.ts:46` -> `items.set`; `apps/api/src/tailor/section-pass.ts:205` -> `result.itemId`.
